import assert from "node:assert/strict";
import { GLOBAL_MARKET_SENTINELS, certifyGlobalInstrument, deduplicateGlobalEvidence, verifyTwelveDataGlobalQuote } from "../lib/trading/global-market-data-certification.ts";
import { applyGlobalMarketStateGate, verifyTwelveDataGlobalMarketState } from "../lib/trading/global-market-state.ts";
import { admitIndependentGlobalEvidence } from "../lib/trading/global-independent-evidence.ts";
import { evaluateIndependentGlobalSourceAdmission } from "../lib/trading/global-independent-source-admission.ts";

// Offline fixtures prove gates; they are not provider or licence evidence.
const now = Date.parse("2026-10-05T13:25:00.000Z");
const instrument = GLOBAL_MARKET_SENTINELS.find(item => item.symbol === "ENEL");
const open = verifyTwelveDataGlobalMarketState("XMIL", [{ code: "XMIL", is_market_open: true }], now);
const entitlement = { status: "VERIFIED", evidenceRef: "fixture:independent-only", evidenceSha256: "a".repeat(64),
  validUntil: "2026-11-01T00:00:00.000Z", usageScope: "NON_DISPLAY_INTERNAL", automatedUseAllowed: true, dualControlVerified: true };
const claim = { provider: "fixture-independent", sourceFamily: "fixture-independent", symbol: "ENEL", exchangeMic: "XMIL", currency: "EUR",
  price: 8.13, observedAt: new Date(now - 20_000).toISOString(), realtime: true, exactVenueVerified: true, provenanceVerified: true, entitlement };
const admitted = applyGlobalMarketStateGate(admitIndependentGlobalEvidence(claim, now).evidence, open, now);
assert.equal(admitted.eligibility, "PAPER");

const other = verifyTwelveDataGlobalMarketState("XPAR", [{ code: "XPAR", is_market_open: true }], now);
for (const state of [other, { ...open, returnedMic: "XPAR" }, { ...open, accepted: false }, { ...open, marketOpen: false },
  { ...open, paperSessionAllowed: "true" }, { ...open, provider: "unregistered" },
  { ...open, observedAt: new Date(now - 60_001).toISOString() }, { ...open, observedAt: new Date(now + 1).toISOString() },
  { ...open, observedAt: "invalid" }, null]) {
  assert.equal(applyGlobalMarketStateGate(admitted, state, now).eligibility, "VALIDATION_ONLY");
}
assert.equal(applyGlobalMarketStateGate(admitted, { ...open, observedAt: new Date(now - 60_000).toISOString() }, now).eligibility, "PAPER");
assert.equal(applyGlobalMarketStateGate({ ...admitted, exchangeMic: "XM!IL" }, open, now).eligibility, "VALIDATION_ONLY");
assert.equal(applyGlobalMarketStateGate({ ...admitted, exchangeMic: undefined }, open, now).eligibility, "VALIDATION_ONLY");
assert.equal(applyGlobalMarketStateGate(admitted, open, NaN).eligibility, "VALIDATION_ONLY");
for (const clock of [NaN, Infinity, "2026-10-05", 1e100]) {
  assert.equal(verifyTwelveDataGlobalMarketState("XMIL", [{ code: "XMIL", is_market_open: true }], clock).paperSessionAllowed, false);
  assert.equal(evaluateIndependentGlobalSourceAdmission(claim, clock).admittedForPaper, false);
}
for (const maxAge of [NaN, Infinity, 121, -1, 0, "120"]) assert.equal(evaluateIndependentGlobalSourceAdmission(claim, now, maxAge).admittedForPaper, false);
for (const price of [true, "8.13", NaN, Infinity, 0, -1]) assert.equal(evaluateIndependentGlobalSourceAdmission({ ...claim, price }, now).admittedForPaper, false);
assert.equal(evaluateIndependentGlobalSourceAdmission({ ...claim, sourceFamily: "twelve-data-cboe-europe" }, now).admittedForPaper, false);

const proof = { paperAllowed: true, approvedMics: ["XMIL"], ...entitlement,
  runtimeClaimFresh: true, legalUseScopeVerified: true, persistedEvidenceFound: true, runtimeClaimMatched: true };
const raw = { symbol: "ENEL", mic_code: "XMIL", currency: "EUR", close: "8.125", timestamp: (now - 15_000) / 1000 };
const verified = verifyTwelveDataGlobalQuote(instrument, raw, now, 120, proof);
const primary = applyGlobalMarketStateGate(verified.evidence, open, now);
assert.equal(primary.eligibility, "PAPER");
for (const bad of [{ ...raw, status: "error", code: 401 }, { ...raw, close: true }, { ...raw, timestamp: 1e100 },
  { ...raw, timestamp: true }, { ...raw, timestamp: undefined, datetime: "2026-10-05 13:24:45" },
  { ...raw, mic_code: "XM!IL" }, { ...raw, currency: "EUR_EXTRA" }]) {
  const result = verifyTwelveDataGlobalQuote(instrument, bad, now, 120, proof);
  assert.equal(result.accepted, false);
  assert.equal(result.evidence, null);
  assert.equal(result.eligibility, "VALIDATION_ONLY");
}
assert.equal(verifyTwelveDataGlobalQuote(instrument, { ...raw, timestamp: undefined, datetime: "2026-10-05T15:24:45+02:00" }, now, 120, proof).eligibility, "PAPER");

const pair = [primary, admitted];
assert.equal(certifyGlobalInstrument(instrument, pair, now).allowNewRisk, true);
assert.equal(certifyGlobalInstrument(instrument, deduplicateGlobalEvidence(JSON.parse(JSON.stringify(pair))), now).allowNewRisk, true,
  "normalization and persistence must preserve the checked proof and session");
assert.equal(certifyGlobalInstrument(instrument, pair, now + 60_001).allowNewRisk, false, "still-fresh quotes cannot reuse an expired open-session proof");
assert.equal(certifyGlobalInstrument(instrument, pair, NaN).allowNewRisk, false);
assert.equal(certifyGlobalInstrument(instrument, [null, false, {}], now).allowNewRisk, false);

for (const change of [item => ({ ...item, paperAdmissionProof: undefined }), item => ({ ...item, provenanceVerified: false }),
  item => ({ ...item, price: item.price + 0.001 }), item => ({ ...item, observedAt: new Date(now).toISOString() }),
  item => ({ ...item, marketState: other }), item => ({ ...item, eligibility: "LIVE" }),
  item => ({ ...item, paperAdmissionProof: { ...item.paperAdmissionProof, sourceFamily: "different" } }),
  item => ({ ...item, paperAdmissionProof: { ...item.paperAdmissionProof, dualControlVerified: "true" } }),
  item => ({ ...item, paperAdmissionProof: { ...item.paperAdmissionProof, validUntil: new Date(now).toISOString() } }),
  item => ({ ...item, paperAdmissionProof: { ...item.paperAdmissionProof, checkedAt: new Date(now + 1).toISOString() } })]) {
  const certification = certifyGlobalInstrument(instrument, [primary, change(admitted)], now);
  assert.equal(certification.allowNewRisk, false);
  assert.equal(certification.paperEligibleFamilies.length, 1, "unproven labels must not inflate eligible family counts");
}
const alias = { ...primary, sourceFamily: " TWELVE-DATA " };
assert.equal(certifyGlobalInstrument(instrument, [primary, alias], now).allowNewRisk, false, "case/whitespace aliases remain one family");
assert.equal(deduplicateGlobalEvidence([primary, alias]).length, 1);
assert.equal(certifyGlobalInstrument(instrument, pair.map(item => ({ ...item, paperAdmissionProof: undefined })), now).state, "BLOCKED");
console.log("Fenice global certification integrity tests: PASS");
