import { encodeSysEx, SysExDecoder } from './ble-midi.js';
import { MIDI_SERVICE, MIDI_CHARACTERISTIC, IDENTITY_REQUEST, CHAIN_REQUEST,
  isReadOnlyRequest, pageRequest, parseIdentity, parsePage, parseChain, decodeSnapshot } from './protocol.js';

export class PlugConnection extends EventTarget {
  constructor(bluetooth, timeout = 3500) {
    super(); this.bluetooth = bluetooth; this.timeout = timeout; this.epoch = 0;
    this.pending = null; this.busy = false; this.device = null; this.characteristic = null;
    this.decoder = new SysExDecoder(message => this.receive(message));
    this.onValue = event => this.decoder.push(event.target.value);
    this.onLost = () => { this.close(); this.dispatchEvent(new Event('disconnected')); };
  }
  get connected() { return Boolean(this.device?.gatt.connected && this.characteristic); }
  assertSession(epoch) { if (epoch !== this.epoch) throw new Error('Connection closed.'); }
  async connect() {
    if (this.busy || this.connected) throw new Error('A connection is already active.');
    if (!this.bluetooth?.requestDevice) throw new Error('Open this page in Bluefy on iPhone.');
    this.busy = true; const epoch = ++this.epoch;
    try {
      const device = await this.bluetooth.requestDevice({
        filters: [{ namePrefix: 'MIGHTY PLUG PRO' }, { namePrefix: 'Mighty Plug Pro' }],
        optionalServices: [MIDI_SERVICE]
      });
      this.assertSession(epoch); this.device = device;
      device.addEventListener('gattserverdisconnected', this.onLost);
      const server = await device.gatt.connect();
      if (epoch !== this.epoch) { device.gatt.disconnect(); this.assertSession(epoch); }
      const service = await server.getPrimaryService(MIDI_SERVICE); this.assertSession(epoch);
      const characteristic = await service.getCharacteristic(MIDI_CHARACTERISTIC); this.assertSession(epoch);
      this.characteristic = characteristic;
      characteristic.addEventListener('characteristicvaluechanged', this.onValue);
      await characteristic.startNotifications(); this.assertSession(epoch);
      return await this.snapshot();
    } catch (error) { if (epoch === this.epoch) this.close(); throw error; }
    finally { if (epoch === this.epoch) this.busy = false; }
  }
  close() {
    this.epoch++; this.busy = false;
    if (this.pending) this.pending.reject(new Error('Connection closed.'));
    this.decoder.reset();
    this.characteristic?.removeEventListener('characteristicvaluechanged', this.onValue);
    this.characteristic = null;
    if (this.device) {
      this.device.removeEventListener('gattserverdisconnected', this.onLost);
      if (this.device.gatt.connected) this.device.gatt.disconnect();
    }
    this.device = null;
  }
  receive(message) {
    if (!this.pending) return;
    const value = this.pending.parse(message);
    if (value !== null) this.pending.resolve(value);
  }
  request(message, parse) {
    if (!isReadOnlyRequest(message)) return Promise.reject(new Error('Only status reads are allowed.'));
    if (!this.connected) return Promise.reject(new Error('Plug disconnected.'));
    if (this.pending) return Promise.reject(new Error('A read is already in progress.'));
    this.decoder.reset();
    const epoch = this.epoch, characteristic = this.characteristic;
    return new Promise((resolve, reject) => {
      const finish = (callback, value) => {
        if (this.pending !== pending) return;
        clearTimeout(pending.timer); this.pending = null; callback(value);
      };
      const pending = { parse, resolve: value => finish(resolve, value), reject: error => finish(reject, error),
        timer: setTimeout(() => finish(reject, new Error('No reply. Close other plug controllers, then reconnect.')), this.timeout) };
      this.pending = pending;
      (async () => {
        for (const packet of encodeSysEx(message, Date.now() & 8191)) {
          this.assertSession(epoch);
          if (this.pending !== pending) return;
          if (characteristic.properties.write && characteristic.writeValueWithResponse)
            await characteristic.writeValueWithResponse(packet);
          else if (characteristic.properties.writeWithoutResponse && characteristic.writeValueWithoutResponse)
            await characteristic.writeValueWithoutResponse(packet);
          else if (characteristic.writeValue) await characteristic.writeValue(packet);
          else throw new Error('This Bluetooth connection does not support status requests.');
        }
      })().catch(pending.reject);
    });
  }
  async readPage(page) {
    const response = await this.request(pageRequest(page), message => parsePage(message, page));
    if (response.error) throw new Error('The plug could not read its status. Reconnect and try again.');
    return response.value;
  }
  async snapshot() {
    const identity = await this.request(IDENTITY_REQUEST, parseIdentity);
    if (identity !== 'NAMLNK12') throw new Error('This preview needs NAMLNK12 on the plug.');
    const words = [];
    for (const page of [0, 1, 2, 4, 5, 9, 10, 23, 24, 25]) words[page] = await this.readPage(page);
    const chain = await this.request(CHAIN_REQUEST, parseChain);
    if (await this.readPage(25) !== words[25] || await this.readPage(5) !== words[5])
      throw new Error('The preset changed while reading. Refresh to read it again.');
    return decodeSnapshot(words, chain, identity);
  }
  async refresh() {
    if (this.busy) throw new Error('A read is already in progress.');
    this.busy = true;
    try { return await this.snapshot(); }
    catch (error) { this.close(); throw error; }
    finally { this.busy = false; }
  }
}
