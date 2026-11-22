// Allowlisted presentation preferences only; the original storage key is retained for migration.
export const BB_UI_PREFERENCES_KEY="blackbox.ui-preferences.v1";
export const BB_UI_DEFAULTS=Object.freeze({theme:"dark",accent:"brand",textSize:"normal",density:"comfortable",contrast:"standard",motion:"system",level:"unset"});
export const BB_UI_PRESETS=Object.freeze([
 {id:"signature",title:"الهوية الأصلية",theme:"dark",accent:"brand",textSize:"normal",density:"comfortable",contrast:"standard",motion:"system"},
 {id:"focus",title:"وضع العمليات",theme:"stealth",accent:"cyan",textSize:"normal",density:"compact",contrast:"standard",motion:"reduce"},
 {id:"reading",title:"قراءة مريحة",theme:"light",accent:"brand",textSize:"large",density:"comfortable",contrast:"high",motion:"reduce"}
]);
const allowed={theme:["dark","stealth","light"],accent:["brand","cyan","violet"],textSize:["normal","large","xlarge"],density:["comfortable","compact"],contrast:["standard","high"],motion:["system","reduce"],level:["unset","beginner","hobbyist","intermediate","advanced"]};
export function normalizeBbPreferences(input){
 const v=input&&typeof input==="object"&&!Array.isArray(input)?input:{};
 return Object.fromEntries(Object.entries(BB_UI_DEFAULTS).map(([key,def])=>[key,allowed[key].includes(v[key])?v[key]:def]));
}
export function applyBbPreset(value,id){
 const p=BB_UI_PRESETS.find(x=>x.id===id);
 return normalizeBbPreferences(p?{...normalizeBbPreferences(value),...p}:value);
}
export function readBbPreferences(storage){
 try{const db=storage===undefined?(typeof window==="undefined"?null:window.localStorage):storage;
 const raw=db?.getItem(BB_UI_PREFERENCES_KEY);
 return normalizeBbPreferences(raw?JSON.parse(raw):null);
 }catch{return normalizeBbPreferences(null);}
}
export function saveBbPreferences(value,storage){
 try{const db=storage===undefined?(typeof window==="undefined"?null:window.localStorage):storage;
 if(!db)return false;
 db.setItem(BB_UI_PREFERENCES_KEY,JSON.stringify(normalizeBbPreferences(value)));
 return true;
 }catch{return false;}
}
export function applyBbPreferences(value,root){
 const p=normalizeBbPreferences(value);
 const node=root===undefined?(typeof document==="undefined"?null:document.documentElement):root;
 if(node?.dataset){node.dataset.bbTheme=p.theme;node.dataset.bbAccent=p.accent;
 node.dataset.bbText=p.textSize;node.dataset.bbDensity=p.density;node.dataset.bbContrast=p.contrast;node.dataset.bbMotion=p.motion;}
 return p;
}
