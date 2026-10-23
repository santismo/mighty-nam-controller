import { A2_TOPOLOGY } from './a2-topology.js?v=0.8.6';
import { crc32,word,put } from './commands.js?v=0.8.6';
export const MAX_NAM_BYTES=4*1024*1024;
export async function sha256(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
function equal(a,b){if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]));}
function validate(model){
  if(model?.version!=='0.7.0'||model.architecture!=='WaveNet'||model.sample_rate!==48000||!model.config)throw new Error('Choose a 48 kHz NAM A2 Lite capture.');
  const {head_scale,...topology}=model.config;
  if(!Number.isFinite(head_scale)||!equal(topology,A2_TOPOLOGY))throw new Error('This capture does not contain the A2 Lite model supported by the plug.');
  if(!Array.isArray(model.weights)||model.weights.length!==1871||model.weights.some(w=>typeof w!=='number'||!Number.isFinite(Math.fround(w))))throw new Error('The capture contains invalid A2 Lite weights.');
}
export async function parseModel(bytes,metadata={}){
  if(!(bytes instanceof Uint8Array)||bytes.length>MAX_NAM_BYTES)throw new Error('Capture exceeds the size limit.');
  let root;try{root=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new Error('The downloaded file is not a NAM capture.');}
  let chosen=root;
  if(root?.architecture==='SlimmableContainer'){
    if(root.version!=='0.7.0'||!Array.isArray(root.config?.submodels)||root.config.submodels.length>32)throw new Error('Unsupported NAM container.');
    const found=[];for(const sub of root.config.submodels){const m={...sub?.model};if(m.sample_rate===undefined)m.sample_rate=root.sample_rate;try{validate(m);found.push(m);}catch{}}
    if(found.length!==1)throw new Error('Choose a capture with exactly one compatible A2 Lite model.');chosen=found[0];
  }
  validate(chosen);const slot=new Uint8Array(8192).fill(255),v=new DataView(slot.buffer);
  chosen.weights.forEach((w,i)=>v.setFloat32(32+4*i,w,true));[0x3241504d,1,48000,1871,7484,crc32(slot.slice(32,7516)),1,0].forEach((w,i)=>v.setUint32(i*4,w,true));
  return {slot,sha:await sha256(slot),crc:crc32(slot),metadata:{...metadata,source_sha256:await sha256(bytes),sample_rate:48000}};
}
export function validSlot(slot){
  if(!(slot instanceof Uint8Array)||slot.length!==8192)return false;
  if(![0x3241504d,1,48000,1871,7484].every((v,i)=>word(slot,4*i)===v)||word(slot,24)!==1||word(slot,28)!==0||word(slot,20)!==crc32(slot.slice(32,7516))||slot.slice(7516).some(b=>b!==255))return false;
  const view=new DataView(slot.buffer,slot.byteOffset,slot.byteLength);for(let p=32;p<7516;p+=4)if(!Number.isFinite(view.getFloat32(p,true)))return false;return true;
}
export async function validateModel(model){if(!validSlot(model?.slot)||model.crc!==crc32(model.slot)||model.sha!==await sha256(model.slot))throw new Error('Capture failed its integrity check. Download it again.');return model;}
export const includesCab=model=>model?.metadata?.tone?.gear==='amp-cab';
export class CaptureLibrary {
  constructor(storage){this.storage=storage;this.key='namplug.captures.v1';}
  records(){try{const rows=JSON.parse(this.storage.getItem(this.key)||'[]');return Array.isArray(rows)?rows.slice(0,64):[];}catch{return [];}}
  async add(model){await validateModel(model);if(!model.metadata||JSON.stringify(model.metadata).length>16384)throw new Error('Capture details exceed the storage limit.');const list=this.records(),old=list.find(r=>r.sha===model.sha);const row={sha:model.sha,crc:model.crc,slot:btoa(String.fromCharCode(...model.slot)),metadata:model.metadata,favorite:old?.favorite??false};
    const next=[row,...list.filter(r=>r.sha!==row.sha)];if(next.length>64)throw new Error('This phone has 64 saved captures. Remove one before adding another.');this.storage.setItem(this.key,JSON.stringify(next));return row;}
  async get(sha){const row=this.records().find(r=>r.sha===sha);if(!row||typeof row.slot!=='string'||row.slot.length>12000)throw new Error('Saved capture is unavailable.');return validateModel({...row,slot:Uint8Array.from(atob(row.slot),c=>c.charCodeAt(0))});}
  favorite(sha,value){const rows=this.records(),row=rows.find(r=>r.sha===sha);if(!row)throw new Error('Capture not saved on this phone.');row.favorite=Boolean(value);this.storage.setItem(this.key,JSON.stringify(rows));}
  remove(sha){this.storage.setItem(this.key,JSON.stringify(this.records().filter(r=>r.sha!==sha)));}
  async matching(crc){for(const row of this.records().filter(r=>r.crc===crc)){try{return await this.get(row.sha);}catch{}}return null;}
}
