import {STOCK_AMPS,stockAmpChoices,validFx} from './fx.js?v=0.11.3';
export const isAmp=(id,fx)=>[11,12].includes(id)&&fx?.[(id-11)*16]===8;
export const ampModel=(id,fx)=>isAmp(id,fx)?STOCK_AMPS.find(a=>a.value===fx[(id-11)*16+3])?.label??'Choose amp':null;
export const ampUnavailable=state=>state?.identity==='NAMLNK30'&&!state.stockAmp?'Amp needs the corrected NAMLNK30 firmware. Update with revision 2, then reconnect.':null;
export function ampSlot(fx,visible,state){
 if(!fx||!state?.stockAmp||!stockAmpChoices(state).length)return null;
 const existing=[11,12].find(id=>isAmp(id,fx));
 if(existing)return visible.includes(existing)?null:existing;
 return [11,12].find(id=>!visible.includes(id))??null;
}
export function configureAmp(fx,id,state){
 if(![11,12].includes(id)||!state?.stockAmp)throw new Error('Amp is unavailable on this firmware.');
 const choices=stockAmpChoices(state);if(!choices.length)throw new Error('No supported amps.');
 const next=[...fx],i=(id-11)*16;
 if(!isAmp(id,fx))next.splice(i,16,8,1,fx[i+2],choices[0].value,100,50,50,50,50,50,0,0,0,0,0,0);
 next[i+1]=1;return validFx(next);
}
