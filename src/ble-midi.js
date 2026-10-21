// Bounded BLE-MIDI SysEx framing. Timestamps are framing, not MIDI status.
export function encodeSysEx(message, timestamp = 0, mtu = 20) {
  if (message.length < 2 || message.length > 330 || message[0] !== 0xf0 ||
      message.at(-1) !== 0xf7 || message.slice(1, -1).some(b => !Number.isInteger(b) || b < 0 || b > 127) ||
      !Number.isInteger(mtu) || mtu < 5 || mtu > 512) throw new Error('Invalid MIDI frame');
  const header = 0x80 | ((timestamp >>> 7) & 63), time = 0x80 | (timestamp & 127);
  const packets = []; let packet = [header, time, 0xf0];
  for (const byte of message.slice(1, -1)) {
    if (packet.length === mtu) { packets.push(Uint8Array.from(packet)); packet = [header]; }
    packet.push(byte);
  }
  if (packet.length + 2 > mtu) { packets.push(Uint8Array.from(packet)); packet = [header]; }
  packet.push(time, 0xf7); packets.push(Uint8Array.from(packet));
  return packets;
}

export class SysExDecoder {
  constructor(onMessage) { this.onMessage = onMessage; this.reset(); }
  reset() { this.message = null; this.updated = 0; }
  push(data, now = Date.now()) {
    const bytes = data instanceof DataView ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : data;
    if (now - this.updated > 2500) this.reset();
    this.updated = now;
    if (!bytes || bytes.length < 2 || bytes.length > 512 || (bytes[0] & 0xc0) !== 0x80) { this.reset(); return; }
    let i = 1;
    while (i < bytes.length) {
      const byte = bytes[i++];
      if (this.message && byte < 128) {
        this.message.push(byte);
        if (this.message.length > 329) this.reset();
        continue;
      }
      if (byte < 128) continue; // Ignore channel-message data/running status.
      // Any high byte here is a timestamp. In particular, F0/F7 can be timestamps.
      if (i === bytes.length) { this.reset(); return; }
      const status = bytes[i++];
      if (status === 0xf0) this.message = [0xf0];
      else if (status === 0xf7) {
        const complete = this.message; this.message = null;
        if (complete) { complete.push(0xf7); this.onMessage(Uint8Array.from(complete)); }
      } else if (status >= 0xf8) {
        // Realtime events may appear during SysEx; they do not enter its payload.
      } else if (this.message) this.reset();
    }
  }
}
