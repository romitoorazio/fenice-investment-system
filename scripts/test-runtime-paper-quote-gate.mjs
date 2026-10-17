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
  paperEligibleSymbols: 3, rows: [...symbols.map((symbol) => ({ symbol, paperEligible: true })),
    ...Array.from({ length: 7 }, (_, i) => ({ symbol: `UNQUOTED${i}`, paperEligible: false }))],
  policy: { approvedIndependentPaperSourceFamilies: ["alpaca", "twelve-data"], liveTradingAllowed: false },
};
const evaluate = (ev = evidence, cv = coverage, atNow = now) => assessRuntimePaperQuoteGate(ev, cv, atNow);
assert.equal(evaluate().ready, true, "current dual-provider per-symbol PAPER proof passes");
assert.equal(evaluate(evidence, coverage, now + 130000).ready, false, "historical once-valid quotes cannot stay execution-grade");
assert.equal(evaluate({ ...evidence, generatedAt: at(160) }).ready, false, "stale evidence file cannot pass");
assert.equal(evaluate(evidence, { ...coverage, evidenceGeneratedAt: at(18) }).ready, false, "unlinked coverage is rejected");
assert.equal(evaluate(evidence, { ...coverage, evidenceGeneratedAt: at(15.5) }).ready, false,
  "half-second timestamp tolerance cannot substitute batch identity");
assert.equal(evaluate(evidence, { ...coverage, paperEligibleSymbols: 2 }).ready, false,
  "coverage count must match per-row eligibility");
assert.equal(evaluate({ ...evidence, observations: observations.map(row =>
  row.sourceFamily === "twelve-data" ? { ...row, provenanceMethod: undefined } : row,
) }).ready, false, "unattributed provider evidence cannot establish independent PAPER quorum");
const contradictory = { ...evidence, observations: [
  ...observations, { ...observations[0], price: 100.3 },
]};
const contradiction = evaluate(contradictory);
assert.equal(contradiction.ready, false, "same provider, same time, two prices invalidate source proof");
assert.equal(contradiction.conflictingProviderSymbols, 1);
assert(contradiction.reasons.some(reason => reason.includes("contradictory")));
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

for (const requestedSymbols of [0, -1, 2, 3.5, "10", Number.NaN]) {
  assert.equal(evaluate(evidence, { ...coverage, requestedSymbols }).ready, false);
}
assert.equal(evaluate(evidence, { ...coverage, paperEligibleSymbols: 11 }).ready, false);
assert.equal(evaluate(evidence, { ...coverage, rows: [...coverage.rows, coverage.rows[0]] }).ready, false);
assert.equal(evaluate(evidence, { ...coverage, rows: [] }).ready, false);
assert.equal(evaluate(evidence, { ...coverage, rows: [null, ...coverage.rows.slice(1)] }).ready, false,
  "null coverage rows must never crash the market diagnostics");
assert.equal(evaluate(evidence, { ...coverage, rows: coverage.rows.slice(0, 3) }).ready, false, "truncated requested universe fails closed");
assert.equal(evaluate({ ...evidence, observations: "malformed" }).ready, false);
assert.equal(evaluate(evidence, { ...coverage, policy: { ...coverage.policy, approvedIndependentPaperSourceFamilies: "malformed" } }).ready, false);
assert.equal(evaluate(evidence, { ...coverage, rows: symbols.map(symbol => ({ symbol: "OTHER_" + symbol, paperEligible: false })) }).ready, false,
  "unrequested but fresh symbol quotes cannot establish coverage");
assert.equal(evaluate({ ...evidence, generatedAt: "2026-02-30T13:00:00.000Z" }).ready, false);
assert.equal(evaluate(evidence, coverage, Number.NaN).ready, false);

console.log("Fenice runtime PAPER quote freshness/quorum regression: PASS.");
