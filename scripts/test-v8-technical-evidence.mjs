import assert from "node:assert/strict";
import {
  PINNED_V8_FILES, buildV8Proof, replayV8Days, assessV8,
} from "./run-v8-technical-evidence.mjs";
import { freshExecutionLabLedger, runExecutionLab } from "./run-paper-execution-lab.mjs";

const start = "2026-11-03T19:35:00.000Z";
const at = "2026-11-04T17:30:00.000Z";
const isoBefore = (at, seconds) => new Date(Date.parse(at) - seconds * 1000).toISOString();
const approved = {
  campaignId: "fenice-v8-paper-technical-20261103",
  approved: true, humanConfirmation: true, mode: "PAPER_TECHNICAL_V8",
  prospectiveOnly: true, allowBackfill: false,
  minCalendarDays: 30, minEvidenceDays: 25,
  minTechnicalSamples: 10, maxTechnicalSamples: 10,
  minIndependentSourceFamilies: 2, creditTowardV6: false,
  creditTowardB2: false, liveTradingAllowed: false, brokerConnectivityAllowed: false,
  baselineCommit: "a".repeat(40),
  effectiveFrom: start, expiresAt: "2027-01-03T19:35:00.000Z",
  coreFileBlobs: Object.fromEntries(PINNED_V8_FILES.map(path => [path, "b".repeat(40)])),
};
const core = { ...approved.coreFileBlobs };
const freshDays = () => ({
  version: 1, mode: "V8_TECHNICAL_PAPER_DAYS",
  campaignId: approved.campaignId, records: [],
  liveTradingAllowed: false, brokerConnectivityAllowed: false,
});
function data(nowIso = at) {
  const before = sec => isoBefore(nowIso, sec);
  const symbols = ["SPY", "QQQ", "MSFT", "AAPL"];
  return {
    session: {
      configured: true, liveTradingAllowed: false,
      evidence: {
        state: "OPEN", venue: "US_EQUITIES", authoritative: true,
        observedAt: before(8),
      },
      decision: { allowed: true },
      nextClose: new Date(Date.parse(nowIso) + 1_000_000).toISOString(),
    },
    coverage: {
      generatedAt: before(14), paperEligibleSymbols: 4,
      policy: { liveTradingAllowed: false, minIndependentSourceFamilies: 2 },
      rows: symbols.map(symbol => ({
        symbol, paperEligible: true, state: "CAUTION",
        independentSourceFamilies: 2, medianPrice: 400,
        maxSpreadPercent: 0.01, staleEvidence: 0, invalidEvidence: 0,
        sourceFamilies: ["alpaca", "twelve-data"],
        approvedIndependentPaperFamilies: ["alpaca", "twelve-data"],
      })),
    },
    executionEvidence: {
      generatedAt: before(12), policy: { liveTradingAllowed: false },
      observations: symbols.flatMap(symbol => [
        {
          symbol, currency: "USD", sourceFamily: "alpaca", eligibility: "PAPER",
          provenanceVerified: true, provenanceMethod: "authenticated-alpaca-iex-latest-quote",
          price: 399.98, observedAt: before(20),
        },
        {
          symbol, currency: "USD", sourceFamily: "twelve-data", eligibility: "PAPER",
          provenanceVerified: true, provenanceMethod: "provider-batch-quote-last_quote_at-us-realtime-venue",
          price: 400.02, observedAt: before(25),
        },
      ]),
    },
    fx: {
      generatedAt: before(16), provider: "twelve-data", baseCurrency: "EUR",
      provenanceVerified: true, maxAgeSeconds: 120,
      brokerConnectivityAllowed: false, liveTradingAllowed: false,
      ratesToEuro: { USD: { observedAt: before(30), rate: 0.9 } },
    },
  };
}
const args = (nowIso = at, days = freshDays(), lab = freshExecutionLabLedger()) => ({
  approval: approved, observedCoreBlobs: core, days, lab, ...data(nowIso), nowIso,
});
const readySource = buildV8Proof({ ...data(), nowIso: at });
assert.equal(readySource.valid, true);
const result = assessV8(args());
assert.equal(result.status, "COLLECTING");
assert.equal(result.newValidDay, true);
assert.equal(result.validDays, 1);
assert.equal(result.validTechnicalSamples, 0);
assert.equal(result.countsTowardB2, false);
assert.equal(result.readyForTechnicalReview, false);
assert.equal(replayV8Days(result.days, approved).valid, true);

const dup = assessV8(args(at, result.days));
assert.equal(dup.newValidDay, false);
assert.equal(dup.validDays, 1);
const badApproval = structuredClone(approved);
badApproval.approved = false;
assert.equal(assessV8({ ...args(), approval: badApproval }).reason, "NOT_APPROVED_OR_POLICY_CHANGED");
const short = structuredClone(approved);
short.minCalendarDays = 0;
assert.equal(assessV8({ ...args(), approval: short }).status, "BLOCKED");
const badCore = { ...core, [PINNED_V8_FILES[0]]: "c".repeat(40) };
assert.equal(assessV8({ ...args(), observedCoreBlobs: badCore }).reason, "V8_PINNED_CORE_CHANGED");
const stale = args();
stale.executionEvidence.observations.forEach(q => { q.observedAt = isoBefore(at, 129); });
assert.equal(assessV8(stale).newValidDay, false);
assert.equal(assessV8(stale).reason, "FRESH_DUAL_PROVIDER_OPEN_PROOF_MISSING");
const future = args();
future.session.evidence.observedAt = new Date(Date.parse(at) + 10_000).toISOString();
assert.equal(assessV8(future).newValidDay, false);
const noQuorum = args();
noQuorum.executionEvidence.observations = noQuorum.executionEvidence.observations
  .filter(q => q.sourceFamily === "alpaca");
assert.equal(assessV8(noQuorum).newValidDay, false);
const tamper = structuredClone(result.days);
tamper.records[0].proof.instruments[0].medianPrice = 199;
assert.equal(replayV8Days(tamper, approved).valid, false);

let ledger = freshExecutionLabLedger();
let days = freshDays();
// Ten truly simulated engineering samples in synthetic TEST fixtures, not
// capital-market outcomes and never written to actual production datasets.
for (let index = 0; index < 31; index++) {
  const nowIso = new Date(Date.parse("2026-11-04T17:30:00.000Z") + index * 86400000).toISOString();
  const evidence = data(nowIso);
  if (index < 10) {
    const trade = runExecutionLab({
      nowIso, ledger, ...evidence,
    });
    assert.equal(trade.status, "SIMULATED_EXECUTION");
    ledger = trade.ledger;
  }
  const measured = assessV8({
    approval: approved, observedCoreBlobs: core, days, lab: ledger,
    ...evidence, nowIso,
  });
  assert.equal(measured.newValidDay, true, "fixture day " + index);
  days = measured.days;
  if (index === 24) {
    assert.equal(measured.validDays, 25);
    assert.equal(measured.readyForTechnicalReview, false, "30-day minimum not elapsed");
  }
  if (index === 30) {
    assert.equal(measured.validDays, 31);
    assert.equal(measured.validTechnicalSamples, 10);
    assert.equal(measured.readyForTechnicalReview, true);
    assert.equal(measured.investmentSignalQualityCertified, false);
    assert.equal(measured.countsTowardB2, false);
    assert.equal(measured.status, "READY_FOR_INDEPENDENT_TECHNICAL_REVIEW");
  }
}
assert.equal(replayV8Days(days, approved).valid, true);
const afterApproval = approved.effectiveFrom;
const beforeApproval = "2026-11-02T17:30:00.000Z";
const tooEarly = assessV8(args(beforeApproval));
assert.equal(tooEarly.reason, "OUTSIDE_APPROVED_WINDOW");
assert.equal(approved.effectiveFrom, afterApproval);
console.log("V8 PAPER-only technical methodology: PASS");
console.log("Prospective 30-day/25-day/10-sample contract, B2/V6 isolation and safety verified with offline fixtures.");
