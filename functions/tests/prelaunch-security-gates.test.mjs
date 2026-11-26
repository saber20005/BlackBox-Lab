import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {SUITE_RELEASE,membershipForClient,suiteFeatureAllowed} from "../suite-membership.js";

// Offline release-control regression tests. These checks cannot attest the
// deployed Firebase Functions revision or cloud IAM/App Check configuration.
const functionsSource=readFileSync(new URL("../index.js",import.meta.url),"utf8");

test("P0: verified certificates cannot be enabled by a policy document alone",()=>{
  assert.match(functionsSource,/const\s+CERTIFICATE_ISSUANCE_ENABLED\s*=\s*false\s*;/,
    "certificate issuance hard gate must remain OFF until a separate reviewed launch");
  assert.match(functionsSource,/if\s*\(\s*!CERTIFICATE_ISSUANCE_ENABLED\s*\)/,
    "callable must reject before processing untrusted certificate requests");
});

test("P0: forged or even future-dated membership cannot activate the suite before release",()=>{
  assert.equal(SUITE_RELEASE,"not-for-sale");
  const future=new Date(Date.now()+20*86400000).toISOString();
  const trustedLooking={schemaVersion:1,plan:"cybertrace-blackbox-pro",source:"trusted-billing",
    status:"active",expiresAt:future};
  assert.equal(membershipForClient(trustedLooking).active,false);
  assert.equal(suiteFeatureAllowed(trustedLooking,"advanced-soc"),false);
  assert.equal(suiteFeatureAllowed(trustedLooking,"advanced-reports"),false);
});

test("P0: independently graded challenges require an explicit enabled private rubric",()=>{
  assert.match(functionsSource,/rubricSnap\.data\(\)\?\.enabled\s*!==\s*true/,
    "creating a session must fail closed for missing or disabled grading rubrics");
});

test("P1: every callable endpoint declares enforced Firebase App Check",()=>{
  const blocks=[...functionsSource.matchAll(/export const (\w+)\s*=\s*onCall\(\s*\{([\s\S]*?)\}\s*,\s*async\s+request\s*=>/g)];
  const exports=[...functionsSource.matchAll(/export const (\w+)\s*=\s*onCall\(/g)].map(x=>x[1]);
  assert.ok(exports.length>=17,"expected current set of onCall exports");
  assert.equal(blocks.length,exports.length,"every callable must have a recognized options block");
  for(const [,name,options] of blocks) {
    assert.match(options,/enforceAppCheck\s*:\s*true\b/,
      name+" must not accept clients missing App Check");
  }
});
