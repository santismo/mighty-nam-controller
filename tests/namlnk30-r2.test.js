import test from 'node:test';import assert from 'node:assert/strict';
import {PlugConnection} from '../src/device.js';import {PlugEditor} from '../src/editor.js';
import {editingBluetooth} from './editor-fixture.js';
import {ampUnavailable,ampSlot} from '../src/amp-ui.js';
import {isReadOnlyRequest,pageRequest} from '../src/protocol.js';

test('original NAMLNK30 unsupported capability stays usable and explains missing Amp',async()=>{
 const fake=editingBluetooth({identity:'NAMLNK30',stockCapabilityError:1});const link=new PlugConnection(fake.bluetooth,500,0,0);
 try{const s=await link.connect();assert.equal(s.stockAmp,false);assert.match(ampUnavailable(s),/revision 2/);assert.match(link.report(),/response 1 \/ 0/);assert.ok(fake.requests.filter(q=>q[7]===80).every(isReadOnlyRequest));}finally{link.close();}
});
test('NAMLNK30 revision 2 enables Amp and copies into all four initially empty colors',async()=>{
 const fake=editingBluetooth({identity:'NAMLNK30',mask:7,onRequest(m,{words}){words[126]=0x5354011d;words[127]=0x4e300002;}});
 const link=new PlugConnection(fake.bluetooth,500,0,0),editor=new PlugEditor(link);
 try{let s=await link.connect();assert.equal(s.firmwareRevision,0x4e300002);assert.equal(ampUnavailable(s),null);assert.equal(ampSlot(s.fx,[3,8],s),11);await editor.readBank();
 for(const slot of [3,4,5,6]){s=await editor.save(s,s.effects,8,`New ${slot+1}`,{slot});assert.equal(s.active,slot);assert.equal(editor.bank[slot].occupied,true);}
 assert.equal(s.occupied,127);assert.equal(fake.saveCount,4);assert.equal(fake.requests.filter(q=>q[7]===65).length,0);
 }finally{link.close();}
});
test('storage error records read-only diagnostics once and never retries or changes output',async()=>{
 for(const page of [124,125,126,127])assert.equal(isReadOnlyRequest(pageRequest(page)),true);
 const fake=editingBluetooth({identity:'NAMLNK30',mask:7,saveError:3,onRequest(m,{words}){words[126]=0x5354011d;words[127]=0x4e300002;words[124]=0x81000001;words[125]=0x30390000;}});
 const link=new PlugConnection(fake.bluetooth,500,0,0),editor=new PlugEditor(link);
 try{const s=await link.connect();await editor.readBank();await assert.rejects(editor.save(s,s.effects,8,'Fourth',{slot:3}),/code 3/);
 assert.match(link.report(),/Storage diagnostics: status 81000001; address 30390000; no retry sent/);
 assert.equal(fake.requests.filter(q=>q[7]===65).length,0);assert.equal(fake.saveCount,0);assert.equal(editor.bank[3].occupied,false);
 }finally{link.close();}
});
