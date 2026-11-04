import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {evaluatePaperCycle} from "./fenice-unica-paper-cycle.mjs";
const read=name=>JSON.parse(readFileSync(new URL("../data/"+name,import.meta.url),"utf8"));
const inputs={
 committee:read("investment-committee.json"),terminal:read("terminal-intelligence.json"),
 coverage:read("execution-market-coverage.json"),approval:read("paper-v7-b2-approval.json"),
 b2Ledger:read("paper-v7-b2-forward-ledger.json"),b2Days:read("paper-v7-b2-forward-days.json"),
 v8Status:read("paper-v8-technical-status.json"),worldLedger:read("world-v7-validation-ledger.json")
};
const report=evaluatePaperCycle(inputs);
assert.equal(report.safeguards.readOnly,true);
assert.equal(report.safeguards.liveTradingAllowed,false);
assert.equal(report.safeguards.brokerConnectivityAllowed,false);
assert.equal(report.safeguards.creditsTechnicalSamplesAsStrategyFills,false);
assert.equal(report.strategyPaper.b2Attempts,inputs.b2Ledger.attempts.length);
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
