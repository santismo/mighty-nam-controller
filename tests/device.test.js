import test from 'node:test';
import assert from 'node:assert/strict';
import { PlugConnection } from '../src/device.js';
import { isReadOnlyRequest, IDENTITY_REQUEST, parseIdentity } from '../src/protocol.js';
import { fakeBluetooth } from './fixtures.js';
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };

for (const withoutResponse of [false, true]) test(`connect, refresh and disconnect; without-response=${withoutResponse}`, async () => {
  const fake = fakeBluetooth({ withoutResponse }); const link = new PlugConnection(fake.bluetooth, 500, 0, 0);
  const state = await link.connect(); assert.equal(state.buffer, 8); assert.equal(link.connected, true);
  fake.words[24] += 8; assert.equal((await link.refresh()).buffer, 16);
  assert.ok(fake.requests.length >= 28); assert.ok(fake.requests.every(isReadOnlyRequest));
  assert.equal(fake.bluetooth.filters.filters[0].namePrefix, 'MIGHTY PLUG PRO');
  await assert.rejects(link.request([176, 3, 1], () => null), /Unsupported command/);
  link.close(); assert.equal(link.connected, false); assert.equal(link.pending, null);
  assert.equal((await link.connect()).buffer, 16); link.close();
});
test('unsupported firmware and device errors retain BLE without reporting a valid snapshot', async () => {
  for (const options of [{ identity: 'NAMLNK11' }, { error: 2 }]) {
    const fake = fakeBluetooth(options); const link = new PlugConnection(fake.bluetooth, 500, 0, 0);
    await assert.rejects(link.connect()); assert.equal(link.connected, true); assert.equal(link.busy, false);
    assert.match(link.report(), /failed/); link.close();
  }
});
test('preset changing during a snapshot is refused', async () => {
  let reads = 0; const fake = fakeBluetooth({ onPage(page, words) { if (page === 25 && ++reads === 2) words[25]++; } });
  const link = new PlugConnection(fake.bluetooth, 500, 0, 0); await assert.rejects(link.connect(), /preset changed/); assert.equal(link.connected, true); link.close();
});
test('a missing reply retains BLE, records the stage and allows a manual retry', async () => {
  const options = { silent: true }; const fake = fakeBluetooth(options); const link = new PlugConnection(fake.bluetooth, 15, 0, 0);
  await assert.rejects(link.connect(), /Reading firmware identity: no matching reply/);
  assert.equal(link.pending, null); assert.equal(link.connected, true); assert.equal(fake.requests.length, 1);
  assert.match(link.report(), /write completed=true; notifications=0; MIDI replies=0/);
  options.silent = false; assert.equal((await link.refresh()).buffer, 8); link.close();
});
test('cancel during notifications and during GATT connect is safe', async () => {
  for (const phase of ['notifications', 'connecting']) {
    const gate = deferred(); const entered = deferred();
    const fake = fakeBluetooth({ [phase]: () => { entered.resolve(); return gate.promise; } });
    const link = new PlugConnection(fake.bluetooth, 500, 0, 0); const result = link.connect(); const rejection = assert.rejects(result, /Connection closed/);
    await entered.promise; link.close(); gate.resolve(); await rejection;
    assert.equal(fake.device.gatt.connected, false); assert.deepEqual(fake.requests, []);
  }
});
test('disconnect rejects a pending query and blocks overlapping reads', async () => {
  const fake = fakeBluetooth(); const link = new PlugConnection(fake.bluetooth, 500, 0, 0); await link.connect();
  fake.characteristic.writeValueWithResponse = async () => {};
  const pending = link.request(IDENTITY_REQUEST, parseIdentity); const rejected = assert.rejects(pending, /Connection closed/);
  await assert.rejects(link.request(IDENTITY_REQUEST, parseIdentity), /already in progress/);
  let lost = false; link.addEventListener('disconnected', () => lost = true);
  fake.device.gatt.disconnect(); await rejected; assert.equal(lost, true); assert.equal(link.pending, null);
});
test('iOS preference: no-response writes, zero timestamps, ArrayBuffer notifications, three-part chain', async () => {
  const fake = fakeBluetooth({ bothMethods: true, arrayBuffer: true, zeroTimestamps: true });
  const link = new PlugConnection(fake.bluetooth, 500, 0, 0);
  const state = await link.connect(); assert.equal(state.effects.length, 128);
  assert.ok(fake.attempts.every(method => method === 'writeValueWithoutResponse'));
  assert.deepEqual(fake.writes[0], [128, 128, 240, 67, 88, 0, 128, 247]);
  assert.ok(fake.requests.every(isReadOnlyRequest)); link.close();
});
test('explicit unsupported browser method falls back and remembers the successful path', async () => {
  const fake = fakeBluetooth({ bothMethods: true, reject: { writeValueWithoutResponse: new DOMException('Request rejected', 'NotSupportedError') } });
  const link = new PlugConnection(fake.bluetooth, 500, 0, 0); await link.connect();
  assert.deepEqual(fake.attempts.slice(0, 2), ['writeValueWithoutResponse', 'writeValueWithResponse']);
  assert.equal(fake.attempts.filter(m => m === 'writeValueWithoutResponse').length, 1);
  assert.match(link.report(), /Write rejected: writeValueWithoutResponse/); link.close();
});
test('legacy browser bridge can write using writeValue with an exact ArrayBuffer', async () => {
  const fake = fakeBluetooth({ legacy: true }); delete fake.characteristic.writeValueWithResponse;
  const link = new PlugConnection(fake.bluetooth, 500, 0, 0); await link.connect();
  assert.ok(fake.attempts.every(method => method === 'writeValue')); link.close();
});
test('all write rejections are reported immediately with stage and do not close Bluetooth', async () => {
  const fake = fakeBluetooth({ bothMethods: true, reject: { writeValueWithoutResponse: new Error('Request rejected'), writeValueWithResponse: new Error('Request rejected') } });
  const link = new PlugConnection(fake.bluetooth, 500, 0, 0);
  await assert.rejects(link.connect(), /Reading firmware identity: Bluetooth write rejected/);
  assert.equal(link.connected, true); assert.equal(link.pending, null); assert.deepEqual(fake.requests, []);
  assert.match(link.report(), /Write rejected: writeValueWithResponse/); link.close();
});
test('permission denial is not retried using another write method', async () => {
  const fake = fakeBluetooth({ bothMethods: true, reject: { writeValueWithoutResponse: new DOMException('Denied', 'SecurityError') } });
  const link = new PlugConnection(fake.bluetooth, 500, 0, 0); await assert.rejects(link.connect());
  assert.deepEqual(fake.attempts, ['writeValueWithoutResponse']); link.close();
});
test('a stuck native write is distinct from a missing reply and prevents overlapping retries', async () => {
  const fake = fakeBluetooth({ withoutResponse: true, hang: 'writeValueWithoutResponse' });
  const link = new PlugConnection(fake.bluetooth, 15, 0, 0);
  await assert.rejects(link.connect(), /Bluetooth write did not finish/);
  assert.equal(link.connected, true); assert.equal(link.writeStalled, true);
  await assert.rejects(link.refresh(), /Disconnect and reconnect/);
  assert.equal(fake.attempts.length, 1); link.close();
});
test('notification subscription rejection closes an incomplete connection and identifies the failed stage', async () => {
  const fake = fakeBluetooth({ notifications: () => { throw new Error('Request rejected'); } });
  const link = new PlugConnection(fake.bluetooth, 500, 0, 0); await assert.rejects(link.connect(), /Request rejected/);
  assert.equal(link.connected, false); assert.equal(fake.device.gatt.connected, false);
  assert.match(link.report(), /Starting notifications failed/); assert.deepEqual(fake.requests, []);
});
