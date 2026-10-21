import test from 'node:test';
import assert from 'node:assert/strict';
import {PlugConnection} from '../src/device.js';
import {PlugEditor} from '../src/editor.js';
import {editingBluetooth} from './editor-fixture.js';
import {decodeSnapshot} from '../src/protocol.js';
import {statusWords,chainFrame} from './fixtures.js';
for(const identity of ['NAMLNK17','NAMLNK18'])for(const playing of [false,true])test(`${identity} buffer and save preserve playback=${playing}`,async()=>{
 const fake=editingBluetooth({identity}),link=new PlugConnection(fake.bluetooth,300,0,0),editor=new PlugEditor(link);fake.words[23]=playing?1:0;
 await link.connect();await editor.readBank();let state=link.current;
 const original=fake.bank.map(h=>[...h]);
 for(const buffer of [32,16,8]){
  state=await editor.live(state,()=>({effects:state.effects,fx:state.fx,buffer}));
  assert.equal(state.buffer,buffer);assert.equal(state.listening,playing);assert.equal(state.globalBuffer,identity==='NAMLNK18');assert.deepEqual(fake.bank.map(h=>[...h]),original);assert.equal(fake.saveCount,0);
  if(state.globalBuffer){assert.ok(editor.bank.every(p=>p.buffer===buffer));for(let slot=0;slot<7;slot++){state=await editor.recall(slot);assert.equal(state.buffer,buffer);assert.equal(state.listening,playing);}}
 }
 state=await editor.save(state,state.effects,state.buffer,'Keep playback');assert.equal(state.listening,playing);assert.equal(fake.saveCount,1);link.close();
});
test('global buffer storage failure never reports success or enables output',async()=>{
 const fake=editingBluetooth({identity:'NAMLNK18',onRequest(m,{words}){if(m[7]===66)words[24]=(48000*65536)+(0x32<<8)+(words[24]&255);}}),link=new PlugConnection(fake.bluetooth,300,0,0),editor=new PlugEditor(link);await link.connect();const before=link.current;
 await assert.rejects(editor.live(before,()=>({effects:before.effects,fx:before.fx,buffer:16})),/not saved/);
 assert.equal(fake.requests.some(m=>m[7]===65&&m[8]===1),false);assert.equal(fake.saveCount,0);link.close();
});
test('global schema is required only for firmware 18; corrupt formats rejected',()=>{
 const chain={channel:0,effects:chainFrame().slice(7,-1)},words=statusWords();
 assert.throws(()=>decodeSnapshot(words,chain,'NAMLNK18'));
 words[24]=(48000*65536)+(2<<8)+8;assert.equal(decodeSnapshot(words,chain,'NAMLNK18').globalBuffer,true);assert.throws(()=>decodeSnapshot(words,chain,'NAMLNK17'));
 for(const format of [3,0x52,0xf2]){words[24]=(48000*65536)+(format<<8)+8;assert.throws(()=>decodeSnapshot(words,chain,'NAMLNK18'));}
});

test('changed capture during playback resume stops output and reports failure',async()=>{
 const fake=editingBluetooth({identity:'NAMLNK17',onRequest(m,{words}){if(m[7]===65&&m[8]===1)words[5]^=1;}}),link=new PlugConnection(fake.bluetooth,300,0,0),editor=new PlugEditor(link);fake.words[23]=1;await link.connect();
 await assert.rejects(editor.apply(link.current,link.current.effects,16),/Playback was not confirmed/);assert.equal(fake.words[23]&1,0);link.close();
});
