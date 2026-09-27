import assert from "node:assert/strict";
import { evaluateIndependentGlobalSourceAdmission } from "../lib/trading/global-independent-source-admission.ts";

const now = Date.parse("2026-09-28T10:00:30.000Z");
const base = {
  provider: "broker-independent",
  sourceFamily: "broker-independent",
  symbol: "ENEL",
  exchangeMic: "XMIL",
  currency: "EUR",
  price: 8.125,
  observedAt: "2026-09-28T10:00:00.000Z",
  realtime: true,
  exactVenueVerified: true,
  provenanceVerified: true,
  entitlement: {
    status: "VERIFIED",
    evidenceRef: "fixture:verified-entitlement",
    evidenceSha256: "a".repeat(64),
  },
};

const good = evaluateIndependentGlobalSourceAdmission(base, now);
assert.equal(good.admittedForPaper, true);
assert.equal(good.eligibility, "PAPER");

const sameFamily = evaluateIndependentGlobalSourceAdmission({ ...base, provider: "twelve-data", sourceFamily: "twelve-data" }, now);
assert.equal(sameFamily.admittedForPaper, false);
assert.ok(sameFamily.reasons.some((r) => r.includes("independent")));

const delayed = evaluateIndependentGlobalSourceAdmission({ ...base, realtime: false, entitlement: { ...base.entitlement, status: "DELAYED_ONLY" } }, now);
assert.equal(delayed.eligibility, "VALIDATION_ONLY");
assert.ok(delayed.reasons.some((r) => r.includes("not verified realtime")));

const wrongMic = evaluateIndependentGlobalSourceAdmission({ ...base, exchangeMic: "MIL" }, now);
assert.equal(wrongMic.admittedForPaper, false);

const stale = evaluateIndependentGlobalSourceAdmission({ ...base, observedAt: "2026-09-28T09:55:00.000Z" }, now);
assert.equal(stale.admittedForPaper, false);
assert.ok(stale.reasons.some((r) => r.includes("freshness")));

const noEvidence = evaluateIndependentGlobalSourceAdmission({
  ...base,
  entitlement: { status: "VERIFIED", evidenceRef: "", evidenceSha256: "" },
}, now);
assert.equal(noEvidence.admittedForPaper, false);

const directaSafe = evaluateIndependentGlobalSourceAdmission({
  ...base,
  provider: "directa-readonly",
  sourceFamily: "directa",
  readOnly: true,
  datafeedEntitled: true,
  writeTradingCommandsAllowed: false,
}, now);
assert.equal(directaSafe.admittedForPaper, true);

const directaNoEntitlement = evaluateIndependentGlobalSourceAdmission({
  ...base,
  provider: "directa-readonly",
  sourceFamily: "directa",
  readOnly: true,
  datafeedEntitled: false,
  writeTradingCommandsAllowed: false,
}, now);
assert.equal(directaNoEntitlement.admittedForPaper, false);
assert.ok(directaNoEntitlement.reasons.some((r) => r.includes("Directa datafeed entitlement")));

const directaWrites = evaluateIndependentGlobalSourceAdmission({
  ...base,
  provider: "directa-readonly",
  sourceFamily: "directa",
  readOnly: true,
  datafeedEntitled: true,
  writeTradingCommandsAllowed: true,
}, now);
assert.equal(directaWrites.admittedForPaper, false);
assert.ok(directaWrites.reasons.some((r) => r.includes("writes")));

console.log("Fenice independent global source admission tests: PASS");
