import assert from "node:assert/strict";
import { evaluatePaperValidationCampaign } from "../lib/trading/paper-validation.mjs";

const now = Date.parse("2026-10-26T12:00:00Z");
const startedAt = "2026-09-25T12:00:00Z";
const fingerprint = {
  version: 1,
  algorithm: "sha256",
  digest: "a".repeat(64),
  complete: true,
};

function evidenceRow(index) {
  const cumulativePaperFilled = Math.min(10, index + 1);
  const previousPaperFilled = index === 0 ? 0 : Math.min(10, index);
  const delta = cumulativePaperFilled - previousPaperFilled;
  const date = new Date(Date.parse("2026-09-25T00:00:00Z") + index * 86_400_000).toISOString().slice(0, 10);
  return {
    date,
    observedAt: `${date}T13:36:00Z`,
    validationFingerprint: fingerprint,
    cumulativePaperFilled,
    newPaperFills: delta,
    liveOrders: 0,
    liveTradingAllowed: false,
    brokerConnectivityAllowed: false,
    reconciliationBalanced: true,
    reconciliationBreaks: 0,
    auditChainValid: true,
    fillEvidenceProof: {
      version: 2,
      requiredFills: delta,
      coveredFills: delta,
      complete: true,
      windows: delta > 0 ? [{
        observedAt: `${date}T13:35:50Z`,
        fromCumulativePaperFilled: previousPaperFilled,
        toCumulativePaperFilled: cumulativePaperFilled,
        newPaperFills: delta,
        decisionData: { ready: true },
        executionMarket: { ready: true },
        marketFx: {
          ready: true,
          requiredForAdditionalFills: true,
          nonEuroFills: delta,
          matchedNonEuroFills: delta,
          proofs: Array.from({ length: delta }, (_, proofIndex) => ({
            clientOrderId: `v6-${date}-${proofIndex}`,
            currency: "USD",
            readyAtFill: true,
            matches: true,
          })),
        },
      }] : [],
    },
    executionQuality: {
      state: cumulativePaperFilled >= 10 ? "HEALTHY" : "INSUFFICIENT",
      allowPilot: cumulativePaperFilled >= 10,
      fills: cumulativePaperFilled,
    },
  };
}

const dailyEvidence = Array.from({ length: 26 }, (_, index) => evidenceRow(index));
function campaign(overrides = {}) {
  return {
    version: 6,
    startedAt,
    baselineCommit: "b".repeat(40),
    baselineFingerprint: fingerprint,
    requiredDays: 30,
    minEvidenceDays: 25,
    minPaperFills: 10,
    liveTradingAllowed: false,
    evidencePolicy: { freshMarketFxRequiredForNonEuroPaperFill: true },
    dailyEvidence,
    ...overrides,
  };
}

const matured = evaluatePaperValidationCampaign(campaign(), now);
assert.equal(matured.matured, true, matured.reasons.join(" | "));
assert.equal(matured.fxEvidenceProofFailureDays, 0);
assert.equal(matured.fillEvidenceProofFailureDays, 0);

const missingPolicy = evaluatePaperValidationCampaign(campaign({ evidencePolicy: {} }), now);
assert.equal(missingPolicy.state, "INVALID");
assert.equal(missingPolicy.matured, false);
assert(missingPolicy.reasons.some((reason) => reason.includes("market FX proof")));

const missingFxWindow = evaluatePaperValidationCampaign(campaign({
  dailyEvidence: dailyEvidence.map((row, index) => index === 3
    ? {
        ...row,
        fillEvidenceProof: {
          ...row.fillEvidenceProof,
          windows: row.fillEvidenceProof.windows.map(({ marketFx: _marketFx, ...window }) => window),
        },
      }
    : row),
}), now);
assert.equal(missingFxWindow.state, "INVALID");
assert.equal(missingFxWindow.matured, false);
assert.equal(missingFxWindow.fxEvidenceProofFailureDays, 1);
assert.equal(missingFxWindow.fillEvidenceProofFailureDays, 1);

const mismatchedFx = evaluatePaperValidationCampaign(campaign({
  dailyEvidence: dailyEvidence.map((row, index) => index === 4
    ? {
        ...row,
        fillEvidenceProof: {
          ...row.fillEvidenceProof,
          windows: row.fillEvidenceProof.windows.map((window) => ({
            ...window,
            marketFx: {
              ...window.marketFx,
              matchedNonEuroFills: 0,
              proofs: window.marketFx.proofs.map((proof) => ({ ...proof, matches: false })),
            },
          })),
        },
      }
    : row),
}), now);
assert.equal(mismatchedFx.state, "INVALID");
assert.equal(mismatchedFx.fxEvidenceProofFailureDays, 1);

const v5LegacyProof = evaluatePaperValidationCampaign({
  ...campaign({ version: 5, evidencePolicy: undefined }),
  dailyEvidence: dailyEvidence.map((row) => ({
    ...row,
    fillEvidenceProof: {
      ...row.fillEvidenceProof,
      version: 1,
      windows: row.fillEvidenceProof.windows.map(({ marketFx: _marketFx, ...window }) => window),
    },
  })),
}, now);
assert.equal(v5LegacyProof.matured, true, "v5 archive evidence remains readable, but only v6+ requires FX proof");

console.log("Fenice v6 PAPER campaign FX-proof invariants: PASS");
