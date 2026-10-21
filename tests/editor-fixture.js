import { SysExDecoder,encodeSysEx } from '../src/ble-midi.js';
import { identityFrame,pageFrame,chainFrame,statusWords } from './fixtures.js';
// Independent byte builders matching the firmware record format.
export function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let bit=0;bit<8;bit++)c=(c&1)?(c>>>1)^0xedb88320:c>>>1;}return (c^0xffffffff)>>>0;}
export function set32(b,at,n){new DataView(b.buffer).setUint32(at,n,true);}
export function get32(b,at){return new DataView(Uint8Array.from(b).buffer).getUint32(at,true);}
export function pack(b){const r=[];for(let i=0;i<b.length;){const start=r.length;r.push(0);for(let bit=0;bit<7&&i<b.length;bit++,i++){r[start]|=((b[i]&128)?1:0)<<bit;r.push(b[i]&127);}}return r;}
export function unpack(b){const r=[];for(let i=0;i<b.length;){const mask=b[i++];for(let bit=0;bit<7&&i<b.length;bit++,i++)r.push(b[i]|((mask&(1<<bit))?128:0));}return r;}
export function header(slot,effects,buffer=8){
  const h=new Uint8Array(256);set32(h,0,0x3142504e);set32(h,4,1);set32(h,8,slot);set32(h,12,1);set32(h,16,0x12345678+slot);set32(h,20,1);set32(h,24,buffer);
  h.fill(slot+1,32,64);h.set(new TextEncoder().encode(`Preset ${slot+1}`),64);h.set(effects,128);return h;
}
export function presetFrame(request,h,active=0,mask=127,error=0){
  const q=unpack(request.slice(9,-1)),r=new Uint8Array(276);set32(r,0,0x3031504e);r[4]=1;r[5]=q[5]|128;r[6]=q[6];r[7]=error;set32(r,8,get32(q,8));r[13]=1;r[14]=active;r[15]=mask;if(h)r.set(h,16);set32(r,272,crc(r.slice(0,272)));return [...request.slice(0,9),...pack(r),247];
}
export function tunerFrame(request,{generation=1,error=0,count=2048,frequency=110}={}){
  const r=new Uint8Array(280);set32(r,0,0x31554e4d);r[4]=1;r[5]=request[9]|128;r[6]=request[10];r[7]=error;set32(r,8,request[11]+128*request[12]);set32(r,12,generation);r[16]=12000&255;r[17]=12000>>>8;r[18]=count&255;r[19]=count>>>8;
  if(request[9]===2)for(let i=0;i<128;i++)new DataView(r.buffer).setInt16(20+2*i,Math.round(7000*Math.sin(2*Math.PI*frequency*(request[10]*128+i)/12000)),true);
  set32(r,276,crc(r.slice(0,276)));return [...request.slice(0,9),...pack(r),247];
}
const ranges=[[13,16,15],[17,22,20],[31,42,36],[43,46,49],[47,52,54],[53,60,61],[61,64,70],[65,70,75]];
export function editingBluetooth(options={}){
  const words=statusWords(),effects=chainFrame().slice(7,-1),bank=Array.from({length:7},(_,i)=>header(i,effects));
  let generation=0,saveCount=0,writeCount=0;const requests=[],writes=[],methods=[];
  const characteristic=new EventTarget();characteristic.properties={notify:true,write:true,writeWithoutResponse:true};characteristic.startNotifications=async()=>characteristic;
  const reply=frame=>queueMicrotask(()=>{for(const packet of encodeSysEx(frame,0)){characteristic.value=packet.buffer;characteristic.dispatchEvent(new Event('characteristicvaluechanged'));}});
  const decoder=new SysExDecoder(frame=>{
    const m=[...frame];requests.push(m);options.onRequest?.(m,{words,effects,bank});
    if(m.length===5){reply(identityFrame());return;}
    if(m.length===7){for(let p=0;p<3;p++)reply([240,67,88,112,12,2,words[25]&255,48+p,...effects.slice(p*50,(p+1)*50),247]);return;}
    if(m[7]===80){reply(pageFrame(m[8],words[m[8]]));return;}
    if(m[7]===65){words[23]=m[8];return;}
    if(m[7]===66){words[24]=((words[24]&0xffffff00)|m[8])>>>0;words[23]=0;return;}
    if(m[4]===13){effects.splice(90,9,...m.slice(7,16));return;}
    if(m[7]===83){
      const q=unpack(m.slice(9,-1)),op=q[5],slot=q[6];let error=0;
      if(op===3){effects.splice(0,128,...bank[slot].slice(128));words[5]=get32(bank[slot],16);words[24]=((words[24]&0xffffff00)|get32(bank[slot],24))>>>0;words[25]=(words[25]&0xffffff00)|slot;}
      if(op===2){
        if(get32(q,16)!==words[5]||get32(q,20)!==crc(effects))error=2;
        else{saveCount++;const h=header(slot,effects,get32(q,28));set32(h,12,get32(bank[slot],12)+1);set32(h,16,words[5]);set32(h,20,get32(q,24));h.set(q.slice(32,64),32);h.set(q.slice(64,128),64);bank[slot]=h;words[23]=0;}
      }
      options.onPreset?.(op,slot,{words,effects,bank});
      if(op===2&&options.dropSaveReply)return;
      reply(presetFrame(m,bank[slot],words[25]&255,127,error));return;
    }
    if(m[7]===85){if(m[9]===1)generation++;reply(tunerFrame(m,{generation:generation+(options.changedTuner&&m[10]===3?1:0),error:m[9]===1&&words[23]?3:0,frequency:options.frequency??110}));return;}
    throw new Error(`Unexpected request: ${m}`);
  });
  const write=async(method,data)=>{
    methods.push(method);writeCount++;if(options.rejectMutation&&new Uint8Array(data)[2]===176)throw new Error('Request rejected');
    if(options.delay)await new Promise(r=>setTimeout(r,options.delay));
    const packet=[...new Uint8Array(data)];writes.push(packet);
    if(packet[2]===176){const cc=packet[3],value=packet[4];requests.push(packet.slice(2));if(!options.ignoreCC){if(cc<=9)effects[cc]=value;else{const r=ranges.find(([a,b])=>cc>=a&&cc<=b);effects[r[2]+cc-r[0]]=value;}}options.onCC?.(cc,value);}
    else decoder.push(Uint8Array.from(packet));
  };
  characteristic.writeValueWithoutResponse=d=>write('without',d);characteristic.writeValueWithResponse=d=>write('with',d);
  const device=new EventTarget();device.gatt={connected:false,async connect(){this.connected=true;return this;},async getPrimaryService(){return {getCharacteristic:async()=>characteristic};},disconnect(){this.connected=false;device.dispatchEvent(new Event('gattserverdisconnected'));}};
  return {bluetooth:{requestDevice:async()=>device},device,characteristic,words,effects,bank,requests,writes,methods,get saveCount(){return saveCount;},get writeCount(){return writeCount;}};
}
