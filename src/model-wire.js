// A2 Lite RAM-model messages only. No firmware updater or raw-memory commands.
import { crc32,word,put,pack7,unpack7 } from './commands.js?v=0.7.3';
const PREFIX=[240,67,88,112,4,2,78,76,1];
export function modelPacket(op,session=0,offset=0,data=[]){
  if(![1,2,3,4,5,6].includes(op)||!Number.isInteger(session)||session<0||session>0xffffffff||!Number.isInteger(offset)||offset<0||offset>8192||data.length>256||data.some(b=>!Number.isInteger(b)||b<0||b>255))throw new Error('Invalid model packet.');
  const raw=Array(24+data.length).fill(0);put(raw,0,0x314c504d);raw[4]=1;raw[5]=op;raw[6]=data.length&255;raw[7]=data.length>>>8;put(raw,8,session);put(raw,12,offset);put(raw,16,crc32(data));put(raw,20,crc32(raw.slice(0,20)));raw.splice(24,data.length,...data);
  const wire=[...PREFIX,...pack7(raw),247];if(!modelRequest(wire))throw new Error('Invalid model request.');return wire;
}
function unpack(m){
  if(m.length>330||m.at(-1)!==247||!PREFIX.every((b,i)=>m[i]===b))return null;
  try{const r=unpack7(m.slice(9,-1));if(r.length<24||r.length>280||word(r,0)!==0x314c504d||r[4]!==1||r.length!==24+r[6]+256*r[7]||word(r,20)!==crc32(r.slice(0,20))||word(r,16)!==crc32(r.slice(24)))return null;return r;}catch{return null;}
}
export function modelRequest(m){
  const r=unpack(m);if(!r)return null;const op=r[5],session=word(r,8),offset=word(r,12),n=r.length-24;
  if(op===1)return !session&&!offset&&!n?r:null;
  if(!session)return null;
  if(op===2)return !offset&&n===8&&word(r,24)===8192?r:null;
  if(op===3)return n>0&&n<=256&&offset+n<=8192?r:null;
  return [4,5,6].includes(op)&&!offset&&!n?r:null;
}
export function modelReply(m,q){
  const r=unpack(m),request=modelRequest(q);if(!r||!request||r.length!==48||r[5]!== (request[5]|128)||word(r,8)!==word(request,8)||word(r,12)!==0)return null;
  return {error:word(r,24),received:word(r,28),crc:word(r,32),slotBytes:word(r,36),maxChunk:word(r,40),capabilities:word(r,44)};
}
