// Serial polling: never queue stale snapshots or retry a failed device request.
export class AutoTuner {
  constructor({read,onReading=()=>{},onError=()=>{},onProgress=()=>{},onBusy=()=>{},interval=150}){
    Object.assign(this,{read,onReading,onError,onProgress,onBusy,interval});this.generation=0;this.running=false;
  }
  start(){
    if(this.running)return;
    this.running=true;const generation=++this.generation;
    const canceled=()=>!this.running||generation!==this.generation;
    const next=async()=>{
      if(canceled())return;
      this.onBusy(true);
      try{
        const result=await this.read({canceled,onProgress:n=>{if(!canceled())this.onProgress(n);}});
        if(!canceled()){this.onReading(result);this.timer=setTimeout(next,this.interval);}
      }catch(error){if(!canceled()){this.stop();this.onError(error);}}
      finally{this.onBusy(false);}
    };
    next();
  }
  stop(){this.running=false;this.generation++;clearTimeout(this.timer);}
}
