import test from 'node:test';
import assert from 'node:assert/strict';
import { A2_TOPOLOGY } from '../src/a2-topology.js';
import { parseModel,validateModel,CaptureLibrary,includesCab } from '../src/model.js';
import { modelPacket,modelRequest,modelReply } from '../src/model-wire.js';
import { allowedCommand,word,put,crc32,pack7,unpack7 } from '../src/commands.js';
import { PlugConnection } from '../src/device.js';
import { PlugEditor } from '../src/editor.js';
import { editingBluetooth } from './editor-fixture.js';
export const memoryStorage=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),data};};
export const namFixture=(n=0)=>({version:'0.7.0',architecture:'WaveNet',sample_rate:48000,config:{...structuredClone(A2_TOPOLOGY),head_scale:2},weights:Array.from({length:1871},(_,i)=>i===1870?1:i===0?n:0)});
export const fixtureModel=async(n=0,gear='amp-cab')=>parseModel(new TextEncoder().encode(JSON.stringify(namFixture(n))),{tone:{id:1,title:'Synthetic fixture',gear,format:'nam',license:'cco',user:{username:'Test'}},model:{id:n+1,name:`Silent fixture ${n}`}});
test('model parser packs exact float32 weights and validates topology, samples, size and container',async()=>{
  const model=await fixtureModel();assert.equal(model.slot.length,8192);assert.equal(word(model.slot,32+1870*4),0x3f800000);assert.ok(includesCab(model));await validateModel(model);
  const encode=j=>new TextEncoder().encode(JSON.stringify(j));
  for(const mutate of [j=>j.sample_rate=44100,j=>j.weights.pop(),j=>j.weights[0]=1e40,j=>j.weights[0]='0',j=>j.config.layers[0].channels=4,j=>j.architecture='LSTM']){const j=namFixture();mutate(j);await assert.rejects(parseModel(encode(j)));}
  const sub=namFixture();delete sub.sample_rate;const root={version:'0.7.0',architecture:'SlimmableContainer',sample_rate:48000,config:{submodels:[{model:sub}]}};
  assert.equal((await parseModel(encode(root))).sha,model.sha);root.config.submodels.push({model:sub});await assert.rejects(parseModel(encode(root)),/exactly one/);
  const damaged={...model,slot:model.slot.slice()};damaged.slot[900]^=1;await assert.rejects(validateModel(damaged));
  await assert.rejects(parseModel(new Uint8Array(4*1024*1024+1)));await assert.rejects(parseModel(encode(null)));
});
test('phone library keeps multiple favorites, verifies reloads, and never treats a favorite as active',async()=>{
  const store=memoryStorage(),library=new CaptureLibrary(store),a=await fixtureModel(1),b=await fixtureModel(2);await library.add(a);await library.add(b);library.favorite(a.sha,true);library.favorite(b.sha,true);
  assert.equal(library.records().filter(r=>r.favorite).length,2);await library.add(a);assert.equal(library.records().filter(r=>r.favorite).length,2);assert.equal((await new CaptureLibrary(store).get(b.sha)).crc,b.crc);
  const rows=library.records();rows[0].sha='0'.repeat(64);store.setItem(library.key,JSON.stringify(rows));await assert.rejects(library.get(rows[0].sha));assert.equal(await library.matching(a.crc),null);
  library.remove(a.sha);assert.equal((await library.get(b.sha)).sha,b.sha);
});
test('model wire is bounded and allowed only for NAMLNK14; replies require session, CRC and opcode',()=>{
  const begin=modelPacket(2,1,0,[0,32,0,0,1,2,3,4]);assert.ok(modelRequest(begin));assert.ok(allowedCommand(begin,true,{identity:'NAMLNK14'}));assert.equal(allowedCommand(begin,false,{identity:'NAMLNK14'}),false);assert.equal(allowedCommand(begin,true,{identity:'NAMLNK13'}),false);
  assert.equal(modelPacket(3,1,0,Array(256).fill(255)).length,330);
  for(const args of [[3,1,8191,[1,2]],[2,1,0,[]],[1,1],[4,0],[3,1,0,[]]])assert.throws(()=>modelPacket(...args));
  const q=modelPacket(1),r=Array(48).fill(0);put(r,0,0x314c504d);r[4]=1;r[5]=129;r[6]=24;put(r,36,8192);put(r,40,256);put(r,44,3);put(r,16,crc32(r.slice(24)));put(r,20,crc32(r.slice(0,20)));const wire=[...q.slice(0,9),...pack7(r),247];
  assert.equal(modelReply(wire,q).capabilities,3);assert.equal(modelReply(wire,modelPacket(4,1)),null);wire[29]^=1;assert.equal(modelReply(wire,q),null);
});
const setup=async(options={})=>{const fake=editingBluetooth({identity:'NAMLNK14',...options}),link=new PlugConnection(fake.bluetooth,100,0,0),editor=new PlugEditor(link);await link.connect();await editor.readBank();return {fake,link,editor};};
for (const identity of ['NAMLNK14','NAMLNK15','NAMLNK16']) test(`${identity} BLE capture transfer activates, preserves FX and saves only on request`,async()=>{
  const {fake,link,editor}=await setup({identity}),model=await fixtureModel(3),bank=fake.bank.map(x=>[...x]),extra=[...fake.extra],progress=[];fake.words[23]=1;
  const state=await editor.loadModel(link.current,model,{progress:n=>progress.push(n)});
  assert.equal(state.modelCrc,model.crc);assert.equal(state.listening,false);assert.equal(state.effects[3]&64,0);assert.equal(state.effects[9]&64,64);assert.deepEqual(state.fx,extra);assert.equal(progress.length,32);assert.equal(progress.at(-1),8192);assert.deepEqual(fake.bank.map(x=>[...x]),bank);assert.equal(fake.saveCount,0);assert.equal(editor.activeCapture.sha,model.sha);
  const next=await editor.saveCapture(state,state.effects,state.buffer,'New capture',3,model);assert.equal(next.active,3);assert.equal(fake.saveCount,1);assert.equal(editor.bank[3].name,'New capture');assert.equal(editor.bank[3].flags,1);
  const boot=await editor.saveCapture(next,next.effects,next.buffer,'New capture',3,model,{playOnBoot:false});assert.equal(editor.bank[3].flags,0);assert.equal(boot.listening,false);
  for(const i of [0,1,2,4,5,6])assert.deepEqual([...fake.bank[i]],bank[i]);link.close();
});
test('cancel, preset changes, lost replies and bad commit checksums cannot report active or save',async()=>{
  for(const mode of ['cancel','preset','crc','lost']){
    let cancel=false;const options={};if(mode==='crc')options.badModelCrc=true;if(mode==='lost')options.dropModelOp=3;
    const {fake,link,editor}=await setup(options),before=link.current,model=await fixtureModel(4);
    const original=link.request.bind(link);link.request=(w,p,l,o={})=>original(w,p,l,{...o,timeout:800});
    await assert.rejects(editor.loadModel(before,model,{canceled:()=>cancel,progress:n=>{if(n===256){if(mode==='cancel')cancel=true;if(mode==='preset')fake.words[25]++;}}}));
    assert.equal(editor.activeCapture,null);assert.equal(fake.saveCount,0);assert.equal(fake.words[23],0);if(mode!=='crc')assert.equal(fake.words[5],before.modelCrc);assert.ok(fake.requests.some(w=>w[7]===76&&modelRequest(w)?.[5]===5)||mode==='crc');link.close();
  }
});
test('reconnect aborts only this browser’s unfinished session and loads cleanly without preset writes',async()=>{
  const store=memoryStorage(),{fake,link,editor}=await setup(),model=await fixtureModel(6);editor.recoveryStorage=store;
  const original=link.request.bind(link);let disconnected=false;
  link.request=async(w,p,l,o)=>{if(modelRequest(w)?.[5]===3&&!disconnected){disconnected=true;link.close();throw new Error('Disconnected');}return original(w,p,l,o);};
  await assert.rejects(editor.loadModel(link.current,model),/Disconnected/);assert.equal(store.data.size,1);const previous=JSON.parse([...store.data.values()][0]);
  await link.connect();const fresh=new PlugEditor(link,{recoveryStorage:store});const result=await fresh.loadModel(link.current,model);assert.equal(result.modelCrc,model.crc);assert.equal(store.data.size,0);assert.equal(fake.saveCount,0);
  assert.ok(fake.requests.some(w=>{const raw=modelRequest(w);return raw?.[5]===5&&word(raw,8)===previous.session;}));link.close();
});
test('changing the target color before save prevents any overwrite',async()=>{
  const {fake,link,editor}=await setup(),model=await fixtureModel(7),state=await editor.loadModel(link.current,model);fake.bank[3][12]++;
  await assert.rejects(editor.saveCapture(state,state.effects,state.buffer,'New capture',3,model),/destination preset changed/);assert.equal(fake.saveCount,0);link.close();
});
