import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.BLACKBOX_PLAYWRIGHT_MODULE||'playwright');
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const out=process.env.BLACKBOX_APP_NAV_ARTIFACTS||'/tmp/blackbox-app-navigation';
await mkdir(out,{recursive:true});
const config='export const accountConfig='+JSON.stringify({enabled:false,linkedSkillsEnabled:true,providers:{email:false,google:false},grading:{enabled:false,appCheckSiteKey:''},firebase:{},emulators:null})+';';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.csv':'text/csv','.txt':'text/plain'};
const server=createServer(async(req,res)=>{try{
 const path=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
 if(!['GET','HEAD'].includes(req.method)||path.includes('\\')||path.split('/').some(part=>part.startsWith('.')))throw Error('denied');
 const file=resolve(root,'.'+(path==='/'?'/index.html':path));if(!file.startsWith(root+sep))throw Error('denied');
 let body=path==='/account-config.js'?config:path.startsWith('/_vercel/insights/')?'// disabled local analytics':await readFile(file);
 if(extname(file)==='.html')body=body.toString().replace(/<link\b(?=[^>]*\brel=["'](?:preconnect|dns-prefetch|stylesheet)["'])(?=[^>]*\bhref=["']https?:\/\/)[^>]*>/g,'');
 res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let browser,page;let activeErrors=[];const report=[];
try{
 browser=await chromium.launch({executablePath:process.env.BLACKBOX_CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
 for(const width of [320,390,1440]){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});const errors=[],external=[];activeErrors=errors;
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();external.push(new URL(route.request().url()).hostname);return route.abort('blockedbyclient');});
  page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/?track=logs&stage=0',{waitUntil:'domcontentloaded'});await page.locator('#stageNotes').waitFor();
  const note='PRIVATE_APP_NAV_DRAFT_'+width;
  await page.locator('#stageNotes').fill(note);
  const textarea=await page.locator('#stageNotes').elementHandle();
  const opener=page.locator('#bb-app-search-open'),dialog=page.locator('#bb-app-search'),input=page.locator('#bb-app-search-input');
  await opener.click();assert.equal(await dialog.evaluate(node=>node.open),true);
  assert.equal(await textarea.evaluate(node=>node.isConnected),true,'opening search does not rerender an editing exercise');
  await input.fill(note);await page.locator('.bb-search-empty').waitFor();
  assert.equal(await page.locator('[data-app-search-result]').count(),0,'private drafts are excluded');
  await input.fill('<img src=x onerror="window.searchInjected=true">');
  assert.equal(await dialog.locator('img').count(),0);assert.equal(await page.evaluate(()=>window.searchInjected),undefined);
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await dialog.evaluate(node=>node.open),false);assert.equal(await opener.evaluate(node=>document.activeElement===node),true);
  const previousOverflow=await page.evaluate(()=>document.body.style.overflow);
  await page.evaluate(()=>{document.body.style.overflow='clip';const open=document.getElementById('bb-app-search-open'),close=document.querySelector('[data-app-search-close]');open.click();close.click();open.click();});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await dialog.evaluate(node=>node.open),true,'rapid reopen keeps the newest search open');
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden','a queued old close cannot unlock the current modal');
  await dialog.locator('[data-app-search-close]').click();
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'clip','closing restores the original scroll setting');
  await page.evaluate(value=>{document.body.style.overflow=value;},previousOverflow);
  assert.equal(await page.locator('#stageNotes').inputValue(),note);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('blackbox-progress-v1')).notes['logs-0']),note,'opening discovery flushes pending drafts');
  await opener.click();await input.fill('Nmap');
  await dialog.locator('[data-app-search-category=stage]').click();
  assert.equal(await dialog.locator('[data-track-id=nmap][data-stage-index="1"]').isDisabled(),true,'search preserves stage prerequisites');
  await dialog.locator('[data-app-search-category=track]').click();
  await dialog.locator('[data-app-search-result][data-track-id=nmap]').click();
  await page.waitForFunction(()=>new URL(location.href).searchParams.get('track')==='nmap');await page.locator('#selectedTrack').waitFor();
  assert.equal(await dialog.evaluate(node=>node.open),false);
  await page.goBack();await page.locator('#stageNotes').waitFor();assert.equal(await page.locator('#stageNotes').inputValue(),note,'Back restores the existing draft');
  await page.goForward();await page.waitForFunction(()=>document.documentElement.dataset.bbView==='tracks');
  await page.locator('#selectedTrack [data-open=nmap][data-stage="0"]').click();await page.locator('#stageNotes').waitFor();
  await page.locator('[data-return-track]').click();await page.waitForFunction(()=>document.documentElement.dataset.bbView==='tracks');
  assert.equal(await page.locator('#selectedTrack').evaluate(node=>document.activeElement===node),false,'return restores source control rather than trapping focus in a heading');
  assert.equal(await page.locator('#nav [data-view]').count(),4);assert.equal(await page.locator('#bb-quick-dock').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'dock and page fit '+width+'px');
  assert.equal(await page.locator('#content').evaluate(node=>getComputedStyle(node).animationName),'none','reduced motion avoids route animation');
  if(width<700){const box=await page.locator('#nav').boundingBox();assert(box.y>800&&box.width<=width);await page.locator('#nav [data-view=home]').click();await page.locator('.app-search-launcher').waitFor();assert.equal(await page.locator('#nav').evaluate(node=>getComputedStyle(node).position),'fixed');}
  await page.screenshot({path:out+'/workspace-'+width+'.png',fullPage:true});await opener.click();await page.screenshot({path:out+'/search-'+width+'.png'});await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);report.push({width,publicSearch:true,privateDraftExcluded:true,locks:true,historyAndDraft:true,errors,external});
  console.log('PASS app navigation '+width+'px: persistent routes, native search, private draft exclusion, locks, pending save, Back/Forward and reduced motion');await context.close();
 }
 await writeFile(out+'/results.json',JSON.stringify(report,null,2));
}catch(error){console.error(JSON.stringify({error:error.message,pageErrors:activeErrors}));if(page&&!page.isClosed())await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});throw error;}
finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
