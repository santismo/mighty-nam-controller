import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeSysEx, SysExDecoder } from '../src/ble-midi.js';

test('known BLE-MIDI vectors, including fragmented SysEx and timestamp/status collisions', () => {
  const messages = []; const decoder = new SysExDecoder(m => messages.push([...m]));
  decoder.push([0x80, 0xf0, 0xf0, 0x43, 0x58, 0]);
  decoder.push([0x80, 0x12, 0x34, 0xf7, 0xf7]);
  assert.deepEqual(messages, [[0xf0, 0x43, 0x58, 0, 0x12, 0x34, 0xf7]]);
  assert.deepEqual(encodeSysEx([240, 67, 88, 0, 247], 119).map(p => [...p]), [[128, 247, 240, 67, 88, 0, 247, 247]]);
});
test('all timestamp bytes and payload boundaries round trip with bounded packets', () => {
  for (const length of [2, 5, 15, 18, 19, 20, 21, 45, 136, 330]) for (const mtu of [5, 20, 64, 512]) {
    const frame = [240, ...Array.from({ length: length - 2 }, (_, i) => i % 128), 247];
    for (let time = 0; time < 128; time++) {
      const messages = []; const decoder = new SysExDecoder(m => messages.push([...m]));
      for (const p of encodeSysEx(frame, 8064 + time, mtu)) { assert.ok(p.length <= mtu); decoder.push(p); }
      assert.deepEqual(messages, [frame]);
    }
  }
});
test('DataView offsets, multiple messages and interleaved realtime messages', () => {
  const messages = []; const decoder = new SysExDecoder(m => messages.push([...m]));
  const data = Uint8Array.from([0, 0, 128, 128, 240, 1, 128, 248, 2, 128, 247, 128, 240, 3, 128, 247, 0]);
  decoder.push(new DataView(data.buffer, 2, 14));
  assert.deepEqual(messages, [[240, 1, 2, 247], [240, 3, 247]]);
});
test('invalid packets, expired fragments and overflow cannot complete stale messages', () => {
  const messages = []; const decoder = new SysExDecoder(m => messages.push([...m]));
  for (const invalid of [[], [128], [0, 1], [192, 1], Array(513).fill(128), [128, 128]]) {
    decoder.push([128, 128, 240, 1], 10); decoder.push(invalid, 20); decoder.push([128, 128, 247], 30);
  }
  decoder.push([128, 128, 240, 1], 100); decoder.push([128, 2, 128, 247], 2700);
  decoder.push([128, 128, 240, ...Array(330).fill(0), 128, 247], 2800);
  assert.deepEqual(messages, []);
  decoder.push([128, 128, 240, 7, 128, 247], 2900);
  assert.deepEqual(messages, [[240, 7, 247]]);
});
test('invalid outgoing frames are refused', () => {
  for (const frame of [[], [240], [240, 255, 247], [240, -1, 247], [240, 1.2, 247], [240, ...Array(329).fill(0), 247]]) assert.throws(() => encodeSysEx(frame));
  assert.throws(() => encodeSysEx([240, 247], 0, 4));
});
