import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {computeV7PhaseBFingerprint}
  from "../lib/trading/paper-v7-phase-b-forward-fingerprint.mjs";
import {freshV7PhaseBLedger,replayV7PhaseBLedger}
  from "../lib/trading/paper-v7-phase-b-v6-parity.mjs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=async n=>JSON.parse(await readFile(resolve(root,"data",n),"utf8"));
const [approval,ledger,days,legacy]=await Promise.all([
  read("paper-v7-phase-b-approval.json"),
  read("paper-v7-phase-b-forward-ledger.json"),
  read("paper-v7-phase-b-forward-days.json"),
  read("paper-validation-approval.json"),
]);
const frozen=await computeV7PhaseBFingerprint(root);
assert.equal(frozen.complete,true);
assert.equal(frozen.digest,approval.coreFingerprint?.digest,"independent V7 code must remain exactly pinned");
assert.equal(frozen.domain,approval.coreFingerprint?.domain);
assert.deepEqual(frozen.files,approval.coreFingerprint?.files);
assert.match(approval.baselineCommit,/^[a-f0-9]{40}$/);
execFileSync("git",["merge-base","--is-ancestor",approval.baselineCommit,"HEAD"],{cwd:root});
assert.equal(approval.approved,true);
assert.equal(approval.humanConfirmation,true);
assert.equal(approval.mode,"PAPER");
assert.equal(approval.capitalEuro,10000);
assert.equal(approval.maxNotionalEuroPerOrder,300);
assert.equal(approval.maxCapitalPercentPerProbe,3);
assert.equal(approval.maxOrdersPerDay,1);
assert.equal(approval.maxProbeAttemptsTotal,20);
assert.equal(approval.minTcaProbeNotionalEuro,250);
assert.equal(approval.maxSingleAssetWeightPercentForProbe,15);
assert.equal(approval.minCommitteeScore,70);
assert.equal(approval.minValidationDataConfidence,90);
assert.equal(approval.maxRiskScore,75);
assert.equal(approval.targetPaperFills,10);
assert.equal(approval.minCalendarDays,30);
assert.equal(approval.minEvidenceDays,25);
assert.equal(approval.allowBackfill,false);
assert.equal(approval.v6HistoricalFillsCredited,0);
assert.equal(approval.brokerConnectivityAllowed,false);
assert.equal(approval.liveTradingAllowed,false);
assert.equal(approval.approvalEvidence?.kind,"EXPLICIT_CHAT_OWNER_INSTRUCTION");
assert.equal(approval.approvalEvidence?.brokerOrdersExcluded,true);
assert.equal(approval.approvalEvidence?.liveTradingExcluded,true);
assert.equal(approval.approvalStatus,"PAPER_ONLY_TIME_BOUNDED_CORE_PINNED");
assert.equal(approval.effectiveFrom,approval.approvedAt);
assert.equal(approval.approvalExpires,approval.expiresAt);
const issued=Date.parse(approval.approvedAt),exp=Date.parse(approval.expiresAt);
assert.equal(approval.approvedAt,"2026-10-27T00:00:00.000Z");
assert.equal(approval.expiresAt,"2026-11-27T00:00:00.000Z");
assert(exp-issued>=30*86400_000&&exp-issued<=32*86400_000);
const snapshot=replayV7PhaseBLedger(ledger);
assert.equal(snapshot.valid,true);
assert(snapshot.fills<=10&&snapshot.attempts<=20);
assert.equal(ledger.liveTradingAllowed,false);
assert.equal(ledger.brokerConnectivityAllowed,false);
if(snapshot.attempts===0)assert.deepEqual(ledger,freshV7PhaseBLedger());
assert.equal(days.mode,"V7_PHASE_B_FORWARD_DAYS");
assert(Array.isArray(days.days));
assert(days.days.every((row,i)=>row.liveTradingAllowed===false
  &&row.brokerConnectivityAllowed===false
  &&(!i||days.days[i-1].date<row.date)
  &&row.date>=approval.approvedAt.slice(0,10)
  &&row.date<=approval.expiresAt.slice(0,10)));

assert.equal(legacy.approvalId,"fenice-paper-validation-v6-2026-09-24");
assert.equal(legacy.expiresAt,"2026-10-24T21:59:59.000Z");
assert.equal(legacy.liveTradingAllowed,false);
console.log(JSON.stringify({state:"V7_PHASE_B_BOUND_OWNER_PAPER_APPROVAL",
  coreSha256:frozen.digest,baselineCommit:approval.baselineCommit,
  effectiveFrom:approval.approvedAt,expiresAt:approval.expiresAt,
  capitalEuro:10000,oldV6FillsCredited:0,
  verifiedNewV7PaperFills:snapshot.fills,brokerConnectivityAllowed:false,liveTradingAllowed:false}));
