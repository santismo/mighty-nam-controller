import test from 'node:test';
import assert from 'node:assert/strict';
import {PlugConnection} from '../src/device.js';
import {PlugEditor} from '../src/editor.js';
import {editingBluetooth} from './editor-fixture.js';
import {Looper,hasLooper,loopRequest} from '../src/looper.js';
import {allowedCommand} from '../src/commands.js';

for(let version=12;version<=30;version++)test(`NAMLNK${version}: read, direct preset recall and version-limited looper queries`,async()=>{
 const identity=`NAMLNK${version}`,fake=editingBluetooth({identity,replyMtu:20});fake.words[23]=1;
 const link=new PlugConnection(fake.bluetooth,1500,0,0),editor=new PlugEditor(link);
 try{
  await link.connect();assert.equal(link.current.identity,identity);assert.equal(link.current.listening,true);
  assert.equal(Boolean(link.current.fx),version>=13);
  assert.equal(Boolean(link.current.codec),version>=17);
  await editor.recall(2);assert.equal(link.current.active,2);assert.equal(fake.saveCount,0);
  assert.equal(hasLooper(identity),version>=25);
  if(version>=25){
   const state=await new Looper(link).read();
   assert.equal(state.extended,version>=26);assert.equal(state.saveSupported,version>=28);
   assert.equal(state.peak!==null,version>=27);assert.equal(Boolean(state.takes),version>=29);
   assert.deepEqual(fake.requests.filter(q=>q[7]===79).map(q=>[q[9],q[10]]),
     version===25?[[0,0],[0,1],[0,2],[0,3],[0,4]]:version===26?[[0,5]]:version>=29?[[0,6],[0,7]]:[[0,6]]);
  }
  assert.equal(fake.requests.some(q=>q[7]===65),false,'No automatic output command');
  assert.equal(fake.requests.some(q=>q[7]===79&&q[9]!==0),false,'No automatic loop mutation');
  assert.equal(fake.requests.some(q=>q[7]===70),version>=13);
  assert.equal(fake.requests.some(q=>q[7]===80&&q[8]===117),version>=17);
 }finally{link.close();}
});

test('lane and undo commands cannot reach older firmware, including after reconnecting to an older plug',()=>{
 const requests=[[0,7],[1,11],[1,12],[1,13],[1,14],[6,80],[7,80],[8,80],[9,80],[10,3],[11,1],[12,1]];
 for(const [op,arg] of requests){
  const q=loopRequest(op,arg,1,'NAMLNK29');
  assert.equal(allowedCommand(q,op!==0,{identity:'NAMLNK29'}),true);
  for(let v=12;v<29;v++){
   assert.throws(()=>loopRequest(op,arg,1,`NAMLNK${v}`));
   assert.equal(allowedCommand(q,true,{identity:`NAMLNK${v}`}),false);
  }
 }
 for(const identity of ['NAMLNK11','NAMLNK31','MP3 V3.0.5'])assert.equal(hasLooper(identity),false);
});
