import { fullOrder, reorder } from './fx.js?v=0.7.1';
export const supportsActiveChain = identity => identity === 'NAMLNK20';
export const enabled = (effects, fx, id) => id > 9 ? Boolean(fx?.[(id-11)*16+1]) : !(effects[id]&64);
export function visibleOrder(effects, fx, identity) {
  const order=fullOrder(effects,fx);
  return supportsActiveChain(identity)?order.filter(id=>enabled(effects,fx,id)):order;
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
