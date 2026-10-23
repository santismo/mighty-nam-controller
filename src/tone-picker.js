// Same-origin callback relay. The controller tab remains alive with its GATT
// session. PKCE verification and one-use state validation stay in ToneClient.
export class TonePicker {
  constructor({open=url=>window.open(url,'_blank'),channel=name=>new BroadcastChannel(name),returned,origin=location.origin}){Object.assign(this,{openWindow:open,makeChannel:channel,returned,origin});this.active=false;}
  async open(authorize){
    if(this.active)this.close();
    // Must happen synchronously inside the original click, before WebCrypto.
    const tab=this.openWindow('about:blank');
    if(!tab)throw new Error('Allow a new tab in Bluefy, then tap Browse TONE3000 again.');
    this.active=true;this.tab=tab;tab.name='mighty-nam-tone-picker';
    // Safari may clear window.name across sites; sessionStorage restores this
    // marker when the callback returns to our origin. It contains no tokens.
    tab.sessionStorage?.setItem('mighty-nam-picker','1');
    try{
      const url=new URL(await authorize()),state=url.searchParams.get('state');
      if(!state||state.length>512)throw new Error('Invalid sign-in state.');
      const channel=this.channel=this.makeChannel('mighty-nam-tone-'+state);
      let consumed=false;
      channel.onmessage=async event=>{
        const value=event.data;if(consumed||value?.type!=='tone-return'||typeof value.url!=='string')return;
        let callback;try{callback=new URL(value.url);}catch{return;}
        if(callback.origin!==this.origin||callback.searchParams.get('state')!==state)return;
        consumed=true;channel.postMessage({type:'tone-received'});
        try{await this.returned(callback.href);}finally{this.close(false);}
      };
      tab.location.href=url.href;
      this.check=setTimeout(()=>this.close(false),600000);
    }catch(error){this.close();throw error;}
  }
  close(closeTab=true){clearInterval(this.check);this.channel?.close();if(closeTab)this.tab?.close();this.channel=null;this.tab=null;this.active=false;}
}
// A callback tab must not instantiate the full controller or touch Bluetooth.
export function relayToneCallback(url,{channel=name=>new BroadcastChannel(name),received=()=>window.close()}={}){
  const callback=new URL(url),state=callback.searchParams.get('state');
  if(!state||state.length>512)return null;
  const port=channel('mighty-nam-tone-'+state);
  let timer;
  const send=()=>port.postMessage({type:'tone-return',url:callback.href});
  port.onmessage=e=>{if(e.data?.type==='tone-received'){clearInterval(timer);port.close();received();}};
  send();timer=setInterval(send,500);
  return ()=>{clearInterval(timer);port.close();};
}
