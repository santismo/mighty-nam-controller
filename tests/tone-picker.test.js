import test from 'node:test';import assert from 'node:assert/strict';
import {TonePicker,relayToneCallback} from '../src/tone-picker.js';
const origin='https://santismo.github.io';
const callback=origin+'/mighty-nam-controller/?code=one-use&state=abc&tone_id=123';
function setup(){
 const listeners=new Set(),messages=[],returns=[],visibilities=[],navigation=[];
 const events={addEventListener:(n,f)=>listeners.add(f),removeEventListener:(n,f)=>listeners.delete(f)};
 const frame={src:'',contentWindow:{postMessage:(...v)=>messages.push(v)},removeAttribute(){this.src='';}};
 const picker=new TonePicker({frame,events,origin,returned:async url=>returns.push(url),changed:v=>visibilities.push(v),navigate:url=>navigation.push(url)});
 const send=e=>{for(const fn of listeners)fn(e);};
 return {picker,frame,events,send,listeners,messages,returns,visibilities,navigation};
}
const authorize=async()=> 'https://www.tone3000.com/api/v1/oauth/authorize?state=abc';
test('embedded picker accepts exactly one matching return from its own same-origin callback frame',async()=>{
 const s=setup();await s.picker.open(authorize);assert.equal(s.picker.active,true);assert.match(s.frame.src,/tone3000/);assert.deepEqual(s.navigation,[]);
 const valid={origin,source:s.frame.contentWindow,data:{type:'tone-return',url:callback}};
 for(const e of [{...valid,origin:'https://evil.test'},{...valid,source:{}},{...valid,data:{type:'tone-return',url:'https://evil.test/?state=abc'}},{...valid,data:{type:'tone-return',url:callback.replace('abc','wrong')}}])s.send(e);
 await Promise.resolve();assert.equal(s.returns.length,0);
 s.send(valid);s.send(valid);await Promise.resolve();
 assert.deepEqual(s.returns,[callback]);assert.deepEqual(s.messages,[[{type:'tone-received'},origin]]);assert.equal(s.picker.active,false);assert.equal(s.frame.src,'');assert.equal(s.listeners.size,0);
});
test('cancel during PKCE generation never reopens a dismissed frame',async()=>{
 const s=setup();let resolve;const p=s.picker.open(()=>new Promise(r=>resolve=r));s.picker.close();resolve(await authorize());await p;
 assert.equal(s.picker.active,false);assert.equal(s.frame.src,'');assert.equal(s.listeners.size,0);
});
test('same-tab fallback only navigates on explicit request, and keeps the original OAuth state',async()=>{
 const s=setup();await s.picker.open(authorize);assert.deepEqual(s.navigation,[]);s.picker.continueInTab();assert.deepEqual(s.navigation,[await authorize()]);assert.equal(s.picker.active,false);
});
test('authorization failure cleans up the panel',async()=>{
 const s=setup();await assert.rejects(s.picker.open(async()=>{throw new Error('offline');}),/offline/);assert.equal(s.picker.active,false);assert.equal(s.listeners.size,0);
});
test('callback relay uses its parent and rejects acknowledgements from other windows',()=>{
 const s=setup(),sent=[];let received=0;const parent={postMessage:(...v)=>sent.push(v)};
 const stop=relayToneCallback(callback,{target:parent,events:s.events,origin,received:()=>received++});
 try{
 assert.deepEqual(sent,[[{type:'tone-return',url:callback},origin]]);
 s.send({origin:'https://evil.test',source:parent,data:{type:'tone-received'}});s.send({origin,source:{},data:{type:'tone-received'}});assert.equal(received,0);
 s.send({origin,source:parent,data:{type:'tone-received'}});assert.equal(received,1);assert.equal(s.listeners.size,0);
 }finally{stop();}
});
