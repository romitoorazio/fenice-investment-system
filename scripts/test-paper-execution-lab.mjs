import assert from "node:assert/strict";
import {
  freshExecutionLabLedger, replayExecutionLabLedger, runExecutionLab,
} from "./run-paper-execution-lab.mjs";

const nowIso = "2026-11-03T17:40:00.000Z";
const now = Date.parse(nowIso);
const ago = seconds => new Date(now - seconds * 1000).toISOString();
const symbols = ["SPY", "QQQ", "MSFT", "AAPL"];
const row = symbol => ({
  symbol, paperEligible: true, state: "CAUTION", equityOrEtf: true,
  medianPrice: 400, maxSpreadPercent: 0.1, independentSourceFamilies: 2,
  sourceFamilies: ["alpaca", "twelve-data"],
  approvedIndependentPaperFamilies: ["alpaca", "twelve-data"],
  staleEvidence: 0, invalidEvidence: 0,
});
const base = () => ({
  ledger: freshExecutionLabLedger(),
  nowIso,
  session: {
    configured: true, liveTradingAllowed: false,
    evidence: { venue: "US_EQUITIES", state: "OPEN", authoritative: true, observedAt: ago(10) },
    decision: { allowed: true }, nextClose: "2026-11-03T21:00:00.000Z",
  },
  coverage: {
    generatedAt: ago(15), paperEligibleSymbols: 4,
    policy: { liveTradingAllowed: false, minIndependentSourceFamilies: 2 },
    rows: symbols.map(row),
  },
  fx: {
    generatedAt: ago(20), baseCurrency: "EUR", provider: "twelve-data",
    provenanceVerified: true, maxAgeSeconds: 120,
    liveTradingAllowed: false, brokerConnectivityAllowed: false,
    ratesToEuro: { USD: { rate: 0.9, observedAt: ago(30), source: "Twelve Data /exchange_rate USD/EUR" } },
  },
});

const result = runExecutionLab(base());
assert.equal(result.status, "SIMULATED_EXECUTION");
assert.equal(result.simulatedExecutionsAdded, 1);
assert.equal(result.ledger.events.length, 1);
assert.equal(result.ledger.events[0].status, "SIMULATED_EXECUTION");
assert.equal(result.ledger.events[0].simulated, true);
assert.equal(result.ledger.events[0].certificationCredit, 0);
assert.equal(result.certificationCredit, 0);
assert.equal(result.liveTradingAllowed, false);
assert.equal(result.brokerConnectivityAllowed, false);
assert(result.ledger.events[0].notionalEuro >= 250);
assert(result.ledger.events[0].notionalEuro <= 300);
assert(result.ledger.events[0].evidenceSha256.length === 64);
assert.equal(replayExecutionLabLedger(result.ledger).valid, true);
const again = runExecutionLab({ ...base(), ledger: result.ledger });
assert.equal(again.simulatedExecutionsAdded, 0);
assert.equal(again.reason, "ALREADY_SAMPLED_THIS_UTC_DAY");

const bad = [
  ["closed venue", b => b.session.evidence.state = "CLOSED", "NO_FRESH_AUTHORITATIVE_OPEN_SESSION"],
  ["unverified venue", b => b.session.evidence.authoritative = false, "NO_FRESH_AUTHORITATIVE_OPEN_SESSION"],
  ["future market timestamp", b => b.session.evidence.observedAt = new Date(now + 60000).toISOString(), "NO_FRESH_AUTHORITATIVE_OPEN_SESSION"],
  ["old market clock", b => b.session.evidence.observedAt = ago(121), "NO_FRESH_AUTHORITATIVE_OPEN_SESSION"],
  ["market near close", b => b.session.nextClose = new Date(now + 240000).toISOString(), "NO_FRESH_AUTHORITATIVE_OPEN_SESSION"],
  ["stale provider coverage", b => b.coverage.generatedAt = ago(121), "NO_FRESH_DUAL_PROVIDER_COVERAGE"],
  ["LIVE price data", b => b.coverage.policy.liveTradingAllowed = true, "NO_FRESH_DUAL_PROVIDER_COVERAGE"],
  ["too few eligible", b => b.coverage.paperEligibleSymbols = 2, "NO_FRESH_DUAL_PROVIDER_COVERAGE"],
  ["stale fx", b => b.fx.ratesToEuro.USD.observedAt = ago(121), "NO_FRESH_VERIFIED_USD_EUR"],
  ["fake fx provenance", b => b.fx.provenanceVerified = false, "NO_FRESH_VERIFIED_USD_EUR"],
  ["future fx timestamp", b => b.fx.ratesToEuro.USD.observedAt = new Date(now + 5000).toISOString(), "NO_FRESH_VERIFIED_USD_EUR"],
  ["fx live leak", b => b.fx.liveTradingAllowed = true, "NO_FRESH_VERIFIED_USD_EUR"],
  ["single provider", b => b.coverage.rows.forEach(x => x.sourceFamilies = ["alpaca"]), "NO_THREE_VERIFIED_ELIGIBLE_INSTRUMENTS"],
  ["wide source spreads", b => b.coverage.rows.forEach(x => x.maxSpreadPercent = 5), "NO_THREE_VERIFIED_ELIGIBLE_INSTRUMENTS"],
  ["missing source admission", b => b.coverage.rows.forEach(x => x.approvedIndependentPaperFamilies = []), "NO_THREE_VERIFIED_ELIGIBLE_INSTRUMENTS"],
  ["bad source error", b => b.coverage.rows.forEach(x => x.invalidEvidence = 1), "NO_THREE_VERIFIED_ELIGIBLE_INSTRUMENTS"],
];
for (const [name, mutate, reason] of bad) {
  const input = base();
  mutate(input);
  const got = runExecutionLab(input);
  assert.equal(got.status, "BLOCKED", name);
  assert.equal(got.reason, reason, name);
  assert.equal(got.ledger.events.length, 0, name);
  assert.equal(got.certificationCredit, 0, name);
}
const tampered = structuredClone(result.ledger);
tampered.events[0].notionalEuro = 10000;
assert.equal(replayExecutionLabLedger(tampered).valid, false);
assert.throws(() => runExecutionLab({ ...base(), ledger: tampered }), /ENGINEERING_LEDGER_INTEGRITY/);
const falseLive = structuredClone(result.ledger);
falseLive.liveTradingAllowed = true;
assert.equal(replayExecutionLabLedger(falseLive).valid, false);
const fakeB2 = structuredClone(result.ledger);
fakeB2.mode = "V7_PHASE_B_FORWARD_PAPER";
assert.equal(replayExecutionLabLedger(fakeB2).valid, false);

// Prospectively advance ten distinct UTC days with live-window-shaped fixtures,
// never copy the synthetic test data to the production ledger.
let ledger = freshExecutionLabLedger();
for (let day = 1; day <= 10; day++) {
  const utc = new Date(Date.UTC(2026, 10, day + 2, 17, 40, 0)).toISOString();
  const b = base();
  const shifted = Date.parse(utc);
  b.nowIso = utc;
  b.session.evidence.observedAt = new Date(shifted - 10_000).toISOString();
  b.session.nextClose = new Date(shifted + 3 * 3600000).toISOString();
  b.coverage.generatedAt = new Date(shifted - 15_000).toISOString();
  b.fx.generatedAt = new Date(shifted - 20_000).toISOString();
  b.fx.ratesToEuro.USD.observedAt = new Date(shifted - 30_000).toISOString();
  b.ledger = ledger;
  const next = runExecutionLab(b);
  assert.equal(next.status, "SIMULATED_EXECUTION", "fixture day " + day);
  ledger = next.ledger;
}
assert.equal(replayExecutionLabLedger(ledger).simulatedExecutions, 10);
assert.equal(runExecutionLab({ ...base(), ledger }).reason, "ENGINEERING_SAMPLE_TARGET_REACHED");
console.log("Engineering execution lab tests: PASS (10 synthetic fixture days, tamper, close, stale, future, quorum, FX, LIVE lock).");
console.log("Synthetic tests produce NO certification/PAPER credit and do NOT change persisted ledger.");
