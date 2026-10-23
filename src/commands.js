import {isLoopRequest} from './looper.js?v=0.8.6';
import {isNamRequest as isRecordRequest} from './usb-record.js?v=0.8.6';
import { isNamRequest } from './nam-controls.js?v=0.8.6';
import { isFxRequest } from './fx.js?v=0.8.6';
import { modelRequest } from './model-wire.js?v=0.8.6';
import { isReadOnlyRequest } from './protocol.js?v=0.8.6';
import { MAX_TYPES, maxType, parameterIndex, validOrder, validateEffects, same, COLORS } from './controls.js?v=0.8.6';
export function crc32(bytes) { let c=0xffffffff; for(const byte of bytes) {c^=byte; for(let i=0;i<8;i++) c=(c>>>1)^((c&1)?0xedb88320:0);} return (c^0xffffffff)>>>0; }
export const word=(b,at)=>new DataView(Uint8Array.from(b).buffer).getUint32(at,true);
export const put=(b,at,value)=>{for(let i=0;i<4;i++)b[at+i]=(value>>>(8*i))&255;};
export function pack7(bytes) { const out=[]; for(let at=0;at<bytes.length;at+=7){const group=bytes.slice(at,at+7);out.push(group.reduce((mask,b,i)=>mask|((b>>>7)<<i),0),...group.map(b=>b&127));}return out; }
export function unpack7(bytes) {
  if(bytes.some(b=>!Number.isInteger(b)||b<0||b>127)) throw new Error('Invalid packed data.');
  const out=[];for(let at=0;at<bytes.length;at+=8){const group=bytes.slice(at,at+8);if(group.length<2||group[0]>=(1<<(group.length-1)))throw new Error('Invalid packed mask.');for(let i=1;i<group.length;i++)out.push(group[i]|(((group[0]>>>(i-1))&1)<<7));}return out;
}
const NS=[240,67,88,112,4,2,78,83,1], NU=[240,67,88,112,4,2,78,85,1];
const prefix=(m,p)=>same(m.slice(0,p.length),p);
export function nameBytes(name) {
  const bytes=[...new TextEncoder().encode(name.trim())];
  if(!bytes.length||bytes.length>63||bytes.some(b=>b<32||b===127))throw new Error('Use a name of 1–63 UTF-8 bytes without control characters.');
  return bytes;
}
function rawPreset(message) {
  if(!prefix(message,NS)||message.at(-1)!==247)throw new Error('Invalid preset frame.');
  const raw=unpack7(message.slice(9,-1));
  if(![20,132].includes(raw.length)||word(raw,0)!==0x3031504e||raw[4]!==1||raw[6]>6||raw[7]||!word(raw,8)||raw[14]||raw[15]||
     raw[12]+256*raw[13]!==raw.length-20||word(raw,raw.length-4)!==crc32(raw.slice(0,-4))||
     !((raw.length===20&&[1,3].includes(raw[5]))||(raw.length===132&&raw[5]===2)))throw new Error('Invalid preset request.');
  if(raw[5]===2) {
    const body=raw.slice(16,-4), end=body.indexOf(0,48);
    if(!word(body,0)||word(body,8)>1||![8,16,32].includes(word(body,12))||end<49||body.slice(end).some(b=>b!==0))throw new Error('Invalid preset save.');
    const name=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(body.slice(48,end)));nameBytes(name);
  }
  return raw;
}
export function presetRequest(op,slot,nonce,body=[]) {
  if(!Number.isInteger(slot)||slot<0||slot>6||!Number.isInteger(nonce)||nonce<1||nonce>0xffffffff)throw new Error('Invalid preset address.');
  const raw=Array(body.length+20).fill(0);put(raw,0,0x3031504e);raw[4]=1;raw[5]=op;raw[6]=slot;put(raw,8,nonce);raw[12]=body.length&255;raw[13]=body.length>>>8;
  raw.splice(16,body.length,...body);put(raw,raw.length-4,crc32(raw.slice(0,-4)));
  const wire=[...NS,...pack7(raw),247];rawPreset(wire);return wire;
}
export function saveBody(saved,state,name,{playOnBoot=true}={}) {
  if(typeof playOnBoot!=='boolean')throw new Error('Invalid startup output setting.');
  validateEffects(state.effects,state.identity);
  if(!saved?.occupied||saved.modelCrc!==state.modelCrc||saved.slot!==state.active||saved.sha?.length!==32)throw new Error('Recall an onboard capture before saving.');
  const body=Array(112).fill(0);put(body,0,state.modelCrc);put(body,4,crc32(state.effects));put(body,8,playOnBoot?1:0);put(body,12,state.buffer);
  body.splice(16,32,...saved.sha);const bytes=nameBytes(name);body.splice(48,bytes.length,...bytes);return body;
}
export function presetReply(wire,request,identity='NAMLNK14') {
  if(wire.length!==326||!prefix(wire,NS)||wire.at(-1)!==247)return null;
  let raw;try{raw=unpack7(wire.slice(9,-1));}catch{return null;}
  const req=rawPreset(request);
  if(raw.length!==276||word(raw,0)!==0x3031504e||raw[4]!==1||raw[5]!== (req[5]|128)||raw[6]!==req[6]||word(raw,8)!==word(req,8)||
     raw[12]!==0||raw[13]!==1||!(raw[14]<7||raw[14]===255)||raw[15]>127||word(raw,272)!==crc32(raw.slice(0,272)))return null;
  if(raw[7])return {error:raw[7]};
  const slot=raw[6],occupied=Boolean(raw[15]&(1<<slot)),header=raw.slice(16,272),base={slot,active:raw[14],mask:raw[15],occupied};
  if(!occupied){if(header.some(b=>b!==0))return null;return {...base,name:COLORS[slot],generation:0,modelCrc:0,sha:null,effects:null,buffer:8,flags:0};}
  if(word(header,0)!==0x3142504e||word(header,4)!==1||word(header,8)!==slot||!word(header,12)||!word(header,16)||word(header,20)>1||![8,16,32].includes(word(header,24))||word(header,28))return null;
  const names=header.slice(64,128),end=names.indexOf(0);if(end<1||names.slice(end).some(b=>b!==0))return null;
  try{const name=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(names.slice(0,end)));nameBytes(name);
    return {...base,name,generation:word(header,12),modelCrc:word(header,16),flags:word(header,20),buffer:word(header,24),sha:header.slice(32,64),effects:validateEffects(header.slice(128),identity)};
  }catch{return null;}
}
export function tunerRequest(op,page,nonce) {
  if(![0,1,2].includes(op)||!Number.isInteger(page)||page<0||page>15||(op!==2&&page!==0)||!Number.isInteger(nonce)||nonce<1||nonce>16383)throw new Error('Invalid tuner request.');
  return [...NU,op,page,nonce&127,nonce>>>7,247];
}
export function tunerReply(wire,request) {
  if(wire.length!==330||!prefix(wire,NU)||wire.at(-1)!==247)return null;
  let raw;try{raw=unpack7(wire.slice(9,-1));}catch{return null;}
  if(raw.length!==280||word(raw,0)!==0x31554e4d||raw[4]!==1||raw[5]!== (request[9]|128)||raw[6]!==request[10]||![0,1,3].includes(raw[7])||
    word(raw,8)!==request[11]+128*request[12]||raw[16]+256*raw[17]!==12000||raw[18]+256*raw[19]>2048||word(raw,276)!==crc32(raw.slice(0,276)))return null;
  return {error:raw[7],generation:word(raw,12),count:raw[18]+256*raw[19],samples:Array.from({length:128},(_,i)=>new DataView(Uint8Array.from(raw).buffer).getInt16(20+2*i,true))};
}
export const listenCommand=enabled=>[240,67,88,112,4,2,78,65,enabled?1:0,247];
export const bufferCommand=samples=>[240,67,88,112,4,2,78,66,samples,247];
export function allowedCommand(m,mutation=false,current=null) {
  if(isLoopRequest(m,mutation,current))return true;
  if(isReadOnlyRequest(m))return true;
  if(modelRequest(m))return mutation&&['NAMLNK14','NAMLNK15','NAMLNK16', 'NAMLNK17','NAMLNK18','NAMLNK19','NAMLNK20', 'NAMLNK21','NAMLNK22','NAMLNK23', 'NAMLNK24', 'NAMLNK25', 'NAMLNK26'].includes(current?.identity);
  if(isFxRequest(m,mutation,current))return true;
  if(isRecordRequest(m,mutation,current)||isNamRequest(m,mutation,current))return true;
  try{if(prefix(m,NS)){const raw=rawPreset(m);return raw[5]===1||mutation;}}catch{return false;}
  if(!mutation)return false;
  if(m.length===3&&m[0]===176&&m.every(Number.isInteger)&&m[2]>=0&&m[2]<=127) {
    const cc=m[1],value=m[2];
    if(cc===3)return Boolean(current)&& (value&63)===(current.effects[3]&63);
    if(MAX_TYPES[cc])return (value&63)>0&&(value&63)<=maxType(cc,current?.identity);
    return parameterIndex(cc)!==null&&value<=100;
  }
  if(m.length===17&&prefix(m,[240,67,88,112,13,1,9])&&m[16]===247)return validOrder(m.slice(7,16));
  if(m.length===10&&prefix(m,[240,67,88,112,4,2,78])&&m[9]===247)return (m[7]===65&&[0,1].includes(m[8]))||(m[7]===66&&[8,16,32].includes(m[8]));
  if(m.length===14&&prefix(m,NU)&&m[9]>=3){try{return ['NAMLNK15','NAMLNK16', 'NAMLNK17','NAMLNK18','NAMLNK19','NAMLNK20', 'NAMLNK21','NAMLNK22','NAMLNK23', 'NAMLNK24', 'NAMLNK25', 'NAMLNK26'].includes(current?.identity)&&same(m,compactTunerRequest(m[9],m[11]+128*m[12]));}catch{return false;}}
  if(m.length===14&&prefix(m,NU)){try{return same(m,tunerRequest(m[9],m[10],m[11]+128*m[12]));}catch{return false;}}
  return false;
}

export function compactTunerRequest(op,nonce) {
  if(![3,4,5].includes(op)||!Number.isInteger(nonce)||nonce<1||nonce>16383)throw new Error('Invalid compact tuner request.');
  return [...NU,op,0,nonce&127,nonce>>>7,247];
}
export function compactTunerReply(wire,request){
  if(wire.length!==42||!prefix(wire,[240,67,88,112,4,2,78,86,2])||wire.at(-1)!==247)return null;
  let raw;try{raw=unpack7(wire.slice(9,-1));}catch{return null;}
  if(raw.length!==28||word(raw,0)!==0x32554e4d||raw[4]!==2||raw[5]!==(request[9]|128)||raw[6]||![0,1,3].includes(raw[7])||word(raw,8)!==request[11]+128*request[12]||word(raw,24)!==crc32(raw.slice(0,24)))return null;
  const frequency=word(raw,16)/1000,confidence=word(raw,20)/1000000;
  if((frequency!==0&&(frequency<40||frequency>1400))||confidence>1)return null;
  return {error:raw[7],generation:word(raw,12),frequency,confidence};
}
