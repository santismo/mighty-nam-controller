import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ToneBrowser} from '../src/tone-browser.js';
import {ToneClient} from '../src/tone3000.js';
import {CaptureLibrary} from '../src/model.js';
import {A2_TOPOLOGY} from '../src/a2-topology.js';
import {PlugConnection} from '../src/device.js';
import {PlugEditor} from '../src/editor.js';
import {editingBluetooth} from './editor-fixture.js';
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
class Node {
 constructor(tag='div'){this.tag=tag;this.children=[];this.dataset={};this.value='';this.textContent='';this.listeners=new Map();this.classList={toggle(){}};this.contentWindow={postMessage(){}};}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=nodes;}
 setAttribute(k,v){this[k]=v;}
 removeAttribute(k){delete this[k];}
 addEventListener(k,f){this.listeners.set(k,f);}
 querySelectorAll(selector){return this.children.flatMap(n=>n instanceof Node?[...(n.tag==='button'&&(!selector.includes('data-model-id')||n.dataset.modelId)&&(!selector.includes('data-capture-sha')||n.dataset.captureSha)?[n]:[]),...n.querySelectorAll(selector)]:[]);}
 showModal(){this.open=true;}
 close(){this.open=false;this.listeners.get('close')?.();}
}
function setup(t){
 const old={document:globalThis.document,window:globalThis.window,location:globalThis.location};
 const nodes=new Map([...readFileSync(new URL('../index.html',import.meta.url),'utf8').matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Node()]));
 const location={origin:'https://santismo.github.io',href:'https://santismo.github.io/mighty-nam-controller/'};
 globalThis.location=location;globalThis.window={addEventListener(){},removeEventListener(){}};
 globalThis.document={getElementById:id=>{assert.ok(nodes.has(id),`Missing HTML element ${id}`);return nodes.get(id);},createElement:tag=>new Node(tag)};
 nodes.get('tone-collection').value='local';
 t.after(()=>{for(const [key,value] of Object.entries(old))if(value===undefined)delete globalThis[key];else globalThis[key]=value;});
 return {nodes,location};
}
test('selection returns in-page, downloads a validated A2 Lite capture, and only labels it active after confirmed selection',async t=>{
 const {nodes,location}=setup(t),calls=[],selected=[];
 const fake=editingBluetooth({identity:'NAMLNK28'}),link=new PlugConnection(fake.bluetooth,500,0,0),editor=new PlugEditor(link);
 t.after(()=>link.close());await link.connect();await editor.readBank();
 const nam={version:'0.7.0',architecture:'WaveNet',sample_rate:48000,config:{...structuredClone(A2_TOPOLOGY),head_scale:1},weights:Array(1871).fill(0)};
 const tone={id:123,title:'Test amp',format:'nam',gear:'amp',user:{username:'test'},images:[]};
 const model={id:456,tone_id:123,architecture_version:'2',name:'Test Lite',model_url:'/api/v1/models/456/download/test.nam'};
 const client=new ToneClient({storage:storage(),fetcher:async(url,options)=>{
  const path=new URL(url).pathname;calls.push(path);
  const body=path.endsWith('/token')?{access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600,token_type:'bearer'}:path.endsWith('/user')?{username:'test'}:path.endsWith('/tones/123')?tone:path.endsWith('/models')?{data:[model]}:path.endsWith('/test.nam')?nam:null;
  assert.ok(body,`Unexpected request ${path}`);
  if(!path.endsWith('/token'))assert.equal(options.headers.Authorization,'Bearer fixture-access');
  return new Response(JSON.stringify(body));
 }});
 let browser;
 browser=new ToneBrowser({client,library:new CaptureLibrary(storage()),onSelect:async capture=>{const confirmed=await editor.loadModel(link.current,capture);assert.equal(confirmed.modelCrc,capture.crc);selected.push(capture);browser.showActive(capture);}});
 await browser.authorize();assert.equal(nodes.get('tone-picker').hidden,false);assert.equal(nodes.get('tone-library').hidden,true);
 const state=new URL(nodes.get('tone-picker-frame').src).searchParams.get('state');browser.picker.close();
 await browser.callback(`${location.href}?code=fixture-code&state=${state}&tone_id=123`);
 assert.equal(nodes.get('tone-picker').hidden,true);assert.equal(nodes.get('tone-library').hidden,false);assert.equal(selected.length,0);
 const load=nodes.get('tone-content').querySelectorAll('button[data-model-id]')[0];assert.equal(load.textContent,'Load capture');
 await load.onclick();assert.equal(selected.length,1);assert.equal(selected[0].slot.length,8192);assert.equal(load.textContent,'Active on plug');
 assert.equal(fake.saveCount,0);assert.equal(editor.activeCapture.sha,selected[0].sha);
 assert.equal(browser.library.records().length,1);assert.ok(calls.includes('/api/v1/models/456/download/test.nam'));assert.equal(nodes.get('tone-dialog').open,true);
});
test('failed transfer leaves the downloaded capture available without claiming it is active',async t=>{
 const {nodes}=setup(t);let selected=0;
 const browser=new ToneBrowser({client:{connected:false},library:new CaptureLibrary(storage()),onSelect:async()=>{selected++;throw new Error('Transfer not confirmed');}});
 await browser.job('Loading…',()=>browser.select({sha:'fixture'}));
 assert.equal(selected,1);assert.equal(browser.active,null);assert.equal(nodes.get('tone-message').textContent,'Transfer not confirmed');assert.equal(browser.waiting,false);
});
