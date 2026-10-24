import test from 'node:test';import assert from 'node:assert/strict';
import {PlugConnection} from '../src/device.js';import {PlugEditor} from '../src/editor.js';
import {editingBluetooth,unpack,get32} from './editor-fixture.js';
test('NAMLNK28 fourth-preset I/O rejection stays connected and never retries or claims success',async t=>{
 const fake=editingBluetooth({identity:'NAMLNK28',mask:7,saveError:3}),link=new PlugConnection(fake.bluetooth,500,0,0),editor=new PlugEditor(link);
 t.after(()=>link.close());fake.words[25]=(1<<24)|(7<<8)|2;fake.words[5]=get32(fake.bank[2],16);fake.bank[3].fill(0);
 await link.connect();await editor.readBank();const state=link.current;
 await assert.rejects(editor.save(state,state.effects,state.buffer,'Fourth',{slot:3}),e=>e.presetError===3&&/flash-storage I\/O/.test(e.message));
 const saves=fake.requests.filter(q=>q[7]===83&&unpack(q.slice(9,-1))[5]===2);
 assert.equal(saves.length,1);assert.equal(fake.saveCount,0);assert.equal(link.connected,true);assert.equal(editor.bank[3].occupied,false);
});

test('NAMLNK28 can add presets four through seven from the onboard capture when storage succeeds',async t=>{
 const fake=editingBluetooth({identity:'NAMLNK28',mask:7}),link=new PlugConnection(fake.bluetooth,500,0,0),editor=new PlugEditor(link);
 t.after(()=>link.close());fake.words[25]=(1<<24)|(7<<8)|2;fake.words[5]=get32(fake.bank[2],16);for(let slot=3;slot<7;slot++)fake.bank[slot].fill(0);
 await link.connect();await editor.readBank();let state=link.current;
 for(let slot=3;slot<7;slot++){state=await editor.save(state,state.effects,state.buffer,`Preset ${slot+1}`,{slot});assert.equal(state.active,slot);assert.equal(editor.bank[slot].occupied,true);}
 assert.equal(fake.saveCount,4);assert.equal(link.connected,true);
});
