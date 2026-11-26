import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const workflow=readFileSync(new URL("../.github/workflows/firebase-production-rules-attestation.yml",import.meta.url),"utf8");

test("Only manual, main-branch workflows may read the live Firebase rules",()=>{
  assert.match(workflow,/on:\s*\n\s*workflow_dispatch:/);
  assert.match(workflow,/if:\s*github\.ref\s*==\s*'refs\/heads\/main'/);
  assert.match(workflow,/permissions:\s*\n\s*contents:\s*read\s*\n\s*id-token:\s*write/);
  assert.doesNotMatch(workflow,/\bfirebase\s+(?:deploy|firestore:rules:release)\b|service_account_key|\bprivate_key\b/i);
});

test("Read-only identity uses scoped GitHub WIF and emits only SHA metadata",()=>{
  assert.match(workflow,/uses:\s*google-github-actions\/auth@v3/);
  assert.match(workflow,/workload_identity_provider:\s*\$\{\{\s*vars\.FIREBASE_RULES_WIF_PROVIDER\s*\}\}/);
  assert.match(workflow,/service_account:\s*\$\{\{\s*vars\.FIREBASE_RULES_VIEWER_SA\s*\}\}/);
  assert.match(workflow,/create_credentials_file:\s*false/);
  assert.match(workflow,/--project=black-box-lab\s+--file=firestore\.rules/);
  assert.match(workflow,/Repository source SHA-256/);
  assert.match(workflow,/Active source SHA-256/);
});

test("Auditing reference-only rules cannot be mistaken for verified production parity",()=>{
  assert.doesNotMatch(workflow,/--reference-only/);
  assert.match(workflow,/exit "\$result"/);
});
