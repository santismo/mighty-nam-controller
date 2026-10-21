import { PlugConnection } from './device.js?v=0.3.1';
import { PlugEditor } from './editor.js?v=0.3.1';
import { LiveEdits } from './live.js?v=0.3.1';
import { COLORS, catalog, chosenEffect, changeType, same } from './controls.js?v=0.3.1';
import { nameBytes } from './commands.js?v=0.3.1';
const $=id=>document.getElementById(id);
const connection=new PlugConnection(navigator.bluetooth),editor=new PlugEditor(connection);
const blocks={
  1:['Compressor','Comp','M5 5v14M19 5v14M8 9h8M8 15h8M12 6v12'],
  2:['Drive','Drive','M3 15l6-8v10l6-10v10l6-8'],
  3:['NAM','NAM','M5 19V5h3l8 14h3V5M8 5v14M16 5v14'],
  4:['Equalizer','EQ','M5 4v16M12 4v16M19 4v16M2 8h6M9 16h6M16 10h6'],
  5:['Noise gate','Gate','M3 12h5l2-7h4l2 7h5M8 19h8'],
  6:['Modulation','Mod','M2 12c4-14 6 14 10 0s6 14 10 0'],
  7:['Delay','Delay','M4 4v16M10 7v10M16 9v6M22 11v2'],
  8:['Reverb','Reverb','M3 9l3 6 3-6 3 6 3-6 3 6 3-6M3 4h18M3 20h18'],
  9:['Cabinet','Cab','M5 3h14v18H5zM15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0M15 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0']
};
let snapshot=null,effects=null,buffer=8,selected=3,busy=false,needsRefresh=false,operation=0,dragged=null;
const live=new LiveEdits(editor,{
  changed:()=>status(),
  accepted:state=>{snapshot=state;message('Live on plug. Save to keep after power-off.');status();},
  failed:error=>{needsRefresh=true;message(error.message,true);render();}
});
const online=()=>Boolean(snapshot&&connection.connected);
const canEdit=()=>online()&&!busy&&!needsRefresh&&!connection.writeStalled&&!$('tuner-dialog').open;
const locked=()=>busy||live.pending;
function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function button(text,fn,label){const node=el('button',text);node.type='button';if(label)node.setAttribute('aria-label',label);node.addEventListener('click',fn);return node;}
function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);if(error&&connection.log.length)$('connection-details').open=true;}
function diagnostics(){$('connection-details').hidden=!connection.log.length;$('diagnostics-text').value=connection.report();}
function savedMatches(){
  const saved=editor.bank[snapshot?.active];
  return Boolean(saved?.occupied&&saved.modelCrc===snapshot.modelCrc&&same(saved.effects,effects)&&saved.buffer===buffer&&saved.name===$('preset-name').value.trim());
}
function status(){
  const ready=online(),waiting=locked();
  $('connection-state').textContent=busy?'Working…':live.pending?'Updating…':ready?'Connected':connection.connected?'Linked':'Offline';
  $('connection-state').classList.toggle('online',connection.connected);
  $('connect').textContent=connection.connected?'Disconnect':'Connect';$('connect').disabled=waiting||!navigator.bluetooth?.requestDevice;
  $('refresh').disabled=!connection.connected||waiting||connection.writeStalled;
  $('active-preset').textContent=ready?COLORS[snapshot.active]??'Unsaved':'—';
  $('save-state').textContent=!ready?'Offline':needsRefresh?'Refresh needed':live.pending?'Applying live…':editor.largeReplies===false?'Live · save unavailable':savedMatches()?'Saved on plug':'Live · not saved';
  $('save').disabled=!canEdit()||waiting||!editor.bank[snapshot?.active]?.occupied;
  $('preset-name').disabled=!canEdit()||waiting||editor.largeReplies!==true;
  $('buffer').disabled=!canEdit();$('buffer').value=String(buffer);
  $('listen').disabled=!ready||waiting||needsRefresh||$('tuner-dialog').open;
  $('listen').textContent=snapshot?.listening?'Mute plug':'Listen on plug';
  $('tuner').disabled=!canEdit()||waiting||editor.largeReplies!==true;
  $('feature-notice').hidden=!ready||!editor.bankWarning;
  $('feature-notice').textContent=editor.bankWarning;
  $('output').textContent=ready?snapshot.settling?'Settling':snapshot.listening?'On':'Muted':'—';
  $('model').textContent=ready?snapshot.loaded?'Loaded':'Empty':'—';
  $('health').textContent=ready?snapshot.faults?'Fault reported':'Ready':'—';
  $('version').textContent=ready?`0.3.1 · ${snapshot.identity}`:'0.3.1';
  for(const node of $('presets').querySelectorAll('button'))node.disabled=!canEdit()||waiting||!editor.bank[Number(node.dataset.slot)]?.occupied;
  for(const node of $('block-detail').querySelectorAll('button,input,select'))node.disabled=!canEdit();
  for(const node of $('chain').querySelectorAll('button'))node.disabled=!canEdit();
  $('move-left').disabled=!canEdit()||effects?.[90]===selected;
  $('move-right').disabled=!canEdit()||effects?.[98]===selected;
}
function accept(state,keepName=false){const name=keepName&&snapshot?.active===state.active&&snapshot?.modelCrc===state.modelCrc?$('preset-name').value:null;snapshot=state;effects=[...state.effects];buffer=state.buffer;needsRefresh=false;live.reset(state);$('preset-name').value=name??editor.bank[state.active]?.name??COLORS[state.active]??'Preset';render();}
function render(){
  const ready=online();
  $('presets').replaceChildren(...COLORS.map((color,index)=>{
    const item=el('li');const saved=editor.bank[index],active=ready&&snapshot.active===index;
    const b=button('',()=>recall(index),`${index+1}. ${color}${saved?.occupied?`, ${saved.name}`:''}${active?', active':''}`);
    const occupied=ready&&Boolean(snapshot.occupied&(1<<index));
    b.dataset.slot=index;b.className=`preset ${color.toLowerCase()}${occupied?' occupied':''}${active?' active':''}`;
    if(active)b.setAttribute('aria-current','true');b.append(el('span',undefined,'swatch'),el('span',index+1));item.append(b);return item;
  }));
  $('empty-chain').hidden=ready;$('chain').hidden=!ready;
  $('chain-hint').textContent=ready?'Tap a symbol to bypass · select a name to edit':'Waiting for connection';
  renderChain();detail();status();diagnostics();
}
function renderChain(){
  const scroll=$('chain').scrollLeft;$('chain').replaceChildren();if(!online())return;
  for(const id of effects.slice(90,99)){
    const [name,short,path]=blocks[id],bypassed=Boolean(effects[id]&64);
    const block=el('div',undefined,`block${bypassed?' bypassed':''}${selected===id?' selected':''}`);block.dataset.id=id;block.draggable=true;
    const power=button('',()=>{selected=id;edit(next=>{next[id]^=64;});},`${bypassed?'Enable':'Bypass'} ${name}`);power.className='block-power';power.setAttribute('aria-pressed',String(!bypassed));
    const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');const line=document.createElementNS(icon.namespaceURI,'path');line.setAttribute('d',path);icon.append(line);power.append(icon);
    const select=button('',()=>{selected=id;renderChain();detail();status();},`Edit ${name}`);select.className='block-select';select.setAttribute('aria-pressed',String(selected===id));select.append(el('span',short),el('small',bypassed?'Bypassed':'On'));
    block.addEventListener('dragstart',event=>{if(!canEdit()){event.preventDefault();return;}dragged=id;event.dataTransfer.setData('text/plain',String(id));});
    block.addEventListener('dragover',event=>event.preventDefault());
    block.addEventListener('drop',event=>{event.preventDefault();if(dragged&&canEdit())move(dragged,id);dragged=null;});
    block.addEventListener('dragend',()=>dragged=null);block.append(power,select);$('chain').append(block);
  }
  $('chain').scrollLeft=scroll;
}
function detail(){
  const ready=online(),choice=ready?chosenEffect(effects,selected):null;
  $('block-name').textContent=ready?blocks[selected][0]:'No block selected';
  $('block-state').textContent=ready?(effects[selected]&64?'Bypassed':'Enabled'):'—';
  $('block-info').textContent=!ready?'Your chain will appear here.':selected===3?'Onboard capture. Load new captures with the Mac app for now.':'';
  $('choose-effect').hidden=!ready||selected===3;$('choose-effect').textContent=choice?`${choice.name}  ›`:'Choose effect';
  $('parameters').replaceChildren();
  if(choice)for(const p of choice.parameters){
    const label=el('label',undefined,'parameter');const heading=el('span',p.name,'parameter-heading');let control;
    if(p.options){control=el('select');for(const option of p.options){const node=el('option',option.label);node.value=option.value;control.append(node);}control.value=effects[p.index];}
    else{control=el('input');control.type='range';control.min=0;control.max=100;control.step=1;control.value=effects[p.index];const output=el('output',p.labels[effects[p.index]]);heading.append(output);control.addEventListener('input',()=>output.textContent=p.labels[Number(control.value)]);}
    control.setAttribute('aria-label',p.name);control.dataset.index=p.index;
    control.addEventListener(p.options?'change':'input',()=>edit(next=>{next[p.index]=Number(control.value);},false));
    label.append(heading,control);$('parameters').append(label);
  }
}
function edit(change,redraw=true){
  if(!canEdit())return;const next=[...effects];change(next);effects=next;
  try{live.update(effects,buffer);message('Applying live…');if(redraw){renderChain();detail();}status();}catch(error){message(error.message,true);}
}
function move(id,to){edit(next=>{const order=next.slice(90,99),from=order.indexOf(id),dest=order.indexOf(to);order.splice(from,1);order.splice(dest,0,id);next.splice(90,9,...order);});}
async function work(label,action){
  if(locked())return;busy=true;const ticket=++operation;message(label);status();
  try{await action();}catch(error){if(ticket===operation){needsRefresh=true;message(error.message,true);}}
  finally{if(ticket===operation){busy=false;render();}}
}
function clear(){operation++;busy=false;snapshot=null;effects=null;needsRefresh=false;editor.resetBank();live.reset(null);connection.close();$('preset-name').value='';$('effect-dialog').close();$('tuner-dialog').close();render();}
async function recall(slot){
  if(slot===snapshot?.active&&savedMatches())return;
  if(!savedMatches()&&!confirm('Switch preset and discard the unsaved changes?'))return;
  await work('Loading preset…',async()=>{accept(await editor.recall(slot));message(`${COLORS[slot]} loaded.`);});
}
$('connect').addEventListener('click',async()=>{
  if(locked())return;if(connection.connected){clear();message('Disconnected.');return;}
  await work('Choose your Mighty Plug Pro.',async()=>{accept(await connection.connect());await editor.readBank();accept(connection.current);message(editor.bankWarning?'Connected. Live controls are ready.':'Connected. Controls apply live; Save keeps your preset.');});
});
$('refresh').addEventListener('click',()=>work('Reading the plug…',async()=>{await connection.refresh();await editor.readBank();accept(connection.current);message(editor.bankWarning?'Status updated. Live controls are ready.':'Status updated.');}));
$('save').addEventListener('click',()=>{
  try{nameBytes($('preset-name').value);}catch(error){message(error.message,true);return;}
  work('Saving preset to plug…',async()=>{accept(await editor.save(snapshot,effects,buffer,$('preset-name').value));message(`Saved to ${COLORS[snapshot.active]}. Plug muted.`);});
});
$('preset-name').addEventListener('input',status);
$('buffer').addEventListener('change',()=>{buffer=Number($('buffer').value);edit(()=>{},false);});
$('listen').addEventListener('click',()=>work('Changing plug output…',async()=>{accept(await editor.listen(!snapshot.listening),true);message(snapshot.listening?'Listening on plug.':'Plug muted.');}));
$('move-left').addEventListener('click',()=>{const order=effects.slice(90,99);move(selected,order[order.indexOf(selected)-1]);});
$('move-right').addEventListener('click',()=>{const order=effects.slice(90,99);move(selected,order[order.indexOf(selected)+1]);});
function choices(){
  const query=$('effect-search').value.trim().toLowerCase();
  const choices=(catalog[selected]??[]).filter(choice=>choice.name.toLowerCase().includes(query));
  $('effect-list').replaceChildren(...choices.map(choice=>{
    const b=button(choice.name,()=>{effects=changeType(effects,selected,choice.id);$('effect-dialog').close();edit(()=>{});});
    b.className='effect-choice';b.setAttribute('aria-pressed',String((effects[selected]&63)===choice.id));return b;
  }));if(!choices.length)$('effect-list').append(el('p','No matching effects.','secondary'));
}
$('choose-effect').addEventListener('click',()=>{$('effect-search').value='';$('effect-heading').textContent=blocks[selected][0];choices();$('effect-dialog').showModal();});
$('effect-search').addEventListener('input',choices);$('close-effects').addEventListener('click',()=>$('effect-dialog').close());
$('tuner').addEventListener('click',()=>{
  work('Muting for tuner…',async()=>{accept(await editor.listen(false),true);$('check-note').disabled=false;$('tuner-note').textContent='—';$('tuner-reading').textContent='Pluck one string, then check the note.';$('tuner-meter').value=0;$('tuner-dialog').showModal();message('Tuner open. Plug muted.');});
});
$('check-note').addEventListener('click',async()=>{
  $('check-note').disabled=true;$('close-tuner').disabled=true;$('tuner-reading').textContent='Pluck one string…';
  try{
    const {reading}=await editor.tune(Number($('reference').value));accept(connection.current,true);
    $('tuner-note').textContent=reading?`${reading.note}${reading.octave}`:'—';
    $('tuner-reading').textContent=reading?`${reading.cents>=0?'+':''}${reading.cents.toFixed(1)} cents · ${reading.frequency.toFixed(1)} Hz`:'No clear note. Pluck one string and check again.';
    $('tuner-meter').value=reading?Math.max(-50,Math.min(50,reading.cents)):0;
    $('tuner-note').classList.toggle('in-tune',Boolean(reading?.inTune));
  }catch(error){needsRefresh=true;$('tuner-reading').textContent=error.message;message(error.message,true);}
  finally{$('check-note').disabled=needsRefresh;$('close-tuner').disabled=false;status();}
});
$('close-tuner').addEventListener('click',()=>$('tuner-dialog').close());
$('tuner-dialog').addEventListener('cancel',event=>{if(connection.busy)event.preventDefault();});
$('tuner-dialog').addEventListener('close',()=>{status();message(needsRefresh?'Refresh before editing again.':'Plug muted. Tap Listen on plug to resume.',needsRefresh);});
connection.addEventListener('diagnostic',diagnostics);
connection.addEventListener('disconnected',event=>{clear();message(`Bluetooth disconnected during: ${event.detail.stage}.`,true);});
$('copy-report').addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(connection.report());$('copy-status').textContent='Report copied.';}
  catch{const field=$('diagnostics-text');field.focus();field.select();field.setSelectionRange(0,field.value.length);$('copy-status').textContent='Select and copy the report below.';}
});
window.addEventListener('pagehide',clear);$('browser-help').hidden=Boolean(navigator.bluetooth?.requestDevice);render();
