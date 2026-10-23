import test from 'node:test';
import assert from 'node:assert/strict';
import {PlugConnection} from '../src/device.js';
import {PlugEditor} from '../src/editor.js';
import {compactTunerRequest,compactTunerReply,allowedCommand,pack7,crc32,put} from '../src/commands.js';
import {editingBluetooth} from './editor-fixture.js';
function reply(q){const raw=Array(28).fill(0);put(raw,0,0x32554e4d);raw[4]=2;raw[5]=q[9]|128;put(raw,8,q[11]+128*q[12]);put(raw,12,42);put(raw,16,110000);put(raw,20,999000);put(raw,24,crc32(raw.slice(0,24)));return [240,67,88,112,4,2,78,86,2,...pack7(raw),247];}
test('compact pitch is one small frame; nonce/CRC/version gates reject invalid frames',()=>{
 const q=compactTunerRequest(4,124),wire=reply(q);assert.equal(wire.length,42);assert.equal(compactTunerReply(wire,q).frequency,110);
 assert.equal(compactTunerReply(wire,compactTunerRequest(4,125)),null);
 const corrupt=[...wire];corrupt[30]^=1;assert.equal(compactTunerReply(corrupt,q),null);
 for(const id of ['NAMLNK12','NAMLNK13','NAMLNK14','NAMLNK29'])assert.equal(allowedCommand(q,true,{identity:id}),false);
 assert.equal(allowedCommand(q,true,{identity:'NAMLNK15'}),true);assert.equal(allowedCommand(q,false,{identity:'NAMLNK15'}),false);
 assert.equal(allowedCommand([...q.slice(0,10),1,...q.slice(11)],true,{identity:'NAMLNK15'}),false);
});
for (const identity of ['NAMLNK15','NAMLNK16', 'NAMLNK17','NAMLNK18','NAMLNK19','NAMLNK20','NAMLNK21','NAMLNK22','NAMLNK23', 'NAMLNK24', 'NAMLNK25']) test(`${identity} tuner uses two requests per reading, no pages or repeated full status/mute cycle`,async()=>{
 const fake=editingBluetooth({identity}),link=new PlugConnection(fake.bluetooth,500,0,0),editor=new PlugEditor(link);await link.connect();const at=fake.requests.length;
 for(let i=0;i<3;i++) {const result=await editor.tune(440,{fast:true});assert.equal(result.reading.note,'A');assert.equal(result.reading.cents,0);assert.equal(result.compact,true);}
 assert.deepEqual(fake.requests.slice(at).map(m=>m[9]),[3,4,3,4,3,4]);assert.equal(fake.saveCount,0);assert.equal(fake.words[23],0);link.close();
});
test('compact tuner rejects changed capture and refuses unmuted capture; cancellation stops capture',async()=>{
 for(const mode of ['changed','playing','cancel']){
  let canceled=false;const fake=editingBluetooth({identity:'NAMLNK15',changedCompact:mode==='changed',onRequest:m=>{if(mode==='cancel'&&m[7]===85&&m[9]===3)canceled=true;}}),link=new PlugConnection(fake.bluetooth,500,0,0),editor=new PlugEditor(link);await link.connect();
  if(mode==='playing')fake.words[23]=1;
  await assert.rejects(editor.tune(440,{fast:true,canceled:()=>canceled}),mode==='changed'?/changed/:mode==='playing'?/muted/:/stopped/);
  if(mode==='cancel')assert.equal(fake.requests.at(-1)[9],5);assert.equal(fake.saveCount,0);link.close();
 }
});
