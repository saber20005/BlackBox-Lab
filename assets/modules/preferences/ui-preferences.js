// Device-local, optional presentation preferences only. Never modify progress keys.
export const BB_UI_PREFERENCES_KEY="blackbox.ui-preferences.v1";
export const BB_UI_DEFAULTS=Object.freeze({
  theme:"dark",textSize:"normal",motion:"system",level:"unset",
});
const choices=Object.freeze({
  theme:["dark","light"],textSize:["normal","large"],
  motion:["system","reduce"],level:["unset","beginner","hobbyist","intermediate","advanced"],
});
export function normalizeBbPreferences(input) {
  const v=input&&typeof input==="object"&&!Array.isArray(input)?input:{};
  return Object.fromEntries(Object.entries(BB_UI_DEFAULTS).map(([key,def])=>[key,choices[key].includes(v[key])?v[key]:def]));
}
export function readBbPreferences(storage) {
  try{
    const db=storage===undefined?(typeof window==="undefined"?null:window.localStorage):storage;
    const raw=db?.getItem(BB_UI_PREFERENCES_KEY);
    return normalizeBbPreferences(raw?JSON.parse(raw):null);
  }catch{return normalizeBbPreferences(null);}
}
export function saveBbPreferences(value,storage) {
  try{
    const db=storage===undefined?(typeof window==="undefined"?null:window.localStorage):storage;
    if(!db)return false;
    db.setItem(BB_UI_PREFERENCES_KEY,JSON.stringify(normalizeBbPreferences(value)));
    return true;
  }catch{return false;}
}
export function applyBbPreferences(value,root) {
  const normalized=normalizeBbPreferences(value);
  const node=root===undefined?(typeof document==="undefined"?null:document.documentElement):root;
  if(node?.dataset) {
    node.dataset.bbTheme=normalized.theme;
    node.dataset.bbText=normalized.textSize;
    node.dataset.bbMotion=normalized.motion;
  }
  return normalized;
}
