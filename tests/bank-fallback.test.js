import test from 'node:test';
import assert from 'node:assert/strict';
import { PlugConnection } from '../src/device.js';
import { PlugEditor } from '../src/editor.js';
import { editingBluetooth } from './editor-fixture.js';

async function setup(options, timeout = 500) {
  const fake = editingBluetooth(options);
  const link = new PlugConnection(fake.bluetooth, timeout, 0, 0);
  const editor = new PlugEditor(link);
  await link.connect();
  return { fake, link, editor };
}

test('the observed short preset reply keeps verified live controls available without timing out', async t => {
  const { fake, link, editor } = await setup({ truncatedPresetReply: true, replyMtu: 512 });
  t.after(() => link.close());
  assert.equal(await editor.readBank(), null);
  assert.equal(link.connected, true);
  assert.equal(link.busy, false);
  assert.equal(link.pending, null);
  assert.equal(editor.largeReplies, false);
  assert.deepEqual(editor.bank, []);
  assert.match(editor.bankWarning, /Saving and tuner/);
  assert.match(link.report(), /RX 78 bytes/);
  assert.match(link.report(), /75 of 326/);
  assert.doesNotMatch(link.report(), /Timeout:/);
  assert.equal(fake.requests.filter(m => m[7] === 83).length, 1);

  const effects = [...link.current.effects];
  effects[20] = 37;
  const changed = await editor.live(link.current, () => ({ effects, buffer: 16 }));
  assert.equal(changed.effects[20], 37);
  assert.equal(changed.buffer, 16);
  assert.equal((await editor.listen(true)).listening, true);
  assert.equal(fake.saveCount, 0);
});

test('unavailable metadata cannot trigger save, recall or tuner mutations', async t => {
  const { fake, link, editor } = await setup({ truncatedPresetReply: true });
  t.after(() => link.close());
  await editor.readBank();
  const before = fake.requests.length;
  await assert.rejects(editor.save(link.current, link.current.effects, 8, 'Name'), /unavailable/);
  await assert.rejects(editor.recall(1), /unavailable/);
  await assert.rejects(editor.tune(), /unavailable/);
  assert.equal(fake.requests.length, before);
  assert.equal(fake.saveCount, 0);
});

test('a missing optional bank reply can be retried manually and stale metadata is cleared', async t => {
  const options = {};
  const { fake, link, editor } = await setup(options, 150);
  t.after(() => link.close());
  assert.equal((await editor.readBank()).length, 7);
  options.dropPresetReply = true;
  assert.equal(await editor.readBank(), null);
  assert.deepEqual(editor.bank, []);
  assert.equal(editor.largeReplies, false);
  assert.ok(link.current);
  options.dropPresetReply = false;
  assert.equal((await editor.readBank()).length, 7);
  assert.equal(editor.largeReplies, true);
  assert.equal(editor.bankWarning, '');
  assert.equal(fake.saveCount, 0);
  editor.resetBank();
  assert.equal(editor.largeReplies, null);
  assert.deepEqual(editor.bank, []);
});

test('a rejected bank write is not hidden as a recoverable reply problem', async t => {
  const { fake, link, editor } = await setup({});
  t.after(() => link.close());
  fake.characteristic.writeValueWithoutResponse = async () => {
    throw new DOMException('Denied', 'NotAllowedError');
  };
  await assert.rejects(editor.readBank(), /Bluetooth write rejected/);
  assert.equal(editor.bankWarning, '');
});

test('failed status verification during fallback never reports live controls ready', async t => {
  const { fake, link, editor } = await setup({ truncatedPresetReply: true });
  t.after(() => link.close());
  // Make the next small status snapshot fail after the malformed bank reply.
  fake.words[1] = 2;
  await assert.rejects(editor.readBank(), /unsupported status/);
  assert.deepEqual(editor.bank, []);
  assert.equal(editor.bankWarning, '');
});

test('disconnect during a bank read is not treated as a usable connection', async t => {
  const options = {};
  const { fake, link, editor } = await setup(options);
  t.after(() => link.close());
  options.onPreset = () => fake.device.gatt.disconnect();
  await assert.rejects(editor.readBank(), /Connection closed/);
  assert.equal(link.connected, false);
  assert.equal(editor.bankWarning, '');
  assert.deepEqual(editor.bank, []);
});
