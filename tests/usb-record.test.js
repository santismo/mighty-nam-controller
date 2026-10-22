import test from 'node:test';import assert from 'node:assert/strict';
import {readNam as readRecord,putNam as putRecord,namRequest,namReply} from '../src/usb-record.js';
import {readNam,putNam} from '../src/nam-controls.js';
import {allowedCommand} from '../src/commands.js';import {PlugConnection} from '../src/device.js';import {PlugEditor} from '../src/editor.js';import {editingBluetooth} from './editor-fixture.js';
test('USB recording wire is distinct from tuner, bounded, model guarded',()=>{
 const state={identity:'NAMLNK21',active:0,modelCrc:42},q=namRequest(1,0,123,[60],42);
 assert.equal(q[7],86);assert.equal(allowedCommand(q,true,state),true);assert.equal(allowedCommand(q,false,state),false);assert.equal(allowedCommand(q,true,{...state,modelCrc:43}),false);
 assert.throws(()=>namRequest(1,0,1,[97],42));const r=[...q.slice(0,9),65,...q.slice(10,13),0,0,60,247];assert.deepEqual(namReply(r,q).config,[60]);r[11]^=1;assert.equal(namReply(r,q),null);
});
test('USB gain applies live, leaves headphone master/NAM unchanged, saves and recalls',async()=>{
 const fake=editingBluetooth({identity:'NAMLNK21'}),link=new PlugConnection(fake.bluetooth,500,0,0),editor=new PlugEditor(link);fake.words[23]=1;
 await link.connect();await editor.readBank();let state=link.current;const before=[...state.effects],effects=putRecord([...state.effects],[60]);
 state=await editor.live(state,()=>({effects,fx:state.fx,buffer:8}));assert.deepEqual(readRecord(state.effects),[60]);assert.equal(state.effects[84],before[84]);assert.deepEqual(readNam(state.effects),readNam(before));assert.equal(state.listening,true);
 const next=putNam([...state.effects],[54,12,12,12,100,48]);state=await editor.live(state,()=>({effects:next,fx:state.fx,buffer:8}));assert.deepEqual(readRecord(state.effects),[60]);
 await editor.save(state,state.effects,8,'USB +6 dB');await editor.recall(1);state=await editor.recall(0);assert.deepEqual(readRecord(state.effects),[60]);assert.equal(state.effects[84],before[84]);assert.equal(fake.requests.some(q=>q[7]===65),false);link.close();
});

test('nonadjacent color recall selects the requested onboard slot',async()=>{
 const fake=editingBluetooth({identity:'NAMLNK21'}),link=new PlugConnection(fake.bluetooth,500,0,0),editor=new PlugEditor(link);fake.words[23]=1;await link.connect();await editor.readBank();
 for(const slot of [5,2,6,0]){const state=await editor.recall(slot);assert.equal(state.active,slot);assert.equal(fake.words[25]&255,slot);}
 link.close();
});
