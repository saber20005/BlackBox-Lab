#!/usr/bin/env node
/**
 * READ-ONLY Firebase Rules drift inspection.
 * GET projects.releases.get and projects.rulesets.get only.
 * Never deploys, patches, logs OAuth tokens, or writes downloaded rule sources.
 */
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import process from "node:process";

export const normalizeRules = input => String(input).replace(/\r\n/g,"\n").trimEnd()+"\n";
export const sha256 = input => createHash("sha256").update(normalizeRules(input),"utf8").digest("hex");

export function compareRuleSource(local,source){
 const files=source?.files;
 if(!Array.isArray(files)||files.length!==1||typeof files[0]?.content!=="string"){
  return {status:"manual-review",reason:"Deployed rules use zero or multiple source files; compare the complete rule bundle manually."};
 }
 return {status:sha256(local)===sha256(files[0].content)?"match":"drift",
  localSha256:sha256(local),deployedSha256:sha256(files[0].content),deployedFile:files[0].name??"unnamed"};
}

export function validateProject(project){
 if(typeof project!=="string"||!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project)){
  throw Error("Invalid Firebase project ID");
 }
 return project;
}

export function validateRulesetName(project,name){
 if(typeof name!=="string"||!name.startsWith("projects/"+project+"/rulesets/")||
  !/^projects\/[a-z][a-z0-9-]{4,28}[a-z0-9]\/rulesets\/[A-Za-z0-9_-]+$/.test(name)){
  throw Error("Invalid ruleset resource or project mismatch");
 }
 return name;
}

export async function fetchLiveRules({project,token,release="cloud.firestore",fetchImpl=fetch}){
 validateProject(project);
 if(release!=="cloud.firestore"&&release!=="cloud.firestore/(default)")throw Error("Unsupported Firestore release");
 if(typeof token!=="string"||token.length<10)throw Error("OAuth bearer token required");
 const root="https://firebaserules.googleapis.com/v1/";
 async function fetchJSON(path){
  const response=await fetchImpl(root+path,{method:"GET",headers:{Authorization:"Bearer "+token,Accept:"application/json"},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error("Firebase Rules read failed (HTTP "+response.status+"); confirm read-only Rules Viewer permissions");
  return response.json();
 }
 const releaseName="projects/"+project+"/releases/"+release;
 const liveRelease=await fetchJSON(releaseName);
 const rulesetName=validateRulesetName(project,liveRelease.rulesetName);
 const ruleset=await fetchJSON(rulesetName);
 return {releaseName,rulesetName,source:ruleset.source};
}

function help(){
 console.log("Read-only Firebase Firestore rules comparison");
 console.log("Usage: FIREBASE_RULES_ACCESS_TOKEN=<OAuth token> node scripts/audit-deployed-firestore-rules.mjs --project=PROJECT --file=PATH [--reference-only]");
 console.log("The token must have Firebase Rules Viewer access. Never paste the token into a chat or commit it.");
 console.log("Reference-only reports drift without treating the reference file as complete production rules.");
}

async function main(){
 const args=process.argv.slice(2);
 if(args.includes("--help")){help();return;}
 const get=name=>args.find(v=>v.startsWith("--"+name+"="))?.slice(name.length+3);
 const project=get("project"),path=get("file"),referenceOnly=args.includes("--reference-only");
 if(!project||!path)throw Error("Required: --project=PROJECT --file=PATH");
 validateProject(project);
 if(path.startsWith("http:")||path.startsWith("https:"))throw Error("Only local files are supported");
 const token=process.env.FIREBASE_RULES_ACCESS_TOKEN;
 if(!token)throw Error("Set FIREBASE_RULES_ACCESS_TOKEN in your local environment (do not paste it here)");
 const local=readFileSync(path,"utf8");
 const {releaseName,rulesetName,source}=await fetchLiveRules({project,token});
 const result=compareRuleSource(local,source);
 console.log(JSON.stringify({project,releaseName,rulesetName,referenceOnly,...result},null,2));
 if(result.status==="drift"&&!referenceOnly)process.exitCode=2;
 if(result.status==="manual-review"&&!referenceOnly)process.exitCode=3;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(error=>{console.error("Read-only rules audit: "+error.message);process.exitCode=1;});
}
