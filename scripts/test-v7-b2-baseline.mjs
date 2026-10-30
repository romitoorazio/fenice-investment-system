import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeV7B2Fingerprint } from "../lib/trading/paper-v7-b2-fingerprint.mjs";
import { assessV7B2Preflight } from "./check-v7-b2-preflight.mjs";
import { replayV7PhaseBLedger } from "../lib/trading/paper-v7-phase-b-v6-parity.mjs";

const read=n=>JSON.parse(readFileSync("data/"+n,"utf8"));
const originalApproval=read("paper-v7-phase-b-approval.json");
const originalLedger=read("paper-v7-phase-b-forward-ledger.json");
const originalDays=read("paper-v7-phase-b-forward-days.json");
const approval=read("paper-v7-b2-approval.json");
const ledger=read("paper-v7-b2-forward-ledger.json");
const days=read("paper-v7-b2-forward-days.json");
const fp=await computeV7B2Fingerprint(".");
assert.equal(fp.complete,true,JSON.stringify(fp.missingFiles));
assert.equal(fp.files.includes(".github/workflows/v7-phase-b-forward-paper.yml"),false,
  "B2 cannot mutate or depend on editing pinned legacy workflow");
assert.equal(fp.files.includes(".github/workflows/v7-b2-forward-paper.yml"),true);
assert.equal(fp.files.includes("scripts/refresh-twelve-data-batch-evidence.mjs"),true);
assert.equal(approval.approvalId,"fenice-paper-v7-b2-2026-11-02");
assert.notEqual(approval.approvalId,originalApproval.approvalId);
assert.equal(approval.v6HistoricalFillsCredited,0);
assert.equal(approval.allowBackfill,false);
assert.equal(approval.liveTradingAllowed,false);
assert.equal(approval.brokerConnectivityAllowed,false);
assert.equal(approval.maxOrdersPerDay,1);
assert.equal(approval.minCommitteeScore,70);
assert.equal(approval.minEvidenceDays,25);
assert.equal(approval.minCalendarDays,30);
assert.equal(approval.targetPaperFills,10);
assert(Date.parse(approval.expiresAt)-Date.parse(approval.approvedAt)>=30*86400000);
// At preparation time the isolated journal starts at GENESIS. After launch,
// regression MUST continue accepting *genuine* forward days and fills.
if (approval.approved===false) {
  assert.equal(ledger.attempts.length,0,"unapproved B2 ledger must start at GENESIS");
  assert.equal(days.days.length,0,"unapproved B2 history must start empty");
}
assert.equal(days.campaignId,approval.approvalId);
assert.equal(replayV7PhaseBLedger(ledger).valid,true);
assert(ledger.attempts.every(e=>e.id.startsWith(approval.idPrefix)
  &&e.occurredAt>=approval.approvedAt&&e.liveTradingAllowed===false
  &&e.brokerConnectivityAllowed===false),
  "Only genuine prospective B2 attempts accepted");
assert(days.days.every(d=>d.date>=approval.approvedAt.slice(0,10)
  &&d.liveTradingAllowed===false&&d.brokerConnectivityAllowed===false),
  "No backfill or original Phase B daily history may be imported");
assert.equal(originalApproval.approved,true,"previous approved campaign must remain intact");
assert.equal(originalLedger.liveTradingAllowed,false);
assert(originalDays.days.length>=3,"previous Phase B forward history must be preserved");
const oldState=JSON.stringify({originalApproval,originalLedger,originalDays});

const nowMs=Date.parse("2026-11-02T15:30:00.000Z");
const approved={...approval,approved:true,humanConfirmation:true,coreFingerprint:fp};
const base={approval:approved,ledger,days,fingerprint:fp,nowMs,shaAncestor:true};
const valid=assessV7B2Preflight(base);
assert.deepEqual(valid,{allowed:true,reason:"FORWARD_PAPER_ONLY_OPEN_MARKET_CHECK_REQUIRED"});
assert.equal(assessV7B2Preflight({...base,approval}).reason,"NOT_PROSPECTIVELY_APPROVED");
const reject=[
  ["no consent",b=>b.approval.humanConfirmation=false],
  ["expired",b=>b.nowMs=Date.parse("2027-01-01T00:00:00.000Z")],
  ["before first market",b=>b.nowMs=Date.parse("2026-11-01T00:00:00.000Z")],
  ["wrong fingerprint",b=>b.approval.coreFingerprint={...fp,digest:"a".repeat(64)}],
  ["live leak",b=>b.approval.liveTradingAllowed=true],
  ["broker",b=>b.ledger.brokerConnectivityAllowed=true],
  ["backfill",b=>b.approval.allowBackfill=true],
  ["old fills credited",b=>b.approval.v6HistoricalFillsCredited=7],
  ["lower committee threshold",b=>b.approval.minCommitteeScore=50],
  ["higher daily count",b=>b.approval.maxOrdersPerDay=3],
  ["missing commit anchor",b=>b.shaAncestor=false],
  ["foreign campaign",b=>b.days.campaignId="old-b"],
  ["replayed proof",b=>b.days.days=[{date:"2026-11-02",marketEvidenceValid:true,fillCount:0,brokerConnectivityAllowed:false,liveTradingAllowed:false}]],
  ["risk budget consumed",b=>b.ledger.attempts=Array.from({length:20},()=>({}))],
];
for(const [name,mutate] of reject){
  const input=structuredClone(base);mutate(input);
  const got=assessV7B2Preflight(input);
  assert.equal(got.allowed,false,name);
}
assert.equal(JSON.stringify({originalApproval,originalLedger,originalDays}),oldState);
const workflow=readFileSync(".github/workflows/v7-b2-forward-paper.yml","utf8");
const runner=readFileSync("scripts/run-v7-b2-forward-cycle.mjs","utf8");
const oldWorkflow=readFileSync(".github/workflows/v7-phase-b-forward-paper.yml","utf8");
const batch="node --experimental-strip-types scripts/refresh-twelve-data-batch-evidence.mjs";
assert(workflow.includes("npm run marketdata:execution"));
assert(workflow.indexOf(batch)>workflow.indexOf("npm run marketdata:execution"));
assert(workflow.indexOf("node scripts/refresh-paper-fx-evidence.mjs")>workflow.indexOf(batch));
assert(workflow.indexOf("check-execution-market-coverage.mjs")>workflow.indexOf(batch));
assert(oldWorkflow.indexOf(batch)<0,"original frozen Phase B workflow must stay untouched");
assert(workflow.includes("scripts/check-v7-b2-preflight.mjs"));
assert(workflow.includes("steps.preflight.outputs.allowed == 'true'"));
assert(!workflow.includes("paper-api.alpaca.markets"));
assert(!runner.includes('"paper-v7-phase-b-forward-ledger.json"'));
assert(!runner.includes('"paper-validation-campaign.json"'));
assert(runner.includes('"paper-v7-b2-forward-ledger.json"'));
assert(runner.includes('"paper-v7-b2-forward-days.json"'));
console.log("V7 B2 independent forward campaign: PASS (14 negative gates; 0 imported old fills; exact SHA256="+fp.digest+")");
