import test from 'node:test';
import assert from 'node:assert/strict';
import {effectChoices,changeType,validateEffects} from '../src/controls.js';
import {allowedCommand} from '../src/commands.js';
import {PlugConnection} from '../src/device.js';
import {PlugEditor} from '../src/editor.js';
import {editingBluetooth} from './editor-fixture.js';
for(const identity of ['NAMLNK24','NAMLNK25']) test(`${identity} Touch Wah edits, saves, recalls and preserves both custom FX slots`,async()=>{
 const fake=editingBluetooth({identity}),link=new PlugConnection(fake.bluetooth,1500,0,0),editor=new PlugEditor(link);
 await link.connect();await editor.readBank();const original=link.current;
 const effects=changeType(original.effects,2,14,original.identity);effects[2]=14;
 assert.deepEqual(effects.slice(20,25),[1,35,90,0,100]);
 assert.deepEqual(effectChoices(2,original.identity).find(x=>x.id===14).parameters[3].labels,['Down','Up']);
 for(const identity of ['NAMLNK23','NAMLNK22',undefined]){
  assert.ok(!effectChoices(2,identity).some(x=>x.id===14));
  assert.throws(()=>validateEffects(effects,identity));
  assert.equal(allowedCommand([176,2,14],true,{...original,identity}),false);
 }
 effects[20]=3;effects[21]=60;effects[22]=75;effects[23]=1;effects[24]=65;
 let state=await editor.apply(original,effects,8);
 assert.deepEqual(state.effects,effects);assert.equal(fake.saveCount,0);assert.equal(state.listening,original.listening);
 await editor.save(state,effects,8,'Touch Wah');await editor.recall(1);state=await editor.recall(0);
 assert.equal(editor.bank[0].name,'Touch Wah');assert.deepEqual(state.effects,effects);assert.deepEqual(state.fx,original.fx);
 assert.equal(state.modelCrc,original.modelCrc);assert.equal(fake.requests.some(q=>q[7]===65),false);link.close();
});
