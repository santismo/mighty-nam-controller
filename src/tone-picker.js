// Keep the controller and its Bluetooth connection alive underneath the picker.
// Only the same-origin callback in this exact frame can hand a code back.
export class TonePicker {
  constructor({frame,returned,changed=()=>{},failed=()=>{},events=window,origin=location.origin,navigate=url=>location.assign(url)}){
    Object.assign(this,{frame,returned,changed,failed,events,origin,navigate});this.active=false;this.generation=0;
  }
  async open(authorize){
    this.close();const generation=this.generation;this.active=true;this.changed(true);
    try{
      const url=new URL(await authorize()),state=url.searchParams.get('state');
      if(generation!==this.generation)return;
      if(url.origin!=='https://www.tone3000.com'||!state||state.length>512)throw new Error('Invalid sign-in address.');
      this.url=url.href;let consumed=false;
      this.listener=event=>{
        if(consumed||event.origin!==this.origin||event.source!==this.frame.contentWindow||event.data?.type!=='tone-return'||typeof event.data.url!=='string')return;
        let callback;try{callback=new URL(event.data.url);}catch{return;}
        if(callback.origin!==this.origin||callback.searchParams.get('state')!==state)return;
        consumed=true;
        event.source.postMessage({type:'tone-received'},this.origin);
        this.close();Promise.resolve().then(()=>this.returned(callback.href)).catch(this.failed);
      };
      this.events.addEventListener('message',this.listener);
      this.frame.src=url.href;
    }catch(error){if(generation===this.generation)this.close();throw error;}
  }
  continueInTab(){const url=this.url;if(!url)return;this.close();this.navigate(url);}
  close(){
    this.generation++;this.events.removeEventListener('message',this.listener);this.listener=null;
    this.frame.removeAttribute('src');this.url=null;this.active=false;this.changed(false);
  }
}

// The callback frame must never instantiate a second controller. Keep the old
// BroadcastChannel relay for a picker tab opened before this update.
export function relayToneCallback(url,{target=window.parent!==window?window.parent:null,events=window,origin=location.origin,channel=name=>new BroadcastChannel(name),received=()=>{if(!target)window.close();}}={}){
  const callback=new URL(url),state=callback.searchParams.get('state');
  if(callback.origin!==origin||!state||state.length>512)return null;
  let timer,timeout,port,listener;
  const stop=()=>{clearInterval(timer);clearTimeout(timeout);port?.close();if(listener)events.removeEventListener('message',listener);};
  const acknowledged=()=>{stop();received();};
  const value={type:'tone-return',url:callback.href};
  let send;
  if(target){
    listener=e=>{if(e.origin===origin&&e.source===target&&e.data?.type==='tone-received')acknowledged();};
    events.addEventListener('message',listener);send=()=>target.postMessage(value,origin);
  }else{
    port=channel('mighty-nam-tone-'+state);port.onmessage=e=>{if(e.data?.type==='tone-received')acknowledged();};send=()=>port.postMessage(value);
  }
  timer=setInterval(send,500);timeout=setTimeout(stop,120000);send();return stop;
}
