import test from 'node:test';
import assert from 'node:assert/strict';
import {ChainView,visibleOrder,replaceBlock,enabled,membership} from '../src/active-chain.js';
import {editingBluetooth} from './editor-fixture.js';
import {fullOrder,defaultFx} from '../src/fx.js';
test('bypass retains a tile and settings; remove and replace are distinct',()=>{
 const f=editingBluetooth({identity:'NAMLNK21'}),effects=f.effects,fx=defaultFx();
 for(let i=1;i<=9;i++)effects[i]|=64;effects[3]&=63;effects[8]&=63;
 fx[1]=fx[17]=0;
 const base=effects.slice(),retained=[3];effects[3]|=64;
 assert.deepEqual(visibleOrder(effects,fx,'NAMLNK21',retained),[3,8]);
 assert.equal(enabled(effects,fx,3),false);
 assert.deepEqual(effects.slice(11),base.slice(11));
 assert.deepEqual(visibleOrder(effects,fx,'NAMLNK21',[]),[8]);
 const position=fullOrder(effects,fx).indexOf(3),changed=replaceBlock(effects,fx,3,2,'NAMLNK21');
 assert.equal(fullOrder(changed.effects,changed.fx).indexOf(2),position);
 assert.equal(enabled(changed.effects,changed.fx,2),false);
 assert.equal(enabled(changed.effects,changed.fx,3),false);
 assert.equal(changed.effects[84],effects[84]);
 assert.equal(changed.effects[20],effects[20]);
});
test('bypassed tile membership stays per color in local storage',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 const view=new ChainView(storage);view.write(0,[3,8]);view.write(1,[3,7,11]);
 assert.deepEqual(new ChainView(storage).read(0),[3,8]);assert.deepEqual(view.read(1),[3,7,11]);
 storage.setItem(view.key,'{"0":[3,3,-1,100,12]}');assert.deepEqual(view.read(0),[3,12]);
 storage.setItem(view.key,'broken');assert.deepEqual(view.read(0),[]);
});
