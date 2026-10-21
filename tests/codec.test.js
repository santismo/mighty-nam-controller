import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeCodecStatus,pageRequest,isReadOnlyRequest} from '../src/protocol.js';
import {PlugConnection} from '../src/device.js';
import {editingBluetooth} from './editor-fixture.js';
test('converter diagnostics distinguish matching readback, failed reads and invalid schemas',()=>{
  assert.equal(decodeCodecStatus(0xc10f220a).verified,true);
  for(const word of [0xc103ffff,0xc10b000a,0xc10722ff]) assert.equal(decodeCodecStatus(word).verified,false);
  for(const word of [0,0xc11f220a,0xc20f220a,-1,2**32,1.5]) assert.throws(()=>decodeCodecStatus(word));
  assert.equal(isReadOnlyRequest(pageRequest(117)),true);
  for(const p of [26,116,118,128])assert.throws(()=>pageRequest(p));
});
test('17 reads cached converter status without changing output; 16 does not request it',async()=>{
  for(const identity of ['NAMLNK16','NAMLNK17','NAMLNK18','NAMLNK19'])for(const codecStatus of [0xc10f220a,0xc103ffff]){
    const fake=editingBluetooth({identity,codecStatus}),link=new PlugConnection(fake.bluetooth,500,0,0);
    await link.connect();
    assert.equal(fake.requests.filter(m=>m[7]===80&&m[8]===117).length,['NAMLNK17','NAMLNK18','NAMLNK19'].includes(identity)?1:0);
    if(['NAMLNK17','NAMLNK18','NAMLNK19'].includes(identity))assert.equal(link.current.codec.verified,codecStatus===0xc10f220a);
    link.log=[];
    if(['NAMLNK17','NAMLNK18','NAMLNK19'].includes(identity))assert.match(link.report(),codecStatus===0xc10f220a?/Converter startup: short-delay setting verified; c10f220a/:/Converter startup: setting unverified; c103ffff/);
    assert.equal(fake.requests.some(m=>m[7]===65),false);assert.equal(fake.saveCount,0);link.close();
  }
});
