import test from 'node:test';
import assert from 'node:assert/strict';
import { ToneClient,TONE_ORIGIN,safeImage,toneURL } from '../src/tone3000.js';
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),data};};
const response=(object,status=200)=>new Response(JSON.stringify(object),{status,headers:{'content-type':'application/json'}});
const session={access_token:'test-access',refresh_token:'test-refresh',expires_in:3600,token_type:'bearer'};
const redirect='https://santismo.github.io/mighty-nam-controller/';
async function flow(client){const url=new URL(await client.authorize(redirect));return `${redirect}?state=${url.searchParams.get('state')}&code=test-code&tone_id=123`;}
test('PKCE authorization, one-use callback and token exchange retain tokens only in the supplied tab session',async()=>{
  const store=storage(),calls=[],client=new ToneClient({storage:store,fetcher:async(u,o)=>{calls.push([u,o]);return response(session);}});
  const url=new URL(await client.authorize(redirect,{gear:'amp-cab'})),query=url.searchParams,flow=JSON.parse([...store.data.values()][0]);
  assert.equal(query.get('prompt'),'select_tone');assert.equal(query.get('architecture'),'2');assert.equal(query.get('preview'),'false');assert.equal(query.get('gears'),'amp-cab');assert.ok(!query.has('client_secret'));assert.equal(query.get('state'),flow.state);
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(flow.verifier)));assert.equal(query.get('code_challenge'),Buffer.from(digest).toString('base64url'));
  const callback=`${redirect}?code=test-code&state=${flow.state}&tone_id=123`;assert.equal(await client.complete(callback),123);assert.ok(client.connected);assert.equal(store.data.size,1);assert.equal(store.data.has('namplug.tone.pkce.v1'),false);assert.equal(calls[0][1].body.get('code_verifier'),flow.verifier);assert.equal(calls[0][1].credentials,'omit');assert.equal(calls[0][1].referrerPolicy,'no-referrer');
  await assert.rejects(client.complete(callback));assert.equal(calls.length,1);
});
test('state, redirect, expiry, duplicate query, errors and replay cannot exchange a code',async()=>{
  for(const mode of ['state','redirect','expiry','duplicate','error','hash']){let time=1000,calls=0;const c=new ToneClient({storage:storage(),now:()=>time,fetcher:async()=>{calls++;return response(session);}});const u=new URL(await flow(c));
    if(mode==='state')u.searchParams.set('state','bad');if(mode==='redirect')u.pathname='/elsewhere/';if(mode==='expiry')time+=600001;if(mode==='duplicate')u.searchParams.append('code','second');if(mode==='error')u.searchParams.set('error','denied');if(mode==='hash')u.hash='bad';await assert.rejects(c.complete(u.href));assert.equal(calls,0);await assert.rejects(c.complete(u.href));
  }
});
test('only same-origin API downloads receive bearer tokens; errors never echo token or raw server messages',async()=>{
  let calls=0;const c=new ToneClient({storage:storage(),fetcher:async(u,o)=>{calls++;assert.ok(u.startsWith(TONE_ORIGIN+'/api/v1/'));assert.equal(o.headers.Authorization,'Bearer test-access');assert.equal(o.redirect,'error');return response({message:'private-secret'},403);}});c.session={access:'test-access',refresh:'test-refresh',expires:Date.now()+3600000};
  for(const url of ['https://other.test/api/v1/steal','https://www.tone3000.com.evil.test/api/v1/a','https://user:pass@www.tone3000.com/api/v1/a','/settings','/api/v1/a#bad'])await assert.rejects(c.get(url),/Untrusted/);assert.equal(calls,0);
  await assert.rejects(c.get('/api/v1/user'),e=>!e.message.includes('private-secret'));assert.equal(calls,1);
  assert.equal(safeImage('javascript:alert(1)'),null);assert.equal(safeImage('data:image/svg+xml,xx'),null);assert.equal(toneURL('https://evil.test'),TONE_ORIGIN);
});
test('refresh is single-flight and sign-out prevents delayed tokens from restoring session',async()=>{
  let resolve,calls=0;const c=new ToneClient({storage:storage(),fetcher:async()=>{calls++;return new Promise(r=>resolve=r);}});c.session={access:'old',refresh:'refresh',expires:0};const a=c.refresh(),b=c.refresh();await Promise.resolve();c.signOut();resolve(response(session));await assert.rejects(a,/changed/);await assert.rejects(b,/changed/);assert.equal(calls,1);assert.equal(c.connected,false);
});
test('bounded library feeds cannot request unrestricted search or invalid models',async()=>{
  const calls=[],c=new ToneClient({storage:storage(),fetcher:async(u)=>{calls.push(u);return response({data:[]});}});c.session={access:'test-access',refresh:'test-refresh',expires:Date.now()+3600000};
  for(const collection of ['favorited','downloaded','created','trending','latest'])await c.list(collection,1,'amp-cab');
  assert.equal(calls.length,5);assert.ok(calls.every(u=>!u.includes('/search')));await assert.rejects(c.list('search'));await assert.rejects(c.list('favorited',0));await assert.rejects(c.list('trending',1,'bad'));
  await assert.rejects(c.download({tone_id:2,architecture_version:'2',model_url:'/api/v1/a'},{id:1,format:'nam'}));assert.equal(calls.length,5);
});
test('oversized responses are refused and non-success download is not treated as model data',async()=>{
  const c=new ToneClient({storage:storage(),fetcher:async()=>new Response('x'.repeat(50))});c.session={access:'a',refresh:'r',expires:Date.now()+100000};await assert.rejects(c.get('/api/v1/user',10),/too large/);
});
test('browser fetch default is called without a custom receiver; only model-download routes follow redirects',async()=>{
  const original=globalThis.fetch,calls=[];globalThis.fetch=function(url,options){assert.equal(this,undefined);calls.push([url,options]);return Promise.resolve(response({ok:true}));};
  try{const c=new ToneClient({storage:storage()});await c.response('/api/v1/user');await c.response('/api/v1/models/748130/download/example.nam',{download:true});assert.equal(calls[0][1].redirect,'error');assert.equal(calls[1][1].redirect,'follow');await assert.rejects(c.response('/api/v1/user',{download:true}));assert.equal(calls.length,2);}finally{globalThis.fetch=original;}
});

test('reload restores the authorized tab session; sign-out removes it',async()=>{
 const store=storage(),c=new ToneClient({storage:store,fetcher:async()=>response(session)});
 await c.complete(await flow(c));
 const restored=new ToneClient({storage:store,fetcher:async()=>response({username:'test'})});
 assert.equal(restored.connected,true);assert.equal((await restored.checkSession()).username,'test');
 restored.signOut();assert.equal(new ToneClient({storage:store}).connected,false);assert.equal(store.data.size,0);
});
test('invalid saved sessions are ignored and expired authorization is cleared',async()=>{
 const store=storage();store.setItem('namplug.tone.session.v1','{"access":123}');assert.equal(new ToneClient({storage:store}).connected,false);
 const c=new ToneClient({storage:store,fetcher:async()=>response({},401)});c.session={access:'fixture',refresh:'fixture',expires:Date.now()+3600000};c.remember();
 assert.equal(await c.checkSession(),null);assert.equal(c.connected,false);assert.equal(store.data.size,0);
});
