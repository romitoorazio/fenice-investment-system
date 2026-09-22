import assert from "node:assert/strict";
import { evaluateExecutionCoverageReport } from "../lib/trading/execution-coverage.ts";

const now = Date.parse("2026-09-21T20:00:00Z");
const fresh = "2026-09-21T19:59:30Z";

function observation(symbol, sourceFamily, price, eligibility = "PAPER", assetClass = "equity", provenanceVerified = eligibility === "PAPER" || eligibility === "LIVE") {
  return {
    symbol,
    assetClass,
    source: `${sourceFamily} test`,
    sourceFamily,
    eligibility,
    price,
    observedAt: fresh,
    provenanceVerified,
    provenanceMethod: provenanceVerified ? "test-verified-provider-route" : undefined,
  };
}

{
  const report = evaluateExecutionCoverageReport({
    generatedAt: fresh,
    requestedSymbols: ["MSFT"],
    observations: [
      observation("MSFT", "twelve-data", 500),
      observation("MSFT", "alpaca", 500.05),
    ],
    errors: [],
  }, now);
  assert.equal(report.paperEligibleSymbols, 1, "two independent verified PAPER families may satisfy the generic PAPER quorum");
  assert.equal(report.rows[0].directaPaperEvidence, false, "Directa evidence is optional for PAPER certification");
  assert.equal(report.rows[0].paperEligible, true);
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
  assert.equal(report.paperEligibleSymbols, 1, "generic quorum remains provider-neutral across verified evidence");
  assert.equal(report.rows[0].directaPaperEvidence, true);
  assert.equal(report.rows[0].directaOptionalEvidence, true);
}

{
  const report = evaluateExecutionCoverageReport({
    generatedAt: fresh,
    requestedSymbols: ["MSFT"],
    observations: [
      observation("MSFT", "twelve-data", 500, "PAPER", "equity", false),
      observation("MSFT", "alpaca", 500.04),
    ],
    errors: [],
  }, now);
  assert.equal(report.paperEligibleSymbols, 0, "unverified PAPER claims must be downgraded before quorum evaluation");
  assert.deepEqual(report.rows[0].unverifiedPaperEvidence, ["twelve-data"]);
  assert.ok(report.rows[0].reasons.some((reason) => reason.includes("provenance not verified")));
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
  assert.equal(report.paperEligibleSymbols, 0, "VALIDATION_ONLY evidence cannot satisfy PAPER quorum");
}

{
  const report = evaluateExecutionCoverageReport({
    generatedAt: fresh,
    requestedSymbols: ["BTC"],
    observations: [
      observation("BTC", "provider-a", 60000, "PAPER", "crypto"),
      observation("BTC", "provider-b", 60010, "PAPER", "crypto"),
    ],
    errors: [],
  }, now);
  assert.equal(report.paperEligibleSymbols, 1, "provider-neutral verified PAPER quorum also applies outside equities");
  assert.equal(report.rows[0].equityOrEtf, false);
}

const policy = evaluateExecutionCoverageReport({ generatedAt: fresh, requestedSymbols: [], observations: [], errors: [] }, now).policy;
assert.equal(policy.directaPaidRealtimeRequired, false);
assert.equal(policy.directaEvidenceOptionalForPaperCertification, true);
assert.equal(policy.minIndependentSourceFamilies, 2);
assert.equal(policy.paperEligibilityRequiresVerifiedProvenance, true);
assert.equal(policy.liveTradingAllowed, false);
assert.ok(policy.approvedIndependentPaperSourceFamilies.includes("twelve-data"));
assert.ok(policy.approvedIndependentPaperSourceFamilies.includes("alpaca"));
assert.deepEqual(policy.preferredZeroCostPaperSourceFamilies, ["alpaca", "twelve-data"]);

console.log("Fenice zero-cost PAPER execution coverage tests: PASS");
