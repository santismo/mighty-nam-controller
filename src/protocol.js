export const MIDI_SERVICE = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
export const MIDI_CHARACTERISTIC = '7772e5db-3868-4112-a1a9-f2669d106bf3';
export const IDENTITY_REQUEST = Object.freeze([240, 67, 88, 0, 247]);
export const CHAIN_REQUEST = Object.freeze([240, 67, 88, 112, 12, 2, 247]);
const prefix = [240, 67, 88, 112, 4, 2];
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const starts = (a, b) => b.every((x, i) => x === a[i]);
export const pageRequest = page => {
  if (!Number.isInteger(page) || page < 0 || page > 25) throw new Error('Invalid status page');
  return [...prefix, 78, 80, page, 247];
};
// Status-only allowlist. Typed editor commands are separately bounded in commands.js.
export function isReadOnlyRequest(message) {
  return same(message, IDENTITY_REQUEST) || same(message, CHAIN_REQUEST) ||
    (message.length === 10 && starts(message, [...prefix, 78, 80]) &&
     Number.isInteger(message[8]) && message[8] >= 0 && message[8] <= 25 && message[9] === 247);
}
export function parseIdentity(message) {
  if (message.length !== 45 || !starts(message, [240, 67, 88, 16]) || message[44] !== 247 ||
      !same(message.slice(36, 44), [80, 76, 85, 71, 80, 82, 79, 0]) ||
      message.slice(4, 12).some(b => b < 32 || b > 126)) return null;
  return String.fromCharCode(...message.slice(4, 12));
}
export function parsePage(message, page) {
  if (message.length !== 15 || !starts(message, prefix) || message[6] !== 1 ||
      message[7] !== page || message[14] !== 247 || message[13] >= 16 ||
      message.slice(6, 14).some(b => b >= 128)) return null;
  let value = 0;
  for (let i = 0; i < 5; i++) value += message[9 + i] * 2 ** (7 * i);
  return { error: message[8], value: value >>> 0 };
}
export function parseChain(message) {
  if (message.length !== 136 || !starts(message, [240, 67, 88, 112, 12, 2]) ||
      message[6] > 6 || message[135] !== 247 || message.slice(7, 135).some(b => b >= 128)) return null;
  const effects = Array.from(message.slice(7, 135));
  const order = effects.slice(90, 99);
  if (order.length !== 9 || [...order].sort().join() !== '1,2,3,4,5,6,7,8,9') return null;
  return { effects, order };
}
// The stock channel-1 (Bluetooth) handler returns 50 + 50 + 28 bytes in
// three independent SysEx replies tagged 0x30, 0x31 and 0x32. Channel 0
// (USB) returns all 128 bytes in one reply. This accumulator is per request.
export function chainParser() {
  const pieces = []; let channel = null;
  return message => {
    const complete = parseChain(message);
    if (complete) return complete;
    if (message.length < 9 || !starts(message, [240, 67, 88, 112, 12, 2]) ||
        message[6] > 6 || message.at(-1) !== 247 || message.slice(6, -1).some(b => b >= 128)) return null;
    const part = message[7] - 0x30;
    if (part < 0 || part > 2 || message.length !== (part === 2 ? 37 : 59)) return null;
    if (part === 0) { pieces.length = 0; channel = message[6]; }
    if (channel !== message[6] || pieces.length !== part * 50) { pieces.length = 0; channel = null; return null; }
    pieces.push(...message.slice(8, -1));
    return part === 2 ? parseChain([240, 67, 88, 112, 12, 2, channel, ...pieces, 247]) : null;
  };
}
export function decodeSnapshot(words, chain, identity) {
  if ([0, 1, 2, 4, 5, 9, 10, 23, 24, 25].some(page =>
    !Number.isInteger(words[page]) || words[page] < 0 || words[page] > 0xffffffff))
    throw new Error('The plug returned an incomplete status.');
  if (!['NAMLNK12','NAMLNK13','NAMLNK14','NAMLNK15'].includes(identity) || words[0] !== 0x4e4c4b31 || words[1] !== 1 || words[2] !== 1)
    throw new Error('The plug returned an unsupported status.');
  const listen = words[23], buffer = words[24], bank = words[25];
  if ((listen & ~7) !== 0 || (listen & 6) === 6 || ((listen & 4) !== 0 && !(listen & 1)) ||
      (buffer >>> 16) !== 48000 || ((buffer >>> 8) & 255) !== 1 || ![8, 16, 32].includes(buffer & 255) ||
      (bank >>> 24) !== 1 || (bank & 0x00ff0000) !== 0 || ((bank >>> 8) & 255) > 127 ||
      !([0, 1, 2, 3, 4, 5, 6, 255].includes(bank & 255)) || ![0, 1].includes(words[9]))
    throw new Error('The plug returned an invalid status.');
  return { identity, buffer: buffer & 255, sampleRate: buffer >>> 16, active: bank & 255,
    occupied: (bank >>> 8) & 127, listening: Boolean(listen & 1), settling: Boolean(listen & 2),
    running: Boolean(words[9]), loaded: words[5] !== 0, modelCrc: words[5], faults: words[4] + words[10], ...chain };
}
