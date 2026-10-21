import test from 'node:test';
import assert from 'node:assert/strict';
import {PlugConnection} from '../src/device.js';
import {PlugEditor} from '../src/editor.js';
import {AutoTuner} from '../src/auto-tuner.js';
import {detectPitch} from '../src/tuner.js';
import {editingBluetooth,set32,get32} from './editor-fixture.js';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function setup(t,options={}){const fake=editingBluetooth({identity:'NAMLNK14',...options}),link=new PlugConnection(fake.bluetooth,500,0,0),editor=new PlugEditor(link);t.after(()=>link.close());await link.connect();await editor.readBank();return {fake,link,editor};}
test('phone buffer 32→16→8 is confirmed and persisted; silently ignored command fails',async t=>{
  const {fake,link,editor}=await setup(t),other=fake.bank.slice(1).map(x=>[...x]);let state=link.current;
  for(const buffer of [32,16,8]){state=await editor.live(state,()=>({effects:state.effects,buffer,fx:state.fx}));assert.equal(state.buffer,buffer);assert.equal(state.listening,false);assert.equal(fake.saveCount,0);}
  await editor.save(state,state.effects,8,'Eight');assert.equal(get32(fake.bank[0],24),8);assert.deepEqual(fake.bank.slice(1).map(x=>[...x]),other);
  const ignored=await setup(t,{ignoreBuffer:true});await assert.rejects(ignored.editor.live(ignored.link.current,()=>({effects:ignored.link.current.effects,buffer:32,fx:ignored.link.current.fx})),/not confirmed/);
});
test('existing silent preset gains startup output only on explicit save; mute can still be saved',async t=>{
  const {fake,link,editor}=await setup(t);set32(fake.bank[0],20,0);await editor.readBank();const sha=[...editor.bank[0].sha],crc=link.current.modelCrc;
  await editor.save(link.current,link.current.effects,8,'Standalone');assert.equal(editor.bank[0].flags,1);assert.equal(link.current.listening,false);assert.equal(editor.bank[0].modelCrc,crc);assert.deepEqual(editor.bank[0].sha,sha);
  await editor.save(link.current,link.current.effects,8,'Silent',{playOnBoot:false});assert.equal(editor.bank[0].flags,0);assert.equal(fake.saveCount,2);
  assert.ok(fake.requests.filter(m=>m[7]===65).every(m=>m[8]===0));
});
test('diagnostics retain confirmed buffer and live chain after short log rolls over',async t=>{
  const {link}=await setup(t);for(let i=0;i<120;i++)link.record('bank read');const report=link.report();assert.match(report,/Confirmed buffer: 8 samples at 48000 Hz/);assert.match(report,/Live stock effects:/);assert.match(report,/Live FX A\/B:/);assert.match(report,/capture CRC:/);
});
test('short snapshots detect all six guitar strings and detuning; low notes retain longer path',()=>{
  for(const n of [512,1024,2048])for(const f of [82.407,110,146.832,195.998,246.942,329.628,440])for(const cents of [-35,0,27]){
    const hz=f*2**(cents/1200),samples=Array.from({length:n},(_,i)=>Math.round(6000*Math.sin(2*Math.PI*hz*i/12000+.2)+2200*Math.sin(4*Math.PI*hz*i/12000+.7)));
    const pitch=detectPitch(samples);assert.ok(pitch,`${n}/${hz}`);assert.ok(Math.abs(1200*Math.log2(pitch.frequency/hz))<2,`${n}/${hz}: ${pitch.frequency}`);
  }
  let seed=1729;const noise=Array.from({length:2048},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed/2**32-.5)*10000;});
  for(const n of [512,1024,2048]){assert.equal(detectPitch(Array(n).fill(0)),null);assert.equal(detectPitch(noise.slice(0,n)),null);}
});
test('automatic tuner uses fewer pages for a clear guitar note and extends for bass',async t=>{
  for(const [frequency,note,count] of [[110,'A',512],[41.203,'E',1024]]){
    const {fake,link,editor}=await setup(t,{frequency});const result=await editor.tune(440,{fast:true});assert.equal(result.reading.note,note);assert.equal(result.sampleCount,count);
    assert.equal(fake.requests.filter(m=>m[7]===85&&m[9]===2).length,count/128);assert.equal(link.current.listening,false);assert.equal(fake.saveCount,0);
  }
});
test('closing tuner stops after current page, sends stop, never enables output',async t=>{
  let cancel=false;const {fake,editor}=await setup(t);
  await assert.rejects(editor.tune(440,{fast:true,canceled:()=>cancel,onProgress:()=>{cancel=true;}}),{code:'tuner-canceled'});
  const requests=fake.requests.filter(m=>m[7]===85);assert.equal(requests.at(-1)[9],0);assert.equal(requests.filter(m=>m[9]===2).length,1);assert.ok(fake.requests.filter(m=>m[7]===65).every(m=>m[8]===0));
});
test('automatic polling starts without a click, stays serial and stops on error or close',async()=>{
  let active=0,peak=0,calls=0,received=0,errors=0;
  const poll=new AutoTuner({interval:1,read:async()=>{calls++;peak=Math.max(peak,++active);await wait(3);active--;if(calls===3)throw new Error('lost reply');return {reading:{note:'A'}};},onReading:()=>received++,onError:()=>errors++});
  poll.start();poll.start();await wait(70);assert.equal(calls,3);assert.equal(received,2);assert.equal(errors,1);assert.equal(peak,1);assert.equal(poll.running,false);
  let finish,late=0;const pending=new AutoTuner({read:()=>new Promise(r=>finish=r),onReading:()=>late++});pending.start();pending.stop();finish({reading:null});await wait(5);assert.equal(late,0);
});
