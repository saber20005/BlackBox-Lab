import assert from 'node:assert/strict';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
const {chromium} = await import(process.env.BLACKBOX_PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const phase = process.env.BB_REVIEW_PHASE || 'after';
const theme = process.env.BB_REVIEW_THEME || 'dark';
const textSize = process.env.BB_REVIEW_TEXT || 'normal';
const density = process.env.BB_REVIEW_DENSITY || 'comfortable';
const out = process.env.BLACKBOX_PRESENTATION_ARTIFACTS || `/tmp/blackbox-presentation-artifacts/${phase}`;
await mkdir(out,{recursive:true});
const fixture=`export const accountConfig = Object.freeze(${JSON.stringify({enabled:false,linkedSkillsEnabled:true,providers:{email:false,google:false},grading:{enabled:false,appCheckSiteKey:''},firebase:{},emulators:null})});`;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.zip':'application/zip','.txt':'text/plain','.csv':'text/csv','.eml':'message/rfc822'};
const server=createServer(async(req,res)=>{try{let pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);if(!['GET','HEAD'].includes(req.method)||pathname.includes('\\')||pathname.includes('\0')||pathname.split('/').some(p=>p.startsWith('.'))){res.writeHead(403);res.end();return}let path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return}let body, type=mime[extname(path)]||'application/octet-stream';if(pathname==='/account-config.js')body=Buffer.from(fixture);else if(pathname.startsWith('/_vercel/insights/')){body=Buffer.from('// local screenshot fixture disables analytics');type=mime['.js']}else{body=await readFile(path);if(extname(path)==='.html')body=Buffer.from(body.toString().replace(/<link\b(?=[^>]*\brel=["'](?:preconnect|dns-prefetch|stylesheet)["'])(?=[^>]*\bhref=["']https?:\/\/)[^>]*>/g,''))}res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body)}catch{res.writeHead(404);res.end()}});
await new Promise(y=>server.listen(0,'127.0.0.1',y));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.BLACKBOX_CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox']});
const report={phase,root,origin,externalRequests:[],pages:[]};
const paths=[['landing','/?intro=1'],['home','/?view=home'],['tracks','/?view=tracks'],['exercise','/?track=logs&stage=0'],['settings','/?view=settings'],['mission','/mission-mode.html'],['portfolio','/portfolio.html'],['certificates','/certificates.html'],['evidence','/evidence-labs.html'],['catalogue','/labs.html'],['guide','/training-guide.html'],['journeys','/?view=journeys'],['pro','/pro.html'],['defense','/defense-final.html'],['vm-report','/vm-report.html']];
try{
for(const width of (process.env.BB_REVIEW_WIDTHS || '1440,390,320,768').split(',').map(Number)){
 const context=await browser.newContext({viewport:{width,height:width===1440?1000:844},deviceScaleFactor:1});
 await context.route('**/*',route=>{let u=new URL(route.request().url());if(u.origin===origin)return route.continue();report.externalRequests.push(u.hostname);return route.abort('blockedbyclient')});
 await context.addInitScript(({theme,textSize,density})=>{localStorage.setItem('blackbox-lab-intro-seen-v1','1');localStorage.setItem('blackbox.first-visit-tour.v1','done');localStorage.setItem('blackbox.ui-preferences.v1',JSON.stringify({theme,accent:'brand',textSize,density,contrast:'standard',motion:'reduce',level:'unset'}));},{theme,textSize,density});
 const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [name,path] of paths.filter(([name])=>!process.env.BB_REVIEW_PAGES || process.env.BB_REVIEW_PAGES.split(',').includes(name))){
  await page.goto(origin+path,{waitUntil:'domcontentloaded'});await page.waitForFunction(({theme,textSize,density})=>document.documentElement.dataset.bbTheme===theme&&document.documentElement.dataset.bbText===textSize&&document.documentElement.dataset.bbDensity===density,{theme,textSize,density});
  if(path.startsWith('/?view=')||name==='exercise')await page.locator('#content h1').first().waitFor({timeout:10000});
  const info=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyFont:getComputedStyle(document.body).fontSize,title:document.title,preferences:document.documentElement.dataset.bbTheme||null,textSize:document.documentElement.dataset.bbText||null,density:document.documentElement.dataset.bbDensity||null,bodyBackground:getComputedStyle(document.body).backgroundColor,bodyColor:getComputedStyle(document.body).color,visibleHeading:[...document.querySelectorAll('h1')].filter(e=>e.getClientRects().length).map(e=>e.textContent.trim())}));
  assert.equal(info.overflow,false,`${name} fits ${width}px in ${theme}`);
  assert.equal(info.preferences,theme,`${name} shares the selected theme`);
  assert.equal(info.textSize,textSize,`${name} shares text size`);
  assert.equal(info.density,density,`${name} shares density`);
  assert.deepEqual(errors,[],`${name} renders without browser exceptions`);
  const item={width,name,path,...info,errors:[...errors]};
  if(process.env.BLACKBOX_CAPTURE_PRESENTATION === '1' && [1440,390].includes(width)) {item.screenshot=`${out}/${name}-${width}.png`;await page.screenshot({path:item.screenshot,fullPage:true});}
  if(info.overflow)item.overflowElements=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>{let r=e.getBoundingClientRect();return r.width&&((r.left < -1)||(r.right>innerWidth+1))}).slice(0,12).map(e=>({tag:e.tagName,cls:e.className,id:e.id,width:e.getBoundingClientRect().width,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})));
  report.pages.push(item);
 }
 await context.close();
}
assert.deepEqual(report.externalRequests, [], 'display review uses no external services');
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({out,pages:report.pages.length,overflow:report.pages.filter(p=>p.overflow),errors:report.pages.filter(p=>p.errors.length),externalRequests:[...new Set(report.externalRequests)]},null,2));
}finally{await browser.close();await new Promise(y=>server.close(y));}
