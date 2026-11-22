import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, routeURL, primaryView } from '../routes.js';
import { BB_UI_PREFERENCES_KEY, BB_UI_DEFAULTS, normalizeBbPreferences, readBbPreferences, saveBbPreferences, applyBbPreferences } from '../ui-preferences.js';
const mock=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),keys:()=>[...map.keys()]};};
test('settings route is account-neighbor not a training stage',()=>{
  const route=parseRoute('https://blackboxlab.dev/?view=settings');
  assert.equal(route.view,'settings');
  assert.equal(route.stageIndex,0);
  assert.equal(routeURL({view:'settings'}).searchParams.get('view'),'settings');
  assert.equal(primaryView('settings'),'account');
});
test('device display preferences cannot write identity, completion, results or notes',()=>{
  const storage=mock();
  const obj={theme:'light',textSize:'large',motion:'reduce',level:'hobbyist',uid:'fake',completed:{'recon-0':true}};
  assert.equal(saveBbPreferences(obj,storage),true);
  assert.deepEqual(readBbPreferences(storage),{theme:'light',textSize:'large',motion:'reduce',level:'hobbyist'});
  assert.deepEqual(storage.keys(),[BB_UI_PREFERENCES_KEY]);
  assert.equal(storage.getItem(BB_UI_PREFERENCES_KEY).includes('recon-0'),false);
});
test('storage failures or malformed saved data fail safely',()=>{
  const bad={getItem:()=>'{bad json',setItem:()=>{throw Error('quota')}};
  assert.deepEqual(readBbPreferences(bad),BB_UI_DEFAULTS);
  assert.equal(saveBbPreferences({theme:'light'},bad),false);
  assert.deepEqual(normalizeBbPreferences({theme:'missing',textSize:'huge'}),BB_UI_DEFAULTS);
});
test('switches visual preferences only at supplied DOM root',()=>{
  const root={dataset:{}};
  assert.deepEqual(applyBbPreferences({theme:'light',textSize:'large',motion:'reduce'},root).level,'unset');
  assert.deepEqual(root.dataset,{bbTheme:'light',bbText:'large',bbMotion:'reduce'});
});
