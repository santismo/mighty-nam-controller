import { catalog } from './catalog.js?v=0.4.1';
export { catalog };
export const COLORS = ['Green', 'Orange', 'Red', 'Blue', 'Cyan', 'Pink', 'Lilac'];
export const RANGES = [[13,16,15],[17,22,20],[31,42,36],[43,46,49],[47,52,54],[53,60,61],[61,64,70],[65,70,75]];
export const MAX_TYPES = {1:3,2:13,4:2,5:1,6:13,7:5,8:6,9:34};
export function parameterIndex(cc) {
  for (const [first,last,index] of RANGES) if (cc >= first && cc <= last) return index + cc - first;
  return null;
}
export const same = (a,b) => a.length === b.length && a.every((v,i) => v === b[i]);
export function validOrder(order) { return order.length === 9 && same([...order].sort(), [1,2,3,4,5,6,7,8,9]); }
export function validateEffects(data) {
  if (!data || data.length !== 128 || data.some(v => !Number.isInteger(v) || v < 0 || v > 127) ||
      !validOrder(data.slice(90,99)) || !(data[3] & 63)) throw new Error('Invalid signal chain.');
  for (const [id,max] of Object.entries(MAX_TYPES)) if (!(data[id]&63) || (data[id]&63)>max) throw new Error('Unsupported effect type.');
  for (const [first,last] of RANGES) for(let cc=first;cc<=last;cc++) if (data[parameterIndex(cc)]>100) throw new Error('Invalid effect parameter.');
  return data;
}
export function chosenEffect(effects, id) { return catalog[id]?.find(e => e.id === (effects[id]&63)); }
export function changeType(effects,id,type) {
  const choice=catalog[id]?.find(e=>e.id===type); if(!choice) throw new Error('Unsupported effect.');
  const next=[...effects]; next[id]=type|(effects[id]&64);
  for(const p of choice.parameters) next[p.index]=p.default;
  return validateEffects(next);
}
export function editPlan(before,after) {
  validateEffects(before);validateEffects(after);
  if((before[3]&63)!==(after[3]&63)) throw new Error('The NAM capture cannot be changed with an effect command.');
  const allowed=new Set([1,2,3,4,5,6,7,8,9,...Array.from({length:9},(_,i)=>90+i)]), messages=[];
  for(const [first,last] of RANGES) for(let cc=first;cc<=last;cc++) allowed.add(parameterIndex(cc));
  if(before.some((v,i)=>v!==after[i]&&!allowed.has(i))) throw new Error('An unrelated setting changed.');
  for(let id=1;id<=9;id++) if(before[id]!==after[id]) messages.push([176,id,after[id]]);
  for(const [first,last] of RANGES) for(let cc=first;cc<=last;cc++) if(before[parameterIndex(cc)]!==after[parameterIndex(cc)]) messages.push([176,cc,after[parameterIndex(cc)]]);
  if(!same(before.slice(90,99),after.slice(90,99))) messages.push([240,67,88,112,13,1,9,...after.slice(90,99),247]);
  return messages;
}
