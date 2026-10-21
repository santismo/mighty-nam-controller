import { SysExDecoder, encodeSysEx } from '../src/ble-midi.js';
import { CHAIN_REQUEST, IDENTITY_REQUEST } from '../src/protocol.js';
export const identityFrame = (identity = 'NAMLNK12') => {
  const frame = Array(45).fill(0); frame.splice(0, 4, 240, 67, 88, 16);
  frame.splice(4, 8, ...[...identity].map(c => c.charCodeAt(0)));
  frame.splice(36, 8, 80, 76, 85, 71, 80, 82, 79, 0); frame[44] = 247; return frame;
};
export const pageFrame = (page, value, error = 0) => [240, 67, 88, 112, 4, 2, 1, page, error,
  ...Array.from({ length: 5 }, (_, i) => Math.floor(value / 2 ** (7 * i)) & 127), 247];
export const chainFrame = () => {
  const data = Array(128).fill(0);
  for (let i = 1; i <= 9; i++) data[i] = i === 3 || i === 8 ? 1 : 65;
  data.splice(90, 9, 5, 1, 2, 3, 9, 4, 6, 7, 8);
  return [240, 67, 88, 112, 12, 2, 0, ...data, 247];
};
export const statusWords = () => Object.assign(Array(26).fill(0), {
  0: 0x4e4c4b31, 1: 1, 2: 1, 5: 0x12345678, 9: 1,
  23: 0, 24: (48000 * 65536) + 256 + 8, 25: 0x01007f00
});
export function fakeBluetooth(options = {}) {
  const writes = [], requests = [], words = statusWords();
  const characteristic = new EventTarget();
  characteristic.properties = { write: !options.withoutResponse, writeWithoutResponse: Boolean(options.withoutResponse) };
  characteristic.startNotifications = async () => { await options.notifications?.(); return characteristic; };
  const decoder = new SysExDecoder(message => {
    requests.push(Array.from(message)); if (options.silent) return;
    let reply;
    if (String(message) === String(IDENTITY_REQUEST)) reply = identityFrame(options.identity);
    else if (String(message) === String(CHAIN_REQUEST)) reply = chainFrame();
    else { const page = message[8]; options.onPage?.(page, words); reply = pageFrame(page, words[page], options.error ?? 0); }
    queueMicrotask(() => {
      for (const packet of encodeSysEx(reply, 119)) {
        characteristic.value = new DataView(packet.buffer);
        characteristic.dispatchEvent(new Event('characteristicvaluechanged'));
      }
    });
  });
  const write = async packet => { writes.push(Array.from(packet)); decoder.push(packet); };
  characteristic.writeValueWithResponse = write; characteristic.writeValueWithoutResponse = write;
  const device = new EventTarget();
  device.gatt = {
    connected: false,
    async connect() { await options.connecting?.(); this.connected = true; return this; },
    async getPrimaryService() { return { getCharacteristic: async () => characteristic }; },
    disconnect() { this.connected = false; device.dispatchEvent(new Event('gattserverdisconnected')); }
  };
  const bluetooth = { requestDevice: async filters => { bluetooth.filters = filters; return device; } };
  return { bluetooth, characteristic, device, requests, writes, words };
}
