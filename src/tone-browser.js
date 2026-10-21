import { ToneClient, safeImage, toneURL } from './tone3000.js?v=0.6.2';
import { CaptureLibrary, parseModel } from './model.js?v=0.6.2';
const $=id=>document.getElementById(id);
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,fn,cls='secondary-button')=>{const b=node('button',text,cls);b.type='button';b.onclick=fn;return b;};
const gearNames={'amp':'Amp head','amp-cab':'Amp + cabinet','pedal':'Pedal','cab':'Cabinet','outboard':'Outboard','space':'Space','experimental':'Experimental'};
export const captureName=m=>m?.metadata?.model?.name||m?.metadata?.tone?.title||'NAM capture';
export function shortPresetName(model){let s=captureName(model).replace(/[\x00-\x1f\x7f]/g,' ').trim();while(new TextEncoder().encode(s).length>63)s=Array.from(s).slice(0,-1).join('');return s||'NAM capture';}
function image(url,cls){const src=safeImage(url);if(!src)return null;const img=node('img',undefined,cls);img.src=src;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';return img;}
function creator(user){const wrap=node('span',undefined,'tone-creator');const avatar=image(user?.avatar_url,'avatar');if(avatar)wrap.append(avatar);wrap.append(node('span',user?.display_name||user?.username||'Unknown creator'));return wrap;}
export function captureCard(tone,modelName=null){
  const card=node('div',undefined,'tone-card'),img=image(tone?.images?.[0],'tone-image');if(img)card.append(img);
  const content=node('div',undefined,'tone-card-copy');content.append(node('strong',tone?.title||modelName||'NAM capture'),creator(tone?.user));
  const facts=[gearNames[tone?.gear]||tone?.gear,(tone?.format||'nam').toUpperCase()];if(Number.isFinite(tone?.downloads_count))facts.push(`${Intl.NumberFormat().format(tone.downloads_count)} downloads`);
  content.append(node('span',facts.filter(Boolean).join(' · '),'secondary'));if(modelName&&modelName!==tone?.title)content.append(node('span',modelName,'secondary'));card.append(content);return card;
}
export class ToneBrowser {
  constructor({onSelect,onChange=()=>{},isBusy=()=>false,client=new ToneClient(),library=new CaptureLibrary(localStorage)}){
    Object.assign(this,{onSelect,onChange,isBusy,client,library});this.ticket=0;this.waiting=false;this.active=null;this.pending=null;this.view='local';
    $('open-captures').onclick=() =>this.open();$('nam-browse').onclick=()=>this.open();$('close-tones').onclick=()=>$('tone-dialog').close();
    $('tone-catalog').onclick=()=>this.authorize();$('tone-collection').onchange=()=>this.list();$('tone-gear').onchange=()=>this.list();$('tone-local-search').oninput=()=>{if(['local','favorites'].includes($('tone-collection').value))this.list();};
    $('tone-back').onclick=()=>this.list();$('tone-signout').onclick=()=>{this.ticket++;this.client.signOut();$('tone-account').replaceChildren();$('tone-collection').value='local';this.list();};
    $('nam-favorite').onclick=()=>this.favorite(this.active);
  }
  say(text,error=false){$('tone-message').textContent=text;$('tone-message').classList.toggle('error',error);}
  controls(){for(const id of ['tone-catalog','tone-collection','tone-gear','tone-local-search','tone-back','tone-signout','tone-more'])$(id).disabled=this.waiting||this.isBusy();$('tone-signout').hidden=!this.client.connected;for(const b of $('tone-content').querySelectorAll('button'))b.disabled=this.waiting||this.isBusy()||b.dataset.unavailable==='true';}
  async job(label,fn){if(this.waiting||this.isBusy())return;const ticket=++this.ticket;this.waiting=true;this.say(label);this.controls();try{await fn(ticket);}catch(e){if(ticket===this.ticket)this.say(e.message,true);}finally{if(ticket===this.ticket){this.waiting=false;this.controls();}}}
  open(){if(!$('tone-dialog').open)$('tone-dialog').showModal();if(!this.waiting)this.list();}
  async authorize(toneId=null){
    if(this.waiting||this.isBusy())return;
    await this.job('Opening TONE3000…',async()=>{const redirect=new URL('./',location.href);redirect.search='';redirect.hash='';location.assign(await this.client.authorize(redirect.href,{toneId,gear:$('tone-gear').value}));});
  }
  async callback(url){
    $('tone-dialog').showModal();
    await this.job('Finishing TONE3000 sign-in…',async()=>{
      const id=await this.client.complete(url);
      try{const user=await this.client.profile();$('tone-account').replaceChildren(creator(user));}catch{ $('tone-account').textContent='Signed in'; }
      if(id)await this.showTone(id);else{this.say('No tone selected. Browse again or choose a downloaded capture.');}
    });
  }
  async list(){
    return this.job('Loading captures…',async()=>{
      this.view=$('tone-collection').value;$('tone-back').hidden=true;$('tone-content').replaceChildren();$('tone-more').hidden=true;
      const local=['local','favorites'].includes(this.view);$('tone-local-search').hidden=!local;$('tone-gear').disabled=this.waiting;
      if(local){this.local();return;}
      if(!this.client.connected){this.say('Browse TONE3000 to sign in and open your account library.');return;}
      this.page=1;await this.feed(false);
    });
  }
  local(){
    const filter=$('tone-local-search').value.toLowerCase().trim(),gear=$('tone-gear').value;
    const rows=this.library.records().filter(r=>(this.view!=='favorites'||r.favorite)&&(!gear||r.metadata?.tone?.gear===gear)&&`${r.metadata?.tone?.title} ${r.metadata?.model?.name}`.toLowerCase().includes(filter));
    $('tone-content').replaceChildren(...rows.map(row=>{
      const wrap=node('div',undefined,'tone-row');wrap.append(captureCard(row.metadata?.tone,row.metadata?.model?.name));
      const actions=node('div',undefined,'tone-actions');const active=this.active?.sha===row.sha;
      const load=button(active?'Active on plug':'Load capture',()=>this.job('Reading downloaded capture…',async()=>{await this.select(await this.library.get(row.sha));}),active?'secondary-button':'primary');
      const fav=button(row.favorite?'★ Favorite':'☆ Favorite',()=>this.favorite(row));fav.setAttribute('aria-pressed',String(row.favorite));
      const remove=button('Remove',()=>{if(confirm('Remove this download from this phone? Saved plug presets are kept.')){this.library.remove(row.sha);this.onChange();this.list();}});
      actions.append(load,fav,remove);wrap.append(actions);return wrap;
    }));this.say(rows.length?'Downloads and favorites stay on this phone.':'No captures here yet. Browse TONE3000 to choose one.');
  }
  async feed(append){
    const result=await this.client.list(this.view,this.page,$('tone-gear').value);
    if(!Array.isArray(result.data)||result.data.length>25)throw new Error('Unexpected tone list.');
    const rows=result.data.map(tone=>{const wrap=node('div',undefined,'tone-row');wrap.append(captureCard(tone));const choose=button('View models',()=>this.job('Reading tone…',()=>this.showTone(tone.id)));wrap.append(choose);return wrap;});
    if(append)$('tone-content').append(...rows);else $('tone-content').replaceChildren(...rows);
    this.say(result.data.length?'Choose a tone, then its A2 Lite model.':'No tones in this collection. Full search is in Browse TONE3000.');
    $('tone-more').hidden=!(this.page<Math.min(result.total_pages||1,100));$('tone-more').onclick=()=>this.job('Loading more…',async()=>{this.page++;await this.feed(true);});
  }
  async showTone(id){
    const tone=await this.client.tone(id);if(tone.id!==id)throw new Error('The selected tone did not match.');this.tone=tone;this.view='detail';this.modelPage=1;
    $('tone-back').hidden=false;$('tone-more').hidden=true;$('tone-local-search').hidden=true;$('tone-content').replaceChildren(captureCard(tone));
    const description=node('p',tone.description||'','tone-description');const license=node('p',`License: ${tone.license||'See TONE3000'}`,'secondary');
    const link=node('a','View on TONE3000 ↗','secondary');link.href=toneURL(tone.url);link.target='_blank';link.rel='noopener noreferrer';
    const about=node('details',undefined,'tone-about');about.append(node('summary','About this capture'),description,license,link);$('tone-content').append(about);this.modelList=node('div',undefined,'tone-models');$('tone-content').append(this.modelList);
    if(tone.format!=='nam'){this.say('This plug loads 48 kHz NAM A2 Lite captures. Choose a NAM tone.');return;}
    await this.models(false);
  }
  async models(append){
    const result=await this.client.models(this.tone.id,this.modelPage);if(!Array.isArray(result.data)||result.data.length>25)throw new Error('Unexpected model list.');
    const rows=result.data.map(model=>{
      // A2 Standard files can be containers that also include Lite. Validate the file, not just its label.
      const supported=String(model.architecture_version)==='2';
      const wrap=node('div',undefined,'tone-model');wrap.append(node('div',model.name),node('span',`A${model.architecture_version||'?'} · ${model.size||'Lite extracted on load'}`,'secondary'));
      const b=button(supported?'Load capture':'A2 Lite required',()=>this.job('Downloading and checking A2 Lite…',async()=>{
        const bytes=await this.client.download(model,this.tone);
        // Store attribution, never a signed URL or authentication state.
        const meta={id:model.id,tone_id:model.tone_id,name:model.name,size:model.size,architecture_version:model.architecture_version};
        const t=this.tone,tone={id:t.id,title:t.title,description:(t.description||'').slice(0,8000),gear:t.gear,format:t.format,license:t.license,images:(t.images||[]).slice(0,1),user:t.user,url:t.url,downloads_count:t.downloads_count};
        const capture=await parseModel(bytes,{tone,model:meta});await this.library.add(capture);await this.select(capture);
      }),supported?'primary':'secondary-button');b.dataset.unavailable=String(!supported);b.disabled=!supported;wrap.append(b);return wrap;
    });if(append)this.modelList.append(...rows);else this.modelList.replaceChildren(...rows);
    this.say(result.data.length?'A2 Lite is extracted automatically from compatible A2 captures.':'This tone has no A2 models. Browse another capture.');
    $('tone-more').hidden=!(this.modelPage<Math.min(result.total_pages||1,100));$('tone-more').onclick=()=>this.job('Reading more models…',async()=>{this.modelPage++;await this.models(true);});
  }
  async select(model){await this.onSelect(model);this.onChange();}
  favorite(model){if(!model||this.isBusy())return;try{const row=this.library.records().find(r=>r.sha===model.sha);this.library.favorite(model.sha,!row?.favorite);this.onChange();this.showActive(this.active);if(['local','favorites'].includes(this.view))this.local();}catch(e){this.say(e.message,true);}}
  showActive(model){this.active=model;$('nam-capture').replaceChildren();if(model)$('nam-capture').append(captureCard(model.metadata?.tone,model.metadata?.model?.name));const row=model&&this.library.records().find(r=>r.sha===model.sha);$('nam-favorite').hidden=!row;$('nam-favorite').textContent=row?.favorite?'★ Favorite on phone':'☆ Favorite on phone';$('nam-favorite').setAttribute('aria-pressed',String(Boolean(row?.favorite)));}
}
