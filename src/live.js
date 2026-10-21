// One in-flight edit stream; updates replace the target rather than queueing
// every slider event. Any failure stops automatic writes until a fresh read.
export class LiveEdits {
  constructor(editor,{changed=()=>{},accepted=()=>{},failed=()=>{}}={}){
    Object.assign(this,{editor,changed,accepted,failed});this.reset(null);
  }
  reset(state){clearTimeout(this.timer);this.epoch=(this.epoch||0)+1;this.state=state;this.target=null;this.pending=false;this.blocked=false;}
  update(effects,buffer){
    if(this.blocked||!this.state)throw new Error('Refresh the plug before editing.');
    this.target={effects:[...effects],buffer};
    if(!this.pending){this.pending=true;const epoch=this.epoch;this.timer=setTimeout(()=>this.start(epoch),60);}
    this.changed();
  }
  async start(epoch){
    try{
      const result=await this.editor.live(this.state,()=>this.target);
      if(epoch!==this.epoch)return;
      this.state=result;this.pending=false;this.accepted(result);this.changed();
    }catch(error){
      if(epoch!==this.epoch)return;
      this.pending=false;this.blocked=true;this.target=null;this.failed(error);this.changed();
    }
  }
}
