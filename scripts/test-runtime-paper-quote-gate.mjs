import assert from "node:assert/strict";
import { assessRuntimePaperQuoteGate } from "../lib/trading/runtime-paper-quote-gate.ts";

const now = Date.parse("2026-10-09T16:00:00.000Z");
const at = (secondsAgo) => new Date(now - secondsAgo * 1000).toISOString();
const symbols = ["AAPL", "MSFT", "SPY"];
const observations = symbols.flatMap((symbol) => [
  { symbol, sourceFamily: "alpaca", eligibility: "PAPER", provenanceVerified: true,
    provenanceMethod: "authenticated-alpaca-iex-latest-quote", price: 100, currency: "USD", observedAt: at(20) },
  { symbol, sourceFamily: "twelve-data", eligibility: "PAPER", provenanceVerified: true,
    provenanceMethod: "provider-batch-quote-last_quote_at-us-realtime-venue", price: 100.1, currency: "USD", observedAt: at(30) },
]);
const evidence = { generatedAt: at(15), observations };
const coverage = { generatedAt: at(5), evidenceGeneratedAt: at(15), requestedSymbols: 10,
  paperEligibleSymbols: 3, rows: symbols.map((symbol) => ({ symbol, paperEligible: true })),
  policy: { approvedIndependentPaperSourceFamilies: ["alpaca", "twelve-data"], liveTradingAllowed: false },
};
const evaluate = (ev = evidence, cv = coverage, atNow = now) => assessRuntimePaperQuoteGate(ev, cv, atNow);
assert.equal(evaluate().ready, true, "current dual-provider per-symbol PAPER proof passes");
assert.equal(evaluate(evidence, coverage, now + 130000).ready, false, "historical once-valid quotes cannot stay execution-grade");
assert.equal(evaluate({ ...evidence, generatedAt: at(160) }).ready, false, "stale evidence file cannot pass");
assert.equal(evaluate(evidence, { ...coverage, evidenceGeneratedAt: at(18) }).ready, false, "unlinked coverage is rejected");
assert.equal(evaluate({ ...evidence, observations: observations.map((x) =>
  x.sourceFamily === "twelve-data" ? { ...x, observedAt: at(130) } : x,
) }).ready, false, "one-source quotes cannot satisfy a two-source quorum");
assert.equal(evaluate({ ...evidence, observations: observations.map((x) =>
  x.sourceFamily === "twelve-data" ? { ...x, price: 105 } : x,
) }).ready, false, "divergent prices must not be treated as execution-grade");
assert.equal(evaluate({ ...evidence, observations: observations.map((x) =>
  x.sourceFamily === "twelve-data" ? { ...x, provenanceVerified: false } : x,
) }).ready, false, "unverified PAPER data must be blocked");
assert.equal(evaluate({ ...evidence, observations: observations.map((x) =>
  x.sourceFamily === "twelve-data" ? { ...x, eligibility: "LIVE" } : x,
) }).ready, false, "LIVE-labeled evidence never unlocks PAPER");
assert.equal(evaluate(evidence, { ...coverage, policy: { ...coverage.policy, liveTradingAllowed: true } }).ready, false);
assert.equal(evaluate(evidence, coverage, now - 300000).ready, false, "future-dated evidence is blocked");

assert.equal(evaluate({ ...evidence, observations: observations.map((x) =>
  x.sourceFamily === "twelve-data" ? { ...x, currency: "EUR" } : x,
) }).ready, false, "numeric prices from different currencies can never establish quorum");
assert.equal(evaluate({ ...evidence, observations: observations.map((x) =>
  x.sourceFamily === "twelve-data" ? { ...x, currency: undefined } : x,
) }).ready, false, "missing currency metadata must fail closed");
assert.equal(evaluate({ ...evidence, observations: observations.map((x) =>
  x.sourceFamily === "twelve-data" ? { ...x, currency: "EURO" } : x,
) }).ready, false, "invalid currency metadata must fail closed");
const newestQuoteDivergence = { ...evidence, observations: [
  ...observations.filter((x) => x.symbol !== "AAPL" || x.sourceFamily !== "twelve-data"),
  { ...observations.find((x) => x.symbol === "AAPL" && x.sourceFamily === "twelve-data"), price: 140, observedAt: at(15) },
  { ...observations.find((x) => x.symbol === "AAPL" && x.sourceFamily === "twelve-data"), price: 100.1, observedAt: at(90) },
]};
assert.equal(evaluate(newestQuoteDivergence).ready, false, "older same-provider quote must never mask a newer divergent quote");

console.log("Fenice runtime PAPER quote freshness/quorum regression: PASS.");
