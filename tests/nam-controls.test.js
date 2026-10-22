import test from 'node:test';import assert from 'node:assert/strict';
import {neutralNam,readNam,putNam,validNam,namRequest,namReply} from '../src/nam-controls.js';
import {allowedCommand} from '../src/commands.js';import {PlugConnection} from '../src/device.js';import {PlugEditor} from '../src/editor.js';import {editingBluetooth} from './editor-fixture.js';
test('NAM bounded wire and neutral legacy parameters',()=>{
 assert.deepEqual(readNam(Array(128).fill(50)),neutralNam());for(let i=0;i<6;i++){const bad=neutralNam();bad[i]=127;assert.throws(()=>validNam(bad));}
 const state={identity:'NAMLNK21',active:0,modelCrc:0x12345678},q=namRequest(1,0,123,neutralNam(),state.modelCrc);
 assert.equal(allowedCommand(q,true,state),true);assert.equal(allowedCommand(q,false,state),false);assert.equal(allowedCommand(q,true,{...state,identity:'NAMLNK20'}),false);assert.equal(allowedCommand(q,true,{...state,active:1}),false);
 const r=[...q.slice(0,9),65,...q.slice(10,13),0,0,...neutralNam(),247];assert.deepEqual(namReply(r,q).config,neutralNam());r[12]^=1;assert.equal(namReply(r,q),null);
});
test('NAM live knobs, save, recall, no mute or unrelated settings writes',async()=>{
 const fake=editingBluetooth({identity:'NAMLNK21'}),link=new PlugConnection(fake.bluetooth,500,0,0),editor=new PlugEditor(link);fake.words[23]=1;
 await link.connect();await editor.readBank();let state=link.current;const effects=putNam([...state.effects],[54,18,8,14,75,42]),before=fake.requests.length;
 state=await editor.live(state,()=>({effects,fx:state.fx,buffer:8}));assert.deepEqual(readNam(state.effects),[54,18,8,14,75,42]);assert.equal(state.listening,true);assert.equal(fake.saveCount,0);
 assert.equal(fake.requests.slice(before).some(q=>q[7]===65),false);
 await editor.save(state,state.effects,8,'Tone knobs');await editor.recall(1);state=await editor.recall(0);assert.deepEqual(readNam(state.effects),[54,18,8,14,75,42]);link.close();
});
