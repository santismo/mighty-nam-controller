import test from 'node:test';import assert from 'node:assert/strict';
import {TonePicker} from '../src/tone-picker.js';
test('picker preserves the controller page and accepts one matching same-origin return only',async()=>{
 const tab={location:{},closed:false,close(){this.closed=true;}},messages=[],returns=[];let port;
 const picker=new TonePicker({open:()=>tab,channel:()=>port={postMessage:v=>messages.push(v),close(){}},returned:async u=>returns.push(u),origin:'https://santismo.github.io'});
 try{await picker.open(async()=> 'https://www.tone3000.com/api/v1/oauth/authorize?state=abc');
 assert.equal(picker.active,true);assert.equal(tab.name,'mighty-nam-tone-picker');assert.match(tab.location.href,/tone3000/);
 for(const url of ['https://evil.test/?state=abc','https://santismo.github.io/?state=wrong'])await port.onmessage({data:{type:'tone-return',url}});
 assert.equal(returns.length,0);
 const e={data:{type:'tone-return',url:'https://santismo.github.io/mighty-nam-controller/?code=one-use&state=abc'}};
 await port.onmessage(e);await port.onmessage(e);assert.equal(returns.length,1);assert.deepEqual(messages,[{type:'tone-received'}]);assert.equal(picker.active,false);
 }finally{picker.close();}
});
test('blocked popup does not navigate the controller or start authorization',async()=>{
 let calls=0;const picker=new TonePicker({open:()=>null,returned:()=>{},origin:'https://santismo.github.io'});
 await assert.rejects(picker.open(async()=>{calls++;}),/Allow a new tab/);assert.equal(calls,0);
});
