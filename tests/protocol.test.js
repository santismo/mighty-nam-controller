import test from 'node:test';
import assert from 'node:assert/strict';
import { IDENTITY_REQUEST, CHAIN_REQUEST, pageRequest, isReadOnlyRequest, parseIdentity, parsePage, parseChain, decodeSnapshot } from '../src/protocol.js';
import { identityFrame, pageFrame, chainFrame, statusWords } from './fixtures.js';

test('outbound allowlist permits only exact read queries', () => {
  const allowed = [IDENTITY_REQUEST, CHAIN_REQUEST, ...Array.from({ length: 26 }, (_, p) => pageRequest(p))];
  for (const message of allowed) {
    assert.ok(isReadOnlyRequest(message));
    for (let i = 0; i < message.length; i++) for (const value of [0, 1, 63, 127, 128, 247, 255]) {
      const changed = [...message]; changed[i] = value;
      if (allowed.some(a => String(a) === String(changed))) continue;
      assert.equal(isReadOnlyRequest(changed), false);
    }
  }
  for (const message of [[176, 3, 1], [192, 1], [240, 67, 88, 112, 4, 2, 78, 65, 1, 247], [...CHAIN_REQUEST, 0]]) assert.equal(isReadOnlyRequest(message), false);
  assert.throws(() => pageRequest(26)); assert.throws(() => pageRequest(-1));
});
test('identity, current chain and uint32 status decode with strict framing', () => {
  assert.equal(parseIdentity(identityFrame()), 'NAMLNK12');
  assert.equal(parseIdentity(identityFrame().slice(1)), null);
  const invalid = identityFrame(); invalid[36] = 0; assert.equal(parseIdentity(invalid), null);
  for (const word of [0, 1, 127, 128, 0x12345678, 0xffffffff]) assert.deepEqual(parsePage(pageFrame(5, word), 5), { error: 0, value: word });
  assert.equal(parsePage(pageFrame(5, 1), 6), null);
  const invalidPage = pageFrame(5, 1); invalidPage[13] = 16; assert.equal(parsePage(invalidPage, 5), null);
  assert.deepEqual(parsePage(pageFrame(5, 1, 2), 5), { error: 2, value: 1 });
  const invalidChain = chainFrame(); invalidChain[97] = invalidChain[98]; assert.equal(parseChain(invalidChain), null);
  const snapshot = decodeSnapshot(statusWords(), parseChain(chainFrame()), 'NAMLNK12');
  assert.equal(snapshot.buffer, 8); assert.equal(snapshot.active, 0); assert.equal(snapshot.occupied, 127);
  assert.equal(snapshot.listening, false); assert.equal(snapshot.loaded, true); assert.equal(snapshot.faults, 0);
  assert.deepEqual(snapshot.order, [5, 1, 2, 3, 9, 4, 6, 7, 8]);
});
test('unrecognized firmware, incomplete words and invalid flags are rejected', () => {
  const chain = parseChain(chainFrame());
  for (const [page, value] of [[0, 0], [1, 2], [2, 0], [5, undefined], [4, -1], [9, 2], [23, 8], [23, 6], [23, 4], [24, 8], [24, 48000 * 65536 + 256 + 4], [25, 0x01007f07], [25, 0x0100ff00], [25, 0x01017f00]]) {
    const words = statusWords(); words[page] = value; assert.throws(() => decodeSnapshot(words, chain, 'NAMLNK12'));
  }
  assert.throws(() => decodeSnapshot(statusWords(), chain, 'NAMLNK11'));
});
