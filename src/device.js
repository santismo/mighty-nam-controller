import { ReplyPages, isReplyPage } from './reply-pages.js?v=0.6.6';
import { fxRequest, fxReply } from './fx.js?v=0.6.6';
import { encodeSysEx, SysExDecoder, notificationBytes } from './ble-midi.js?v=0.6.6';
import { MIDI_SERVICE, MIDI_CHARACTERISTIC, IDENTITY_REQUEST, CHAIN_REQUEST,
  pageRequest, parseIdentity, parsePage, chainParser, decodeSnapshot, decodeCodecStatus } from './protocol.js?v=0.6.6';
import { allowedCommand } from './commands.js?v=0.6.6';
import { validateEffects } from './controls.js?v=0.6.6';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const errorText = error => `${error?.name || 'Error'}: ${error?.message || String(error)}`.slice(0, 220);
const hex = bytes => [...bytes].slice(0, 512).map(b => b.toString(16).padStart(2, '0')).join(' ');

export class PlugConnection extends EventTarget {
  constructor(bluetooth, timeout = 6500, settle = 300, spacing = 35) {
    super(); this.bluetooth = bluetooth; this.timeout = timeout; this.settle = settle; this.spacing = spacing;
    this.epoch = 0; this.pending = null; this.busy = false; this.device = null; this.characteristic = null;
    this.ready = false; this.writeStalled = false; this.writeMethod = null; this.lastWrite = 0;
    this.current = null;
    this.log = []; this.stage = 'Idle'; this.notifications = 0; this.frames = 0; this.started = Date.now();
    this.decoder = new SysExDecoder(message => this.receive(message));
    this.onValue = event => {
      const bytes = notificationBytes(event.target.value); this.notifications++;
      this.record(bytes ? `RX ${bytes.length} bytes: ${hex(bytes)}` : 'RX unsupported value type');
      this.decoder.push(bytes);
    };
    this.onLost = () => {
      const stage = this.stage; this.record(`Bluetooth disconnected during ${stage}`); this.close(false);
      this.dispatchEvent(new CustomEvent('disconnected', { detail: { stage } }));
    };
  }
  get connected() { return Boolean(this.ready && this.device?.gatt.connected && this.characteristic); }
  record(text) {
    this.log.push(`${((Date.now() - this.started) / 1000).toFixed(2)}s ${text}`);
    if (this.log.length > 90) this.log.shift();
    this.dispatchEvent(new Event('diagnostic'));
  }
  progress(stage) { this.stage = stage; this.record(stage); this.dispatchEvent(new Event('progress')); }
  report() {
    const s=this.current;
    const summary=s?`Firmware: ${s.identity}\nConfirmed buffer: ${s.buffer} samples at ${s.sampleRate} Hz\nBuffer scope: ${s.globalBuffer?'Global · saved on plug':'Per preset'}${s.bufferStorageError?' · storage error':''}\nActive color index: ${s.active}; capture CRC: ${s.modelCrc}; faults: ${s.faults}\nOutput: ${s.listening?'on':'muted'}; settling: ${s.settling}\nLive stock effects: ${s.effects.join(',')}\nLive FX A/B: ${s.fx?.join(',')??'unavailable'}\n`:'';
    const codec=s?.codec?`Converter startup: ${s.codec.verified?'short-delay setting verified':'setting unverified'}; ${s.codec.raw.toString(16)}\n`:'';
    return `NAM Plug controller 0.6.6\n${summary}${codec}Bluetooth: ${this.connected ? 'connected' : 'disconnected'}\nStage: ${this.stage}\nNotifications: ${this.notifications}; MIDI replies: ${this.frames}\n${this.log.join('\n')}`;
  }
  assertSession(epoch) { if (epoch !== this.epoch) throw new Error('Connection closed.'); }
  async connect() {
    if (this.busy || this.connected) throw new Error('A connection is already active.');
    if (!this.bluetooth?.requestDevice) throw new Error('Open this page in Bluefy on iPhone.');
    this.busy = true; const epoch = ++this.epoch;
    this.log = []; this.notifications = 0; this.frames = 0; this.started = Date.now(); this.writeStalled = false;
    this.writeMethod = null; this.lastWrite = 0;
    try {
      this.progress('Choose your Mighty Plug Pro');
      const device = await this.bluetooth.requestDevice({
        filters: [{ namePrefix: 'MIGHTY PLUG PRO' }, { namePrefix: 'Mighty Plug Pro' }],
        optionalServices: [MIDI_SERVICE]
      });
      this.assertSession(epoch); this.device = device;
      device.addEventListener('gattserverdisconnected', this.onLost);
      this.progress('Opening Bluetooth connection');
      const server = await device.gatt.connect();
      if (epoch !== this.epoch) { device.gatt.disconnect(); this.assertSession(epoch); }
      this.progress('Finding MIDI service');
      const service = await server.getPrimaryService(MIDI_SERVICE); this.assertSession(epoch);
      this.progress('Finding MIDI characteristic');
      const characteristic = await service.getCharacteristic(MIDI_CHARACTERISTIC); this.assertSession(epoch);
      this.characteristic = characteristic;
      const p = characteristic.properties || {};
      this.record(`Properties: notify=${Boolean(p.notify)} read=${Boolean(p.read)} write=${Boolean(p.write)} writeWithoutResponse=${Boolean(p.writeWithoutResponse)}`);
      characteristic.addEventListener('characteristicvaluechanged', this.onValue);
      this.progress('Starting notifications');
      await characteristic.startNotifications(); this.assertSession(epoch); this.ready = true;
      // Let the native bridge finish enabling notifications before the first read.
      await pause(this.settle); this.assertSession(epoch);
      return await this.snapshot();
    } catch (error) {
      if (epoch === this.epoch) {
        this.record(`${this.stage} failed — ${errorText(error)}`);
        // A failed read is not a lost BLE connection. Retain it for manual retry.
        if (!this.connected) this.close(false);
      }
      throw error;
    } finally { if (epoch === this.epoch) this.busy = false; }
  }
  close(log = true) {
    if (log) this.record('Disconnected by page');
    this.epoch++; this.busy = false; this.ready = false; this.writeStalled = false;
    this.current = null;
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
    this.frames++; this.record(`MIDI ${message.length} bytes: ${hex(message)}`);
    if (!this.pending) return;
    if (!this.pending.parse) return;
    if(isReplyPage(message)){
      try{const part=this.pending.pages.push(message);if(part.next){this.pending.next=part.next;this.pending.pump?.();return;}message=part.message;}
      catch(error){this.pending.reject(error);return;}
    }
    const value = this.pending.parse(message);
    if (value !== null) this.pending.match(value);
  }
  async writePacket(packet, pending, epoch, characteristic) {
    const p = characteristic.properties || {};
    // Match Mightier Amp's iOS preference. Fall back only on explicit rejection.
    const methods = [
      ...(this.writeMethod ? [this.writeMethod] : []),
      ...(p.writeWithoutResponse ? ['writeValueWithoutResponse'] : []),
      ...(p.write ? ['writeValueWithResponse'] : []), 'writeValue'
    ].filter((name, i, all) => all.indexOf(name) === i && typeof characteristic[name] === 'function');
    if (!methods.length) throw new Error('No supported Bluetooth write method.');
    let failure;
    for (const method of methods) {
      this.assertSession(epoch); if (this.pending !== pending) return;
      this.record(`TX ${pending.label} via ${method}: ${hex(packet)}`);
      try {
        await characteristic[method](packet.buffer.slice(packet.byteOffset, packet.byteOffset + packet.byteLength));
        this.assertSession(epoch); if (this.pending !== pending) return;
        this.writeMethod = method; this.lastWrite = Date.now(); this.record(`Write accepted: ${method}`); return;
      } catch (error) {
        this.assertSession(epoch); if (this.pending !== pending) return;
        this.record(`Write rejected: ${method} — ${errorText(error)}`); failure = error;
        // Never retry a mutation with another transport method: acceptance may
        // be ambiguous, and duplicate flash/preset operations are not safe.
        if (pending.mutation || !this.connected || ['SecurityError', 'NotAllowedError'].includes(error?.name)) break;
      }
    }
    throw new Error(`${pending.label}: Bluetooth write rejected (${failure?.message || 'unsupported method'}). Open Connection details.`);
  }
  async request(message, parse, label = 'Status read', { mutation = false, timeout = this.timeout } = {}) {
    if (!allowedCommand(message, mutation, this.current)) throw new Error('Unsupported command; nothing sent.');
    if (mutation && !['NAMLNK12','NAMLNK13','NAMLNK14','NAMLNK15','NAMLNK16', 'NAMLNK17','NAMLNK18','NAMLNK19'].includes(this.current?.identity)) throw new Error('Read and verify supported firmware before editing.');
    if (!this.connected) throw new Error('Plug disconnected.');
    if (this.pending) throw new Error('A read is already in progress.');
    if (this.writeStalled) throw new Error('A Bluetooth write did not finish. Disconnect and reconnect before retrying.');
    const epoch = this.epoch, characteristic = this.characteristic;
    this.decoder.reset(); this.progress(label);
    return new Promise((resolve, reject) => {
      const finish = (callback, value) => {
        if (this.pending !== pending) return;
        clearTimeout(pending.timer); this.pending = null; callback(value);
      };
      const pending = { label, parse, mutation, pages:new ReplyPages(), next:null, pumping:false, writeDone: false, matched: false, value: null,
        match: value => { pending.matched = true; pending.value = value; if (pending.writeDone) finish(resolve, value); },
        reject: error => finish(reject, error),
        timer: setTimeout(() => {
          this.writeStalled = !pending.writeDone;
          this.record(`Timeout: ${label}; write completed=${pending.writeDone}; notifications=${this.notifications}; MIDI replies=${this.frames}`);
          const error = new Error(pending.writeDone
            ? `${label}: no matching reply. Bluetooth is still connected. Open Connection details.`
            : `${label}: Bluetooth write did not finish. Open Connection details, then disconnect and reconnect.`);
          error.code = pending.writeDone ? 'reply-timeout' : 'write-timeout';
          finish(reject, error);
        }, timeout)
      };
      this.pending = pending;
      const transmit=async message=>{
        const wait=this.spacing-(Date.now()-this.lastWrite);if(wait>0)await pause(wait);
        const packets=message[0]===176?[Uint8Array.from([128,128,...message])]:encodeSysEx(message,0);
        for(let index=0;index<packets.length;index++){
          if(index)await pause(15);this.assertSession(epoch);if(this.pending!==pending)return;
          await this.writePacket(packets[index],pending,epoch,characteristic);
        }
      };
      pending.pump=()=>{
        if(pending.pumping||!pending.writeDone||!pending.next||this.pending!==pending)return;
        pending.pumping=true;
        (async()=>{
          while(pending.next&&this.pending===pending){const next=pending.next;pending.next=null;pending.writeDone=false;
            await transmit(next);this.assertSession(epoch);if(this.pending!==pending)return;pending.writeDone=true;
            if(pending.matched){finish(resolve,pending.value);return;}
          }
        })().catch(pending.reject).finally(()=>{pending.pumping=false;});
      };
      (async()=>{
        await transmit(message);this.assertSession(epoch);if(this.pending!==pending)return;
        pending.writeDone=true;if(!parse||pending.matched)finish(resolve,pending.value);else pending.pump();
      })().catch(pending.reject);
    });
  }
  async readPage(page) {
    const response = await this.request(pageRequest(page), message => parsePage(message, page), `Reading status ${page}`);
    if (response.error) throw new Error(`Status ${page}: the plug returned error ${response.error}.`);
    return response.value;
  }
  async snapshot() {
    const identity = await this.request(IDENTITY_REQUEST, parseIdentity, 'Reading firmware identity');
    this.record(`Identity: ${identity}`);
    if (!['NAMLNK12','NAMLNK13','NAMLNK14','NAMLNK15','NAMLNK16', 'NAMLNK17','NAMLNK18','NAMLNK19'].includes(identity)) throw new Error(`The plug reports ${identity}. This controller needs NAMLNK12 or later supported firmware.`);
    const words = [];
    for (const page of [0, 1, 2, 4, 5, 9, 10, 23, 24, 25]) words[page] = await this.readPage(page);
    const chain = await this.request(CHAIN_REQUEST, chainParser(), 'Reading signal chain');
    if (await this.readPage(25) !== words[25] || await this.readPage(5) !== words[5])
      throw new Error('The preset changed while reading. Refresh to read it again.');
    const state = decodeSnapshot(words, chain, identity); validateEffects(state.effects,identity);
    if(['NAMLNK13','NAMLNK14','NAMLNK15','NAMLNK16', 'NAMLNK17','NAMLNK18','NAMLNK19'].includes(identity)){
      const wire=fxRequest(0,state.active,1);const result=await this.request(wire,m=>fxReply(m,wire),'Reading FX blocks');
      if(result.error||result.active!==state.active)throw new Error('FX snapshot changed. Refresh the plug.');state.fx=result.config;
    }
    if(['NAMLNK17','NAMLNK18','NAMLNK19'].includes(identity)) {
      state.codec=decodeCodecStatus(await this.readPage(117));
      this.record(`Converter startup: ${state.codec.verified?'short-delay setting verified':'setting unverified'}; ${state.codec.raw.toString(16)}`);
    }
    this.current = state; this.progress('Ready'); return state;
  }
  async refresh() {
    if (this.busy) throw new Error('A read is already in progress.');
    this.busy = true; const epoch = this.epoch;
    try { return await this.snapshot(); }
    catch (error) { if (epoch === this.epoch) this.record(`${this.stage} failed — ${errorText(error)}`); throw error; }
    finally { if (epoch === this.epoch) this.busy = false; }
  }
}
