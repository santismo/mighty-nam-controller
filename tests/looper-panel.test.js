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
