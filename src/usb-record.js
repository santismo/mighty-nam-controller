import {readNam as readTone} from './nam-controls.js?v=0.11.3';
const PREFIX=[240,67,88,112,4,2,78,86,1];
const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
export const neutralNam=()=>[48];
export function validNam(c){if(!c||c.length!==1||c.some((v,i)=>!Number.isInteger(v)||v<0||v>96))throw new Error('Invalid NAM controls.');return c;}
export function readNam(effects){return effects[33]===78&&effects[34]===2?validNam(effects.slice(35,36)):neutralNam();}
export function putNam(effects,config){const current=readTone(effects);effects.splice(27,9,...current,78,2,...validNam(config));return effects;}
export function namRequest(op,slot,nonce,config=null,model=0){
 if(![0,1].includes(op)||![0,1,2,3,4,5,6,255].includes(slot)||!Number.isInteger(nonce)||nonce<1||nonce>16383||!Number.isInteger(model)||model<0||model>0xffffffff)throw new Error('Invalid NAM request.');
 return [...PREFIX,op,slot===255?127:slot,nonce&127,nonce>>>7,...(op?[0,...Array.from({length:5},(_,i)=>Math.floor(model/2**(7*i))&127),...validNam(config)]:[]),247];
}
export function namReply(m,q){
 if(m.length!==17||!same(m.slice(0,9),PREFIX)||m.at(-1)!==247||m.slice(1,-1).some(x=>!Number.isInteger(x)||x<0||x>127)||m[9]!== (q[9]|64)||!same(m.slice(10,13),q.slice(10,13))||m[13]>2||![0,1,2,3,4,5,6,127].includes(m[14]))return null;
 try{return {error:m[13],active:m[14]===127?255:m[14],config:validNam(m.slice(15,16))};}catch{return null;}
}
export function isNamRequest(m,mutation,current){
 try{if(!['NAMLNK21','NAMLNK22','NAMLNK23', 'NAMLNK24', 'NAMLNK25', 'NAMLNK26', 'NAMLNK27','NAMLNK28','NAMLNK29','NAMLNK30'].includes(current?.identity)||!same(m.slice(0,9),PREFIX)||m.slice(1,-1).some(x=>!Number.isInteger(x)||x<0||x>127))return false;
 const op=m[9],slot=m[10]===127?255:m[10],crc=op?m.slice(14,19).reduce((n,v,i)=>n+v*2**(7*i),0):0;
 return same(m,namRequest(op,slot,m[11]+128*m[12],op?m.slice(19,-1):null,crc))&&(!op||mutation&&slot===current.active&&crc===current.modelCrc);
 }catch{return false;}
}
