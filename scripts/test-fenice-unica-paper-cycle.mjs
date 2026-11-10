import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {evaluatePaperCycle} from "./fenice-unica-paper-cycle.mjs";
const read=name=>JSON.parse(readFileSync(new URL("../data/"+name,import.meta.url),"utf8"));
const inputs={
 committee:read("investment-committee.json"),terminal:read("terminal-intelligence.json"),
 coverage:read("execution-market-coverage.json"),approval:read("paper-v7-b2-approval.json"),
 b2Ledger:read("paper-v7-b2-forward-ledger.json"),b2Days:read("paper-v7-b2-forward-days.json"),
 v8Status:read("paper-v8-technical-status.json"),
 worldLedger:read("world-v7-validation-ledger.json"),
 v8Approval:read("paper-v8-technical-approval.json"),
 v8Days:read("paper-v8-technical-days.json"),
 v8Samples:read("paper-v8-technical-samples.json"),
 v8Exits:read("paper-v8-shadow-exits.json"),
 nowIso:"2026-11-10T18:44:00.000Z"
};
const report=evaluatePaperCycle(inputs);
assert.equal(report.safeguards.readOnly,true);
assert.equal(report.safeguards.liveTradingAllowed,false);
assert.equal(report.safeguards.brokerConnectivityAllowed,false);
assert.equal(report.safeguards.creditsTechnicalSamplesAsStrategyFills,false);
assert.equal(report.strategyPaper.b2Attempts,inputs.b2Ledger.attempts.length);
assert.equal(report.strategyPaper.verifiedB2Days,
  inputs.b2Days.days.filter(x=>x.validatedForwardDay===true
    &&x.marketEvidenceValid===true).length,
  "B2 forward days are marked validatedForwardDay, not validDay");
assert(report.strategyPaper.verifiedB2Days>=2);
assert.equal(report.strategyPaper.legacyCampaignStatus,"ARCHIVED_DIAGNOSTICS_ONLY");
assert.equal(report.strategyPaper.fillsCreditedToV8,0);
assert.equal(report.technicalPaper.sourceHistoryReplayVerified,true);
assert.equal(report.technicalPaper.technicalExitCount,inputs.v8Exits.events.length);
assert.equal(report.technicalPaper.realizedNetEuro,
  Math.round(inputs.v8Exits.events.reduce((n,e)=>n+e.realizedPnLEuro,0)*10000)/10000);
assert(report.technicalPaper.unrealizedAsOfEuro===null
  ||Number.isFinite(report.technicalPaper.unrealizedAsOfEuro));
assert.equal(typeof report.technicalPaper.unrealizedMarksCurrent,"boolean");
assert.equal(report.operations.activePaperEngine,"V8_TECHNICAL_PAPER");
assert.equal(report.operations.phase9CertifiedStrategyRoundtrips,0);
assert.equal(report.operations.globalMarketsEligibleForExecutablePaper,
  Object.values(inputs.worldLedger.venues).filter(v=>v.paperEligible===true).length);
assert.equal(report.safeguards.technicalExitsCreditedAsPhase9Trades,false);
const forged=structuredClone(inputs);
forged.v8Exits.events[0].realizedPnLEuro=1000000;
assert.throws(()=>evaluatePaperCycle(forged),/ONE_GLOBAL_V8_SOURCE_REPLAY_FAILED/);
const legacyFraud=structuredClone(inputs);
legacyFraud.b2Ledger.cashEuro=123456;
assert.throws(()=>evaluatePaperCycle(legacyFraud),/ONE_GLOBAL_B2_AUDIT_INVALID/);
assert.equal(report.technicalPaper.technicalSamples,inputs.v8Status.validTechnicalSamples);
assert.equal(report.world.certifiedWorldPaperFills,inputs.worldLedger.summary.certifiedPaperFills);
assert.equal(report.candidates.length,inputs.coverage.rows.length);
const spy=report.candidates.find(x=>x.symbol==="SPY");
if(spy && spy.committeeScore<Number(inputs.approval.minCommitteeScore??70))
 assert(spy.reasons.includes("COMMITTEE_SCORE_BELOW_MIN"));
const broken=structuredClone(inputs);
broken.coverage.rows=broken.coverage.rows.map(x=>({...x,paperEligible:false}));
assert.equal(evaluatePaperCycle(broken).strategyPaper.preliminaryEligibleCount,0);
console.log("Fenice Unica PAPER cycle diagnostics: PASS");
