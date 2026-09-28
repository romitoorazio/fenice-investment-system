import assert from "node:assert/strict";
import { evaluateExchangeDirectSourceCandidate } from "../lib/trading/exchange-direct-source-candidate.ts";

const now = Date.parse("2026-09-28T10:00:30.000Z");
const evidence = {
  symbol: "ENI",
  exchangeMic: "EXGM",
  currency: "EUR",
  assetClass: "equity",
  source: "Euronext Stream API BBO (EXGM)",
  sourceFamily: "euronext-stream",
  eligibility: "VALIDATION_ONLY",
  price: 14.762865,
  observedAt: "2026-09-28T10:00:00.100Z",
  provenanceVerified: true,
  provenanceMethod: "euronext-stream:bbo;mic:EXGM;timestamp-ns",
};
const record = {
  provider: "euronext-stream",
  sourceFamily: "euronext-stream",
  exchangeMic: "EXGM",
  status: "VERIFIED",
  realtimeAllowed: true,
  paperAllowed: true,
  evidenceRef: "fixture:euronext-stream-exgm-nondisplay",
  evidenceSha256: "e".repeat(64),
  reviewedAt: "2026-09-27T10:00:00.000Z",
  validUntil: "2026-10-28T10:00:00.000Z",
  usageScope: "NON_DISPLAY_INTERNAL",
  automatedUseAllowed: true,
};
const registry = { policy: "DEFAULT_DENY_DUAL_CONTROL", entitlements: [record] };
const runtime = {
  provider: "euronext-stream",
  sourceFamily: "euronext-stream",
  approvedMics: ["EXGM"],
  evidenceRef: record.evidenceRef,
  evidenceSha256: record.evidenceSha256,
  confirmedAt: "2026-09-28T10:00:00.000Z",
};

const good = evaluateExchangeDirectSourceCandidate(evidence, "euronext-stream", "euronext-stream", registry, runtime, now);
assert.equal(good.entitlement.verified, true);
assert.equal(good.admission.admission.admittedForPaper, true);
assert.equal(good.admission.evidence?.eligibility, "PAPER");
assert.equal(good.admission.evidence?.exchangeMic, "EXGM");

const noPersisted = evaluateExchangeDirectSourceCandidate(evidence, "euronext-stream", "euronext-stream", { entitlements: [] }, runtime, now);
assert.equal(noPersisted.entitlement.verified, false);
assert.equal(noPersisted.admission.admission.admittedForPaper, false);
assert.equal(noPersisted.admission.evidence?.eligibility, "VALIDATION_ONLY");

const noRuntime = evaluateExchangeDirectSourceCandidate(evidence, "euronext-stream", "euronext-stream", registry, {}, now);
assert.equal(noRuntime.entitlement.verified, false);
assert.equal(noRuntime.admission.evidence?.eligibility, "VALIDATION_ONLY");

const wrongMicRuntime = evaluateExchangeDirectSourceCandidate(evidence, "euronext-stream", "euronext-stream", registry, { ...runtime, approvedMics: ["XPAR"] }, now);
assert.equal(wrongMicRuntime.entitlement.verified, false);
assert.equal(wrongMicRuntime.admission.evidence?.eligibility, "VALIDATION_ONLY");

const staleRuntime = evaluateExchangeDirectSourceCandidate(evidence, "euronext-stream", "euronext-stream", registry, { ...runtime, confirmedAt: "2026-09-28T09:54:00.000Z" }, now);
assert.equal(staleRuntime.entitlement.verified, false);
assert.equal(staleRuntime.admission.evidence?.eligibility, "VALIDATION_ONLY");

const displayOnlyRegistry = structuredClone(registry);
displayOnlyRegistry.entitlements[0].usageScope = "DISPLAY_ONLY";
const displayOnly = evaluateExchangeDirectSourceCandidate(evidence, "euronext-stream", "euronext-stream", displayOnlyRegistry, runtime, now);
assert.equal(displayOnly.entitlement.verified, false);
assert.equal(displayOnly.admission.evidence?.eligibility, "VALIDATION_ONLY");

const unverifiedParserEvidence = { ...evidence, provenanceVerified: false };
const badParser = evaluateExchangeDirectSourceCandidate(unverifiedParserEvidence, "euronext-stream", "euronext-stream", registry, runtime, now);
assert.equal(badParser.admission.admission.admittedForPaper, false);
assert.equal(badParser.admission.evidence?.eligibility, "VALIDATION_ONLY");

const alreadyPaperInput = { ...evidence, eligibility: "PAPER" };
const bypassAttempt = evaluateExchangeDirectSourceCandidate(alreadyPaperInput, "euronext-stream", "euronext-stream", registry, runtime, now);
assert.equal(bypassAttempt.admission.admission.admittedForPaper, false, "composer only accepts parser validation evidence and must not trust pre-promoted input");
assert.equal(bypassAttempt.admission.evidence?.eligibility, "VALIDATION_ONLY");

console.log("Fenice exchange-direct source candidate tests: PASS");
