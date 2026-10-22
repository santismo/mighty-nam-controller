import {namRequest as recordRequest,namReply as recordReply,readNam as readRecord} from './usb-record.js?v=0.8.2';
import { namRequest, namReply, readNam, putNam } from './nam-controls.js?v=0.8.2';
import { fxRequest, fxReply } from './fx.js?v=0.8.2';
import { same, validateEffects, editPlan, parameterIndex } from './controls.js?v=0.8.2';
import { presetRequest,presetReply,saveBody,listenCommand,bufferCommand,tunerRequest,tunerReply,compactTunerRequest,compactTunerReply } from './commands.js?v=0.8.2';
import { detectPitch, pitchReading } from './tuner.js?v=0.8.2';
import { modelPacket,modelReply } from './model-wire.js?v=0.8.2';
import { validateModel,includesCab } from './model.js?v=0.8.2';
import { put,crc32,nameBytes } from './commands.js?v=0.8.2';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export class PlugEditor {
  constructor(link,{recoveryStorage=null}={}){this.recoveryStorage=recoveryStorage;this.link=link;this.resetBank();this.nonce=(Date.now()>>>0)||1;}
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
    if(['NAMLNK13','NAMLNK14','NAMLNK15','NAMLNK16', 'NAMLNK17','NAMLNK18','NAMLNK19','NAMLNK20', 'NAMLNK21','NAMLNK22'].includes(this.link.current?.identity))result.fx=(await this.fx(2,slot)).config;
    this.bank[slot]=result;return result;
  }
  async fx(op,slot,config=null,model=0){
    const wire=fxRequest(op,slot,this.token()%16383+1,config,model);
    const result=await this.link.request(wire,m=>fxReply(m,wire),op===1?'Applying FX blocks':'Reading FX blocks',{mutation:op===1});
    if(result.error)throw new Error('FX settings were rejected. Refresh the plug.');return result;
  }
  async nam(state,effects){
    if(!['NAMLNK21','NAMLNK22'].includes(state.identity))throw new Error('NAM controls require NAMLNK21.');
    const config=readNam(effects),q=namRequest(1,state.active,this.token()%16383+1,config,state.modelCrc);
    const reply=await this.link.request(q,m=>namReply(m,q),'Applying NAM controls',{mutation:true});
    if(reply.error||reply.active!==state.active||!same(reply.config,config))throw new Error('NAM controls were not confirmed. Refresh the plug.');
  }
  async recording(state,effects){
    if(!['NAMLNK21','NAMLNK22'].includes(state.identity))throw new Error('USB recording gain require NAMLNK21.');
    const config=readRecord(effects),q=recordRequest(1,state.active,this.token()%16383+1,config,state.modelCrc);
    const reply=await this.link.request(q,m=>recordReply(m,q),'Applying USB recording gain',{mutation:true});
    if(reply.error||reply.active!==state.active||!same(reply.config,config))throw new Error('USB recording gain were not confirmed. Refresh the plug.');
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
  async preserveOutput(state,expectedListening){
    // Resume only after all operation-specific model/control checks passed.
    if(state.listening===expectedListening)return state;
    if(!expectedListening||state.faults||!state.running||!state.loaded)throw new Error('Output changed unexpectedly. Refresh the plug.');
    await this.send(listenCommand(true),'Resuming plug output');
    const after=await this.link.snapshot();
    if(!after.listening||after.faults||!after.running||after.modelCrc!==state.modelCrc||after.active!==state.active||after.buffer!==state.buffer||!same(after.effects,state.effects)||!same(after.fx,state.fx)){try{await this.send(listenCommand(false),'Output changed during resume');}catch{}throw new Error('Playback was not confirmed. Refresh the plug.');}
    return after;
  }
  syncGlobalBuffer(state){if(state.globalBuffer&&!state.bufferStorageError)for(const p of this.bank)if(p?.occupied)p.buffer=state.buffer;return state;}
  async applyInternal(expected,effects,buffer){
    validateEffects(effects,expected.identity);if(![8,16,32].includes(buffer))throw new Error('Invalid buffer.');
    const plan=editPlan(expected.effects,effects,expected.identity);const before=await this.current(expected);
    for(const message of plan)await this.send(message,'Applying signal chain');
    if(!same(readNam(expected.effects),readNam(effects)))await this.nam(before,effects);
    if(effects[34]===2&&!same(expected.effects.slice(33,36),effects.slice(33,36)))await this.recording(before,effects);
    if(buffer!==expected.buffer)await this.send(bufferCommand(buffer),'Changing buffer');
    await pause(150);const result=await this.link.snapshot();
    if(result.active!==expected.active||result.modelCrc!==expected.modelCrc||result.buffer!==buffer||!same(result.effects,effects)||result.faults||!result.running)throw new Error('The edited chain was not confirmed. Refresh before trying again.');
    if(result.bufferStorageError)throw new Error('The global buffer was not saved. Refresh before retrying.');
    return this.syncGlobalBuffer(await this.preserveOutput(result,before.listening));
  }
  apply(expected,effects,buffer){return this.run(()=>this.applyInternal(expected,effects,buffer));}
  // Read the latest target before every write. A slider never builds a backlog
  // of old positions, and only explicit save() calls write the onboard bank.
  live(expected,latest){return this.run(async()=>{
    let state=await this.current(expected),effects=[...state.effects],buffer=state.buffer,fx=state.fx?[...state.fx]:null,lastGuard=Date.now();const wasListening=state.listening;
    for(;;){
      const target=latest();validateEffects(target.effects,expected.identity);
      if(![8,16,32].includes(target.buffer))throw new Error('Invalid buffer.');
      const plan=editPlan(effects,target.effects,expected.identity);
      const namChanged=!same(readNam(effects),readNam(target.effects));
      const recordChanged=target.effects[34]===2&&!same(effects.slice(33,36),target.effects.slice(33,36));
      if(namChanged||recordChanged||plan.length||buffer!==target.buffer||(fx&&!same(fx,target.fx))){
        if(Date.now()-lastGuard>250){
          const bank=await this.link.readPage(25),model=await this.link.readPage(5);
          if((bank&255)!==expected.active||model!==expected.modelCrc)throw new Error('Preset changed. Refresh before editing again.');
          lastGuard=Date.now();continue;
        }
        if(namChanged){await this.nam(state,target.effects);putNam(effects,readNam(target.effects));}
        else if(recordChanged){await this.recording(state,target.effects);effects.splice(27,9,...target.effects.slice(27,36));}
        else if(plan.length){
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
      const next=latest();if(same(next.effects,effects)&&next.buffer===buffer&&(!fx||same(next.fx,fx))){if(state.bufferStorageError)throw new Error('The global buffer was not saved. Refresh before retrying.');return this.syncGlobalBuffer(await this.preserveOutput(state,wasListening));}
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
  save(expected,effects,buffer,name,{playOnBoot=true}={}){return this.run(async()=>{
    this.requireLargeReplies();
    // Fetch the current slot before any writes. Only preserve a known onboard
    // capture; never guess its SHA or overwrite another color's model.
    const before=await this.preset(1,expected.active);
    saveBody(before,{...expected,effects,buffer},name,{playOnBoot});
    const state=await this.applyInternal(expected,effects,buffer);
    const saved=await this.preset(2,state.active,saveBody(before,state,name,{playOnBoot}));
    const checked=await this.preset(1,state.active),after=await this.link.snapshot();
    for(const entry of [saved,checked])if(!entry.occupied||entry.active!==state.active||entry.modelCrc!==before.modelCrc||!same(entry.sha,before.sha)||entry.flags!==(playOnBoot?1:0)||entry.name!==name.trim()||entry.buffer!==buffer||!same(entry.effects,effects))throw new Error('Saved preset readback did not match. Refresh before another save.');
    if(state.fx&&(!same(saved.fx,state.fx)||!same(checked.fx,state.fx)||!same(after.fx,state.fx)))throw new Error('Saved FX readback did not match.');
    if(saved.generation!==checked.generation||checked.generation<before.generation||after.faults||!after.running||after.buffer!==buffer||after.modelCrc!==before.modelCrc||after.active!==state.active||!same(after.effects,effects))throw new Error('Save was not fully confirmed. Refresh before another save.');
    return this.preserveOutput(after,state.listening);
  });}
  loadModel(expected,model,{progress=()=>{},canceled=()=>false}={}){return this.run(async()=>{
    await validateModel(model);
    if(!['NAMLNK14','NAMLNK15','NAMLNK16', 'NAMLNK17','NAMLNK18','NAMLNK19','NAMLNK20', 'NAMLNK21','NAMLNK22'].includes(expected.identity))throw new Error('Bluetooth capture loading requires NAMLNK14.');
    const before=await this.link.snapshot();
    if(before.active!==expected.active||before.modelCrc!==expected.modelCrc||before.buffer!==expected.buffer||!same(before.effects,expected.effects)||(expected.fx&&!same(before.fx,expected.fx))||before.faults)throw new Error('The plug changed. Refresh before loading a capture.');
    const epoch=this.link.epoch;let began=false,committed=false;const session=crypto.getRandomValues(new Uint32Array(1))[0]||1;
    const exchange=async(op,offset=0,data=[],target=session)=>{
      const wire=modelPacket(op,op===1?0:target,offset,data);
      const reply=await this.link.request(wire,m=>modelReply(m,wire),op===3?`Loading capture ${Math.floor((offset+data.length)*100/8192)}%`:'Preparing NAM capture',{mutation:true,timeout:10000});
      if((reply.error&&!(op===5&&reply.error===2))||reply.slotBytes!==8192||reply.maxChunk!==256||reply.capabilities!==3)throw new Error(`The plug rejected the capture transfer (${reply.error}).`);
      return reply;
    };
    try{
      await this.send(listenCommand(false),'Muting for capture transfer');
      if((await this.link.readPage(23))&1)throw new Error('Mute was not confirmed.');
      await exchange(1);
      // An interrupted transfer belongs to this browser/device pair. Abort
      // only that exact random session; never clear another controller's work.
      const deviceId=this.link.device?.id;
      let previous=this.unfinishedTransfer;try{previous=previous||JSON.parse(this.recoveryStorage?.getItem('namplug.transfer.v1')||'null');}catch{}
      if(deviceId&&previous?.deviceId===deviceId&&Number.isInteger(previous.session)&&previous.session>0&&previous.session<=0xffffffff){await exchange(5,0,[],previous.session);this.clearTransfer();}
      const body=Array(8).fill(0);put(body,0,8192);put(body,4,model.crc);began=true;this.unfinishedTransfer={deviceId,session};try{if(deviceId)this.recoveryStorage?.setItem('namplug.transfer.v1',JSON.stringify(this.unfinishedTransfer));}catch{}await exchange(2,0,body);
      for(let offset=0;offset<8192;offset+=256){
        if(canceled())throw new Error('Capture transfer canceled.');
        if((await this.link.readPage(25)&255)!==expected.active)throw new Error('The preset changed during transfer.');
        const reply=await exchange(3,offset,[...model.slot.slice(offset,offset+256)]);
        if(reply.received!==offset+256)throw new Error('Capture transfer position did not match.');progress(reply.received,8192);
      }
      if(canceled())throw new Error('Capture transfer canceled.');
      if((await this.link.readPage(25)&255)!==expected.active)throw new Error('The preset changed during transfer.');
      const done=await exchange(4);committed=true;this.clearTransfer();if(done.crc!==model.crc)throw new Error('Capture checksum was not confirmed.');
      let state=await this.link.snapshot();
      if(state.active!==expected.active||state.modelCrc!==model.crc||state.listening||state.faults||!state.running||!same(state.effects,expected.effects)||!same(state.fx,expected.fx))throw new Error('The loaded capture was not confirmed. Refresh the plug.');
      const effects=[...state.effects];effects[3]&=63;if(includesCab(model))effects[9]|=64;
      state=await this.applyInternal(state,effects,state.buffer);this.activeCapture=model;
      state=await this.preserveOutput(state,true);this.link.progress('Capture loaded');return state;
    }catch(error){
      if(epoch===this.link.epoch&&this.link.connected&&!this.link.writeStalled){
        if(began&&!committed)try{await exchange(5);this.clearTransfer();}catch{}
        try{await this.send(listenCommand(false),'Keeping plug muted');}catch{}
      }
      this.activeCapture=null;throw error;
    }
  });}
  clearTransfer(){this.unfinishedTransfer=null;try{this.recoveryStorage?.removeItem('namplug.transfer.v1');}catch{}}
  saveCapture(expected,effects,buffer,name,slot,model,{playOnBoot=true}={}){return this.run(async()=>{
    if(typeof playOnBoot!=='boolean')throw new Error('Invalid startup output setting.');
    this.requireLargeReplies();await validateModel(model);
    if(!Number.isInteger(slot)||slot<0||slot>6||model.crc!==expected.modelCrc)throw new Error('Load this capture onto the plug before saving.');
    const known=this.bank[slot],before=await this.preset(1,slot);if(!known||known.occupied!==before.occupied||known.generation!==before.generation||known.modelCrc!==before.modelCrc)throw new Error('The destination preset changed. Refresh and choose the color again.');const state=await this.applyInternal(expected,effects,buffer);
    const body=Array(112).fill(0);put(body,0,model.crc);put(body,4,crc32(effects));put(body,8,playOnBoot?1:0);put(body,12,buffer);
    body.splice(16,32,...model.sha.match(/../g).map(x=>parseInt(x,16)));const nameData=nameBytes(name);body.splice(48,nameData.length,...nameData);
    const saved=await this.preset(2,slot,body),checked=await this.preset(1,slot),after=await this.link.snapshot();
    for(const entry of [saved,checked])if(!entry.occupied||entry.modelCrc!==model.crc||entry.sha.map(x=>x.toString(16).padStart(2,'0')).join('')!==model.sha||entry.flags!==(playOnBoot?1:0)||entry.name!==name.trim()||entry.buffer!==buffer||!same(entry.effects,effects)||!same(entry.fx,state.fx))throw new Error('Saved capture readback did not match. Refresh before saving again.');
    if(saved.generation!==checked.generation||checked.generation<before.generation||after.faults||!after.running||after.modelCrc!==model.crc||after.active!==slot||!same(after.effects,effects)||!same(after.fx,state.fx))throw new Error('Saved capture was not fully confirmed. Refresh before saving again.');
    return this.preserveOutput(after,state.listening);
  });}
  resume(expected){return this.run(async()=>this.preserveOutput(await this.current(expected),true));}
  listen(enabled){return this.run(async()=>{
    const state=await this.link.snapshot();if(enabled&&(!state.running||state.faults||!state.loaded))throw new Error('Load a healthy onboard preset before listening.');
    await this.send(listenCommand(enabled),enabled?'Enabling plug output':'Muting plug');
    const after=await this.link.snapshot();if(after.listening!==enabled)throw new Error('Plug output state was not confirmed.');return after;
  });}
  async compactTune(reference,{canceled,onProgress}){
    if(!Number.isFinite(reference)||reference<430||reference>450)throw new Error('Invalid tuner reference.');
    const epoch=this.link.epoch;
    const check=()=>{if(canceled())throw Object.assign(new Error('Tuner stopped.'),{code:'tuner-canceled'});};
    const request=async op=>{
      const q=compactTunerRequest(op,this.token()%16383+1);
      const result=await this.link.request(q,m=>compactTunerReply(m,q),op===3?'Capturing fresh note':op===4?'Reading pitch':'Stopping tuner',{mutation:true});
      if(result.error&&!(op===4&&result.error===1))throw new Error('The plug could not read pitch. Keep output muted while tuning.');return result;
    };
    try{
      check();const start=await request(3);await pause(90);check();
      for(let attempt=0;attempt<8;attempt++){
        const result=await request(4);check();
        if(result.generation!==start.generation)throw new Error('Tuner capture changed. Try again.');
        if(!result.error)return {reading:result.frequency?pitchReading(result.frequency,reference,result.confidence):null,sampleCount:1024,compact:true};
        await pause(20);check();
      }
      throw new Error('Tuner capture did not finish.');
    }finally{
      // A successful capture already stops itself. Send Stop only on cancellation;
      // starting the next capture replaces the finished immutable sample window.
      if(canceled()&&epoch===this.link.epoch&&this.link.connected&&!this.link.writeStalled)await request(5);
    }
  }
  tune(reference=440,{canceled=()=>false,onProgress=()=>{},fast=false}={}){return this.run(async()=>{
    if(fast&&['NAMLNK15','NAMLNK16', 'NAMLNK17','NAMLNK18','NAMLNK19','NAMLNK20', 'NAMLNK21','NAMLNK22'].includes(this.link.current.identity))return this.compactTune(reference,{canceled,onProgress});
    this.requireLargeReplies();
    if(!Number.isFinite(reference)||reference<430||reference>450)throw new Error('Invalid tuner reference.');
    await this.send(listenCommand(false),'Muting for tuner');
    if((await this.link.readPage(23))&1)throw new Error('Mute was not confirmed.');
    const epoch=this.link.epoch;
    const check=()=>{if(canceled())throw Object.assign(new Error('Tuner stopped.'),{code:'tuner-canceled'});};
    const request=async(op,page=0)=>{
      const wire=tunerRequest(op,page,this.token()%16383+1);
      const data=await this.link.request(wire,m=>tunerReply(m,wire),op===2?`Reading tuner ${page+1}/16`:op===1?'Capturing guitar':'Stopping tuner',{mutation:true});
      if(data.error&&!(op===2&&data.error===1))throw new Error('The plug could not capture a tuner reading.');return data;
    };
    try{
      check();const start=await request(1);await pause(190);const samples=[];
      for(let page=0;page<16;page++){
        check();onProgress(page+1);
        let reply;for(let attempt=0;attempt<8;attempt++){reply=await request(2,page);if(reply.generation!==start.generation)throw new Error('Tuner capture changed. Try again.');if(!reply.error)break;await pause(25);}
        if(reply.error||reply.count!==2048)throw new Error('Tuner capture did not finish.');samples.push(...reply.samples);
        if(fast&&(samples.length===512||samples.length===1024)){
          const reading=detectPitch(samples,reference);
          if(reading&&reading.confidence>=0.98&&reading.frequency>=(samples.length===512?75:40))return {reading,sampleCount:samples.length};
          if(samples.length===512&&samples.every(x=>Math.abs(x)<16))return {reading:null,sampleCount:512};
        }
      }
      return {reading:detectPitch(samples,reference),sampleCount:samples.length};
    }finally{
      if(epoch===this.link.epoch&&this.link.connected&&!this.link.writeStalled){await request(0);if(!fast&&!canceled())await this.link.snapshot();}
    }
  });}
}
