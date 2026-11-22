import test from "node:test";
import assert from "node:assert/strict";
import { parseRoute, routeURL, primaryView } from "../routes.js";
import { BB_UI_PREFERENCES_KEY,BB_UI_DEFAULTS,BB_UI_PRESETS,applyBbPreset,normalizeBbPreferences,readBbPreferences,saveBbPreferences,applyBbPreferences } from "../assets/modules/preferences/ui-preferences.js";
const mock=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),keys:()=>[...map.keys()]};};
test("existing settings route stays in account navigation",()=>{
 assert.equal(parseRoute("https://blackboxlab.dev/?view=settings").view,"settings");
 assert.equal(primaryView("settings"),"account");
 assert.equal(routeURL({view:"settings"}).searchParams.get("view"),"settings");
});
test("legacy v1 values survive and stored progress stays unchanged",()=>{
 const store=mock();
 const untouched='{"completed":{"recon-0":true}}';
 store.setItem("blackbox-progress",untouched);
 store.setItem(BB_UI_PREFERENCES_KEY,JSON.stringify({theme:"light",textSize:"large",motion:"reduce",level:"hobbyist"}));
 assert.deepEqual(readBbPreferences(store),{...BB_UI_DEFAULTS,theme:"light",textSize:"large",motion:"reduce",level:"hobbyist"});
 assert.equal(saveBbPreferences({...readBbPreferences(store),accent:"cyan",density:"compact",uid:"foreign",notes:{secret:"not-for-storage"}},store),true);
 assert.equal(store.getItem("blackbox-progress"),untouched);
 assert.deepEqual(store.keys().sort(),[BB_UI_PREFERENCES_KEY,"blackbox-progress"].sort());
 assert.equal(store.getItem(BB_UI_PREFERENCES_KEY).includes("foreign"),false);
 assert.equal(store.getItem(BB_UI_PREFERENCES_KEY).includes("not-for-storage"),false);
});
test("all presets are allowlisted and do not overwrite learning level",()=>{
 assert.equal(BB_UI_PRESETS.length,3);
 for(const preset of BB_UI_PRESETS){const next=applyBbPreset({level:"advanced"},preset.id);
 assert.equal(next.level,"advanced");assert.equal(next.theme,preset.theme);assert.equal(next.density,preset.density);}
 assert.deepEqual(applyBbPreset({theme:"stealth"},"wrong"),normalizeBbPreferences({theme:"stealth"}));
});
test("invalid choices and storage failures fall back safely",()=>{
 assert.deepEqual(normalizeBbPreferences({theme:"css(injection)",accent:"url()",level:"beginner"}),{...BB_UI_DEFAULTS,level:"beginner"});
 const denied={getItem:()=>"{bad",setItem:()=>{throw Error("quota")}};
 assert.deepEqual(readBbPreferences(denied),BB_UI_DEFAULTS);
 assert.equal(saveBbPreferences({theme:"light"},denied),false);
});
test("presentation changes are limited to dataset attributes",()=>{
 const root={dataset:{}};applyBbPreferences({theme:"stealth",accent:"violet",textSize:"xlarge",density:"compact",motion:"reduce",contrast:"high"},root);
 assert.deepEqual(root.dataset,{bbTheme:"stealth",bbAccent:"violet",bbText:"xlarge",bbDensity:"compact",bbContrast:"high",bbMotion:"reduce"});
});
