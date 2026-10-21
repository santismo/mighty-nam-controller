// Browser PKCE; bearer tokens stay in memory and are never logged or exported.
export const TONE_ORIGIN='https://www.tone3000.com';
export const TONE_CLIENT='t3k_pub_cMMvjbb_E3p8wWAvqE6xLJSeVSOhx7S1';
const FLOW_KEY='namplug.tone.pkce.v1';
const base64url=b=>btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const random=()=>base64url(crypto.getRandomValues(new Uint8Array(32)));
export function safeImage(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
export function toneURL(value){try{const u=new URL(value);return u.origin===TONE_ORIGIN&&!u.username&&!u.password?u.href:TONE_ORIGIN;}catch{return TONE_ORIGIN;}}
export class ToneClient {
  constructor({fetcher=(...args)=>fetch(...args),storage=sessionStorage,now=()=>Date.now()}={}){this.fetcher=fetcher;this.storage=storage;this.now=now;this.session=null;this.refreshing=null;this.epoch=0;}
  get connected(){return Boolean(this.session);}
  async authorize(redirect,{toneId=null,gear=''}={}){
    const r=new URL(redirect);if(!['https:','http:'].includes(r.protocol)||r.search||r.hash||(r.protocol==='http:'&&!['localhost','127.0.0.1'].includes(r.hostname)))throw new Error('Invalid sign-in return address.');
    const verifier=random(),state=random(),challenge=base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
    this.storage.setItem(FLOW_KEY,JSON.stringify({verifier,state,redirect:r.href,created:this.now()}));
    const u=new URL('/api/v1/oauth/authorize',TONE_ORIGIN);Object.entries({client_id:TONE_CLIENT,redirect_uri:r.href,response_type:'code',code_challenge:challenge,code_challenge_method:'S256',state,prompt:toneId?'load_tone':'select_tone',architecture:'2',format:'nam',preview:'false',menubar:'true'}).forEach(([k,v])=>u.searchParams.set(k,v));
    if(toneId){if(!Number.isSafeInteger(toneId)||toneId<1)throw new Error('Invalid tone.');u.searchParams.set('tone_id',toneId);}
    if(['amp','amp-cab','pedal','cab','outboard'].includes(gear))u.searchParams.set('gears',gear);
    return u.href;
  }
  async complete(callback){
    const url=new URL(callback),p=url.searchParams;let flow;try{flow=JSON.parse(this.storage.getItem(FLOW_KEY)||'null');}catch{}
    this.storage.removeItem(FLOW_KEY);
    const bare=new URL(url);bare.search='';bare.hash='';
    if(!flow||bare.href!==flow.redirect||url.hash||p.get('state')!==flow.state||this.now()-flow.created>600000||this.now()<flow.created||[...p.keys()].some(k=>p.getAll(k).length!==1))throw new Error('Sign-in expired or did not match. Browse TONE3000 again.');
    if(p.has('error'))throw new Error('TONE3000 sign-in was canceled or declined.');
    const code=p.get('code');if(!code||code.length>4096){if(p.get('canceled')==='true')return null;throw new Error('TONE3000 did not return a sign-in code.');}
    const epoch=++this.epoch;this.session=null;
    const next=await this.token({grant_type:'authorization_code',client_id:TONE_CLIENT,redirect_uri:flow.redirect,code_verifier:flow.verifier,code});
    if(epoch!==this.epoch)throw new Error('Sign-in was superseded.');this.session=next;
    if(p.get('canceled')==='true')return null;const id=Number(p.get('tone_id'));if(!Number.isSafeInteger(id)||id<1)throw new Error('No tone was selected. Browse TONE3000 again.');return id;
  }
  async response(path,{form=null,token=null,limit=1024*1024,download=false}={}){
    const url=new URL(path,TONE_ORIGIN);if(url.origin!==TONE_ORIGIN||!url.pathname.startsWith('/api/v1/')||url.username||url.password||url.hash)throw new Error('Untrusted TONE3000 download address.');
    if(download&&!/^\/api\/v1\/models\/[1-9][0-9]*\/download\/[^/]+$/.test(url.pathname))throw new Error('Invalid model download route.');
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),20000);
    try{
      const response=await this.fetcher(url.href,{method:form?'POST':'GET',credentials:'omit',redirect:download?'follow':'error',referrerPolicy:'no-referrer',headers:token?{Authorization:`Bearer ${token}`}:{},body:form?new URLSearchParams(form):undefined,signal:abort.signal});
      if(Number(response.headers.get('content-length'))>limit)throw new Error('TONE3000 response is too large.');
      const reader=response.body?.getReader();let bytes;
      if(reader){const chunks=[];let n=0;try{for(;;){const {value,done}=await reader.read();if(done)break;n+=value.length;if(n>limit)throw new Error('TONE3000 response is too large.');chunks.push(value);}}catch(e){await reader.cancel();throw e;}bytes=new Uint8Array(n);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}}
      else{bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>limit)throw new Error('TONE3000 response is too large.');}
      return {status:response.status,bytes};
    }catch(error){if(error.name==='AbortError')throw new Error('TONE3000 timed out. Try again.');if(error instanceof TypeError)throw new Error('Could not reach TONE3000. Check the connection and try again.');throw error;}finally{clearTimeout(timer);}
  }
  object(r){if(r.status!==200)throw Object.assign(new Error(r.status===429?'TONE3000 rate limit reached. Wait a minute before trying again.':r.status===401?'Sign in to TONE3000 again.':'TONE3000 could not complete this request.'),{status:r.status});try{const j=JSON.parse(new TextDecoder().decode(r.bytes));if(!j||typeof j!=='object'||Array.isArray(j))throw new Error();return j;}catch{throw new Error('Unexpected TONE3000 response.');}}
  async token(form){const j=this.object(await this.response('/api/v1/oauth/token',{form,limit:16384}));if(typeof j.access_token!=='string'||!j.access_token||typeof j.refresh_token!=='string'||!j.refresh_token||j.token_type?.toLowerCase()!=='bearer'||!Number.isFinite(j.expires_in)||j.expires_in<=0)throw new Error('TONE3000 returned an invalid sign-in response.');return {access:j.access_token,refresh:j.refresh_token,expires:this.now()+j.expires_in*1000};}
  async refresh(){if(this.refreshing)return this.refreshing;if(!this.session)throw new Error('Browse TONE3000 to sign in.');const previous=this.session,epoch=this.epoch;this.refreshing=(async()=>{try{const next=await this.token({grant_type:'refresh_token',client_id:TONE_CLIENT,refresh_token:previous.refresh});if(epoch!==this.epoch)throw new Error('Sign-in changed.');this.session=next;}catch(e){if([400,401].includes(e.status))this.signOut();throw e;}finally{this.refreshing=null;}})();return this.refreshing;}
  signOut(){this.epoch++;this.session=null;this.storage.removeItem(FLOW_KEY);}
  async get(path,limit=1024*1024,download=false){const epoch=this.epoch;if(!this.session)throw new Error('Browse TONE3000 to sign in.');if(this.session.expires-this.now()<60000)await this.refresh();if(epoch!==this.epoch||!this.session)throw new Error('Sign-in changed.');let r=await this.response(path,{token:this.session.access,limit,download});if(epoch!==this.epoch)throw new Error('Sign-in changed.');if(r.status===401){await this.refresh();if(epoch!==this.epoch||!this.session)throw new Error('Sign-in changed.');r=await this.response(path,{token:this.session.access,limit,download});}if(epoch!==this.epoch)throw new Error('Sign-in changed.');if(r.status!==200)this.object(r);return r;}
  async tone(id){if(!Number.isSafeInteger(id)||id<1)throw new Error('Invalid tone.');return this.object(await this.get(`/api/v1/tones/${id}?architecture=2`));}
  async models(id,page=1){if(!Number.isSafeInteger(id)||id<1||!Number.isInteger(page)||page<1||page>100)throw new Error('Invalid model page.');return this.object(await this.get(`/api/v1/models?tone_id=${id}&architecture=2&page_size=25&page=${page}`));}
  async profile(){return this.object(await this.get('/api/v1/user'));}
  async list(collection,page=1,gear=''){
    if(!['favorited','downloaded','created','trending','latest'].includes(collection)||!Number.isInteger(page)||page<1||page>100)throw new Error('Invalid tone collection.');
    const q=new URLSearchParams();if(!['trending','latest'].includes(collection)){q.set('page',page);q.set('page_size','20');}if(gear&&!['amp','amp-cab','pedal','cab','outboard','space','experimental'].includes(gear))throw new Error('Invalid gear type.');if(gear&&collection!=='latest')q.set('gear',gear);
    return this.object(await this.get(`/api/v1/tones/${collection}?${q}`));
  }
  async download(model,tone){if(tone.format!=='nam'||String(model.architecture_version)!=='2'||model.tone_id!==tone.id)throw new Error('Choose a NAM A2 model from this tone.');return (await this.get(model.model_url,4*1024*1024,true)).bytes;}
}
