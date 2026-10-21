import test from 'node:test';
import assert from 'node:assert/strict';
import {PlugConnection} from '../src/device.js';
import {PlugEditor} from '../src/editor.js';
import {LiveEdits} from '../src/live.js';
import {allowedCommand,presetRequest,presetReply,saveBody,tunerRequest,tunerReply,pack7,unpack7,crc32,nameBytes,word} from '../src/commands.js';
import {catalog,changeType,editPlan,parameterIndex} from '../src/controls.js';
import {detectPitch} from '../src/tuner.js';
import {editingBluetooth,header,presetFrame,tunerFrame,get32} from './editor-fixture.js';
import {chainFrame} from './fixtures.js';
const setup=async(options={})=>{const fake=editingBluetooth(options),link=new PlugConnection(fake.bluetooth,500,0,0),editor=new PlugEditor(link);await link.connect();return {fake,link,editor};};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
test('CRC golden value; 7-bit binary round trip and malformed masks',()=>{
  assert.equal(crc32([...new TextEncoder().encode('123456789')]),0xcbf43926);
  const bytes=Array.from({length:276},(_,i)=>i%256);assert.deepEqual(unpack7(pack7(bytes)),bytes);
  for(const bad of [[1,0,0,0,0,0,0,0,128],[128],[2,0],[1]])assert.throws(()=>unpack7(bad));
  assert.throws(()=>nameBytes('x'.repeat(64)));assert.throws(()=>nameBytes('🎸'.repeat(16)));assert.throws(()=>nameBytes('bad\nname'));
});
test('preset schema, independent reply, CRC and nonce matching',()=>{
  const request=presetRequest(1,2,0x12345678),h=header(2,chainFrame().slice(7,-1)),reply=presetFrame(request,h,2);
  assert.equal(request.length,33);assert.equal(reply.length,326);assert.equal(presetReply(reply,request).name,'Preset 3');
  assert.equal(presetReply(reply,presetRequest(1,2,0x12345679)),null);
  const corrupt=[...reply];corrupt[42]^=1;assert.equal(presetReply(corrupt,request),null);
  const empty=presetFrame(request,null,255,0);assert.equal(presetReply(empty,request).occupied,false);
  assert.throws(()=>presetRequest(2,0,1,[]));assert.throws(()=>presetRequest(3,7,1));
});
test('command boundary rejects flash, model transfers, routing, unknown controls and changing amp identity',()=>{
  const state={effects:chainFrame().slice(7,-1)};
  for(const command of [[176,3,2],[176,0,1],[176,120,1],[176,17,101],[240,67,88,112,4,2,78,66,4,247],[240,67,88,112,4,2,78,85,1,7,0,1,0,247]])assert.equal(allowedCommand(command,true,state),false);
  assert.equal(allowedCommand([176,3,65],true,state),true);assert.equal(allowedCommand([176,17,50],false,state),false);
});
test('all 76 described effect choices have bounded valid parameters',()=>{
  assert.equal(Object.values(catalog).flat().length,76);
  for(const [id,choices] of Object.entries(catalog))for(const choice of choices){
    const before=chainFrame().slice(7,-1),after=changeType(before,Number(id),choice.id);
    assert.equal(after[id]&64,before[id]&64);
    for(const p of choice.parameters){assert.equal(parameterIndex(p.cc),p.index);assert.ok(p.default>=0&&p.default<=100);assert.ok(p.options?.length||p.labels?.length===101);}
    for(const m of editPlan(before,after))assert.ok(allowedCommand(m,true,{effects:before}));
  }
});
test('recall, live bypass/parameters/order/buffer, and explicit save preserve capture and other slots',async()=>{
  const {fake,link,editor}=await setup();await editor.readBank();const original=fake.bank.map(h=>[...h]);
  let state=await editor.recall(3);assert.equal(state.active,3);let effects=changeType(state.effects,2,3);effects[8]^=64;effects[3]^=64;effects.splice(90,9,1,5,2,3,9,4,6,7,8);
  state=await editor.live(state,()=>({effects,buffer:16}));assert.deepEqual(fake.effects,effects);assert.equal(state.buffer,16);assert.equal(fake.saveCount,0);assert.deepEqual(fake.bank.map(h=>[...h]),original);
  const saved=await editor.save(state,effects,16,'Favorite 🎸');assert.equal(fake.saveCount,1);assert.equal(saved.listening,false);assert.equal(editor.bank[3].name,'Favorite 🎸');assert.equal(editor.bank[3].flags,1);assert.equal(editor.bank[3].generation,2);
  assert.deepEqual(editor.bank[3].sha,original[3].slice(32,64));assert.equal(editor.bank[3].modelCrc,get32(original[3],16));
  for(const i of [0,1,2,4,5,6])assert.deepEqual([...fake.bank[i]],original[i]);
  const recalled=await editor.recall(3);assert.deepEqual(recalled.effects,effects);assert.equal(recalled.buffer,16);link.close();
});
test('live slider coalesces intermediate values while writes are in flight; never saves',async()=>{
  let queue;const {fake,link,editor}=await setup({delay:2,onCC(cc){if(cc===17)for(let n=20;n<=90;n++)queue.update(Object.assign([...link.current.effects],{20:n}),8);}});
  const done=new Promise((resolve,reject)=>{queue=new LiveEdits(editor,{accepted:resolve,failed:reject});});queue.reset(link.current);
  queue.update(Object.assign([...link.current.effects],{20:10}),8);
  const state=await done;assert.equal(state.effects[20],90);assert.ok(fake.requests.filter(m=>m[0]===176).length<5);assert.equal(fake.saveCount,0);link.close();
});
test('changed preset/capture, readback mismatch and write rejection stop editing without saving',async()=>{
  for(const mode of ['preset','capture','readback','reject']){
    const options={ignoreCC:mode==='readback',rejectMutation:mode==='reject'}, {fake,link,editor}=await setup(options),expected=link.current;
    const effects=[...expected.effects];effects[20]=50;
    if(mode==='preset')fake.words[25]++;if(mode==='capture')fake.words[5]++;
    await assert.rejects(editor.live(expected,()=>({effects,buffer:8})));
    assert.equal(fake.saveCount,0);
    if(mode==='preset'||mode==='capture')assert.equal(fake.requests.filter(m=>m[0]===176).length,0);
    if(mode==='reject')assert.ok(fake.methods.every(m=>m==='without'));
    link.close();
  }
});
test('save refuses unknown capture and detects metadata readback tampering',async()=>{
  const options={}, {fake,link,editor}=await setup(options);await editor.readBank();const state=link.current;
  assert.throws(()=>saveBody({...editor.bank[0],modelCrc:1},state,'Name'));
  options.onPreset=(op,slot,{bank})=>{if(op===1&&fake.saveCount)bank[slot][32]^=1;};
  await assert.rejects(editor.save(state,state.effects,8,'Name'),/readback did not match/);assert.equal(fake.saveCount,1);link.close();
});
test('live queue failure latches until reset and does not replay writes',async()=>{
  let calls=0,fail;const failed=new Promise(r=>fail=r);
  const q=new LiveEdits({live:async()=>{calls++;throw new Error('Lost reply');}},{failed:fail});q.reset({});q.update([1],8);await failed;
  assert.throws(()=>q.update([2],8),/Refresh/);await pause(80);assert.equal(calls,1);q.reset({});assert.equal(q.blocked,false);
});
test('tuner packets validate nonce and CRC; detector covers guitar strings and silence',()=>{
  const request=tunerRequest(2,1,723),reply=tunerFrame(request);assert.equal(reply.length,330);assert.equal(tunerReply(reply,request).samples.length,128);
  assert.equal(tunerReply(reply,tunerRequest(2,1,724)),null);const corrupt=[...reply];corrupt[30]^=1;assert.equal(tunerReply(corrupt,request),null);
  assert.equal(detectPitch(Array(2048).fill(0)),null);
  for(const f of [41.203,82.407,110,146.832,195.998,246.942,329.628,440]){
    const samples=Array.from({length:2048},(_,i)=>Math.round(6000*Math.sin(2*Math.PI*f*i/12000)+2200*Math.sin(4*Math.PI*f*i/12000)));
    const pitch=detectPitch(samples);assert.ok(pitch,`detect ${f}`);assert.ok(Math.abs(1200*Math.log2(pitch.frequency/f))<1,`accuracy ${f}: ${pitch.frequency}`);
  }
});
test('tuner mutes, captures consistent pages, stops and stays muted; changed capture rejected',async()=>{
  for(const changedTuner of [false,true]){
    const {fake,link,editor}=await setup({changedTuner});fake.words[23]=1;
    if(changedTuner)await assert.rejects(editor.tune(),/capture changed/);else assert.equal((await editor.tune()).reading.note,'A');
    assert.equal(fake.words[23],0);const ops=fake.requests.filter(m=>m[7]===85).map(m=>m[9]);assert.equal(ops[0],1);assert.equal(ops.at(-1),0);assert.equal(fake.saveCount,0);link.close();
  }
});
test('lost save acknowledgement is never retried or reported as saved',async()=>{
  const {fake,link,editor}=await setup({dropSaveReply:true});const request=link.request.bind(link);
  link.request=(wire,parse,label,opts={})=>request(wire,parse,label,{...opts,timeout:label.startsWith('Saving')?200:opts.timeout??500});
  await assert.rejects(editor.save(link.current,link.current.effects,8,'No retry'),/no matching reply/);
  assert.equal(fake.saveCount,1);assert.equal(editor.bank[0].name,'Preset 1');assert.equal(link.busy,false);link.close();
});
test('queued live edits are discarded when the connection is reset',async()=>{
  let calls=0;const q=new LiveEdits({live:async()=>{calls++;}});q.reset({});q.update([1],8);q.reset(null);await pause(80);assert.equal(calls,0);assert.equal(q.pending,false);
});
