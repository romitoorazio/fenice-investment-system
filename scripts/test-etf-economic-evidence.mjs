import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assessEtfEconomicEvidence } from "../lib/intelligence/etf-economic-evidence.mjs";

const nowMs = Date.parse("2026-10-26T15:00:00.000Z");
const strategy = (id, annualized, overrides = {}) => ({
  id, annualizedReturnPercent: annualized, maxDrawdownPercent: -15,
  observations: 500, trades: id === "buy-hold" ? 1 : 5,
  benchmarkAnnualizedReturnPercent: 15,
  transactionCostPercent: 0.1, ...overrides,
});
const sample = {
  symbol: "SPY", assetClass: "ETF", valuation: {
    status: "non applicabile", score: 50, confidence: 100,
  },
  technical: {
    observedAt: "2026-10-23T13:30:00.000Z",
    strategies: [
      strategy("buy-hold", 16),
      strategy("trend-50-200", 8),
      strategy("trend-20-100", 11),
    ],
  },
};
const original = JSON.stringify(sample);
const assessed = assessEtfEconomicEvidence(sample, { nowMs });
assert.equal(JSON.stringify(sample), original, "Never mutate source evidence");
assert.equal(assessed.status, "ECONOMIC_VALUATION_NOT_ESTABLISHED");
assert.equal(assessed.issuerExpenseRatioPercent, null);
assert.equal(assessed.trackingDifferenceAnnualPercent, null);
assert.equal(assessed.benchmarkIndex, null);
assert.equal(assessed.instrumentLookthroughValuation, null);
assert.equal(assessed.legacyCommitteeValuationScoreIsNeutralFallback, true);
assert(assessed.missingEvidence.includes("ISSUER_EXPENSE_RATIO"));
assert(assessed.missingEvidence.includes("FORWARD_NET_ALPHA_VS_BENCHMARK"));
assert.equal(assessed.historicalComparison.state, "HISTORICAL_INDICATIVE_ONLY");
assert.equal(assessed.historicalComparison.referenceAnnualizedReturnPercent, 16);
assert.equal(assessed.historicalComparison.bestAlternativeStrategy, "trend-20-100");
assert.equal(assessed.historicalComparison.alternativeMinusBuyHoldAnnualizedPoints, -5);
assert.equal(assessed.historicalComparison.identicalActualDateWindowVerified, false);
assert.equal(assessed.historicalComparison.independentlyForwardValidated, false);
for (const field of ["changesCommitteeScore", "unlocksResearchBuy",
  "paperCertificationEligible", "brokerSubmissionAllowed", "liveTradingAllowed"])
  assert.equal(assessed[field], false, field);

assert.equal(assessEtfEconomicEvidence({ ...sample, assetClass: "Azioni" }, { nowMs }), null);
assert.equal(assessEtfEconomicEvidence(null, { nowMs }), null);
assert.throws(() => assessEtfEconomicEvidence(sample, {nowMs: NaN}), /INVALID_ETF_RESEARCH_CLOCK/);
assert.throws(() => assessEtfEconomicEvidence(sample, {nowMs: 0}), /INVALID_ETF_RESEARCH_CLOCK/);

// Missing/future/invalid timestamps and missing or incomparable historical
// observations may NEVER be reconstructed as an ETF alpha claim.
const rejects = [
  x => { x.technical.observedAt = "2026-10-27T13:30:00.000Z"; },
  x => { x.technical.observedAt = "2026-02-30T13:30:00.000Z"; },
  x => { x.technical.observedAt = "2026-09-23T13:30:00.000Z"; },
  x => { x.technical.observedAt = null; },
  x => { x.technical.strategies[0].annualizedReturnPercent = null; },
  x => { x.technical.strategies[0].transactionCostPercent = "0.1"; },
  x => { x.technical.strategies[0].benchmarkAnnualizedReturnPercent = null; },
  x => { x.technical.strategies[0].observations = 99; },
  x => { x.technical.strategies[1].observations = 499; x.technical.strategies[2].observations = 499; },
  x => { x.technical.strategies[1].transactionCostPercent = 0.4; x.technical.strategies[2].transactionCostPercent = 0.4; },
  x => { x.technical.strategies[1].benchmarkAnnualizedReturnPercent = 17; x.technical.strategies[2].benchmarkAnnualizedReturnPercent = 17; },
  x => { x.technical.strategies[1].annualizedReturnPercent = Infinity; x.technical.strategies[2].annualizedReturnPercent = NaN; },
];
for (const mutate of rejects) {
  const candidate = structuredClone(sample);
  mutate(candidate);
  const rejected = assessEtfEconomicEvidence(candidate, { nowMs });
  assert.equal(rejected.historicalComparison, null);
  assert.equal(rejected.status, "ECONOMIC_VALUATION_NOT_ESTABLISHED");
  assert.equal(rejected.unlocksResearchBuy, false);
}

// Issuer-verified SPY/QQQ/IWM costs require exact ETF name, USD and fresh evidence.
const issuerCases = [
  ["SPY", "S&P 500 ETF", 0.0945, "S&P 500 Index", "GROSS_EXPENSE_RATIO", "ssga.com"],
  ["QQQ", "Nasdaq 100 ETF", 0.18, "Nasdaq-100 Index", "TOTAL_EXPENSE_RATIO", "invesco.com"],
  ["IWM", "Russell 2000 ETF", 0.19, "Russell 2000 Index", "EXPENSE_RATIO_AS_IN_PROSPECTUS", "ishares.com"],
];
for (const [symbol, name, ratio, index, kind, host] of issuerCases) {
  const row = { ...sample, symbol, name, currency: "USD" };
  const evidence = assessEtfEconomicEvidence(row, {nowMs});
  assert.equal(evidence.issuerExpenseRatioPercent, ratio);
  assert.equal(evidence.issuerExpenseRatioKind, kind);
  assert.equal(evidence.benchmarkIndex, index);
  assert.equal(evidence.issuerSourceCheckedOn, "2026-10-26");
  assert.equal(evidence.issuerEvidenceState, "PRIMARY_ISSUER_PAGE_CHECKED");
  assert.equal(new URL(evidence.issuerSourceUrl).hostname.endsWith(host), true);
  assert.equal(evidence.costsVerifiedAgainstIssuer, true);
  assert(!evidence.missingEvidence.includes("ISSUER_EXPENSE_RATIO"));
  assert(evidence.missingEvidence.includes("TRACKING_DIFFERENCE"));
  assert(evidence.missingEvidence.includes("ACTUAL_BROKER_FEES_AND_FX"));
  assert.equal(evidence.trackingDifferenceAnnualPercent, null);
  assert.equal(evidence.changesCommitteeScore, false);
  assert.equal(evidence.unlocksResearchBuy, false);
  assert.equal(evidence.liveTradingAllowed, false);
  for (const spoof of [
    {...row, name: "Other ETF"},
    {...row, currency: "EUR"},
    {...row, assetClass: "Stock"},
  ]) {
    const bad = assessEtfEconomicEvidence(spoof, {nowMs});
    assert.equal(bad?.issuerExpenseRatioPercent ?? null, null);
  }
  const outdated = assessEtfEconomicEvidence(row, {nowMs: Date.parse("2027-02-26T15:00:00Z")});
  assert.equal(outdated.issuerExpenseRatioPercent, null, "stale issuer evidence must expire");
  const future = assessEtfEconomicEvidence(row, {nowMs: Date.parse("2026-10-25T15:00:00Z")});
  assert.equal(future.issuerExpenseRatioPercent, null, "future checkedOn is not valid evidence");
}
const otherEtf = assessEtfEconomicEvidence({...sample,symbol:"XTEST",name:"Other ETF",currency:"USD"}, {nowMs});
assert.equal(otherEtf.issuerSourceUrl,null);

// Even an impressive historical backtest can never create execution rights.
const winner = structuredClone(sample);
winner.technical.strategies[1].annualizedReturnPercent = 45;
const optimistic = assessEtfEconomicEvidence(winner, { nowMs });
assert.equal(optimistic.historicalComparison.alternativeMinusBuyHoldAnnualizedPoints, 29);
assert.equal(optimistic.paperCertificationEligible, false);
assert.equal(optimistic.changesCommitteeScore, false);

const runner = await readFile(new URL("./run-investment-committee.mjs", import.meta.url), "utf8");
const page = await readFile(new URL("../app/committee/page.tsx", import.meta.url), "utf8");
const campaign = JSON.parse(await readFile(new URL("../data/paper-validation-campaign.json", import.meta.url), "utf8"));
assert.match(runner, /assessEtfEconomicEvidence/);
assert.match(runner, /etfEconomics,/);
assert.match(page, /item\.etfEconomics/);
assert.match(page, /ETF · evidenze economiche/);
assert.equal(campaign.liveTradingAllowed, false);
for(const name of [
  "lib/intelligence/etf-economic-evidence.mjs",
  "lib/intelligence/etf-issuer-reference.mjs",
  "scripts/test-etf-economic-evidence.mjs",
  "scripts/run-investment-committee.mjs",
  "app/committee/page.tsx",
  ".github/workflows/etf-economic-evidence.yml",
]) assert.equal(campaign.baselineFingerprint.files.includes(name), false, "Must not touch V6 fingerprint: " + name);
console.log("ETF economic evidence: PASS (neutral fallback is not valuation, no BUY/PAPER/LIVE authorization)");
