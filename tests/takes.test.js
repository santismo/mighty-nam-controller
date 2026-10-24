import test from 'node:test';
import assert from 'node:assert/strict';
import {loopRequest,decodeTakes,decodeLoop,isLoopRequest,Looper} from '../src/looper.js';
const levels=100|(65<<7)|(40<<14)|(100<<21);
test('NAMLNK29 lanes have per-lane meters, mute, record, undo and capacity',()=>{
 const s=decodeTakes([7|32|512,levels,16384|(8192<<16),4096,1,1,17,96000]);
 assert.equal(s.tracks[0].peak,.5);assert.equal(s.tracks[1].muted,true);assert.equal(s.tracks[1].recording,true);
 assert.equal(s.tracks[1].level,65);assert.equal(s.tracks[2].peak,.125);assert.equal(s.available,1);assert.equal(s.undo,true);assert.equal(s.redo,false);
 const edit=decodeTakes([7|(2<<16)|(1<<19),levels,0,0,1,2,18,96000]);
 assert.equal(edit.preparing,2);assert.equal(edit.canEdit,true);
 const restored=decodeTakes([7,levels,0,0,1,2<<8,19,96000]);assert.equal(restored.undo,false);assert.equal(restored.redo,true);
});
test('lane operations never reach old firmware; read-only transport cannot mutate them',()=>{
 const valid=[[0,7],[1,11],[1,12],[1,13],[1,14],[6,0],[7,100],[8,55],[9,99],[10,7],[11,3],[12,2]];
 for(const [op,arg] of valid){
  const q=loopRequest(op,arg,83,'NAMLNK29');assert.equal(isLoopRequest(q,true,{identity:'NAMLNK29'}),true);
  assert.equal(isLoopRequest(q,false,{identity:'NAMLNK29'}),op===0);
  for(const identity of ['NAMLNK25','NAMLNK26','NAMLNK27','NAMLNK28'])assert.equal(isLoopRequest(q,true,{identity}),false);
 }
 for(const [op,arg] of [[0,8],[1,15],[6,101],[9,-1],[10,8],[11,0],[11,4],[12,0],[12,4],[13,1]])assert.throws(()=>loopRequest(op,arg,83,'NAMLNK29'));
});
test('corrupt lane status is rejected instead of creating phantom controls',()=>{
 const w=[3,levels,0,0,2,1,4,100];
 for(const [index,value] of [[0,1<<20],[1,127],[2,0xffffffff],[4,4],[5,4],[7,720001]]){const a=[...w];a[index]=value;assert.throws(()=>decodeTakes(a));}
 assert.throws(()=>decodeTakes([1|512,levels,0,0,2,1,4,100]));
});
test('NAMLNK29 retains compact meter and saved settings compatibility',()=>{
 const s=decodeLoop([3|(3<<8),100,50,0,2,16000<<8,50|(100<<8)|(30<<16)|(1<<24),0],'NAMLNK29');
 assert.equal(s.saved,true);assert.equal(s.overdub,true);assert.equal(s.volume,100);assert.ok(s.peak>.2);
});
test('NAMLNK29 uses just two status replies for all lanes',async()=>{
 const q=[];const loop=new Looper({current:{identity:'NAMLNK29'}});
 loop.request=async(op,arg)=>{q.push([op,arg]);return arg===6?[3,100,40,0,3,0,50|(100<<8)|(30<<16),0]:[3,levels,0,0,2,1,4,100];};
 const s=await loop.read();assert.deepEqual(q,[[0,6],[0,7]]);assert.equal(s.takes.tracks[1].present,true);
});
