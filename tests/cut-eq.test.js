import test from 'node:test';
import assert from 'node:assert/strict';
import {effectChoices,changeType,validateEffects} from '../src/controls.js';
import {allowedCommand} from '../src/commands.js';
import {PlugConnection} from '../src/device.js';
import {PlugEditor} from '../src/editor.js';
import {editingBluetooth} from './editor-fixture.js';
import {chainFrame} from './fixtures.js';
test('cut EQ is visible and writable only on NAMLNK14; each filter has Off and bounded Hz labels',()=>{
 const effects=chainFrame().slice(7,-1);
 for(const identity of ['NAMLNK12','NAMLNK13',undefined]){
  assert.ok(!effectChoices(4,identity).some(c=>c.id===4));
  assert.throws(()=>changeType(effects,4,4,identity));
  assert.equal(allowedCommand([176,4,4],true,{identity,effects}),false);
 }
 const eq=effectChoices(4,'NAMLNK14').find(c=>c.id===4);
 assert.deepEqual(eq.parameters.map(p=>p.default),[0,0]);
 assert.deepEqual(eq.parameters.map(p=>[p.labels[0],p.labels[1],p.labels[100]]),[['Off','20 Hz','1.00 kHz'],['Off','1.00 kHz','20.00 kHz']]);
 const updated=changeType(effects,4,4,'NAMLNK14');assert.equal(updated[4]&63,4);
 assert.equal(allowedCommand([176,4,68],true,{identity:'NAMLNK14',effects}),true);
 assert.throws(()=>validateEffects(updated,'NAMLNK13'));
});
for (const identity of ['NAMLNK14','NAMLNK15','NAMLNK16', 'NAMLNK17']) test(`${identity} cut EQ live controls, reorder, save and recall retain capture and both FX slots`,async()=>{
 const fake=editingBluetooth({identity}),link=new PlugConnection(fake.bluetooth,1500,0,0),editor=new PlugEditor(link);
 await link.connect();await editor.readBank();const original=link.current;
 const effects=changeType(original.effects,4,4,identity);effects[4]=4;effects[36]=42;effects[37]=76;
 const order=effects.slice(90,99).filter(x=>x!==4);effects.splice(90,9,4,...order);
 const state=await editor.apply(original,effects,8);assert.deepEqual(state.effects,effects);assert.equal(fake.saveCount,0);assert.equal(state.modelCrc,original.modelCrc);assert.deepEqual(state.fx,original.fx);
 await editor.save(state,effects,8,'Cuts');await editor.recall(1);await editor.recall(0);
 assert.deepEqual(link.current.effects,effects);assert.equal(link.current.modelCrc,original.modelCrc);assert.deepEqual(link.current.fx,original.fx);assert.equal(fake.saveCount,1);link.close();
});
