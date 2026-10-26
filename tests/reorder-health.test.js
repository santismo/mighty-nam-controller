import test from 'node:test';
import assert from 'node:assert/strict';
import {PlugConnection} from '../src/device.js';
import {PlugEditor} from '../src/editor.js';
import {processingProblem} from '../src/health.js';
import {fullOrder,reorder} from '../src/fx.js';
import {editingBluetooth} from './editor-fixture.js';

const isMove=m=>m[0]===240&&m[4]===13;
const mutations=fake=>fake.requests.filter(m=>m[0]===176||isMove(m)||m[7]===65);
test('a latched processing fault is reported before any move or output command',async()=>{
 const fake=editingBluetooth({identity:'NAMLNK30'}),link=new PlugConnection(fake.bluetooth,500,0,0),editor=new PlugEditor(link);
 try{
  let state=await link.connect();const order=fullOrder(state.effects,state.fx);order.splice(order.indexOf(9),1);order.unshift(9);const target={...reorder(state.effects,state.fx,order),buffer:8};
  fake.words[4]=1;fake.words[9]=0;fake.words[23]=2;fake.words[8]=176;
  await assert.rejects(editor.live(state,()=>target),e=>e.code==='processing-stopped'&&/POWER only/.test(e.message));
  assert.equal(mutations(fake).length,0);assert.match(processingProblem(link.current),/Reconnect.*alone will not clear/i);
  assert.equal(link.current.faultDetails.timerMax,176);assert.match(link.stage,/Processing stopped/);
  for(let n=0;n<120;n++)link.record('Read-only refresh noise');
  assert.match(link.report(),/Last operation error:.*stopped audio processing/);assert.match(link.report(),/"timerMax":176/);
  fake.words[4]=0;fake.words[9]=1;fake.words[23]=1;state=await link.refresh();assert.equal(processingProblem(state),null);assert.equal(link.stage,'Ready');
 }finally{link.close();}
});
test('a fault during IR reorder retains the exact command and does not resume, retry or save',async()=>{
 const fake=editingBluetooth({identity:'NAMLNK30',onRequest(m,{words}){if(isMove(m)){words[4]=1;words[9]=0;words[23]=2;words[8]=150;}}});
 const link=new PlugConnection(fake.bluetooth,500,0,0),editor=new PlugEditor(link);
 try{
  const state=await link.connect(),order=fullOrder(state.effects,state.fx);order.splice(order.indexOf(9),1);order.unshift(9);
  await assert.rejects(editor.live(state,()=>({...reorder(state.effects,state.fx,order),buffer:8})),e=>e.code==='processing-stopped');
  assert.equal(fake.requests.filter(isMove).length,1);assert.equal(fake.requests.filter(m=>m[7]===70&&m[9]===1).length,0);assert.equal(fake.requests.filter(m=>m[7]===65).length,0);assert.equal(fake.saveCount,0);
  for(let n=0;n<180;n++)link.record('Later read');await link.refresh();
  assert.match(link.report(),/before faults=0, running=true/);assert.match(link.report(),/f0 43 58 70 0d 01 09 09/);assert.match(link.report(),/Last operation error:/);
 }finally{link.close();}
});
test('IR left/right moves preserve type, bypass, settings and playback on 29 and 30',async()=>{
 for(const identity of ['NAMLNK29','NAMLNK30']){
  const fake=editingBluetooth({identity}),link=new PlugConnection(fake.bluetooth,500,0,0),editor=new PlugEditor(link);fake.words[23]=1;
  try{
   let state=await link.connect();const settings=[...state.effects.slice(0,90)];
   for(const at of [0,10,3,6]){
    const order=fullOrder(state.effects,state.fx);order.splice(order.indexOf(9),1);order.splice(at,0,9);
    const target={...reorder(state.effects,state.fx,order),buffer:8};state=await editor.live(state,()=>target);
    assert.deepEqual(fullOrder(state.effects,state.fx),order);assert.deepEqual(state.effects.slice(0,90),settings);assert.equal(state.listening,true);assert.equal(state.faults,0);
   }
   assert.equal(fake.saveCount,0);assert.equal(fake.requests.filter(m=>m[7]===65).length,0);
  }finally{link.close();}
 }
});
test('recall timing fault keeps the actual color and restart diagnosis through bank refresh',async()=>{
 const fake=editingBluetooth({identity:'NAMLNK30',onPreset(op,slot,{words}){if(op===3&&slot===3){words[4]=1;words[9]=0;words[23]=2;words[8]=150;}}});
 const link=new PlugConnection(fake.bluetooth,500,0,0),editor=new PlugEditor(link);
 try{
  await link.connect();
  await assert.rejects(editor.recall(3),e=>e.code==='processing-stopped'&&/POWER only/.test(e.message));
  assert.equal(link.current.active,3);assert.equal(link.current.faultDetails.timerMax,150);
  assert.equal(link.current.listening,false);assert.match(link.stage,/Processing stopped/);
  await editor.readBank();assert.equal(editor.bank.filter(p=>p.occupied).length,7);
  assert.match(link.stage,/Processing stopped/);assert.match(link.report(),/Last operation error:.*stopped audio processing/);
  assert.equal(fake.requests.filter(m=>m[7]===65).length,0);assert.equal(fake.saveCount,0);
  const sent=fake.requests.length;
  await assert.rejects(editor.recall(0),e=>e.code==='processing-stopped');
  assert.equal(fake.requests.slice(sent).filter(m=>m[7]===83).length,0);
  fake.words[4]=0;fake.words[9]=1;fake.words[23]=1;
  await link.refresh();const state=await editor.recall(0);assert.equal(state.active,0);assert.equal(state.faults,0);
  await editor.readBank();assert.equal(link.stage,'Ready');
 }finally{link.close();}
});
