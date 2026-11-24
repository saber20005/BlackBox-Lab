import test from "node:test";
import assert from "node:assert/strict";
import {normalizeRules,sha256,compareRuleSource,validateProject,validateRulesetName,fetchLiveRules} from "../scripts/audit-deployed-firestore-rules.mjs";

test("rules drift hashes normalize CRLF but reject substantive rule changes",()=>{
 const local="rules_version = '2';\r\nallow read: if false;\r\n";
 const same="rules_version = '2';\nallow read: if false;\n";
 assert.equal(normalizeRules(local),same);
 const yes=compareRuleSource(local,{files:[{name:"firestore.rules",content:same}]});
 assert.equal(yes.status,"match");
 assert.equal(yes.localSha256,sha256(local));
 const no=compareRuleSource(local,{files:[{name:"firestore.rules",content:same.replace("false","true")}]});
 assert.equal(no.status,"drift");
 assert.notEqual(no.localSha256,no.deployedSha256);
});

test("multi-file deployed rules are not compared as if one file",()=>{
 assert.equal(compareRuleSource("x",{files:[]}).status,"manual-review");
 assert.equal(compareRuleSource("x",{files:[{content:"a"},{content:"b"}]}).status,"manual-review");
});

test("ruleset identifiers must belong to the selected project",()=>{
 assert.equal(validateProject("black-box-lab"),"black-box-lab");
 assert.throws(()=>validateProject("../other"));
 assert.equal(validateRulesetName("black-box-lab","projects/black-box-lab/rulesets/abc-123"),"projects/black-box-lab/rulesets/abc-123");
 assert.throws(()=>validateRulesetName("black-box-lab","projects/other-project/rulesets/abc"));
});

test("read-only API fetch uses exactly two GET calls and never logs token",async()=>{
 const seen=[];
 const mock=async(url,options)=>{
  seen.push({url,method:options.method,authorization:options.headers.Authorization});
  const payload=seen.length===1?{rulesetName:"projects/black-box-lab/rulesets/abc123"}:{source:{files:[{content:"allow read: if false;"}]}};
  return {ok:true,status:200,json:async()=>payload};
 };
 const result=await fetchLiveRules({project:"black-box-lab",token:"stub-read-only-token",fetchImpl:mock});
 assert.equal(result.source.files[0].content,"allow read: if false;");
 assert.equal(seen.length,2);
 assert.ok(seen.every(s=>s.method==="GET"));
 assert.ok(seen.every(s=>s.url.startsWith("https://firebaserules.googleapis.com/v1/projects/black-box-lab/")));
 assert.throws(()=>validateRulesetName("black-box-lab","projects/another-project/rulesets/abc123"));
});
