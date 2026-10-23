import test from 'node:test';
import assert from 'node:assert/strict';
import {PlugConnection} from '../src/device.js';
import {editingBluetooth} from './editor-fixture.js';

test('picker return can reconnect the already granted plug; explicit disconnect forgets it',async()=>{
 const fake=editingBluetooth({identity:'NAMLNK28'});let choices=0;
 const link=new PlugConnection({requestDevice:async()=>{choices++;return fake.device;}},500,0,0);
 try{
  await link.connect();const before=link.current;
  fake.device.gatt.disconnect();assert.equal(link.connected,false);
  const after=await link.reconnect();assert.equal(link.connected,true);assert.equal(choices,1);
  assert.equal(after.modelCrc,before.modelCrc);assert.equal(after.active,before.active);
  assert.equal(fake.requests.some(q=>q[7]===65),false);assert.equal(fake.saveCount,0);
  link.close();await assert.rejects(link.reconnect(),/Tap Connect/);
 }finally{link.close();}
});
