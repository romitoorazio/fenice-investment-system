import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assessEngineeringEvidencePublication, ENGINEERING_EVIDENCE_MIN_INTERVAL_MS }
  from "../lib/ui/engineering-evidence-publish-policy.mjs";

const now = new Date("2026-10-14T18:00:00.000Z");
const a = "a".repeat(40);
const b = "b".repeat(40);
const previous = {
  generatedAt: "2026-10-14T17:30:00.000Z", state: "VERIFIED",
  source: { validatedCommit:a,branch:"main",conclusion:"success" },
  policy: { liveTradingAllowed:false, brokerConnectivityAllowed:false },
};
const get = (changes={}) => assessEngineeringEvidencePublication({
  previous, testedSha:b, now, codeChangedSincePrevious:false, ...changes,
});
assert.equal(ENGINEERING_EVIDENCE_MIN_INTERVAL_MS,6*60*60*1000);
const unchanged = get();
assert.equal(unchanged.publish,false);
assert.equal(unchanged.reason,"RECENT_UNCHANGED_CODE_EVIDENCE");
assert.equal(unchanged.evidenceAgeMinutes,30);
assert.equal(get({codeChangedSincePrevious:true}).publish,true);
assert.equal(get({codeChangedSincePrevious:undefined}).publish,true);
assert.equal(get({previous:null}).publish,true);
assert.equal(get({previous:{...previous,state:"UNVERIFIED"}}).publish,true);
assert.equal(get({previous:{...previous,source:{...previous.source,conclusion:"failure"}}}).publish,true);
assert.equal(get({previous:{...previous,source:{...previous.source,validatedCommit:"invalid"}}}).publish,true);
assert.equal(get({previous:{...previous,policy:{...previous.policy,liveTradingAllowed:true}}}).publish,true);
assert.equal(get({previous:{...previous,generatedAt:"2026-10-15T17:30:00.000Z"}}).publish,true);
assert.equal(get({previous:{...previous,generatedAt:"2026-10-14T11:30:00.000Z"}}).publish,true);
assert.equal(get({testedSha:"bad-sha"}).publish,true);
assert.equal(get({now:new Date("invalid")}).publish,true);
const justExpired = get({now:new Date("2026-10-14T23:30:00.000Z")});
assert.equal(justExpired.reason,"EVIDENCE_RENEWAL_DUE");
assert.equal(justExpired.publish,true);
const workflow = await readFile(new URL("../.github/workflows/engineering-validation-evidence.yml",import.meta.url),"utf8");
const script = await readFile(new URL("./decide-engineering-evidence-publication.mjs",import.meta.url),"utf8");
assert.match(workflow,/run: node scripts\/decide-engineering-evidence-publication\.mjs >> "\$GITHUB_OUTPUT"/);
assert.match(script,/git", \["diff", "--quiet", prev, testedSha/);
assert.match(script,/:\(exclude\)data\/\*\*/);
assert.match(script,/:\(exclude\)\*\*\/\*\.md/);
assert.match(script,/codeChangedSincePrevious = false/);
console.log("Fenice engineering evidence data-only publication budget: PASS");
