import test from 'node:test';
import assert from 'node:assert/strict';
import {PlugConnection} from '../src/device.js';
import {PlugEditor} from '../src/editor.js';
import {editingBluetooth} from './editor-fixture.js';
import {fxControls} from '../src/fx.js';

test('NAMLNK25 both Auto Wah slots edit and recall without changing playback or recording a loop',async()=>{
 const fake=editingBluetooth({identity:'NAMLNK25'}),link=new PlugConnection(fake.bluetooth,1500,0,0),editor=new PlugEditor(link);
 fake.words[23]=1;
 try {
  await link.connect();await editor.readBank();let state=link.current;
  const fx=[...state.fx];
  for(const i of [0,16]){fx[i]=2;fx[i+1]=1;fx[i+4]=72;fx[i+8]=80;fx[i+9]=65;}
  assert.deepEqual(fxControls(fx,0).map(x=>x.name),['Sensitivity','Resonance','Mix']);
  state=await editor.live(state,()=>({effects:state.effects,fx,buffer:8}));
  assert.deepEqual(state.fx,fx);assert.equal(state.listening,true);assert.equal(fake.saveCount,0);
  await editor.save(state,state.effects,8,'Auto Wah');await editor.recall(2);state=await editor.recall(0);
  assert.deepEqual(state.fx,fx);assert.equal(state.listening,true);
  assert.equal(fake.requests.some(q=>q[7]===65),false,'No output command');
  assert.equal(fake.requests.some(q=>q[6]===78&&q[7]===79),false,'No looper command');
 } finally {link.close();}
});
