// NAMLNK13 pulls one short BLE reply at a time. USB keeps the original frames.
const PREFIX=[240,67,88,112,4,2,78,82,1];
export const isReplyPage=m=>m.length>=16&&PREFIX.every((x,i)=>m[i]===x)&&m.at(-1)===247;
export const pagePull=(generation,index)=>[...PREFIX,generation&127,generation>>>7,index,247];
export class ReplyPages {
 constructor(){this.generation=null;this.bytes=[];this.index=0;}
 push(m){
  if(!isReplyPage(m))return null;
  const gen=m[9]+128*m[10],index=m[11],count=m[12],total=m[13]+128*m[14],data=m.slice(15,-1);
  if(!gen||total<63||total>328||count!==Math.ceil(total/40)||index>=count||index!==this.index||
     data.length!==Math.min(40,total-index*40)||m.slice(1,-1).some(x=>x>127)||
     (this.generation!==null&&(gen!==this.generation||total!==this.total)))throw new Error('Bluetooth reply pages changed or arrived out of order. Refresh the plug.');
  this.generation=gen;this.total=total;this.bytes.push(...data);this.index++;
  return this.index===count?{message:[240,...this.bytes,247]}:{next:pagePull(gen,this.index)};
 }
}
