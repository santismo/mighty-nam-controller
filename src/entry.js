import {relayToneCallback} from './tone-picker.js?v=0.10.2';
const url=new URL(location.href),returned=['code','state','error','canceled'].some(k=>url.searchParams.has(k));
if(returned && (window.parent!==window||window.name==='mighty-nam-tone-picker'||sessionStorage.getItem('mighty-nam-picker')==='1')){
  history.replaceState(null,'',new URL('./',location.href).href);
  const message=document.createElement('p');message.textContent='Returning to Captures…';message.className='tone-return';document.body.replaceChildren(message);
  const stop=relayToneCallback(url.href);window.addEventListener('pagehide',()=>stop?.());
}else{await import('./app.js?v=0.10.2');}
