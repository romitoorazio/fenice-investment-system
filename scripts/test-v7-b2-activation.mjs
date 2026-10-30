import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { computeV7B2Fingerprint } from "../lib/trading/paper-v7-b2-fingerprint.mjs";
import { replayV7PhaseBLedger } from "../lib/trading/paper-v7-phase-b-v6-parity.mjs";

const read=name=>JSON.parse(readFileSync("data/"+name,"utf8"));
const a=read("paper-v7-b2-approval.json");
const prior=read("paper-v7-phase-b-approval.json");
const oldLedger=read("paper-v7-phase-b-forward-ledger.json");
const oldDays=read("paper-v7-phase-b-forward-days.json");
const ledger=read("paper-v7-b2-forward-ledger.json");
const days=read("paper-v7-b2-forward-days.json");
const observed=await computeV7B2Fingerprint(".");
const oldDigest="74e09c42bc39b1dd0f5354783e22f63b8b9e9a34aba4cfc3490765455e838c79";
assert.equal(a.approved,true);
assert.equal(a.humanConfirmation,true);
assert.equal(a.mode,"PAPER");
assert.equal(a.consentSource.includes("Vai al prossimo passaggio"),true);
assert.equal(a.approvalEvidence.kind,"EXPLICIT_CHAT_OWNER_INSTRUCTION");
assert.equal(a.approvalEvidence.signedForExactMainCommit,a.baselineCommit);
assert.equal(a.approvalEvidence.paidDataServicesAuthorized,false);
assert.equal(a.approvalEvidence.previousV6AndV7PhaseBHistoryPreserved,true);
assert.equal(a.approvalEvidence.initialPaperFillsCredited,0);
assert.equal(a.coreFingerprint.algorithm,"sha256");
assert.equal(a.coreFingerprint.complete,true);
assert.equal(a.coreFingerprint.digest,observed.digest,
  "approval must pin exact final B2 core, never inherited V7 Phase B digest");
assert.equal(a.coreFingerprint.domain,observed.domain);
assert.deepEqual(a.coreFingerprint.files,observed.files);
assert.notEqual(a.coreFingerprint.digest,oldDigest);
assert.equal(prior.coreFingerprint.digest,oldDigest,"previous Phase B approval must be unchanged");
assert.equal(prior.approved,true);
assert.equal(oldLedger.liveTradingAllowed,false);
assert.equal(oldDays.liveTradingAllowed,false);
assert(oldDays.days.length>=3,"original forward audit history must remain");
assert.equal(a.liveTradingAllowed,false);
assert.equal(a.brokerConnectivityAllowed,false);
assert.equal(a.allowBackfill,false);
assert.equal(a.v6HistoricalFillsCredited,0);
assert.equal(a.maxOrdersPerDay,1);
assert.equal(a.minCommitteeScore,70);
assert.equal(a.minValidationDataConfidence,90);
assert.equal(a.maxRiskScore,75);
assert.equal(a.minCalendarDays,30);
assert.equal(a.minEvidenceDays,25);
assert.equal(a.targetPaperFills,10);
assert.equal(a.maxNotionalEuroPerOrder,300);
assert.equal(a.minTcaProbeNotionalEuro,250);
assert.equal(a.fxPolicy.maxAgeSeconds,120);
assert.equal(a.approvedAt,"2026-11-02T14:30:00.000Z");
assert.equal(a.expiresAt,"2026-12-17T14:30:00.000Z");
assert(Date.parse(a.expiresAt)-Date.parse(a.approvedAt)>=30*86400000);
assert(/^[a-f0-9]{40}$/.test(a.baselineCommit));
execFileSync("git",["merge-base","--is-ancestor",a.baselineCommit,"HEAD"],{stdio:"ignore"});
assert.equal(replayV7PhaseBLedger(ledger).valid,true);
assert.equal(days.campaignId,a.approvalId);
assert(ledger.attempts.every(e=>e.id.startsWith(a.idPrefix)
  &&e.occurredAt>=a.approvedAt&&e.liveTradingAllowed===false
  &&e.brokerConnectivityAllowed===false));
assert(days.days.every(d=>d.date>=a.approvedAt.slice(0,10)
  &&d.liveTradingAllowed===false&&d.brokerConnectivityAllowed===false));
console.log("FENICE V7 B2 approval exact-core/commit and old-history isolation: PASS; digest="+observed.digest
  +"; baseline="+a.baselineCommit+"; LIVE=false; no backfill");
