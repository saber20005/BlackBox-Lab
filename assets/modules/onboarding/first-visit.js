// Device-local discovery only. Never writes account, lab checklist, results, grades or XP.
export const BB_FIRST_VISIT_KEY = "blackbox.first-visit-tour.v1";
export const BB_FIRST_VISIT_DONE = "done";
const LEGACY_INTRO_KEY = "blackbox-lab-intro-seen-v1";
const storageOf = name => {try {return typeof window === "undefined" ? null : window[name];} catch {return null;}};
function isDone(db) {try{return db?.getItem(BB_FIRST_VISIT_KEY)===BB_FIRST_VISIT_DONE;}catch{return false;}}
export function hasFinishedBbTour(local=storageOf("localStorage"),session=storageOf("sessionStorage")) {
 return isDone(local)||isDone(session);
}
export function hasTrainingHistory(state) {
 if(!state || typeof state!=="object")return false;
 return Boolean(state.lastActivity
  || Object.keys(state.completed||{}).length
  || Object.values(state.checks||{}).some(list=>Array.isArray(list)&&list.length>0)
  || Object.values(state.notes||{}).some(note=>typeof note==="string"&&note.trim())
  || Object.values(state.results||{}).some(result=>typeof result==="string"&&result.trim())
  || (Array.isArray(state.logs)&&state.logs.length>0));
}
export function shouldStartBbTour(url,route,state,local=storageOf("localStorage"),session=storageOf("sessionStorage")) {
 if(route?.view!=="home"||route?.invalid||hasFinishedBbTour(local,session)||hasTrainingHistory(state))return false;
 let parsed;
 try {parsed=new URL(url,"https://blackboxlab.dev/");}catch{return false;}
 // Exact public home entry only. Do not intercept training links, local setup, campaigns
 // with explicit views or anchored documentation.
 if(parsed.searchParams.has("view")||parsed.searchParams.has("track")||parsed.searchParams.has("stage")
  ||parsed.searchParams.has("intro")||parsed.hash)return false;
 try {if(local?.getItem(LEGACY_INTRO_KEY)==="1")return false;}catch{/* deny nothing */}
 return true;
}
export function finishBbTour(local=storageOf("localStorage"),session=storageOf("sessionStorage")) {
 let saved=false;
 for(const db of [local,session]){try{if(db){db.setItem(BB_FIRST_VISIT_KEY,BB_FIRST_VISIT_DONE);saved=true;}}catch{/* memory-only exit is safe */}}
 return saved;
}
