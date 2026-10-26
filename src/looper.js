// Explicit, serialized looper commands. No audio streams, mute or flash writes.
const PREFIX=[240,67,88,112,4,2,78,79,1];
const same=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
export const hasLooper=identity=>['NAMLNK25','NAMLNK26', 'NAMLNK27','NAMLNK28','NAMLNK29','NAMLNK30'].includes(identity);
export function loopRequest(op,arg,nonce,identity) {
  if(!hasLooper(identity)||!Number.isInteger(nonce)||nonce<1||nonce>16383||!Number.isInteger(arg)||!Number.isInteger(op))throw new Error('Unsupported looper request.');
  const next=['NAMLNK26','NAMLNK27','NAMLNK28','NAMLNK29','NAMLNK30'].includes(identity);
  const takes=['NAMLNK29','NAMLNK30'].includes(identity);
  if(!(op===0&&arg>=0&&arg<=(takes?7:['NAMLNK27','NAMLNK28'].includes(identity)?6:next?5:4)||op===1&&arg>=1&&arg<=(takes?14:next?10:5)||next&&op===2&&arg>=12&&arg<=60||next&&op===3&&arg>=0&&arg<=100||next&&op===4&&[30,60].includes(arg)||['NAMLNK28','NAMLNK29','NAMLNK30'].includes(identity)&&op===5&&arg===1||takes&&(op>=6&&op<=9&&arg>=0&&arg<=100||op===10&&arg>=0&&arg<=7||(op===11||op===12)&&arg>=1&&arg<=3)))throw new Error('Invalid looper control.');
  return [...PREFIX,op,arg,nonce&127,nonce>>>7,247];
}
export function isLoopRequest(message,mutation,current) {
  try{return (message[9]===0||mutation)&&same(message,loopRequest(message[9],message[10],message[11]+128*message[12],current?.identity));}catch{return false;}
}
export function loopReply(message,request) {
  if(message.length!==55||message.at(-1)!==247||!same(message.slice(0,9),PREFIX)||message[9]!==(request[9]|64)||!same(message.slice(10,13),request.slice(10,13))||message[13]>3||message.slice(1,-1).some(b=>!Number.isInteger(b)||b<0||b>127))return null;
  const words=[];
  for(let i=0;i<8;i++){
    const part=message.slice(14+i*5,19+i*5);if(part[4]>15)return null;
    words.push(part.reduce((n,b,j)=>n+b*2**(7*j),0)>>>0);
  }
  return {error:message[13],words};
}
export function decodeLoop(words,identity) {
  let state,length,cursor,pending,sequence,error,settings,faults,flags=0;
  let peak=null;
  if(['NAMLNK26','NAMLNK27','NAMLNK28','NAMLNK29','NAMLNK30'].includes(identity)){
    if(words.length!==8)throw new Error('Invalid loop status.');
    [state,length,cursor,pending,sequence,error,settings,faults]=words;flags=state>>>8;state&=255;
    if(['NAMLNK27','NAMLNK28','NAMLNK29','NAMLNK30'].includes(identity)){
      if(error>>>24)throw new Error('Invalid input meter.');
      peak=(error>>>8)/65535;error&=255;
    }
  }else{
    if(identity!=='NAMLNK25'||words.length!==40||words[0]!==0x4c4f5031||words[1]!==1||words[2]!==2)throw new Error('Invalid loop status.');
    state=words[8];length=words[9];cursor=words[10];pending=words[12];sequence=words[13];error=words[14];faults=words[3];
  }
  if(['NAMLNK28','NAMLNK29','NAMLNK30'].includes(identity)&&settings>>>25)throw new Error('Invalid saved loop settings.');
  const seconds=settings?(settings>>>16)&255:30,threshold=settings?settings&255:40,volume=settings?(settings>>>8)&255:50;
  if(state>5||length>720000||cursor>length||error>3||flags>15||![30,60].includes(seconds)||threshold<12||threshold>60||volume>100)throw new Error('Invalid loop state.');
  return {state,length,cursor,pending,sequence,error,faults,seconds,threshold,volume,rate:seconds===60?12000:24000,
    mode:Boolean(flags&1),overdub:Boolean(flags&2),committing:Boolean(flags&4),reverse:Boolean(flags&8),extended:identity!=='NAMLNK25',saveSupported:['NAMLNK28','NAMLNK29','NAMLNK30'].includes(identity),saved:['NAMLNK28','NAMLNK29','NAMLNK30'].includes(identity)&&Boolean(settings>>>24&1),peak};
}
export function thresholdMeter(peak,threshold){
  if(peak===null||peak===undefined)return {available:false,percent:0,above:false,label:'Live level needs NAMLNK27'};
  const db=peak>0?20*Math.log10(peak):-96;
  return {available:true,percent:Math.max(0,Math.min(100,(db+60)/48*100)),above:db>=-threshold,
    label:`Input ${db<-60?'below −60':db.toFixed(0)} dB · ${db>=-threshold?'above':'below'} threshold`};
}
export class Looper {
  constructor(connection){this.connection=connection;this.nonce=0;}
  async request(op,arg){
    const message=loopRequest(op,arg,this.nonce=this.nonce%16383+1,this.connection.current?.identity);
    const reply=await this.connection.request(message,m=>loopReply(m,message),op?'Changing loop':'Reading loop',{mutation:op!==0});
    if(reply.error===3&&op===5)throw new Error('Looper settings save failed; refresh before retrying.');
    if(reply.error===2&&op===5)throw new Error('Clear the retained loop before saving looper settings.');
    if(reply.error)throw new Error(['','Invalid loop control.','Loop is busy; refresh before trying again.','Loop memory check failed.'][reply.error]);
    return reply.words;
  }
  async read(){
    const identity=this.connection.current?.identity;
    if(['NAMLNK26','NAMLNK27','NAMLNK28','NAMLNK29','NAMLNK30'].includes(identity)){
      const state=decodeLoop(await this.request(0,['NAMLNK27','NAMLNK28','NAMLNK29','NAMLNK30'].includes(identity)?6:5),identity);
      if(['NAMLNK29','NAMLNK30'].includes(identity))state.takes=decodeTakes(await this.request(0,7));
      return state;
    }
    const words=[];for(let i=0;i<5;i++)words.push(...await this.request(0,i));return decodeLoop(words,identity);
  }
  async change(op,arg){
    const [sequence]=await this.request(op,arg);
    for(let i=0;i<10;i++){
      const state=await this.read();
      if(state.sequence===sequence&&!state.pending){
        if(state.error)throw new Error('That loop action is unavailable in the current state.');
        return state;
      }
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    throw new Error('Loop action not confirmed. Refresh before trying again.');
  }
}

// One page contains all four tracks, avoiding per-track Bluetooth round trips.
export function decodeTakes(w){
  if(w.length!==8||w.some(x=>!Number.isInteger(x)||x<0||x>0xffffffff)||w[0]>>>20||w[1]>>>28||w[4]>3||(w[5]&~0x303)||w[7]>720000)throw new Error('Invalid take status.');
  const tracks=Array.from({length:4},(_,i)=>({index:i,present:Boolean(w[0]&(1<<i)),muted:Boolean(w[0]&(16<<i)),recording:Boolean(w[0]&(256<<i)),undone:Boolean(w[0]&(4096<<i)),level:(w[1]>>>(7*i))&127,peak:((w[2+(i>>1)]>>>(16*(i&1)))&65535)/32768}));
  if(tracks.some(t=>t.level>100||t.peak>1)||tracks.filter(t=>t.recording).length>1||tracks.filter(t=>t.undone).length>1||(w[5]&3)&&Boolean(w[5]>>>8)||tracks.some(t=>t.recording&&!t.present||t.undone&&t.present))throw new Error('Invalid take status.');
  return {tracks,available:w[4],undo:Boolean(w[5]&3),redo:Boolean(w[5]>>>8),preparing:(w[0]>>>16)&3,pending:Boolean(w[0]&(1<<18)),canEdit:Boolean(w[0]&(1<<19)),generation:w[6],length:w[7]};
}
