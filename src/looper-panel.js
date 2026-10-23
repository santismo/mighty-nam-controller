import {Looper,hasLooper,thresholdMeter} from './looper.js?v=0.8.8';
// A nonmodal panel lets guitar preset selection remain available between polls.
// Shares the app's busy gate: no poll runs concurrently with a preset/model edit.
export class LooperPanel {
  constructor({connection,canRun,onBusy}){
    this.connection=connection;this.canRun=canRun;this.onBusy=onBusy;this.loop=new Looper(connection);
    this.open=false;this.busy=false;this.actionWaiting=false;this.changing=false;this.reportedBusy=false;this.flight=null;this.generation=0;this.state=null;this.settings=new Map();
    this.get=id=>document.getElementById(id);
    this.get('looper').addEventListener('click',()=>this.show());
    this.get('close-looper').addEventListener('click',()=>this.close());
    for(const [id,arg] of [['loop-arm',1],['loop-toggle',2],['loop-stop',4],['loop-clear',5],['loop-overdub',6]])
      this.get(id).addEventListener('click',()=>this.action(1,arg));
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
  async action(op,arg){
    if(!this.open||this.changing||this.actionWaiting||(!this.busy&&!this.canRun()))return;
    const generation=this.generation,epoch=this.connection.epoch;
    this.actionWaiting=true;this.notifyBusy();this.render();
    await this.whenIdle();
    this.actionWaiting=false;
    if(generation!==this.generation||epoch!==this.connection.epoch||!this.open||document.hidden||!this.canRun()){
      this.notifyBusy();this.render();return;
    }
    // Keep this user action serialized behind a read without losing the tap.
    return this.run(()=>this.loop.change(op,arg));
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
      if(generation===this.generation&&epoch===this.connection.epoch&&this.open){this.state=state;this.get('loop-error').textContent='';good=true;}
    }catch(error){if(generation===this.generation&&this.open){this.settings.clear();this.state=null;this.get('loop-error').textContent=error.message;}}
    finally{this.busy=false;this.changing=false;this.notifyBusy();this.render();}
    if(good&&this.open&&!this.actionWaiting&&generation===this.generation)this.timer=setTimeout(()=>this.run(),this.settings.size?0:this.state?.peak!==null?125:500);
  }
  labels(){
    this.get('loop-threshold-value').textContent=`${this.get('loop-threshold').value} dB`;
    this.get('loop-volume-value').textContent=`${this.get('loop-volume').value}%`;
    const meter=thresholdMeter(this.state?.peak,-Number(this.get('loop-threshold').value));
    this.get('loop-input-level').textContent=this.state?meter.label:'Input —';
    this.get('loop-threshold-meter').style.setProperty('--input-percent',`${meter.percent}%`);
    this.get('loop-threshold-meter').classList.toggle('above',meter.above);
    this.get('loop-threshold').setAttribute('aria-valuetext',`${this.get('loop-threshold').value} dB; ${this.state?meter.label:'input unavailable'}`);
  }
  render(){
    const s=this.state,disabled=this.changing||this.actionWaiting||!s||!this.connection.connected||Boolean(s?.faults);
    const names=['Empty','Armed · waiting for guitar','Recording','Playing','Paused','Stopped'];
    this.get('loop-state').textContent=s?.faults?'Memory check failed':s?.overdub?'Overdubbing':s?names[s.state]:'Reading…';
    this.get('loop-time').textContent=s?`${(s.length/s.rate).toFixed(1)} / ${s.seconds} s`:'—';
    this.get('loop-state').classList.toggle('armed',s?.state===1);
    for(const b of this.get('looper-panel').querySelectorAll('button:not(#close-looper),input,select'))b.disabled=disabled;
    this.get('loop-refresh').disabled=this.changing||this.actionWaiting;
    this.get('loop-arm').disabled=disabled||s.state!==0;
    this.get('loop-toggle').disabled=disabled||s.state===0;
    this.get('loop-toggle').textContent=s?.state===1?'Cancel arm':s?.state===2?'Finish loop':s?.state===3?'Pause':'Play';
    this.get('loop-stop').disabled=disabled||s.state===0;
    this.get('loop-clear').disabled=disabled||s.state===0||!s.extended&&[2,3].includes(s.state);
    this.get('loop-overdub').disabled=disabled||!s.extended||s.state!==3;
    this.get('loop-overdub').textContent=s?.overdub?'Finish layer':'Overdub';
    this.get('loop-mode').disabled=disabled||!s.extended;
    this.get('loop-mode').textContent=s?.mode?'Preset controls':'Looper controls';
    this.get('loop-control-state').textContent=s?.extended?`Buttons: ${s.mode?'Looper':'Presets'} · Preset order: ${s.reverse?'Reverse':'Forward'}`:'';
    for(const [id,op,key] of [['loop-threshold',2,'threshold'],['loop-volume',3,'volume'],['loop-duration',4,'seconds']]){
      const field=this.get(id);
      field.disabled=this.changing||this.actionWaiting||!s||!this.connection.connected||Boolean(s?.faults)||!s?.extended||(id==='loop-duration'&&s?.state!==0);
      if(s&&document.activeElement!==field&&!this.settings.has(op))field.value=s[key]*(op===2?-1:1);
    }
    this.labels();
    this.get('loop-compatibility').hidden=Boolean(s?.extended);
  }
}
