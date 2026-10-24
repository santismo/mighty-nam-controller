import { fullOrder, reorder } from './fx.js?v=0.9.2';
export const supportsActiveChain = identity => ['NAMLNK20','NAMLNK21','NAMLNK22','NAMLNK23', 'NAMLNK24', 'NAMLNK25', 'NAMLNK26', 'NAMLNK27','NAMLNK28'].includes(identity);
export const enabled = (effects, fx, id) => id > 9 ? Boolean(fx?.[(id-11)*16+1]) : !(effects[id]&64);
export function visibleOrder(effects, fx, identity, retained = []) {
  const order=fullOrder(effects,fx);
  return supportsActiveChain(identity)?order.filter(id=>enabled(effects,fx,id)||retained.includes(id)):order;
}
// Membership uses the persisted enable bits. Keep the complete wire inventory
// and dormant settings so either controller can add an engine back later.
export function membership(effects, fx, id, present, identity) {
  if(!supportsActiveChain(identity)||!fullOrder(effects,fx).includes(id))throw new Error('Active chains require NAMLNK20.');
  let next=[...effects], extra=fx?[...fx]:null;
  if(id>9)extra[(id-11)*16+1]=present?1:0;
  else next[id]=present?next[id]&63:next[id]|64;
  if(present&&!enabled(effects,fx,id)){
    const order=fullOrder(next,extra).filter(x=>x!==id);order.push(id);
    ({effects:next,fx:extra}=reorder(next,extra,order));
  }
  return {effects:next,fx:extra};
}

// View membership is separate from execution. Remember bypassed tiles locally;
// firmware enable bits still decide which DSP callbacks actually execute.
export class ChainView {
  constructor(storage){this.storage=storage;this.key='nam-plug-chain-view-1';}
  read(slot){try{const a=JSON.parse(this.storage.getItem(this.key)||'{}')[slot];return Array.isArray(a)?[...new Set(a.filter(n=>Number.isInteger(n)&&[1,2,3,4,5,6,7,8,9,11,12].includes(n)))]:[];}catch{return [];}}
  write(slot,ids){try{const all=JSON.parse(this.storage.getItem(this.key)||'{}');all[slot]=ids;this.storage.setItem(this.key,JSON.stringify(all));}catch{}}
}
export function replaceBlock(effects,fx,before,after,identity){
  const original=fullOrder(effects,fx),position=original.indexOf(before);
  if(before===after||position<0||!original.includes(after))throw new Error('Choose another available block.');
  const wasEnabled=enabled(effects,fx,before);
  let next=membership(effects,fx,before,false,identity);
  next=membership(next.effects,next.fx,after,true,identity);
  if(!wasEnabled){if(after>9)next.fx[(after-11)*16+1]=0;else next.effects[after]|=64;}
  const order=fullOrder(next.effects,next.fx).filter(id=>id!==after);order.splice(position,0,after);
  return reorder(next.effects,next.fx,order);
}
