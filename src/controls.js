import { catalog } from './catalog.js?v=0.8.4';
export { catalog };
export const hasCutEq=identity=>['NAMLNK14','NAMLNK15','NAMLNK16', 'NAMLNK17','NAMLNK18','NAMLNK19','NAMLNK20', 'NAMLNK21','NAMLNK22','NAMLNK23', 'NAMLNK24'].includes(identity);
const cutLabel=(v,high)=>{if(v===0)return 'Off';const hz=(high?1000:20)*Math.pow(high?20:50,(v-1)/99);return hz>=1000?`${(hz/1000).toFixed(2)} kHz`:`${Math.round(hz)} Hz`;};
const cutEq={id:4,name:'High / Low Cut',parameters:[false,true].map((high,i)=>({name:high?'High Cut':'Low Cut',cc:31+i,index:36+i,default:0,labels:Array.from({length:101},(_,v)=>cutLabel(v,high))}))};
const touchWah={id:14,name:'Touch Wah',parameters:[
 {name:'Type',cc:17,index:20,default:1,labels:['Cry','VX','Full','Talk']},
 {name:'Wow',cc:18,index:21,default:35},
 {name:'Sense',cc:19,index:22,default:90},
 {name:'Direction',cc:20,index:23,default:0,labels:['Down','Up']},
 {name:'Level',cc:21,index:24,default:100}
]};
export const effectChoices=(id,identity)=>id===2&&identity==='NAMLNK24'?[...catalog[id],touchWah]:id===4&&hasCutEq(identity)?[...catalog[id],cutEq]:catalog[id]??[];
export const maxType=(id,identity)=>id==2&&identity==='NAMLNK24'?14:id==4&&hasCutEq(identity)?4:MAX_TYPES[id];
export const COLORS = ['Green', 'Orange', 'Red', 'Blue', 'Cyan', 'Pink', 'Lilac'];
export const RANGES = [[13,16,15],[17,22,20],[31,42,36],[43,46,49],[47,52,54],[53,60,61],[61,64,70],[65,70,75]];
export const MAX_TYPES = {1:3,2:13,4:2,5:1,6:13,7:5,8:6,9:34};
export function parameterIndex(cc) {
  if(cc===73)return 84;
  for (const [first,last,index] of RANGES) if (cc >= first && cc <= last) return index + cc - first;
  return null;
}
export const same = (a,b) => a.length === b.length && a.every((v,i) => v === b[i]);
export function validOrder(order) { return order.length === 9 && same([...order].sort(), [1,2,3,4,5,6,7,8,9]); }
export function validateEffects(data,identity='NAMLNK14') {
  if (!data || data.length !== 128 || data.some(v => !Number.isInteger(v) || v < 0 || v > 127) ||
      !validOrder(data.slice(90,99)) || !(data[3] & 63)) throw new Error('Invalid signal chain.');
  for (const id of Object.keys(MAX_TYPES)) if (!(data[id]&63) || (data[id]&63)>maxType(id,identity)) throw new Error('Unsupported effect type.');
  for (const [first,last] of RANGES) for(let cc=first;cc<=last;cc++) if (data[parameterIndex(cc)]>100) throw new Error('Invalid effect parameter.');
  if(data[84]>100)throw new Error('Invalid master volume.');
  return data;
}
export function chosenEffect(effects, id,identity) { return effectChoices(id,identity).find(e => e.id === (effects[id]&63)); }
export function changeType(effects,id,type,identity) {
  const choice=effectChoices(id,identity).find(e=>e.id===type); if(!choice) throw new Error('Unsupported effect.');
  const next=[...effects]; next[id]=type|(effects[id]&64);
  for(const p of choice.parameters) next[p.index]=p.default;
  return validateEffects(next,identity);
}
export function editPlan(before,after,identity=null) {
  validateEffects(before,identity??undefined);validateEffects(after,identity??undefined);
  if((before[3]&63)!==(after[3]&63)) throw new Error('The NAM capture cannot be changed with an effect command.');
  const allowed=new Set([84,1,2,3,4,5,6,7,8,9,...Array.from({length:9},(_,i)=>90+i)]), messages=[];
  for(const [first,last] of RANGES) for(let cc=first;cc<=last;cc++) allowed.add(parameterIndex(cc));
  if(['NAMLNK21','NAMLNK22','NAMLNK23', 'NAMLNK24'].includes(identity))for(let i=27;i<=35;i++)allowed.add(i);
  if(before.some((v,i)=>v!==after[i]&&!allowed.has(i))) throw new Error('An unrelated setting changed.');
  if(before[84]!==after[84])messages.push([176,73,after[84]]);
  for(let id=1;id<=9;id++) if(before[id]!==after[id]) messages.push([176,id,after[id]]);
  for(const [first,last] of RANGES) for(let cc=first;cc<=last;cc++) if(before[parameterIndex(cc)]!==after[parameterIndex(cc)]) messages.push([176,cc,after[parameterIndex(cc)]]);
  if(!same(before.slice(90,99),after.slice(90,99))) messages.push([240,67,88,112,13,1,9,...after.slice(90,99),247]);
  return messages;
}
