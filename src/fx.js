import { same } from './controls.js?v=0.5.0';
const PREFIX=[240,67,88,112,4,2,78,70,1];
export const FX_MODES=['Pitch','Auto Wah','Chorus','Flanger','Phaser','Tremolo','Vibrato'];
export function defaultFx(){const c=Array(32).fill(0);for(let j=0;j<2;j++){const i=j*16;c[i]=j+1;c[i+2]=j+2;c[i+3]=12;c[i+4]=100;c[i+5]=30;c[i+6]=c[i+8]=c[i+9]=50;}return c;}
export function validFx(c){if(!c||c.length!==32||c.some(x=>!Number.isInteger(x)||x<0||x>127)||c[2]===c[18])throw new Error('Invalid FX blocks.');for(const i of [0,16]){if(c[i]<1||c[i]>7||c[i+1]>1||c[i+2]>10||c[i+3]>24||c.slice(i+4,i+10).some(x=>x>100)||c.slice(i+10,i+16).some(x=>x!==0))throw new Error('Invalid FX setting.');}return c;}
export function fxRequest(op,slot,nonce,config=null,model=0){
 if(![0,1,2].includes(op)||!Number.isInteger(slot)||!([0,1,2,3,4,5,6,255].includes(slot))||(op===2&&slot===255)||!Number.isInteger(nonce)||nonce<1||nonce>16383)throw new Error('Invalid FX request.');
 const body=op===1?[0,...Array.from({length:5},(_,i)=>Math.floor(model/2**(7*i))&127),...validFx(config)]:[];
 return [...PREFIX,op,slot===255?127:slot,nonce&127,nonce>>>7,...body,247];
}
export function fxReply(m,request){
 if(m.length!==48||!same(m.slice(0,9),PREFIX)||m.at(-1)!==247||m[9]!== (request[9]|64)||m[10]!==request[10]||m[11]!==request[11]||m[12]!==request[12]||m[13]>2||!([0,1,2,3,4,5,6,127].includes(m[14])))return null;
 try{return {error:m[13],active:m[14]===127?255:m[14],config:validFx([...m.slice(15,47)])};}catch{return null;}
}
export function isFxRequest(m,mutation,current){
 if(!same(m.slice(0,9),PREFIX)||m.at(-1)!==247)return false;
 try{const op=m[9];if(op===1&&(!mutation||!['NAMLNK13','NAMLNK14'].includes(current?.identity)))return false;
 const model=op===1?m.slice(14,19).reduce((n,x,i)=>n+x*2**(7*i),0):0;
 return same(m,fxRequest(op,m[10]===127?255:m[10],m[11]+128*m[12],op===1?m.slice(19,-1):null,model))&&(op!==1||model===current.modelCrc&&(m[10]===127?255:m[10])===current.active);
 }catch{return false;}
}
export function fullOrder(effects,fx){if(!fx)return effects.slice(90,99);validFx(fx);const order=effects.slice(90,99),out=[];for(let i=0;i<11;i++)out.push(i===fx[2]?11:i===fx[18]?12:order.shift());return out;}
export function reorder(effects,fx,order){const wanted=fx?[1,2,3,4,5,6,7,8,9,11,12]:[1,2,3,4,5,6,7,8,9];if(!same([...order].sort((a,b)=>a-b),wanted))throw new Error('Invalid chain order.');const next=[...effects];next.splice(90,9,...order.filter(id=>id<10));const extra=fx?[...fx]:null;if(extra){extra[2]=order.indexOf(11);extra[18]=order.indexOf(12);}return {effects:next,fx:extra};}
export function fxControls(config,slot){const i=slot*16,mode=config[i];return [
 ...(mode===1?[{name:'Pitch',index:i+3,min:0,max:24,label:v=>`${v-12>0?'+':''}${v-12} semitones`}]:[]),
 ...(mode>=3?[{name:'Rate',index:i+5,label:v=>(.05+7.95*v/100).toFixed(2)+' Hz'},{name:'Depth',index:i+6}]:[]),
 ...([4,5].includes(mode)?[{name:'Feedback',index:i+7}]:[]),
 ...(mode===2?[{name:'Sensitivity',index:i+8},{name:'Resonance',index:i+9}]:[]),
 {name:'Mix',index:i+4}
 ];}
