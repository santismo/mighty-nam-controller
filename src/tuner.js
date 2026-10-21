// Monophonic YIN with multi-period refinement, matching the Mac controller.
// Input is a bounded dry snapshot from the plug; no microphone or audio API.
export function detectPitch(samples,reference=440) {
  if(samples.length!==2048||reference<430||reference>450||samples.some(x=>!Number.isFinite(x)))return null;
  const mean=samples.reduce((a,b)=>a+b,0)/samples.length;
  if(samples.reduce((a,b)=>a+((b-mean)/32768)**2,0)/samples.length<1e-6)return null;
  const difference=lag=>{let sum=0;for(let i=0;i<1024;i++)sum+=(samples[i]-samples[i+lag])**2;return sum;};
  const values=Array(302).fill(1);let cumulative=0;
  for(let lag=1;lag<=301;lag++){const d=difference(lag);cumulative+=d;values[lag]=cumulative>0?d*lag/cumulative:1;}
  let lag=4;for(;lag<301;lag++)if(values[lag]<0.12){while(lag+1<=301&&values[lag+1]<values[lag])lag++;break;}
  if(lag>=301||values[lag]>0.1)return null;
  const offset=(l,c,r)=>{const d=l-2*c+r;return d<=0?0:Math.max(-1,Math.min(1,0.5*(l-r)/d));};
  const period=lag+offset(values[lag-1],values[lag],values[lag+1]),multiple=Math.min(8,Math.floor(1000/period));
  const expected=Math.round(period*multiple),radius=Math.max(1,Math.min(3,Math.floor(period*0.45)));
  let best=expected,minimum=Infinity;
  for(let i=Math.max(2,expected-radius);i<=Math.min(1022,expected+radius);i++){const d=difference(i);if(d<minimum){minimum=d;best=i;}}
  const frequency=12000*multiple/(best+offset(difference(best-1),minimum,difference(best+1)));
  if(!Number.isFinite(frequency)||frequency<40||frequency>1400)return null;
  const note=69+12*Math.log2(frequency/reference),midi=Math.round(note),cents=(note-midi)*100;
  return {frequency,cents,midi,note:['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][midi%12],octave:Math.floor(midi/12)-1,inTune:Math.abs(cents)<=3,confidence:1-values[lag]};
}
