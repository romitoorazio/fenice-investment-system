import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeV7B2Fingerprint } from "../lib/trading/paper-v7-b2-fingerprint.mjs";
import { auditPhase9 } from "./audit-phase9-readiness.mjs";

const read = name => JSON.parse(readFileSync("data/" + name, "utf8"));
const approval = read("paper-v7-b2-approval.json");
const b2Ledger = read("paper-v7-b2-forward-ledger.json");
const b2Days = read("paper-v7-b2-forward-days.json");
const v8Status = read("paper-v8-technical-status.json");
const v8Days = read("paper-v8-technical-days.json");
const coverage = read("execution-market-coverage.json");
const fingerprint = await computeV7B2Fingerprint(".");
const nowIso = new Date().toISOString();
const strategyLedger=read("one-global-strategy-paper-ledger.json");
const base = {approval,b2Ledger,b2Days,v8Status,v8Days,coverage,
  fingerprint,baselineAncestor:true,nowIso,strategyLedger};
const run = changes => auditPhase9({...base,...changes});
const truth = run();
const technicalInputs = {
  v8Approval: read("paper-v8-technical-approval.json"),
  v8Samples: read("paper-v8-technical-samples.json"),
  shadowExitLedger: read("paper-v8-shadow-exits.json"),
};
const shadowTruth = run(technicalInputs);
// The technical ledger grows each trading day. Do not pin CI to the
// snapshot that existed when this test was first written.
const expectedTechnicalExits = technicalInputs.shadowExitLedger.events.length;
const expectedTechnicalPnl = Math.round(technicalInputs.shadowExitLedger.events
  .reduce((sum, event) => sum + event.realizedPnLEuro, 0) * 10000) / 10000;
assert.equal(shadowTruth.diagnostics.v8TechnicalRoundtripsObserved, expectedTechnicalExits);
assert.equal(shadowTruth.diagnostics.v8TechnicalRealizedNetEuro, expectedTechnicalPnl);
assert.equal(shadowTruth.state, "NOT_CERTIFIED");
assert.equal(shadowTruth.diagnostics.v8TechnicalExitsCreditedAsStrategyTrades, 0);
assert.equal(shadowTruth.requirements.closedForwardTrades.observed, 0);
const forgedExit = structuredClone(technicalInputs.shadowExitLedger);
forgedExit.events.push({ id: "forged", realizedPnLEuro: 1000000 });
assert(run({ ...technicalInputs, shadowExitLedger: forgedExit }).reasonCodes
  .includes("V8_TECHNICAL_EXIT_JOURNAL_INVALID"));

assert.equal(truth.state,"NOT_CERTIFIED");
assert.equal(truth.phase,9);
assert.equal(truth.requirements.closedForwardTrades.observed,0);
assert.equal(truth.requirements.certifiedExecutableSourceFamilies.observed,0);
assert.equal(truth.requirements.distinctTradeMarkets.observed,0);
assert.equal(truth.requirements.distinctForwardTradeDays.observed,0);
assert.equal(truth.diagnostics.oneGlobalForwardVirtualStrategy.status,"EMPTY_APPROVAL_REQUIRED");
assert.equal(truth.diagnostics.oneGlobalForwardVirtualStrategy.virtualBuys,0);
assert.equal(truth.diagnostics.oneGlobalForwardVirtualStrategy.closedVirtualRoundTrips,0);
assert.equal(truth.diagnostics.oneGlobalForwardVirtualStrategy.forwardStrategyCertificationCredit,0);
assert(truth.reasonCodes.includes("ONE_GLOBAL_INDEPENDENT_EXECUTION_RECEIPTS_MISSING"));
const injectedVirtual=run({strategyLedger:{...strategyLedger,cashEuro:10100}});
assert(injectedVirtual.reasonCodes.includes("ONE_GLOBAL_STRATEGY_JOURNAL_INVALID"));
assert.equal(injectedVirtual.requirements.closedForwardTrades.observed,0);
const missingStrategy=run({strategyLedger:null});
assert(missingStrategy.reasonCodes.includes("ONE_GLOBAL_STRATEGY_JOURNAL_NOT_PERSISTED"));
assert.equal(missingStrategy.state,"NOT_CERTIFIED");
assert.equal(truth.policy.liveTradingAllowed,false);
assert.equal(truth.policy.brokerConnectivityAllowed,false);
const deliberatelyMismatched = run({fingerprint:{...fingerprint,digest:"f".repeat(64)}});
assert(deliberatelyMismatched.reasonCodes.includes("B2_FROZEN_CORE_FINGERPRINT_NOT_PINNED"),
  "A changed core digest cannot silently be treated as approved.");
assert(truth.diagnostics.technicalQuoteSourceFamiliesObserved.includes("alpaca"));
assert(truth.diagnostics.technicalQuoteSourceFamiliesObserved.includes("twelve-data"));
assert.equal(truth.diagnostics.v8TechnicalDays, v8Days.records.filter(
  day => day.certificationScope === "V8_TECHNICAL_ONLY"
    && day.liveTradingAllowed === false && day.brokerConnectivityAllowed === false,
).length);
const coverageTime = Date.parse(coverage.generatedAt);
const nowTime = Date.parse(nowIso);
assert.equal(truth.diagnostics.coverageFresh, Number.isFinite(coverageTime)
  && coverageTime <= nowTime && nowTime - coverageTime <= 120000);
assert.equal(truth.diagnostics.b2BuyFillsCreditedAsClosedTrades,0);
assert.equal(truth.diagnostics.v8TechnicalSamplesCreditedAsForwardTrades,0);

// Even a synthetic re-pin is NOT a certification, and a test never updates
// the real approval file or pretends the owner signed the changed core.
const matchingApproval = {...approval,coreFingerprint:fingerprint};
const repinned = run({approval:matchingApproval});
assert.equal(repinned.diagnostics.b2FingerprintPinned,true);
assert.equal(repinned.requirements.closedForwardTrades.observed,0);
assert.equal(repinned.state,"NOT_CERTIFIED");

// Fresh dual-feed TECHNICAL observations never equate to executable market
// source certification, regardless of apparent green source coverage.
const freshCoverage = {...coverage,generatedAt:nowIso,
  rows:[{paperEligible:true,approvedIndependentPaperFamilies:["alpaca","twelve-data"]}]};
const dualFeed = run({coverage:freshCoverage});
assert.equal(dualFeed.diagnostics.coverageFresh,true);
assert.equal(dualFeed.diagnostics.freshPaperCoverageFamilies.length,2);
assert.equal(dualFeed.requirements.certifiedExecutableSourceFamilies.observed,0);

// A fabricated "filled" B2 attempt and 30 days of samples must not become
// an entry/exit trade, P/L, a proof of three markets, or any trading permission.
const forgedLedger = structuredClone(b2Ledger);
forgedLedger.attempts.push({symbol:"MSFT", status:"FILLED",action:"SELL",
  occurredAt:"2026-11-10T16:00:00.000Z"});
const forged = run({b2Ledger:forgedLedger,v8Status:{...v8Status,validDays:30}});
assert(forged.reasonCodes.includes("B2_LEDGER_INVALID"));
assert.equal(forged.requirements.closedForwardTrades.observed,0);
assert.equal(forged.state,"NOT_CERTIFIED");

const breached = run({approval:{...approval,liveTradingAllowed:true}});
assert(breached.reasonCodes.includes("LIVE_OR_BROKER_SAFETY_FAILURE"));
const corruptedDays=run({b2Days:{...b2Days,days:[...b2Days.days].reverse()}});
assert(corruptedDays.reasonCodes.includes("B2_DAY_EVIDENCE_INVALID"));
const future=run({coverage:{...coverage,generatedAt:new Date(Date.parse(nowIso)+86400000).toISOString()}});
assert.equal(future.diagnostics.coverageFresh,false);
const invalidClock=run({nowIso:"NOT_A_CLOCK"});
assert(invalidClock.reasonCodes.includes("AUDIT_CLOCK_INVALID"));
console.log("Phase 9 truthful evidence audit: PASS (11 negative/positive safeguards, no backfill, broker off)");
