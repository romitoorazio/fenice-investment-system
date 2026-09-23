import assert from "node:assert/strict";
import { evaluateExecutionCoverageReport } from "../lib/trading/execution-coverage.ts";

const now = Date.parse("2026-09-21T20:00:00Z");
const fresh = "2026-09-21T19:59:30Z";
const directaDedicatedMethod = "directa-readonly-entitlement-isin-topbook";

function observation(
  symbol,
  sourceFamily,
  price,
  eligibility = "PAPER",
  assetClass = "equity",
  provenanceVerified = eligibility === "PAPER" || eligibility === "LIVE",
  provenanceMethod = provenanceVerified ? "test-verified-provider-route" : undefined,
) {
  return {
    symbol,
    assetClass,
    source: `${sourceFamily} test`,
    sourceFamily,
    eligibility,
    price,
    observedAt: fresh,
    provenanceVerified,
    provenanceMethod,
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
  assert.equal(report.paperEligibleSymbols, 1, "two independent approved zero-cost PAPER families may satisfy the quorum");
  assert.equal(report.rows[0].directaPaperEvidence, false, "Directa evidence is optional for PAPER certification");
  assert.equal(report.rows[0].paperEligible, true);
}

{
  const report = evaluateExecutionCoverageReport({
    generatedAt: fresh,
    requestedSymbols: ["MSFT"],
    observations: [
      observation("MSFT", "directa", 500, "PAPER", "equity", true, directaDedicatedMethod),
      observation("MSFT", "twelve-data", 500.04),
    ],
    errors: [],
  }, now);
  assert.equal(report.paperEligibleSymbols, 1, "dedicated verified Directa evidence may contribute without becoming mandatory");
  assert.equal(report.rows[0].directaPaperEvidence, true);
  assert.equal(report.rows[0].directaOptionalEvidence, true);
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
  assert.equal(report.paperEligibleSymbols, 0, "a generic Directa provenance flag must not bypass the dedicated evidence path");
  assert.equal(report.rows[0].directaPaperEvidence, false);
  assert.deepEqual(report.rows[0].unapprovedPaperEvidence, ["directa"]);
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
      observation("MSFT", "alpha-vantage", 500),
      observation("MSFT", "alpaca", 500.04),
    ],
    errors: [],
  }, now);
  assert.equal(report.paperEligibleSymbols, 0, "Alpha Vantage realtime US data cannot satisfy the zero-cost PAPER quorum");
  assert.deepEqual(report.rows[0].unapprovedPaperEvidence, ["alpha-vantage"]);
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
  assert.equal(report.paperEligibleSymbols, 0, "unknown provider families cannot self-register through provenance flags");
  assert.equal(report.rows[0].equityOrEtf, false);
  assert.deepEqual(report.rows[0].unapprovedPaperEvidence.sort(), ["provider-a", "provider-b"]);
}

const policy = evaluateExecutionCoverageReport({ generatedAt: fresh, requestedSymbols: [], observations: [], errors: [] }, now).policy;
assert.equal(policy.directaPaidRealtimeRequired, false);
assert.equal(policy.directaEvidenceOptionalForPaperCertification, true);
assert.equal(policy.directaDedicatedProvenanceMethod, directaDedicatedMethod);
assert.equal(policy.minIndependentSourceFamilies, 2);
assert.equal(policy.paperEligibilityRequiresVerifiedProvenance, true);
assert.equal(policy.unregisteredPaperEvidenceFailsClosed, true);
assert.equal(policy.alphaVantageEligibleForZeroCostPaper, false);
assert.equal(policy.liveTradingAllowed, false);
assert.deepEqual(policy.approvedIndependentPaperSourceFamilies, ["alpaca", "twelve-data"]);
assert.deepEqual(policy.preferredZeroCostPaperSourceFamilies, ["alpaca", "twelve-data"]);

console.log("Fenice zero-cost PAPER execution coverage tests: PASS");
