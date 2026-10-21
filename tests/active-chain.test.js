import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleOrder,membership,enabled} from '../src/active-chain.js';
import {fullOrder,reorder} from '../src/fx.js';
import {PlugConnection} from '../src/device.js';
import {PlugEditor} from '../src/editor.js';
import {editingBluetooth} from './editor-fixture.js';
test('active membership covers every stock mask and both custom slots without losing settings',()=>{
 const fake=editingBluetooth({identity:'NAMLNK20'});
 for(let mask=0;mask<2048;mask++){
   let {effects,extra:fx}=fake;effects=[...effects];fx=[...fx];
   const all=fullOrder(effects,fx);
   for(let j=0;j<all.length;j++){
     const id=all[j];if(id<10)effects[id]=(effects[id]&63)|((mask&(1<<j))?0:64);else fx[(id-11)*16+1]=(mask>>j)&1;
   }
   assert.deepEqual(visibleOrder(effects,fx,'NAMLNK20'),all.filter((_,j)=>mask&(1<<j)));
   assert.deepEqual(visibleOrder(effects,fx,'NAMLNK19'),all);
   const id=all[mask%11],before=enabled(effects,fx,id),after=membership(effects,fx,id,!before,'NAMLNK20');
   assert.equal(enabled(after.effects,after.fx,id),!before);
   assert.deepEqual(after.effects.slice(11,89),effects.slice(11,89));
   for(const i of [0,16])assert.deepEqual(after.fx.slice(i+3,i+16),fx.slice(i+3,i+16));
   assert.equal(new Set(fullOrder(after.effects,after.fx)).size,11);
 }
 assert.throws(()=>membership(fake.effects,fake.extra,3,false,'NAMLNK19'));
});
test('two-block live edits, custom insert/remove, reorder, save and recall use confirmed wire state',async()=>{
 const fake=editingBluetooth({identity:'NAMLNK20'}),link=new PlugConnection(fake.bluetooth,500,0,0),editor=new PlugEditor(link);
 fake.words[23]=1;await link.connect();await editor.readBank();let state=link.current;
 let effects=[...state.effects],fx=[...state.fx];for(let id=1;id<=9;id++)effects[id]=(effects[id]&63)|([3,8].includes(id)?0:64);fx[1]=fx[17]=0;
 state=await editor.live(state,()=>({effects,fx,buffer:8}));assert.deepEqual(visibleOrder(state.effects,state.fx,state.identity),[3,8]);
 for(const id of [11,12]){
   ({effects,fx}=membership(state.effects,state.fx,id,true,state.identity));state=await editor.live(state,()=>({effects,fx,buffer:8}));
 }
 assert.deepEqual(visibleOrder(state.effects,state.fx,state.identity),[3,8,11,12]);
 const order=fullOrder(state.effects,state.fx);order.splice(order.indexOf(12),1);order.unshift(12);
 ({effects,fx}=reorder(state.effects,state.fx,order));state=await editor.live(state,()=>({effects,fx,buffer:8}));
 assert.deepEqual(visibleOrder(state.effects,state.fx,state.identity),[12,3,8,11]);
 for(const id of [11,12]){({effects,fx}=membership(state.effects,state.fx,id,false,state.identity));state=await editor.live(state,()=>({effects,fx,buffer:8}));}
 assert.equal(fake.saveCount,0);assert.equal(state.listening,true);
 state=await editor.save(state,state.effects,8,'Two blocks');assert.equal(fake.saveCount,1);
 await editor.recall(1);state=await editor.recall(0);assert.deepEqual(visibleOrder(state.effects,state.fx,state.identity),[3,8]);assert.equal(state.listening,true);
 for(const id of [3,8]){({effects,fx}=membership(state.effects,state.fx,id,false,state.identity));state=await editor.live(state,()=>({effects,fx,buffer:8}));}
 assert.deepEqual(visibleOrder(state.effects,state.fx,state.identity),[]);assert.equal(state.modelCrc,0x12345678);link.close();
});
