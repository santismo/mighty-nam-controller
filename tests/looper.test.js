import test from 'node:test';
import assert from 'node:assert/strict';
import {loopRequest,loopReply,decodeLoop,Looper,thresholdMeter} from '../src/looper.js';
import {allowedCommand} from '../src/commands.js';
import {PlugConnection} from '../src/device.js';
import {PlugEditor} from '../src/editor.js';
import {editingBluetooth} from './editor-fixture.js';
const reply=(q,words,error=0)=>[...q.slice(0,9),q[9]|64,...q.slice(10,13),error,...words.flatMap(n=>Array.from({length:5},(_,j)=>Math.floor(n/2**(7*j))&127)),247];
test('live input meter shares the threshold dB scale and uses one read-only reply',async()=>{
  const peak=Math.round(.02*65535),words=[257,0,0,0,1,peak<<8,40|(50<<8)|(30<<16),0];
  const requests=[];
  const link={current:{identity:'NAMLNK27'},request:async(q,parse,label,{mutation})=>{
    requests.push(q);assert.equal(q[9],0);assert.equal(q[10],6);assert.equal(mutation,false);return parse(reply(q,words));
  }};
  const state=await new Looper(link).read();assert.equal(requests.length,1);
  const meter=thresholdMeter(state.peak,40);assert.ok(meter.above&&meter.percent>50&&meter.percent<60);
  assert.equal(thresholdMeter(state.peak,20).above,false);
  assert.equal(thresholdMeter(0,60).percent,0);assert.equal(thresholdMeter(null,40).available,false);
  assert.equal(thresholdMeter(1,12).percent,100);
  assert.throws(()=>decodeLoop([...words.slice(0,5),0x1000000,...words.slice(6)],'NAMLNK27'));
  assert.throws(()=>loopRequest(0,6,1,'NAMLNK26'));
  assert.equal(allowedCommand(loopRequest(0,6,1,'NAMLNK27'),false,{identity:'NAMLNK27'}),true);
});
test('loop requests are firmware-gated, bounded, and never mute/write flash',()=>{
  for(const identity of ['NAMLNK25','NAMLNK26','NAMLNK27'])for(const [op,arg] of [[0,0],[0,4],[1,1],[1,5]]){
    const q=loopRequest(op,arg,16383,identity);
    assert.equal(allowedCommand(q,op>0,{identity}),true);
    assert.equal(allowedCommand(q,false,{identity}),op===0);
    assert.equal(allowedCommand(q,true,{identity:'NAMLNK24'}),false);
    assert.equal(allowedCommand(q,true,{identity:'NAMLNK28'}),false);
    assert.equal(q[7],79);
  }
  for(const [op,arg] of [[0,5],[1,6],[1,10],[2,12],[2,60],[3,0],[3,100],[4,30],[4,60]]){
    const q=loopRequest(op,arg,1,'NAMLNK26');assert.equal(allowedCommand(q,op>0,{identity:'NAMLNK26'}),true);
    assert.throws(()=>loopRequest(op,arg,1,'NAMLNK25'));
  }
  for(const [op,arg] of [[0,6],[1,0],[1,11],[2,11],[2,61],[3,101],[4,45],[5,0]])assert.throws(()=>loopRequest(op,arg,1,'NAMLNK26'));
  for(const nonce of [0,-1,1.5,16384,NaN])assert.throws(()=>loopRequest(0,5,nonce,'NAMLNK26'));
});
test('loop replies validate nonce, opcode, seven-bit payload, and full-width words',()=>{
  const q=loopRequest(0,5,130,'NAMLNK26'),words=[259,720000,234,0,0xffffffff,0,40|(50<<8)|(60<<16),0];
  const r=reply(q,words);assert.deepEqual(loopReply(r,q),{error:0,words});
  for(const [i,v] of [[0,0],[9,65],[10,0],[11,3],[12,2],[13,4],[14,128],[18,16],[54,0]]){
    const bad=[...r];bad[i]=v;assert.equal(loopReply(bad,q),null);
  }
  const state=decodeLoop(words,'NAMLNK26');assert.equal(state.mode,true);assert.equal(state.seconds,60);assert.equal(state.rate,12000);
  assert.throws(()=>decodeLoop([6,...words.slice(1)],'NAMLNK26'));
  assert.throws(()=>decodeLoop([...words.slice(0,6),40|(50<<8)|(45<<16),0],'NAMLNK26'));
});
test('NAMLNK25 reports 30-second transport; settings and overdub stay gated',async()=>{
  const data=Array(40).fill(0);Object.assign(data,{0:0x4c4f5031,1:1,2:2,8:3,9:720000,10:500,13:7});
  const requests=[],connection={current:{identity:'NAMLNK25'},request:async(q,parse)=>{requests.push(q);return parse(reply(q,data.slice(q[10]*8,q[10]*8+8)));}};
  const s=await new Looper(connection).read();assert.equal(s.extended,false);assert.equal(s.length/s.rate,30);assert.equal(s.state,3);
  assert.equal(requests.length,5);assert.ok(requests.every(q=>q[9]===0));
});
test('new controls await IRQ application; ambiguous mutation is not retried',async()=>{
  const requests=[];let sequence=0,pending=0,volume=50,reads=0;
  const connection={current:{identity:'NAMLNK26'},request:async(q,parse,label,{mutation})=>{
    requests.push(q);assert.equal(mutation,q[9]!==0);
    if(q[9]){pending=q[10];sequence++;return parse(reply(q,[sequence,0,0,0,0,0,0,0]));}
    if(++reads===2){volume=pending;pending=0;}
    return parse(reply(q,[3,24000,0,pending,sequence,0,40|(volume<<8)|(30<<16),0]));
  }};
  const l=new Looper(connection),s=await l.change(3,70);assert.equal(s.volume,70);
  assert.equal(requests.filter(q=>q[9]!==0).length,1);assert.equal(reads,2);
  connection.request=async()=>{requests.push('failed');throw new Error('No matching reply');};
  await assert.rejects(l.change(1,6),/No matching reply/);assert.equal(requests.filter(q=>q==='failed').length,1);
});
test('fragmented Bluetooth looper replies coexist with direct preset selection without saving or muting',async()=>{
  let sequence=0,volume=50,seconds=30,flags=1,state=0,length=0;
  const fake=editingBluetooth({identity:'NAMLNK26',replyMtu:20,loopReply:q=>{
    if(q[9]){
      ++sequence;
      if(q[9]===3)volume=q[10];if(q[9]===4)seconds=q[10];
      if(q[9]===1&&q[10]===1){state=2;length=12000;}
      if(q[9]===1&&q[10]===2)state=3;
      if(q[9]===1&&q[10]===6)flags^=2;
      return reply(q,[sequence,0,0,0,0,0,0,0]);
    }
    return reply(q,[state|(flags<<8),length,0,0,sequence,0,40|(volume<<8)|(seconds<<16),0]);
  }});
  fake.words[23]=1;
  const link=new PlugConnection(fake.bluetooth,500,0,0);
  try{
    await link.connect();const loop=new Looper(link),editor=new PlugEditor(link);
    await loop.change(4,60);await loop.change(3,65);await loop.change(1,1);await loop.change(1,2);await loop.change(1,6);
    const before=await loop.read();await editor.recall(2);const after=await loop.read();
    assert.deepEqual(after,before);assert.equal(after.overdub,true);assert.equal(after.volume,65);assert.equal(after.seconds,60);
    assert.equal(link.current.active,2);assert.equal(fake.saveCount,0);
    assert.ok(!fake.requests.some(q=>q[7]===65&&q[8]===0),'Must not send an automatic mute');
  }finally{link.close();}
});
