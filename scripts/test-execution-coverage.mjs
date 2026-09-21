import assert from "node:assert/strict";
import { evaluateExecutionCoverageReport } from "../lib/trading/execution-coverage.ts";

const now = Date.parse("2026-09-21T20:00:00Z");
const fresh = "2026-09-21T19:59:30Z";

function observation(symbol, sourceFamily, price, eligibility = "PAPER", assetClass = "equity") {
  return {
    symbol,
    assetClass,
    source: `${sourceFamily} test`,
    sourceFamily,
    eligibility,
    price,
    observedAt: fresh,
  };
}

{
  const report = evaluateExecutionCoverageReport({
    generatedAt: fresh,
    requestedSymbols: ["MSFT"],
    observations: [
      observation("MSFT", "yahoo", 500),
      observation("MSFT", "alpha-vantage", 500.05),
    ],
    errors: [],
  }, now);
  assert.equal(report.paperEligibleSymbols, 1, "two independent external PAPER families may satisfy broad PAPER quorum");
  assert.equal(report.directaPilotEligibleSymbols, 0, "external-only quorum must never certify Directa pilot coverage");
  assert.equal(report.rows[0].directaPaperEvidence, false);
  assert(report.rows[0].reasons.some((reason) => reason.includes("missing Directa PAPER source")));
}

{
  const report = evaluateExecutionCoverageReport({
    generatedAt: fresh,
    requestedSymbols: ["MSFT"],
    observations: [
      observation("MSFT", "directa", 500),
      observation("MSFT", "yahoo", 500.04),
    ],
    errors: [],
  }, now);
  assert.equal(report.paperEligibleSymbols, 1, "broad quorum may remain green with Directa + Yahoo");
  assert.equal(report.directaPilotEligibleSymbols, 0, "Yahoo must not certify the broker pilot even when timestamp-fresh");
  assert.equal(report.rows[0].directaPaperEvidence, true);
  assert.equal(report.rows[0].independentNonDirectaPaperEvidence, false);
  assert.deepEqual(report.rows[0].approvedIndependentPaperFamilies, []);
  assert(report.rows[0].reasons.some((reason) => reason.includes("approved independent realtime PAPER source")));
}

{
  const report = evaluateExecutionCoverageReport({
    generatedAt: fresh,
    requestedSymbols: ["MSFT"],
    observations: [
      observation("MSFT", "directa", 500),
      observation("MSFT", "twelve-data", 500.04),
    ],
    errors: [],
  }, now);
  assert.equal(report.paperEligibleSymbols, 1);
  assert.equal(report.directaPilotEligibleSymbols, 1);
  assert.equal(report.rows[0].directaPaperEvidence, true);
  assert.equal(report.rows[0].independentNonDirectaPaperEvidence, true);
  assert.deepEqual(report.rows[0].approvedIndependentPaperFamilies, ["twelve-data"]);
}

{
  const report = evaluateExecutionCoverageReport({
    generatedAt: fresh,
    requestedSymbols: ["MSFT"],
    observations: [
      observation("MSFT", "directa", 500),
      observation("MSFT", "alpha-vantage", 500.03),
    ],
    errors: [],
  }, now);
  assert.equal(report.directaPilotEligibleSymbols, 1, "realtime-entitled Alpha Vantage evidence may satisfy the approved second-source gate");
}

{
  const report = evaluateExecutionCoverageReport({
    generatedAt: fresh,
    requestedSymbols: ["MSFT"],
    observations: [
      observation("MSFT", "directa", 500),
      observation("MSFT", "twelve-data", 500.04, "VALIDATION_ONLY"),
    ],
    errors: [],
  }, now);
  assert.equal(report.paperEligibleSymbols, 0, "Directa alone cannot satisfy two-family PAPER quorum");
  assert.equal(report.directaPilotEligibleSymbols, 0);
  assert.equal(report.rows[0].independentNonDirectaPaperEvidence, false);
}

{
  const report = evaluateExecutionCoverageReport({
    generatedAt: fresh,
    requestedSymbols: ["BTC"],
    observations: [
      observation("BTC", "coinbase", 60000, "PAPER", "crypto"),
      observation("BTC", "kraken", 60010, "PAPER", "crypto"),
    ],
    errors: [],
  }, now);
  assert.equal(report.paperEligibleSymbols, 1);
  assert.equal(report.directaPilotCandidateSymbols, 0);
  assert.equal(report.directaPilotEligibleSymbols, 0, "crypto quorum must not count toward Directa equity/ETF pilot");
}

const policy = evaluateExecutionCoverageReport({ generatedAt: fresh, requestedSymbols: [], observations: [], errors: [] }, now).policy;
assert.equal(policy.requireDirectaPaperSourceForDirectaPilot, true);
assert.equal(policy.yahooCannotSatisfyDirectaPilotCoverage, true);
assert.ok(policy.approvedIndependentPaperSourceFamiliesForDirectaPilot.includes("twelve-data"));

console.log("Fenice broker-backed execution coverage tests: PASS");
