import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
const output="data/paper-successor-operational-approval.json";
assert.equal(existsSync(output),false,"Test requires no preexisting successor approval");
const original=readFileSync("data/paper-validation-approval.json");
const archive=readFileSync("data/paper-history/v6-20260925-campaign.json");
const run=spawnSync(process.execPath,["scripts/issue-successor-paper-approval.mjs"],{encoding:"utf8"});
assert.notEqual(run.status,0,"Issuer must reject invocation without explicit confirmation");
assert.match(run.stderr,/EXPLICIT_PAPER_ONLY_CONFIRMATION_REQUIRED/);
assert.equal(existsSync(output),false,"No approval must be created without confirmation");
assert.deepEqual(readFileSync("data/paper-validation-approval.json"),original);
assert.deepEqual(readFileSync("data/paper-history/v6-20260925-campaign.json"),archive);
console.log("PASS: issuer rejects missing confirmation, creates no approval, preserves V6");

import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const temp=mkdtempSync(join(tmpdir(),"fenice-approval-negative-"));
try {
  mkdirSync(join(temp,"scripts"),{recursive:true});
  mkdirSync(join(temp,"data/paper-history"),{recursive:true});
  for(const file of [
    "scripts/issue-successor-paper-approval.mjs",
    "data/paper-successor-operator-authorization.json",
    "data/paper-validation-campaign.json",
    "data/paper-history/v6-20260925-campaign.json",
    "data/paper-oms-state.json",
    "data/paper-validation-approval.json"
  ]) cpSync(file,join(temp,file));
  const consentFile=join(temp,"data/paper-successor-operator-authorization.json");
  const consent=JSON.parse(readFileSync(consentFile,"utf8"));
  consent.authorizedOn="2020-01-01";
  writeFileSync(consentFile,JSON.stringify(consent));
  const stale=spawnSync(process.execPath,["scripts/issue-successor-paper-approval.mjs","--confirm-paper-only"],{cwd:temp,encoding:"utf8"});
  assert.notEqual(stale.status,0,"Stale consent must not issue an approval");
  assert.match(stale.stderr,/OPERATOR_CONSENT_DATE_NOT_CURRENT/);
  assert.equal(existsSync(join(temp,output)),false,"Stale consent created an approval");
} finally { rmSync(temp,{recursive:true,force:true}); }
console.log("PASS: stale operator consent rejected without approval output");

