import test from 'node:test';
import assert from 'node:assert/strict';
import { PlugConnection } from '../src/device.js';
import { isReadOnlyRequest, IDENTITY_REQUEST, parseIdentity } from '../src/protocol.js';
import { fakeBluetooth } from './fixtures.js';
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };

for (const withoutResponse of [false, true]) test(`connect, refresh and disconnect; without-response=${withoutResponse}`, async () => {
  const fake = fakeBluetooth({ withoutResponse }); const link = new PlugConnection(fake.bluetooth);
  const state = await link.connect(); assert.equal(state.buffer, 8); assert.equal(link.connected, true);
  fake.words[24] += 8; assert.equal((await link.refresh()).buffer, 16);
  assert.ok(fake.requests.length >= 28); assert.ok(fake.requests.every(isReadOnlyRequest));
  assert.equal(fake.bluetooth.filters.filters[0].namePrefix, 'MIGHTY PLUG PRO');
  await assert.rejects(link.request([176, 3, 1], () => null), /Only status reads/);
  link.close(); assert.equal(link.connected, false); assert.equal(link.pending, null);
  assert.equal((await link.connect()).buffer, 16); link.close();
});
test('unsupported firmware and device errors close the connection', async () => {
  for (const options of [{ identity: 'NAMLNK11' }, { error: 2 }]) {
    const fake = fakeBluetooth(options); const link = new PlugConnection(fake.bluetooth);
    await assert.rejects(link.connect()); assert.equal(link.connected, false); assert.equal(fake.device.gatt.connected, false);
  }
});
test('preset changing during a snapshot is refused', async () => {
  let reads = 0; const fake = fakeBluetooth({ onPage(page, words) { if (page === 25 && ++reads === 2) words[25]++; } });
  const link = new PlugConnection(fake.bluetooth); await assert.rejects(link.connect(), /preset changed/); assert.equal(link.connected, false);
});
test('a timeout cleans up and cannot leave a late request active', async () => {
  const fake = fakeBluetooth({ silent: true }); const link = new PlugConnection(fake.bluetooth, 10);
  await assert.rejects(link.connect(), /No reply/); assert.equal(link.pending, null); assert.equal(link.connected, false); assert.equal(fake.requests.length, 1);
});
test('cancel during notifications and during GATT connect is safe', async () => {
  for (const phase of ['notifications', 'connecting']) {
    const gate = deferred(); const entered = deferred();
    const fake = fakeBluetooth({ [phase]: () => { entered.resolve(); return gate.promise; } });
    const link = new PlugConnection(fake.bluetooth); const result = link.connect(); const rejection = assert.rejects(result, /Connection closed/);
    await entered.promise; link.close(); gate.resolve(); await rejection;
    assert.equal(fake.device.gatt.connected, false); assert.deepEqual(fake.requests, []);
  }
});
test('disconnect rejects a pending query and blocks overlapping reads', async () => {
  const fake = fakeBluetooth(); const link = new PlugConnection(fake.bluetooth); await link.connect();
  fake.characteristic.writeValueWithResponse = async () => {};
  const pending = link.request(IDENTITY_REQUEST, parseIdentity); const rejected = assert.rejects(pending, /Connection closed/);
  await assert.rejects(link.request(IDENTITY_REQUEST, parseIdentity), /already in progress/);
  let lost = false; link.addEventListener('disconnected', () => lost = true);
  fake.device.gatt.disconnect(); await rejected; assert.equal(lost, true); assert.equal(link.pending, null);
});
