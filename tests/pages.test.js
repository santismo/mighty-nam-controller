import test from 'node:test';import assert from 'node:assert/strict';
import {ControllerPages} from '../src/pages.js';
function setup(options={}){
 const views={signal:{hidden:false},looper:{hidden:true},captures:dialog(),tuner:dialog()};
 function dialog(){return {open:false,show(){this.open=true;},close(){this.open=false;}};}
 const buttons=Object.fromEntries(Object.keys(views).map(n=>[n,{setAttribute(k,v){this[k]=v;}}]));
 return {views,buttons,pages:new ControllerPages({views,buttons,...options})};
}
test('navigation shows one page with a selected top button and no browser navigation',async()=>{
 const {pages,views,buttons}=setup();
 for(const name of ['captures','looper','tuner','signal']){
  assert.equal(await pages.show(name),true);
  for(const [key,view] of Object.entries(views)){assert.equal('open' in view?view.open:!view.hidden,key===name);assert.equal(buttons[key]['aria-pressed'],String(key===name));}
 }
});
test('leaving tuner waits for playback restoration before showing the next view',async()=>{
 let release;const done=new Promise(r=>release=r),events=[];
 const {pages,views}=setup({beforeChange:async(from,to)=>{if(from==='tuner'){events.push('restore');await done;events.push('restored');}},changed:n=>events.push(n)});
 await pages.show('tuner');const change=pages.show('looper');assert.equal(views.tuner.open,true);assert.equal(views.looper.hidden,true);
 assert.equal(await pages.show('captures'),false);release();await change;
 assert.deepEqual(events,['tuner','restore','restored','looper']);assert.equal(views.tuner.open,false);
});
test('blocked transition keeps the current view; disconnect invalidates an unfinished transition',async()=>{
 const {pages}=setup({beforeChange:async()=>false});assert.equal(await pages.show('tuner'),false);assert.equal(pages.current,'signal');
 let release;pages.beforeChange=()=>new Promise(r=>release=r);const pending=pages.show('looper');pages.reset();release(true);
 assert.equal(await pending,false);assert.equal(pages.current,'signal');
});
