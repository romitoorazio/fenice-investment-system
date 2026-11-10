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
const nowIso = "2026-11-10T17:00:00.000Z";
const base = {approval,b2Ledger,b2Days,v8Status,v8Days,coverage,
  fingerprint,baselineAncestor:true,nowIso};
const run = changes => auditPhase9({...base,...changes});
const truth = run();
assert.equal(truth.state,"NOT_CERTIFIED");
assert.equal(truth.phase,9);
assert.equal(truth.requirements.closedForwardTrades.observed,0);
assert.equal(truth.requirements.certifiedExecutableSourceFamilies.observed,0);
assert.equal(truth.requirements.distinctTradeMarkets.observed,0);
assert.equal(truth.requirements.distinctForwardTradeDays.observed,0);
assert.equal(truth.policy.liveTradingAllowed,false);
assert.equal(truth.policy.brokerConnectivityAllowed,false);
assert(truth.reasonCodes.includes("B2_FROZEN_CORE_FINGERPRINT_NOT_PINN"),
  "The changed pinned Twelve Data intake cannot silently be treated as approved.");
assert(truth.diagnostics.technicalQuoteSourceFamiliesObserved.includes("alpaca"));
assert(truth.diagnostics.technicalQuoteSourceFamiliesObserved.includes("twelve-data"));
assert.equal(truth.diagnostics.v8TechnicalDays,6);
assert.equal(truth.diagnostics.coverageFresh,false);
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
const future=run({coverage:{...coverage,generatedAt:"2026-11-11T10:00:00.000Z"}});
assert.equal(future.diagnostics.coverageFresh,false);
const invalidClock=run({nowIso:"NOT_A_CLOCK"});
assert(invalidClock.reasonCodes.includes("AUDIT_CLOCK_INVALID"));
console.log("Phase 9 truthful evidence audit: PASS (11 negative/positive safeguards, no backfill, broker off)");
