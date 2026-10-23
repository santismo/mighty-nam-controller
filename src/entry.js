import {relayToneCallback} from './tone-picker.js?v=0.9.0';
const url=new URL(location.href),returned=['code','state','error','canceled'].some(k=>url.searchParams.has(k));
if(returned && (window.name==='mighty-nam-tone-picker'||sessionStorage.getItem('mighty-nam-picker')==='1')){
  history.replaceState(null,'',new URL('./',location.href).href);
  const message=document.createElement('p');message.textContent='Capture selected. Return to your mighty-nam controller tab.';
  message.style.cssText='padding:32px;color:#ddd;background:#090a0b;font:16px system-ui';document.body.replaceChildren(message);
  const stop=relayToneCallback(url.href);window.addEventListener('pagehide',()=>stop?.());
}else{await import('./app.js?v=0.9.0');}
