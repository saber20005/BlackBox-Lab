// Non-blocking loading cue: never hides content or delays user interaction.
(() => {
  const indicator=document.getElementById('bb-load-indicator');
  if(!indicator)return;
  const done=()=>{indicator.hidden=true;};
  // Loading feedback ends as soon as DOM is interactive, independent of slow third-party scripts.
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',done,{once:true});
  else done();
  window.addEventListener('pageshow',done,{once:true});
})();
