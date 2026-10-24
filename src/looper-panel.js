import {Looper,hasLooper,thresholdMeter} from './looper.js?v=0.9.1';
// A nonmodal panel lets guitar preset selection remain available between polls.
// Shares the app's busy gate: no poll runs concurrently with a preset/model edit.
// Avoid rewriting unchanged controls on each meter poll. WebKit visibly
// repaints disabled/enabled buttons even when both assignments share a task.
const put=(node,key,value)=>{if(node[key]!==value)node[key]=value;};
export class LooperPanel {
  constructor({connection,canRun,onBusy}){
    this.connection=connection;this.canRun=canRun;this.onBusy=onBusy;this.loop=new Looper(connection);
    this.open=false;this.busy=false;this.actionWaiting=false;this.changing=false;this.reportedBusy=false;this.flight=null;this.generation=0;this.state=null;this.settings=new Map();this.audibleVolume=100;this.volumeEpoch=connection.epoch;
    this.get=id=>document.getElementById(id);
    this.get('looper').addEventListener('click',()=>this.show());
    this.get('close-looper').addEventListener('click',()=>this.close());
    for(const [id,arg] of [['loop-arm',1],['loop-toggle',2],['loop-stop',4]])
      this.get(id).addEventListener('click',()=>this.action(1,arg));
    this.get('loop-clear').addEventListener('click',()=>{if(this.state?.length&&!confirm('Delete the entire loop, including every overdub?'))return;this.action(1,5);});
    this.get('loop-overdub').addEventListener('click',()=>this.overdub());
    this.get('loop-mute').addEventListener('click',()=>this.mute());
    this.get('loop-save').addEventListener('click',()=>{this.settings.set(5,1);this.run();});
    this.get('loop-mode').addEventListener('click',()=>this.action(1,this.state?.mode?10:9));
    for(const [id,op] of [['loop-threshold',2],['loop-volume',3],['loop-duration',4]]){
      this.get(id).addEventListener('change',()=>{
        this.settings.set(op,Number(this.get(id).value)*(op===2?-1:1));this.run();
      });
      this.get(id).addEventListener('input',()=>this.labels());
      this.get(id).addEventListener('blur',()=>this.render());
    }
    this.get('loop-refresh').addEventListener('click',()=>this.run());
    document.addEventListener('visibilitychange',()=>{clearTimeout(this.timer);if(!document.hidden&&this.open)this.run();});
  }
  show(){
    if(this.open||!hasLooper(this.connection.current?.identity)||(!this.busy&&!this.canRun()))return;
    this.state=null;this.open=true;this.get('looper-panel').hidden=false;
    if(this.busy){const generation=this.generation;this.whenIdle().then(()=>{if(this.open&&generation===this.generation)this.run();});}
    else this.run();
  }
  close(){this.open=false;this.generation++;this.settings.clear();this.actionWaiting=false;this.notifyBusy();clearTimeout(this.timer);this.get('looper-panel').hidden=true;}
  notifyBusy(){
    const changing=this.changing||this.actionWaiting;
    if(changing!==this.reportedBusy){this.reportedBusy=changing;this.onBusy(changing);}
  }
  async whenIdle(){clearTimeout(this.timer);await this.flight;clearTimeout(this.timer);}
  async overdub(){
    if(!this.state||!this.state.extended||this.state.state!==3)return;
    const desired=!this.state.overdub;
    return this.action(1,6,async()=>{
      // The firmware command toggles. Re-read after waiting so a physical
      // button change is reflected before using a stale Finish/Start flag.
      const latest=await this.loop.read();
      if(!latest.extended||latest.state!==3)throw new Error('Play the loop before starting an overdub.');
      return Boolean(latest.overdub)===desired?latest:this.loop.change(1,6);
    });
  }
  mute(){
    if(!this.state?.extended||!this.state.length)return;
    const volume=this.state.volume===0?this.audibleVolume:0;
    return this.action(3,volume);
  }
  async action(op,arg,change=null){
    if(!this.open||this.changing||this.actionWaiting||(!this.busy&&!this.canRun()))return;
    const generation=this.generation,epoch=this.connection.epoch;
    if(op===3)this.settings.delete(3);
    this.actionWaiting=true;this.notifyBusy();this.render();
    await this.whenIdle();
    this.actionWaiting=false;
    if(generation!==this.generation||epoch!==this.connection.epoch||!this.open||document.hidden||!this.canRun()){
      this.notifyBusy();this.render();return;
    }
    // Keep this user action serialized behind a read without losing the tap.
    return this.run(change||(()=>this.loop.change(op,arg)));
  }
  run(change){
    clearTimeout(this.timer);
    if(!this.open||this.busy||this.actionWaiting||document.hidden)return this.flight;
    if(!this.canRun()){this.timer=setTimeout(()=>this.run(),300);return;}
    if(!change&&this.settings.size){
      const [op,arg]=this.settings.entries().next().value;this.settings.delete(op);
      change=()=>this.loop.change(op,arg);
    }
    this.busy=true;this.changing=Boolean(change);this.notifyBusy();
    if(this.changing||!this.state)this.render();
    this.flight=this.exchange(change);return this.flight;
  }
  async exchange(change){
    const generation=this.generation,epoch=this.connection.epoch;
    let good=false;
    try{
      const state=await(change?change():this.loop.read());
      if(generation===this.generation&&epoch===this.connection.epoch&&this.open){
        if(this.volumeEpoch!==epoch){this.audibleVolume=100;this.volumeEpoch=epoch;}
        if(state.volume>0)this.audibleVolume=state.volume;
        this.state=state;put(this.get('loop-error'),'textContent','');good=true;
      }
    }catch(error){if(generation===this.generation&&this.open){this.settings.clear();this.state=null;put(this.get('loop-error'),'textContent',error.message);}}
    finally{this.busy=false;this.changing=false;this.notifyBusy();this.render();}
    if(good&&this.open&&!this.actionWaiting&&generation===this.generation)this.timer=setTimeout(()=>this.run(),this.settings.size?0:this.state?.peak!==null?125:500);
  }
  labels(){
    put(this.get('loop-threshold-value'),'textContent',`${this.get('loop-threshold').value} dB`);
    put(this.get('loop-volume-value'),'textContent',`${this.get('loop-volume').value}%`);
    const meter=thresholdMeter(this.state?.peak,-Number(this.get('loop-threshold').value));
    put(this.get('loop-input-level'),'textContent',this.state?meter.label:'Input —');
    this.get('loop-threshold-meter').style.setProperty('--input-percent',`${meter.percent}%`);
    this.get('loop-threshold-meter').classList.toggle('above',meter.above);
    this.get('loop-threshold').setAttribute('aria-valuetext',`${this.get('loop-threshold').value} dB; ${this.state?meter.label:'input unavailable'}`);
  }
  render(){
    const s=this.state,disabled=this.changing||this.actionWaiting||!s||!this.connection.connected||Boolean(s?.faults);
    const names=['Empty','Armed · waiting for guitar','Recording','Playing','Paused','Stopped'];
    put(this.get('loop-state'),'textContent',s?.faults?'Memory check failed':s?.overdub?'● Recording overdub':s?names[s.state]:'Reading…');
    put(this.get('loop-time'),'textContent',s?`${(s.length/s.rate).toFixed(1)} / ${s.seconds} s`:'—');
    this.get('loop-state').classList.toggle('armed',s?.state===1);
    this.get('looper-panel').classList.toggle('overdubbing',Boolean(s?.overdub));
    put(this.get('loop-recording-status'),'textContent',!s?'Reading recording status…':s.overdub?'Recording new guitar on every pass. Finish overdub keeps the take and continues playback.':s.state===2?'Recording the first loop. Tap Finish loop when ready.':s.state===1?'Armed: your next notes start the first loop.':s.state===3?'Playback only · new guitar is not being recorded.':'Overdub is off. Play the loop, then tap Start overdub to add a take.');
    const position=s?.length?Math.min(s.cursor||0,s.length):0;
    put(this.get('loop-position'),'max',s?.length||1);put(this.get('loop-position'),'value',position);
    put(this.get('loop-position-label'),'textContent',s?.length?`${(position/s.rate).toFixed(1)} / ${(s.length/s.rate).toFixed(1)} s · loop position`:'No recorded loop');
    put(this.get('loop-mix-state'),'textContent',!s?.length?'Empty':s.volume===0?'Muted':s.overdub?'Playing + recording':s.state===3?'Playing':s.state===2?'Recording':s.state===4?'Paused':'Stopped');
    put(this.get('loop-mute'),'disabled',disabled||!s?.extended||!s.length);
    put(this.get('loop-mute'),'textContent',s?.volume===0?'Unmute loop':'Mute loop');
    this.get('loop-mute').setAttribute('aria-pressed',String(s?.volume===0));
    put(this.get('loop-refresh'),'disabled',this.changing||this.actionWaiting);
    put(this.get('loop-arm'),'disabled',disabled||s.state!==0);
    put(this.get('loop-toggle'),'disabled',disabled||s.state===0);
    put(this.get('loop-toggle'),'textContent',s?.state===1?'Cancel arm':s?.state===2?'Finish loop':s?.state===3?'Pause':'Play');
    put(this.get('loop-stop'),'disabled',disabled||s.state===0);
    put(this.get('loop-clear'),'disabled',disabled||s.state===0||!s.extended&&[2,3].includes(s.state));
    put(this.get('loop-overdub'),'disabled',disabled||!s.extended||s.state!==3);
    put(this.get('loop-overdub'),'textContent',s?.overdub?'■ Finish overdub':'● Start overdub');
    this.get('loop-overdub').setAttribute('aria-pressed',String(Boolean(s?.overdub)));
    put(this.get('loop-mode'),'disabled',disabled||!s.extended);
    put(this.get('loop-mode'),'textContent',s?.mode?'Preset controls':'Looper controls');
    put(this.get('loop-control-state'),'textContent',s?.extended?`Buttons: ${s.mode?'Looper':'Presets'}${s.saveSupported?'':` · Preset order: ${s.reverse?'Reverse':'Forward'}`}`:'');
    put(this.get('loop-save'),'disabled',disabled||!s?.saveSupported||s.state!==0||s.length>0||s.saved&&!this.settings.size);
    put(this.get('loop-save-state'),'textContent',!s?.saveSupported?'Saving settings needs NAMLNK28':s.state!==0||s.length>0?'Clear the loop before saving settings':s.saved?'Saved on plug':'Live · not saved');
    put(this.get('loop-gestures'),'textContent',s?.saveSupported?'PRESET: tap next preset; hold previous. In Looper: tap to arm, finish, pause or play; hold to toggle overdub; tap then hold within 300 ms to clear. POWER: double tap enters Looper, or stops and exits; single tap switches between loop and preset controls. Hold POWER to turn off.': 'PRESET: tap next preset; hold reverses preset direction. In Looper: tap to arm, finish, pause or play; hold to clear. POWER: double tap enters Looper, or stops and exits; single tap switches between loop and preset controls. Overdub uses the on-screen button. Hold POWER to turn off.');
    for(const [id,op,key] of [['loop-threshold',2,'threshold'],['loop-volume',3,'volume'],['loop-duration',4,'seconds']]){
      const field=this.get(id);
      put(field,'disabled',disabled||!s?.extended||(id==='loop-duration'&&s?.state!==0));
      if(s&&document.activeElement!==field&&!this.settings.has(op))put(field,'value',String(s[key]*(op===2?-1:1)));
    }
    this.labels();
    this.get('loop-compatibility').hidden=Boolean(s?.extended);
  }
}
