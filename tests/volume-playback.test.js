import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PlugConnection } from '../src/device.js';
import { PlugEditor } from '../src/editor.js';
import { editingBluetooth } from './editor-fixture.js';
import { editPlan, validateEffects } from '../src/controls.js';
import { allowedCommand } from '../src/commands.js';
test('master sends only the level command, reads back, and retains model and output',async()=>{
 const fake=editingBluetooth({identity:'NAMLNK20'});const link=new PlugConnection(fake.bluetooth,300,0,0),editor=new PlugEditor(link);
 let state=await link.connect();state=await editor.listen(true);const crc=state.modelCrc;
 for(const volume of [37,0,1,100]){
  const next=[...state.effects];next[84]=volume;
  const plan=editPlan(state.effects,next);
  assert.deepEqual(plan,[[176,73,volume]]);assert.equal(allowedCommand(plan[0],state),true);
  state=await editor.live(state,()=>({effects:next,buffer:8,fx:state.fx}));
  assert.equal(state.effects[84],volume);assert.equal(state.modelCrc,crc);assert.equal(state.listening,true);assert.equal(fake.saveCount,0);
 }
 const bad=[...state.effects];bad[84]=101;assert.throws(()=>validateEffects(bad));assert.equal(allowedCommand([176,73,101],state),false);assert.equal(allowedCommand([176,86,50],state),false);
 link.close();
});
test('tuner return resumes checked capture; changed capture cannot resume',async()=>{
 const fake=editingBluetooth({identity:'NAMLNK20'});const link=new PlugConnection(fake.bluetooth,300,0,0),editor=new PlugEditor(link);
 const before=await link.connect();await editor.listen(false);
 assert.equal((await editor.resume(before)).listening,true);
 await editor.listen(false);fake.words[5]++;
 await assert.rejects(editor.resume(before),/changed/);assert.equal(fake.words[23],0);link.close();
});
test('controller exposes master, removes manual and saved startup mute switches',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/id="master-volume"/);assert.doesNotMatch(html,/id="(?:listen|boot-output|save-boot-output)"/);
});
