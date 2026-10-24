import test from 'node:test';
import assert from 'node:assert/strict';
import {LooperPanel} from '../src/looper-panel.js';
import {LiveEdits} from '../src/live.js';
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function setup(t){
  const old=globalThis.document,nodes=new Map();
  const get=id=>{if(!nodes.has(id))nodes.set(id,{id,value:'0',disabled:false,hidden:false,textContent:'',addEventListener(){},setAttribute(){},classList:{toggle(){}},style:{setProperty(){}},querySelectorAll(){return [...nodes.values()].filter(n=>n.id!=='close-looper');}});return nodes.get(id);};
  globalThis.document={hidden:false,activeElement:null,getElementById:get,addEventListener(){}};
  const locks=[],link={current:{identity:'NAMLNK27'},epoch:1,connected:true};let externallyBusy=false;
  const panel=new LooperPanel({connection:link,canRun:()=>!externallyBusy,onBusy:b=>locks.push(b)});
  const state={state:0,length:0,rate:24000,seconds:30,volume:50,threshold:50,peak:.02,faults:0,mode:false,reverse:true,extended:true};
  panel.open=true;panel.state=state;panel.render();
  t.after(()=>{panel.close();globalThis.document=old;});
  return {panel,state,get,locks,link,setExternal:b=>externallyBusy=b};
}
test('meter refresh leaves page and transport enabled and reports reverse direction',async t=>{
  const {panel,state,get,locks}=setup(t),read=defer();panel.loop={read:()=>read.promise};
  const pending=panel.run();
  assert.deepEqual(locks,[]);assert.equal(get('loop-arm').disabled,false);assert.equal(get('loop-refresh').disabled,false);
  assert.equal(get('loop-threshold').disabled,false);assert.match(get('loop-control-state').textContent,/Presets.*Reverse/);
  read.resolve({...state,peak:.03});await pending;assert.deepEqual(locks,[]);assert.equal(get('loop-arm').disabled,false);
});
test('transport tap during meter read waits and sends exactly once; duplicate tap is ignored',async t=>{
  const {panel,state,locks}=setup(t),read=defer(),calls=[];let reading=true;
  panel.loop={read:()=>read.promise,change:async(op,arg)=>{assert.equal(reading,false);calls.push([op,arg]);return {...state,state:1};}};
  panel.run();const tap=panel.action(1,1);await panel.action(1,1);
  assert.deepEqual(calls,[]);assert.deepEqual(locks,[true]);reading=false;read.resolve(state);await tap;
  assert.deepEqual(calls,[[1,1]]);assert.deepEqual(locks,[true,false]);assert.equal(panel.state.state,1);
});
for(const disconnect of [false,true])test(`${disconnect?'Disconnecting':'Closing'} cancels a tap waiting behind a read`,async t=>{
    const {panel,state,link}=setup(t),read=defer();let writes=0;
    panel.loop={read:()=>read.promise,change:async()=>{writes++;return state;}};
    panel.run();const tap=panel.action(1,1);if(disconnect)link.epoch++;else panel.close();
    read.resolve(state);await tap;assert.equal(writes,0);panel.close();
});
test('external preset edit and coalesced slider writes wait for meter read',async t=>{
  const {panel,state,setExternal}=setup(t),read=defer();let reading=true,sent=0;
  panel.loop={read:()=>read.promise};panel.run();setExternal(true);
  const finished=defer();const live=new LiveEdits({live:async(s,target)=>{assert.equal(reading,false);sent++;assert.deepEqual(target().effects,[7]);return s;}},{beforeSend:()=>panel.whenIdle(),accepted:finished.resolve});
  live.reset({active:0});live.update([1],8);clearTimeout(live.timer);const task=live.start(live.epoch);live.update([7],8);
  await Promise.resolve();assert.equal(sent,0);reading=false;read.resolve(state);await task;await finished.promise;assert.equal(sent,1);
  await panel.whenIdle();assert.equal(panel.busy,false);
});
test('close then reopen during a read obtains a fresh snapshot without overlapping requests',async t=>{
  const {panel,state}=setup(t),first=defer(),second=defer();let reads=0;
  panel.loop={read:()=>++reads===1?first.promise:second.promise};
  panel.run();panel.close();panel.show();assert.equal(reads,1);
  first.resolve(state);await panel.whenIdle();await Promise.resolve();assert.equal(reads,2);
  second.resolve({...state,threshold:45});await panel.whenIdle();assert.equal(panel.state.threshold,45);
});

test('unchanged transport status never flips disabled buttons or replaces their text during meter polls',async t=>{
  const {panel,state,get,locks}=setup(t);panel.state={...state,state:3};panel.render();
  const changes=[];
  for(const id of ['loop-arm','loop-toggle','loop-stop','loop-clear','loop-overdub','loop-mode']){
    const n=get(id);
    for(const key of ['disabled','textContent']){let value=n[key];Object.defineProperty(n,key,{get:()=>value,set:v=>{changes.push([id,key,v]);value=v;},configurable:true});}
  }
  panel.loop={read:async()=>({...panel.state,peak:.04,cursor:480})};
  for(let i=0;i<10;i++){await panel.run();clearTimeout(panel.timer);}
  assert.deepEqual(changes,[]);assert.deepEqual(locks,[]);
  assert.equal(get('loop-arm').disabled,true);assert.equal(get('loop-toggle').disabled,false);
});

test('finish overdub does not restart recording if a physical button has already finished it',async t=>{
 const {panel,state}=setup(t),calls=[];
 panel.state={...state,state:3,length:24000,cursor:12000,overdub:true};
 panel.loop={read:async()=>({...panel.state,overdub:false}),change:async(...args)=>{calls.push(args);return panel.state;}};
 await panel.overdub();assert.deepEqual(calls,[]);assert.equal(panel.state.overdub,false);
});
test('overdub reads the plug first and writes only once; failure never retries a toggle',async t=>{
 const {panel,state}=setup(t),calls=[];
 panel.state={...state,state:3,length:24000,overdub:false};
 panel.loop={read:async()=>({...panel.state}),change:async(op,arg)=>{calls.push([op,arg]);throw new Error('Lost reply');}};
 await panel.overdub();assert.deepEqual(calls,[[1,6]]);assert.equal(panel.state,null);
 await panel.overdub();assert.equal(calls.length,1);
});
test('combined-loop mute preserves the last confirmed audible level and clears queued volume edits',async t=>{
 const {panel,state,get}=setup(t),calls=[];let device={...state,state:3,length:24000,cursor:12000,volume:65,overdub:false};
 panel.loop={read:async()=>device,change:async(op,arg)=>{calls.push([op,arg]);device={...device,volume:arg};return device;}};
 await panel.run();clearTimeout(panel.timer);panel.settings.set(3,85);
 await panel.mute();clearTimeout(panel.timer);assert.equal(panel.settings.has(3),false);assert.equal(get('loop-mute').textContent,'Unmute loop');assert.equal(get('loop-mix-state').textContent,'Muted');
 await panel.mute();assert.deepEqual(calls,[[3,0],[3,65]]);assert.equal(panel.state.volume,65);assert.equal(panel.state.state,3);assert.equal(panel.state.overdub,false);
});
test('loop position and recording status describe confirmed state rather than simulated layer levels',t=>{
 const {panel,state,get}=setup(t);panel.state={...state,state:3,length:48000,cursor:12000,overdub:true};panel.render();
 assert.equal(get('loop-position').max,48000);assert.equal(get('loop-position').value,12000);assert.match(get('loop-position-label').textContent,/0.5 \/ 2.0 s/);
 assert.match(get('loop-recording-status').textContent,/every pass/);assert.match(get('loop-overdub').textContent,/Finish overdub/);
 panel.state.overdub=false;panel.render();assert.match(get('loop-recording-status').textContent,/not being recorded/);assert.match(get('loop-overdub').textContent,/Start overdub/);
 panel.state.extended=false;panel.render();assert.equal(get('loop-overdub').disabled,true);assert.equal(get('loop-mute').disabled,true);
});
