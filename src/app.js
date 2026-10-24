import {LooperPanel} from './looper-panel.js?v=0.9.1';
import {hasLooper} from './looper.js?v=0.9.1';
import {readNam as readRecord,putNam as putRecord} from './usb-record.js?v=0.9.1';
import { readNam, putNam, namParameters } from './nam-controls.js?v=0.9.1';
import { supportsActiveChain, visibleOrder, membership, enabled, ChainView, replaceBlock } from './active-chain.js?v=0.9.1';
import { FX_MODES, fxControls, fullOrder, reorder } from './fx.js?v=0.9.1';
import { PlugConnection } from './device.js?v=0.9.1';
import { PlugEditor } from './editor.js?v=0.9.1';
import { LiveEdits } from './live.js?v=0.9.1';
import { AutoTuner } from './auto-tuner.js?v=0.9.1';
import { COLORS, effectChoices, chosenEffect, changeType, same } from './controls.js?v=0.9.1';
import { nameBytes } from './commands.js?v=0.9.1';
import { ToneBrowser, captureName, shortPresetName } from './tone-browser.js?v=0.9.1';
const $=id=>document.getElementById(id);
const connection=new PlugConnection(navigator.bluetooth),editor=new PlugEditor(connection,{recoveryStorage:sessionStorage});
const effectColors={1:'comp',2:'drive',3:'nam',4:'eq',5:'gate',6:'mod',7:'delay',8:'reverb',9:'cab',11:'fxa',12:'fxb'};
const blocks={
  11:['FX A','FX A','M4 12h16M12 4v16M5 5l14 14'],
  12:['FX B','FX B','M4 12h16M12 4v16M5 19L19 5'],
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
let snapshot=null,effects=null,fx=null,buffer=8,selected=3,busy=false,needsRefresh=false,operation=0,dragged=null;
let queuedCapture=null,activeCapture=null,loadTicket=0,activeTicket=0,tuning=false,tunerResume=null;
let loopBusy=false,pickerDisconnected=false;
const playOnBoot=true;
const autoTuner=new AutoTuner({
  interval:40,
  read:options=>editor.tune(Number($('reference').value),{...options,fast:true}),
  onReading:({reading})=>showPitch(reading),
  onProgress:page=>{$('tuner-progress').textContent=`Reading guitar · ${page}/16`;},
  onBusy:value=>{tuning=value;status();if(!value&&!autoTuner.running&&!document.hidden&&$('tuner-dialog').open&&!needsRefresh&&online())queueMicrotask(()=>autoTuner.start());},
  onError:error=>{needsRefresh=true;$('tuner-progress').textContent=error.message;message(error.message,true);status();}
});
const tones=new ToneBrowser({onSelect:selectCapture,onChange:()=>{detail();status();},isBusy:()=>locked()});
const live=new LiveEdits(editor,{
  beforeSend:()=>looper.whenIdle(),
  changed:()=>status(),
  accepted:state=>{snapshot=state;message('Applied');status();},
  failed:error=>{needsRefresh=true;message(error.message,true);render();}
});
const looper=new LooperPanel({connection,canRun:()=>online()&&!busy&&!tuning&&!live.pending&&!needsRefresh&&!connection.pending&&!$('tuner-dialog').open,onBusy:value=>{loopBusy=value;status();}});
const chainView=new ChainView(localStorage);let retained=[],viewSlot=null;
function rememberView(){chainView.write(snapshot?.active,retained);}
const compact=()=>supportsActiveChain(snapshot?.identity);
const shown=()=>effects?visibleOrder(effects,fx,snapshot?.identity,retained):[];
const pickVisible=()=>{if(compact()&&!shown().includes(selected))selected=shown()[0]??0;};
const online=()=>Boolean(snapshot&&connection.connected);
const canEdit=()=>online()&&!busy&&!loopBusy&&!tuning&&!needsRefresh&&!connection.writeStalled&&!$('tuner-dialog').open;
const locked=()=>busy||live.pending||tuning||loopBusy;
function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function button(text,fn,label){const node=el('button',text);node.type='button';if(label)node.setAttribute('aria-label',label);node.addEventListener('click',fn);return node;}
function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);if(error&&connection.log.length)$('connection-details').open=true;}
function diagnostics(){$('connection-details').hidden=!connection.log.length;if($('connection-details').open)$('diagnostics-text').value=connection.report();}
$('connection-details').addEventListener('toggle',diagnostics);
function savedMatches(){
  const saved=editor.bank[snapshot?.active];
  return Boolean(saved?.occupied&&saved.modelCrc===snapshot.modelCrc&&same(saved.effects,effects)&&(snapshot.globalBuffer||saved.buffer===buffer)&&saved.flags===(playOnBoot?1:0)&&saved.name===$('preset-name').value.trim()&&(!fx||same(saved.fx,fx)));
}
function status(){
  const ready=online(),waiting=locked();
  $('connection-state').textContent=busy?'Working…':live.pending?'Updating…':ready?'Connected':connection.connected?'Linked':'Offline';
  $('connection-state').classList.toggle('online',connection.connected);
  $('connect').textContent=connection.connected?'Disconnect':'Connect';$('connect').disabled=waiting||!navigator.bluetooth?.requestDevice;
  $('refresh').disabled=!connection.connected||waiting||connection.writeStalled||$('tuner-dialog').open;
  const occupied=editor.bank.filter(p=>p?.occupied);
  $('preset-hint').hidden=!ready||occupied.length!==1;
  $('preset-hint').textContent=occupied.length===1?`Only ${COLORS[occupied[0].slot]} is saved onboard. Save another color to cycle with the plug button.`:'';
  $('active-preset').textContent=ready?COLORS[snapshot.active]??'Unsaved':'—';
  $('save-state').textContent=!ready?'Offline':needsRefresh?'Refresh needed':live.pending?'Applying live…':editor.largeReplies===false?'Live · save unavailable':savedMatches()?'Saved on plug':'Live · not saved';
  $('save').disabled=!canEdit()||waiting||editor.largeReplies!==true||(!activeCapture&&!editor.bank[snapshot?.active]?.occupied);
  $('preset-name').disabled=!canEdit()||waiting||editor.largeReplies!==true;
  $('usb-record-control').hidden=!['NAMLNK21','NAMLNK22','NAMLNK23', 'NAMLNK24', 'NAMLNK25', 'NAMLNK26', 'NAMLNK27','NAMLNK28'].includes(snapshot?.identity);$('usb-record-gain').disabled=!canEdit();$('usb-record-gain').value=effects?readRecord(effects)[0]:48;$('usb-record-value').textContent=effects?`${((readRecord(effects)[0]-48)/2).toFixed(1)} dB`:'—';
  $('master-volume').disabled=!canEdit();$('master-volume').value=effects?.[84]??0;$('master-value').textContent=effects?`${effects[84]} %`:'—';
  $('buffer').disabled=!canEdit();$('buffer').value=String(buffer);
  const saved=editor.bank[snapshot?.active];
  $('buffer-state').textContent=!ready?'8 samples is the minimum output buffer.':live.pending?`Applying · last confirmed ${snapshot.buffer} samples`:snapshot.bufferStorageError?'Global buffer storage needs attention. Refresh the plug.':snapshot.globalBuffer?`Global · ${snapshot.buffer} samples · saved for every color`:`${snapshot.buffer} samples · this preset (global control needs NAMLNK18)`;
  const delayed=fx?[0,16].filter(i=>fx[i+1]&&fx[i+4]>0&&([3,4,7].includes(fx[i])||(fx[i]===1&&fx[i+3]!==12))).map(i=>`${i?'FX B':'FX A'} ${FX_MODES[fx[i]-1]}`):[];
  $('latency-note').hidden=!ready;$('latency-note').textContent=delayed.length?`${delayed.join(' and ')} adds effect delay even at 8 samples.`:snapshot?.globalBuffer?'One buffer setting applies to all colors, including after power-off.':'8 samples keeps the minimum output path. Global buffer requires NAMLNK18.';
  $('tuner').disabled=!canEdit()||waiting||(editor.largeReplies!==true&&!['NAMLNK15','NAMLNK16', 'NAMLNK17','NAMLNK18','NAMLNK19','NAMLNK20', 'NAMLNK21','NAMLNK22','NAMLNK23', 'NAMLNK24', 'NAMLNK25', 'NAMLNK26', 'NAMLNK27','NAMLNK28'].includes(snapshot?.identity));
  $('looper').disabled=!canEdit()||waiting||!hasLooper(snapshot?.identity);
  $('feature-notice').hidden=!ready||!editor.bankWarning;
  $('feature-notice').textContent=editor.bankWarning;
  $('output').textContent=ready?snapshot.settling?'Settling':snapshot.listening?'On':'Muted':'—';
  $('model').textContent=ready?snapshot.loaded?'Loaded':'Empty':'—';
  $('health').textContent=ready?snapshot.faults?'Fault reported':'Ready':'—';
  $('version').textContent=ready?`0.9.1 · ${snapshot.identity}`:'0.9.1';
  for(const node of $('presets').querySelectorAll('button'))node.disabled=!canEdit()||waiting;
  for(const node of $('block-detail').querySelectorAll('button,input,select'))node.disabled=!canEdit();
  $('open-captures').disabled=waiting;$('nam-browse').disabled=waiting;$('nam-favorite').disabled=waiting;tones.controls();
  for(const node of $('chain').querySelectorAll('button'))node.disabled=!canEdit();
  $('add-block').hidden=!online()||!compact();$('add-block').disabled=!canEdit()||!fullOrder(effects??[],fx).some(id=>!shown().includes(id));
  $('move-left').disabled=!canEdit()||(effects&&(!selected||shown()[0]===selected));
  $('move-right').disabled=!canEdit()||(effects&&(!selected||shown().at(-1)===selected));
}
function accept(state,keepName=false){const name=keepName&&snapshot?.active===state.active&&snapshot?.modelCrc===state.modelCrc?$('preset-name').value:null;snapshot=state;if(viewSlot!==state.active){viewSlot=state.active;retained=chainView.read(viewSlot);}effects=[...state.effects];fx=state.fx?[...state.fx]:null;if(selected>9&&!fx)selected=3;buffer=state.buffer;needsRefresh=false;live.reset(state);$('preset-name').value=name??editor.bank[state.active]?.name??COLORS[state.active]??'Preset';render();syncCapture();}
function render(){
  pickVisible();
  const ready=online();
  $('presets').replaceChildren(...COLORS.map((color,index)=>{
    const item=el('li');const saved=editor.bank[index],active=ready&&snapshot.active===index;
    const b=button('',()=>recall(index),`${index+1}. ${color}${saved?.occupied?`, ${saved.name}`:''}${active?', active':''}`);
    const occupied=ready&&Boolean(snapshot.occupied&(1<<index));
    b.dataset.slot=index;b.className=`preset ${color.toLowerCase()}${occupied?' occupied':''}${active?' active':''}`;
    if(active)b.setAttribute('aria-current','true');b.append(el('span',undefined,'swatch'),el('span',index+1));item.append(b);return item;
  }));
  $('empty-chain').hidden=ready;$('chain').hidden=!ready;
  $('chain-hint').textContent=ready?(compact()?`${shown().length} ${shown().length===1?'block':'blocks'}`:''):'Waiting for connection';
  renderChain();detail();status();diagnostics();
}
function renderChain(){
  const scroll=$('chain').scrollLeft;$('chain').replaceChildren();if(!online())return;
  if(compact())$('chain-hint').textContent=`${shown().length} ${shown().length===1?'block':'blocks'}`;
  if(compact()&&!shown().length)$('chain').append(el('p','Direct signal · add a block to begin.','secondary'));
  for(const id of shown()){
    const [name,short,path]=blocks[id],bypassed=id>9?!fx[(id-11)*16+1]:Boolean(effects[id]&64);
    const block=el('div',undefined,`block${bypassed?' bypassed':''}${selected===id?' selected':''}`);block.dataset.id=id;block.dataset.effect=effectColors[id];block.draggable=true;
    const power=button('',()=>toggleBlock(id),`${bypassed?'Enable':'Bypass'} ${name}`);power.className='block-power';power.setAttribute('aria-pressed',String(!bypassed));
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
  $('block-detail').dataset.effect=effectColors[selected]??'nam';
  const ready=online()&&Boolean(selected),choice=ready&&selected<10?chosenEffect(effects,selected,snapshot?.identity):null;
  $('block-detail').hidden=online()&&compact()&&!selected;
  $('block-name').textContent=ready?blocks[selected][0]:'No block selected';
  const enabled=ready&&(selected>9?Boolean(fx[(selected-11)*16+1]):!(effects[selected]&64));
  $('block-state').textContent=ready?(enabled?'Enabled':'Bypassed'):'—';
  $('block-state').setAttribute('aria-pressed',String(enabled));
  $('block-state').setAttribute('aria-label',ready?`${blocks[selected][0]}: ${enabled?'Enabled':'Bypassed'}`:'Selected block enabled');
  $('block-state').title=ready?`Tap to ${enabled?'bypass':'enable'} ${blocks[selected][0]}`:'';
  $('block-info').textContent=!ready?'':selected===3?(activeCapture?'A2 Lite':snapshot.loaded?'Onboard capture':''):selected===4&&choice?.id===4?'12 dB/oct':'';
  $('remove-block').hidden=!ready||!compact();$('change-block').hidden=!ready||!compact();
  $('nam-controls').hidden=!ready||selected!==3;tones.showActive(activeCapture);
  $('choose-effect').hidden=!ready||selected===3;$('choose-effect').textContent=selected>9&&fx?`${FX_MODES[fx[(selected-11)*16]-1]}  ›`:choice?`${choice.name}  ›`:'Choose effect';
  $('parameters').replaceChildren();
  if(ready&&selected===3&&['NAMLNK21','NAMLNK22','NAMLNK23', 'NAMLNK24', 'NAMLNK25', 'NAMLNK26', 'NAMLNK27','NAMLNK28'].includes(snapshot.identity))for(const p of namParameters){
    const config=readNam(effects),label=el('label',undefined,'parameter'),heading=el('span',p.name,'parameter-heading'),value=el('output',p.label(config[p.index])),control=el('input');
    heading.append(value);control.type='range';control.min=0;control.max=p.max;control.step=1;control.value=config[p.index];control.setAttribute('aria-label',p.name);
    control.addEventListener('input',()=>{value.textContent=p.label(Number(control.value));edit(next=>{const c=readNam(next);c[p.index]=Number(control.value);putNam(next,c);},false);});label.append(heading,control);$('parameters').append(label);
  }
  if(ready&&selected>9)for(const p of fxControls(fx,selected-11)){
    const label=el('label',undefined,'parameter'),heading=el('span',p.name,'parameter-heading'),value=el('output'),control=el('input');
    const format=p.label??(v=>`${v} %`);value.textContent=format(fx[p.index]);heading.append(value);
    control.type='range';control.min=p.min??0;control.max=p.max??100;control.step=1;control.value=fx[p.index];control.setAttribute('aria-label',p.name);control.dataset.fx=p.index;
    control.addEventListener('input',()=>{fx[p.index]=Number(control.value);value.textContent=format(fx[p.index]);edit(()=>{},false);});label.append(heading,control);$('parameters').append(label);
  }
  if(choice)for(const p of choice.parameters){
    const label=el('label',undefined,'parameter');const heading=el('span',p.name,'parameter-heading');let control;
    if(p.options){control=el('select');for(const option of p.options){const node=el('option',option.label);node.value=option.value;control.append(node);}control.value=effects[p.index];}
    else{control=el('input');control.type='range';control.min=0;control.max=100;control.step=1;control.value=effects[p.index];const output=el('output',p.labels[effects[p.index]]);heading.append(output);control.addEventListener('input',()=>output.textContent=p.labels[Number(control.value)]);}
    control.setAttribute('aria-label',p.name);control.dataset.index=p.index;
    control.addEventListener(p.options?'change':'input',()=>edit(next=>{next[p.index]=Number(control.value);},false));
    label.append(heading,control);$('parameters').append(label);
  }
}
function toggleBlock(id){
  if(!canEdit())return;selected=id;
  if(compact()){if(!retained.includes(id))retained.push(id);rememberView();}
  edit(next=>{if(id>9)fx[(id-11)*16+1]^=1;else next[id]^=64;});
}
function edit(change,redraw=true){
  if(!canEdit())return;const next=[...effects];change(next);effects=next;
  try{live.update(effects,buffer,fx);message('Applying live…');if(redraw){pickVisible();renderChain();detail();}status();}catch(error){message(error.message,true);}
}
function move(id,to){edit(next=>{const order=fullOrder(next,fx),from=order.indexOf(id),dest=order.indexOf(to);order.splice(from,1);order.splice(dest,0,id);const changed=reorder(next,fx,order);next.splice(0,128,...changed.effects);fx=changed.fx;});}
async function work(label,action){
  if(locked())return;busy=true;const ticket=++operation;message(label);status();
  try{await looper.whenIdle();if(ticket!==operation)return;await action();}catch(error){if(ticket===operation){needsRefresh=true;message(error.message,true);}}
  finally{if(ticket===operation){busy=false;render();}}
}
function clear(){looper.close();tunerResume=null;autoTuner.stop();operation++;loadTicket++;activeTicket++;activeCapture=null;editor.activeCapture=null;busy=false;viewSlot=null;retained=[];snapshot=null;effects=null;fx=null;needsRefresh=false;editor.resetBank();live.reset(null);connection.close();$('preset-name').value='';$('effect-dialog').close();$('add-block-dialog').close();$('tuner-dialog').close();render();}
async function recall(slot){
  if(!editor.bank[slot]?.occupied){openSave(slot);return;}
  if(slot===snapshot?.active&&savedMatches())return;
  if(!savedMatches()&&!confirm('Switch preset and discard the unsaved changes?'))return;
  await work('Loading preset…',async()=>{accept(await editor.recall(slot));message(`${COLORS[slot]} loaded.`);});
}
$('connect').addEventListener('click',async()=>{
  if(locked())return;if(connection.connected){clear();message('Disconnected.');return;}
  await work('Choose your Mighty Plug Pro.',async()=>{accept(await connection.connect());await editor.readBank();accept(connection.current);message(editor.bankWarning?'Connected':'Connected');if(queuedCapture)await transferCapture(queuedCapture);});
});
$('refresh').addEventListener('click',()=>work('Reading the plug…',async()=>{await connection.refresh();await editor.readBank();accept(connection.current);message(editor.bankWarning?'Status updated. Live controls are ready.':'Status updated.');}));
function openSave(slot=snapshot?.active<7?snapshot.active:0){
  if(!canEdit()||locked())return;
  try{nameBytes($('preset-name').value);}catch(error){message(error.message,true);return;}
  $('save-color').replaceChildren(...COLORS.map((color,i)=>{const option=el('option',`${i+1}. ${color}${editor.bank[i]?.occupied?` · ${editor.bank[i].name}`:' · Empty'}`);option.value=i;return option;}));
  $('save-color').value=String(slot);saveDestination();$('save-dialog').showModal();
}
$('save').addEventListener('click',()=>openSave());
function saveDestination(){const row=editor.bank[Number($('save-color').value)];$('save-destination').textContent=row?.occupied?`Replaces “${row.name}” in ${COLORS[row.slot]}.`:'This color is empty.';}
$('save-color').addEventListener('change',saveDestination);$('close-save').addEventListener('click',()=>$('save-dialog').close());
$('confirm-save').addEventListener('click',()=>{
  if(!canEdit()||locked())return;
  const slot=Number($('save-color').value),model=activeCapture,name=$('preset-name').value,view=[...retained];
  try{nameBytes(name);}catch(e){message(e.message,true);return;}
  $('save-dialog').close();work('Saving capture and chain…',async()=>{const saved=model?await editor.saveCapture(snapshot,effects,buffer,name,slot,model,{playOnBoot}):await editor.save(snapshot,effects,buffer,name,{playOnBoot,slot});chainView.write(slot,view);accept(saved);message(`Saved capture and effects to ${COLORS[slot]}. Playback ${snapshot.listening?'on':'muted'}.`);});
});
function chooseBlock(replacing=false){
  if(!canEdit()||!compact())return;
  const previous=selected;
  $('add-block-heading').textContent=replacing?'Change block':'Add block';
  $('add-block-list').replaceChildren(...fullOrder(effects,fx).filter(id=>!shown().includes(id)).map(id=>button(blocks[id][0],()=>{
    if(!canEdit())return;
    const changed=replacing?replaceBlock(effects,fx,previous,id,snapshot.identity):membership(effects,fx,id,true,snapshot.identity);
    if(replacing)retained=retained.filter(x=>x!==previous);
    if(!retained.includes(id))retained.push(id);rememberView();fx=changed.fx;selected=id;
    $('add-block-dialog').close();edit(next=>next.splice(0,128,...changed.effects));
  })));
  if(!$('add-block-list').children.length)$('add-block-list').append(el('p','All available block types are already in this chain.','secondary'));
  $('add-block-dialog').showModal();
}
$('add-block').addEventListener('click',()=>chooseBlock());
$('change-block').addEventListener('click',()=>chooseBlock(true));
$('remove-block').addEventListener('click',()=>{
  if(!canEdit()||!compact())return;
  const changed=membership(effects,fx,selected,false,snapshot.identity);retained=retained.filter(id=>id!==selected);rememberView();fx=changed.fx;edit(next=>next.splice(0,128,...changed.effects));
});
$('close-add-block').addEventListener('click',()=>$('add-block-dialog').close());
$('block-state').addEventListener('click',()=>toggleBlock(selected));
$('preset-name').addEventListener('input',status);
$('buffer').addEventListener('change',()=>{buffer=Number($('buffer').value);edit(()=>{},false);});
$('usb-record-gain').addEventListener('input',()=>edit(next=>putRecord(next,[Number($('usb-record-gain').value)]),false));
$('master-volume').addEventListener('input',()=>edit(next=>{next[84]=Number($('master-volume').value);},false));
$('move-left').addEventListener('click',()=>{const order=shown();move(selected,order[order.indexOf(selected)-1]);});
$('move-right').addEventListener('click',()=>{const order=shown();move(selected,order[order.indexOf(selected)+1]);});
function choices(){
  const query=$('effect-search').value.trim().toLowerCase();
  const choices=(selected>9?FX_MODES.map((name,i)=>({name,id:i+1})):effectChoices(selected,snapshot?.identity)).filter(choice=>choice.name.toLowerCase().includes(query));
  $('effect-list').replaceChildren(...choices.map(choice=>{
    const b=button(choice.name,()=>{if(selected>9){const i=(selected-11)*16;fx[i]=choice.id;fx[i+3]=12;fx[i+4]=[3,4,5].includes(choice.id)?50:100;}else effects=changeType(effects,selected,choice.id,snapshot?.identity);$('effect-dialog').close();edit(()=>{});});
    b.className='effect-choice';b.setAttribute('aria-pressed',String((selected>9?fx[(selected-11)*16]:effects[selected]&63)===choice.id));return b;
  }));if(!choices.length)$('effect-list').append(el('p','No matching effects.','secondary'));
}
$('choose-effect').addEventListener('click',()=>{$('effect-search').value='';$('effect-heading').textContent=blocks[selected][0];choices();$('effect-dialog').showModal();});
$('effect-search').addEventListener('input',choices);$('close-effects').addEventListener('click',()=>$('effect-dialog').close());
$('tuner').addEventListener('click',()=>{
  work('Opening tuner…',async()=>{tunerResume={...snapshot};accept(await editor.listen(false),true);showPitch(null);$('tuner-progress').textContent='Reading guitar…';$('tuner-dialog').showModal();message('Tuner open. Plug muted.');autoTuner.start();});
});
function showPitch(reading){
    $('tuner-note').textContent=reading?`${reading.note}${reading.octave}`:'—';
    $('tuner-reading').textContent=reading?`${reading.cents>=0?'+':''}${reading.cents.toFixed(1)} cents · ${reading.frequency.toFixed(1)} Hz`:'Pluck one string and let it ring.';
    $('tuner-meter').value=reading?Math.max(-50,Math.min(50,reading.cents)):0;
    $('tuner-note').classList.toggle('in-tune',Boolean(reading?.inTune));
    $('tuner-progress').textContent='Updates automatically over Bluetooth.';
}
$('close-tuner').addEventListener('click',()=>$('tuner-dialog').close());
$('tuner-dialog').addEventListener('close',async()=>{
  autoTuner.stop();const expected=tunerResume,epoch=connection.epoch,ticket=operation;tunerResume=null;status();
  // Let the in-flight capture cancellation finish before sending output state.
  while(tuning)await new Promise(resolve=>setTimeout(resolve,20));
  if(!expected||!online()||needsRefresh||connection.epoch!==epoch||operation!==ticket||$('tuner-dialog').open)return;
  work('Returning to playback…',async()=>{accept(await editor.resume(expected),true);message('Tuner closed. Playback resumed.');});
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){autoTuner.stop();}else if($('tuner-dialog').open&&!needsRefresh&&!tuning&&online())autoTuner.start();});
connection.addEventListener('diagnostic',diagnostics);
connection.addEventListener('disconnected',event=>{if(tones.picker.active){pickerDisconnected=true;looper.close();autoTuner.stop();live.reset(null);status();message('Bluetooth paused by the phone. Return here after selecting a capture.');}else{clear();message(`Bluetooth disconnected during: ${event.detail.stage}.`,true);}});
$('copy-report').addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(connection.report());$('copy-status').textContent='Report copied.';}
  catch{const field=$('diagnostics-text');field.focus();field.select();field.setSelectionRange(0,field.value.length);$('copy-status').textContent='Select and copy the report below.';}
});
async function syncCapture(){
  const ticket=++activeTicket,crc=snapshot?.modelCrc;
  if(!snapshot?.loaded){activeCapture=null;tones.showActive(null);return;}
  if(activeCapture?.crc===crc){tones.showActive(activeCapture);return;}
  activeCapture=null;tones.showActive(null);
  const model=await tones.library.matching(crc);
  if(ticket!==activeTicket||snapshot?.modelCrc!==crc)return;
  activeCapture=model;detail();status();
}
function showQueued(){
  $('queued-capture').hidden=!queuedCapture;$('queued-name').textContent=queuedCapture?captureName(queuedCapture):'';
  try{if(queuedCapture)sessionStorage.setItem('namplug.queued',queuedCapture.sha);else sessionStorage.removeItem('namplug.queued');}catch{}
}
async function selectCapture(model){
  if(locked())throw new Error('Wait for the plug to finish its current operation.');
  queuedCapture=model;showQueued();
  if(!connection.connected&&pickerDisconnected&&connection.lastDevice){
    await work('Reconnecting to the plug…',async()=>{await connection.reconnect();await editor.readBank();accept(connection.current);pickerDisconnected=false;});
  }
  if(!connection.connected){tones.say('Downloaded. Close Captures and tap Connect to load it onto the plug.');message('Capture ready. Tap Connect to load it onto the plug.');return;}
  if(needsRefresh)throw new Error('Capture downloaded. Refresh the plug before loading it.');
  let loaded=false;
  await work('Loading capture onto plug…',async()=>{await transferCapture(model);loaded=true;});
  if(!loaded)throw new Error('Transfer was not confirmed. Refresh before trying again.');
}
async function transferCapture(model){
  const ticket=++loadTicket;
  if(!['NAMLNK14','NAMLNK15','NAMLNK16', 'NAMLNK17','NAMLNK18','NAMLNK19','NAMLNK20', 'NAMLNK21','NAMLNK22','NAMLNK23', 'NAMLNK24', 'NAMLNK25', 'NAMLNK26', 'NAMLNK27','NAMLNK28'].includes(snapshot.identity))throw new Error('Capture transfer requires NAMLNK14. Your download is kept on this phone.');
  const state=await editor.loadModel(snapshot,model,{canceled:()=>ticket!==loadTicket,progress:(n,total)=>{const text=`Loading ${captureName(model)} · ${Math.round(n/total*100)}%`;message(text);tones.say(text);}});
  activeCapture=model;accept(state);$('preset-name').value=shortPresetName(model);selected=3;queuedCapture=null;showQueued();render();tones.say(`${captureName(model)} is active. Keep browsing to try another capture.`);message(`${captureName(model)} loaded`);
}
$('cancel-capture').addEventListener('click',()=>{loadTicket++;queuedCapture=null;showQueued();message('Capture load canceled. The download is kept on this phone.');});
window.addEventListener('pagehide',clear);$('browser-help').hidden=Boolean(navigator.bluetooth?.requestDevice);render();
// Strip single-use authorization codes before any API or image request.
const callback=new URL(location.href);
if(['code','state','error','canceled'].some(k=>callback.searchParams.has(k))){history.replaceState(null,'',new URL('./',location.href).href);tones.callback(callback.href);}
else{try{const sha=sessionStorage.getItem('namplug.queued');if(sha)tones.library.get(sha).then(model=>{queuedCapture=model;showQueued();}).catch(()=>sessionStorage.removeItem('namplug.queued'));}catch{}}
