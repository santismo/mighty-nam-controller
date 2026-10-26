import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultFx,validFx,fxControls,fxRequest,fxReply,isFxRequest,reorder,STOCK_AMPS} from '../src/fx.js';
test('Stock amp: all 29 types, both positions, wire replies and controls',()=>{
 for(const amp of STOCK_AMPS)for(const slot of [0,1]){
  const c=defaultFx(),i=slot*16;c[i]=8;c[i+1]=1;c[i+3]=amp.value;c[i+10]=0;
  assert.equal(validFx(c),c);const request=fxRequest(1,0,19,c,31);
  const response=[...request.slice(0,9),65,0,19,0,0,0,...c,247];
  assert.deepEqual(fxReply(response,request).config,c);
  assert.equal(fxControls(c,slot)[0].name,'Amplifier');
  assert.equal(isFxRequest(request,true,{identity:'NAMLNK29',active:0,modelCrc:31,stockAmp:true,stockAmpModels:STOCK_AMPS.map(a=>a.value)}),true);
  assert.equal(isFxRequest(request,true,{identity:'NAMLNK29',active:0,modelCrc:31,stockAmp:false}),false);
 }
});
test('duplicate stock engines and out-of-range stock models are rejected',()=>{
 const c=defaultFx();c[0]=8;c[3]=1;c[16]=8;c[19]=26;assert.throws(()=>validFx(c));
 for(const id of [0,30,127]){const c=defaultFx();c[0]=8;c[3]=id;assert.throws(()=>validFx(c));}
});

import {PlugConnection} from '../src/device.js';
import {editingBluetooth} from './editor-fixture.js';
import {isReadOnlyRequest,pageRequest} from '../src/protocol.js';
test('capability is read-only and old N29 stays connected without stock mode', async()=>{
 assert.equal(isReadOnlyRequest(pageRequest(126)),true);
 for(const cap of [0,0x53540105,0x5354011d]){
  const f=editingBluetooth({identity:'NAMLNK29',stockCapabilityError:cap?0:1,onRequest(m,{words}){words[126]=cap;}});
  const link=new PlugConnection(f.bluetooth,500,0,0);const state=await link.connect();
  assert.equal(state.stockAmp,cap!==0);assert.equal(link.connected,true);link.close();
 }
});
import {PlugEditor} from '../src/editor.js';
test('N30 all stock models can be saved to all seven slots; N29 S1 limits remain',async()=>{
 for(const [identity,cap,models] of [['NAMLNK29',0x53540105,[1,26,27,28,29]],['NAMLNK30',0x5354011d,STOCK_AMPS.map(a=>a.value)]]){
  const f=editingBluetooth({identity,onRequest(m,{words}){words[126]=cap;}}),link=new PlugConnection(f.bluetooth,500,0,0),editor=new PlugEditor(link);
  let state=await link.connect();assert.deepEqual(state.stockAmpModels,models);
  await editor.readBank();
  for(let color=0;color<7;color++){
   state=await editor.recall(color);const fx=[...state.fx];fx[0]=8;fx[1]=1;fx[3]=models[color%models.length];fx[10]=0;
   state=await editor.live(state,()=>({effects:state.effects,fx,buffer:8}));
   await editor.save(state,state.effects,8,`Amp ${color}`);
   assert.deepEqual((await editor.recall(color)).fx,fx);
  }
  const q=defaultFx();q[0]=8;q[3]=2;
  assert.equal(isFxRequest(fxRequest(1,state.active,19,q,state.modelCrc),true,state),cap===0x5354011d);
  assert.equal(f.requests.some(q=>q[7]===65),false);link.close();
 }
});
import {isAmp,ampModel,ampSlot,configureAmp} from '../src/amp-ui.js';
test('Add Amp uses a free slot, names the model, retains bypass and never creates a duplicate',()=>{
 const state={stockAmp:true,stockAmpModels:STOCK_AMPS.map(a=>a.value)};
 let fx=defaultFx();assert.equal(ampSlot(fx,[3,8],state),11);
 fx=configureAmp(fx,11,state);assert.equal(isAmp(11,fx),true);assert.equal(ampModel(11,fx),'Jazz Clean');
 assert.equal(ampSlot(fx,[3,8,11],state),null);fx[1]=0;assert.equal(ampSlot(fx,[3,11],state),null);
 assert.equal(ampSlot(fx,[3],state),11);assert.equal(ampSlot(defaultFx(),[3,11,12],state),null);
 assert.equal(ampSlot(defaultFx(),[3],{stockAmp:false}),null);
 assert.throws(()=>configureAmp(fx,12,state));
 const other=defaultFx();other[1]=1;assert.equal(ampSlot(other,[3,11],state),12);
});
