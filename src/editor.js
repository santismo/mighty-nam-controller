import { fxRequest, fxReply } from './fx.js?v=0.4.1';
import { same, validateEffects, editPlan, parameterIndex } from './controls.js?v=0.4.1';
import { presetRequest,presetReply,saveBody,listenCommand,bufferCommand,tunerRequest,tunerReply } from './commands.js?v=0.4.1';
import { detectPitch } from './tuner.js?v=0.4.1';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export class PlugEditor {
  constructor(link){this.link=link;this.resetBank();this.nonce=(Date.now()>>>0)||1;}
  resetBank(){this.bank=[];this.largeReplies=null;this.bankWarning='';}
  requireLargeReplies(){
    if(this.largeReplies===false)throw new Error('Preset selection, saving and tuner are unavailable over this Bluetooth connection. Use live controls or the Mac app.');
  }
  token(){this.nonce=(this.nonce+1)>>>0;if(!this.nonce)this.nonce=1;return this.nonce;}
  async run(action){
    if(this.link.busy)throw new Error('Wait for the current operation.');
    if(!this.link.connected||!this.link.current)throw new Error('Connect and read the plug first.');
    this.link.busy=true;const epoch=this.link.epoch;
    try{return await action();}finally{if(epoch===this.link.epoch)this.link.busy=false;}
  }
  async preset(op,slot,body=[]){
    if(op!==1)this.requireLargeReplies();
    const wire=presetRequest(op,slot,this.token(),body);
    const result=await this.link.request(wire,m=>{
      const parsed=presetReply(m,wire);
      if(parsed!==null)return parsed;
      // NAMLNK12 can emit a 75-byte Bluetooth reply containing only the
      // first five bytes and the tail (offset 256) of the 326-byte reply.
      // It has already lost data before reaching the browser. Never try to
      // reconstruct preset metadata or treat this frame as an acknowledgement.
      if(m.length===75&&same(m.slice(0,5),[240,67,88,112,4])&&m.at(-1)===247)return {truncated:true};
      return null;
    },`${op===1?'Reading':op===2?'Saving':'Loading'} preset ${slot+1}`,{mutation:op!==1,timeout:op===2?20000:this.link.timeout});
    if(result.truncated){
      this.link.record('Incomplete preset reply: 75 of 326 MIDI bytes; large Bluetooth replies unavailable.');
      throw Object.assign(new Error('The plug returned an incomplete preset reply over Bluetooth.'),{code:'large-reply-truncated'});
    }
    if(result.error)throw new Error(`Preset ${slot+1} ${op===2?'save':'request'} failed (code ${result.error}).`);
    if(this.link.current?.identity==='NAMLNK13')result.fx=(await this.fx(2,slot)).config;
    this.bank[slot]=result;return result;
  }
  async fx(op,slot,config=null,model=0){
    const wire=fxRequest(op,slot,this.token()%16383+1,config,model);
    const result=await this.link.request(wire,m=>fxReply(m,wire),op===1?'Applying FX blocks':'Reading FX blocks',{mutation:op===1});
    if(result.error)throw new Error('FX settings were rejected. Refresh the plug.');return result;
  }
  readBank(){return this.run(async()=>{
    this.resetBank();
    try{
      for(let slot=0;slot<7;slot++)await this.preset(1,slot);
      this.largeReplies=true;this.link.progress('Ready');return this.bank;
    }catch(error){
      this.bank=[];
      if(!['reply-timeout','large-reply-truncated'].includes(error.code)||!this.link.connected||this.link.writeStalled)throw error;
      this.largeReplies=false;
      this.link.record(`Preset metadata unavailable: ${error.message}`);
      // This was a read-only query. Verify the small-reply path and current
      // preset again before allowing live controls to continue.
      await this.link.snapshot();
      this.bankWarning='Saved preset details could not be read. You can still adjust effects, buffer, and output. Use the plug’s preset button, then Refresh. Saving and tuner are unavailable in this session; use the Mac app.';
      this.link.progress('Ready — live controls');return null;
    }
  });}
  async current(expected){
    const now=await this.link.snapshot();
    if(now.active!==expected.active||now.modelCrc!==expected.modelCrc||now.buffer!==expected.buffer||!same(now.effects,expected.effects)||(expected.fx&&!same(now.fx,expected.fx)))throw new Error('The plug changed since this page was read. Refresh before applying edits.');
    if(now.faults||!now.running)throw new Error('The plug is not processing normally. Restart it before editing.');
    return now;
  }
  async send(message,label){await this.link.request(message,null,label,{mutation:true});}
  async applyInternal(expected,effects,buffer){
    validateEffects(effects);if(![8,16,32].includes(buffer))throw new Error('Invalid buffer.');
    const plan=editPlan(expected.effects,effects);await this.current(expected);
    for(const message of plan)await this.send(message,'Applying signal chain');
    if(buffer!==expected.buffer)await this.send(bufferCommand(buffer),'Changing buffer');
    await pause(150);const result=await this.link.snapshot();
    if(result.active!==expected.active||result.modelCrc!==expected.modelCrc||result.buffer!==buffer||!same(result.effects,effects)||result.faults||!result.running)throw new Error('The edited chain was not confirmed. Refresh before trying again.');
    if(buffer!==expected.buffer&&result.listening)throw new Error('The plug did not confirm mute after the buffer change.');
    return result;
  }
  apply(expected,effects,buffer){return this.run(()=>this.applyInternal(expected,effects,buffer));}
  // Read the latest target before every write. A slider never builds a backlog
  // of old positions, and only explicit save() calls write the onboard bank.
  live(expected,latest){return this.run(async()=>{
    let state=await this.current(expected),effects=[...state.effects],buffer=state.buffer,fx=state.fx?[...state.fx]:null,lastGuard=Date.now();
    for(;;){
      const target=latest();validateEffects(target.effects);
      if(![8,16,32].includes(target.buffer))throw new Error('Invalid buffer.');
      const plan=editPlan(effects,target.effects);
      if(plan.length||buffer!==target.buffer||(fx&&!same(fx,target.fx))){
        if(Date.now()-lastGuard>250){
          const bank=await this.link.readPage(25),model=await this.link.readPage(5);
          if((bank&255)!==expected.active||model!==expected.modelCrc)throw new Error('Preset changed. Refresh before editing again.');
          lastGuard=Date.now();continue;
        }
        if(plan.length){
          const command=plan[0];
          if(command[0]===240)await pause(80);
          await this.send(command,'Applying live control');
          if(command[0]===176)effects[command[1]<=9?command[1]:parameterIndex(command[1])]=command[2];
          else effects.splice(90,9,...command.slice(7,16));
        }else if(fx&&!same(fx,target.fx)){const reply=await this.fx(1,state.active,target.fx,state.modelCrc);if(reply.active!==state.active||!same(reply.config,target.fx))throw new Error('FX readback did not match.');fx=[...reply.config];}else{await this.send(bufferCommand(target.buffer),'Changing buffer');buffer=target.buffer;}
        continue;
      }
      await pause(100);state=await this.link.snapshot();lastGuard=Date.now();
      if(state.active!==expected.active||state.modelCrc!==expected.modelCrc||state.buffer!==buffer||!same(state.effects,effects)||(fx&&!same(state.fx,fx))||state.faults||!state.running)
        throw new Error('Live changes were not confirmed. Refresh before editing again.');
      const next=latest();if(same(next.effects,effects)&&next.buffer===buffer&&(!fx||same(next.fx,fx)))return state;
    }
  });}
  recall(slot){return this.run(async()=>{
    this.requireLargeReplies();
    const meta=await this.preset(1,slot);if(!meta.occupied)throw new Error('This preset is empty.');
    const recalled=await this.preset(3,slot),state=await this.link.snapshot();
    if(recalled.active!==slot||state.active!==slot||state.modelCrc!==recalled.modelCrc||state.buffer!==recalled.buffer||!same(state.effects,recalled.effects)||state.faults||!state.running)throw new Error('Preset recall was not confirmed. Refresh the plug.');
    if(state.fx&&!same(state.fx,recalled.fx))throw new Error('Recalled FX settings did not match.');
    return state;
  });}
  save(expected,effects,buffer,name){return this.run(async()=>{
    this.requireLargeReplies();
    // Fetch the current slot before any writes. Only preserve a known onboard
    // capture; never guess its SHA or overwrite another color's model.
    const before=await this.preset(1,expected.active);
    saveBody(before,{...expected,effects,buffer},name);
    const state=await this.applyInternal(expected,effects,buffer);
    const saved=await this.preset(2,state.active,saveBody(before,state,name));
    const checked=await this.preset(1,state.active),after=await this.link.snapshot();
    for(const entry of [saved,checked])if(!entry.occupied||entry.active!==state.active||entry.modelCrc!==before.modelCrc||!same(entry.sha,before.sha)||entry.flags!==before.flags||entry.name!==name.trim()||entry.buffer!==buffer||!same(entry.effects,effects))throw new Error('Saved preset readback did not match. Refresh before another save.');
    if(state.fx&&(!same(saved.fx,state.fx)||!same(checked.fx,state.fx)||!same(after.fx,state.fx)))throw new Error('Saved FX readback did not match.');
    if(saved.generation!==checked.generation||checked.generation<before.generation||after.listening||after.faults||!after.running||after.buffer!==buffer||after.modelCrc!==before.modelCrc||after.active!==state.active||!same(after.effects,effects))throw new Error('Save was not fully confirmed. Refresh before another save.');
    return after;
  });}
  listen(enabled){return this.run(async()=>{
    const state=await this.link.snapshot();if(enabled&&(!state.running||state.faults||!state.loaded))throw new Error('Load a healthy onboard preset before listening.');
    await this.send(listenCommand(enabled),enabled?'Enabling plug output':'Muting plug');
    const after=await this.link.snapshot();if(after.listening!==enabled)throw new Error('Plug output state was not confirmed.');return after;
  });}
  tune(reference=440){return this.run(async()=>{
    this.requireLargeReplies();
    if(!Number.isFinite(reference)||reference<430||reference>450)throw new Error('Invalid tuner reference.');
    await this.send(listenCommand(false),'Muting for tuner');
    if((await this.link.readPage(23))&1)throw new Error('Mute was not confirmed.');
    const epoch=this.link.epoch;
    const request=async(op,page=0)=>{
      const wire=tunerRequest(op,page,this.token()%16383+1);
      const data=await this.link.request(wire,m=>tunerReply(m,wire),op===2?`Reading tuner ${page+1}/16`:op===1?'Capturing guitar':'Stopping tuner',{mutation:true});
      if(data.error&&!(op===2&&data.error===1))throw new Error('The plug could not capture a tuner reading.');return data;
    };
    try{
      const start=await request(1);await pause(190);const samples=[];
      for(let page=0;page<16;page++){
        let reply;for(let attempt=0;attempt<8;attempt++){reply=await request(2,page);if(reply.generation!==start.generation)throw new Error('Tuner capture changed. Try again.');if(!reply.error)break;await pause(25);}
        if(reply.error||reply.count!==2048)throw new Error('Tuner capture did not finish.');samples.push(...reply.samples);
      }
      return {reading:detectPitch(samples,reference)};
    }finally{
      if(epoch===this.link.epoch&&this.link.connected&&!this.link.writeStalled){await request(0);await this.link.snapshot();}
    }
  });}
}
