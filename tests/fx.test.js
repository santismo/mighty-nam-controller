import test from 'node:test';
import assert from 'node:assert/strict';
import {PlugConnection} from '../src/device.js';
import {PlugEditor} from '../src/editor.js';
import {defaultFx,validFx,fullOrder,reorder,fxRequest,isFxRequest} from '../src/fx.js';
import {ReplyPages} from '../src/reply-pages.js';
import {editingBluetooth} from './editor-fixture.js';
import {chainFrame} from './fixtures.js';
const setup=async options=>{const fake=editingBluetooth({identity:'NAMLNK13',...options}),link=new PlugConnection(fake.bluetooth,1500,0,0),editor=new PlugEditor(link);await link.connect();await editor.readBank();return {fake,link,editor};};
test('eleven-block order supports every distinct pair of FX positions and preserves stock bytes',()=>{
 const fx=defaultFx(),effects=chainFrame().slice(7,-1);
 for(let a=0;a<=10;a++)for(let b=0;b<=10;b++){if(a===b)continue;const c=[...fx];c[2]=a;c[18]=b;const order=fullOrder(effects,c);assert.equal(order[a],11);assert.equal(order[b],12);const result=reorder(effects,c,order);assert.deepEqual(result.effects,effects);assert.deepEqual(result.fx,c);}
 const invalid=[...fx];invalid[18]=invalid[2];assert.throws(()=>validFx(invalid));
 assert.ok(isFxRequest(fxRequest(0,255,3),false,null));
 assert.equal(isFxRequest(fxRequest(1,0,3,fx,55),true,{identity:'NAMLNK12',modelCrc:55,active:0}),false);
});
test('paged reply rejects missing, reordered and mixed-generation chunks',()=>{
 const page=(gen,index,total=100)=>[240,67,88,112,4,2,78,82,1,gen,0,index,Math.ceil(total/40),total,0,...Array(Math.min(40,total-index*40)).fill(0),247];
 const p=new ReplyPages();assert.deepEqual(p.push(page(1,0)).next,[240,67,88,112,4,2,78,82,1,1,0,1,247]);assert.throws(()=>p.push(page(2,1)));
 assert.throws(()=>new ReplyPages().push(page(1,1)));
 const q=new ReplyPages();q.push(page(1,0));q.push(page(1,1));assert.equal(q.push(page(1,2)).message.length,102);
});
test('NAMLNK13 paged presets, dual live FX, exact save/recall and tuner work together',async()=>{
 const {fake,link,editor}=await setup();assert.equal(editor.largeReplies,true);assert.deepEqual(link.current.fx,defaultFx());
 const fx=[...link.current.fx];fx[1]=fx[17]=1;fx[3]=0;fx[16]=6;fx[18]=0;fx[2]=10;
 const state=await editor.live(link.current,()=>({effects:link.current.effects,buffer:8,fx}));assert.deepEqual(state.fx,fx);assert.equal(fake.saveCount,0);
 const saved=await editor.save(state,state.effects,8,'Two FX');assert.deepEqual(saved.fx,fx);assert.deepEqual(fake.bankFx[0],fx);
 await editor.recall(1);assert.deepEqual(link.current.fx,defaultFx());await editor.recall(0);assert.deepEqual(link.current.fx,fx);
 assert.equal((await editor.tune()).reading.note,'A');assert.ok(fake.requests.some(m=>m[7]===82));assert.equal(fake.saveCount,1);link.close();
});
test('lost reply page stops the operation without repeating the initiating command',async()=>{
 const {fake,link,editor}=await setup();let drops=0;const original=fake.characteristic.writeValueWithoutResponse;
 fake.characteristic.writeValueWithoutResponse=async data=>{const p=new Uint8Array(data);if(p.includes(82)){drops++;return;}return original(data);};
 link.timeout=25;await assert.rejects(editor.preset(1,0),/no matching reply/);assert.equal(drops,1);assert.equal(fake.saveCount,0);link.close();
});
