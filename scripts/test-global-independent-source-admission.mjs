import assert from "node:assert/strict";
import { evaluateIndependentGlobalSourceAdmission } from "../lib/trading/global-independent-source-admission.ts";
import { admitIndependentGlobalEvidence } from "../lib/trading/global-independent-evidence.ts";

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
    validUntil: "2026-10-31T23:59:59.000Z",
    usageScope: "NON_DISPLAY_INTERNAL",
    automatedUseAllowed: true,
    dualControlVerified: true,
  },
};

const good = evaluateIndependentGlobalSourceAdmission(base, now);
assert.equal(good.admittedForPaper, true);
assert.equal(good.eligibility, "PAPER");
const gatedGood = admitIndependentGlobalEvidence(base, now);
assert.equal(gatedGood.admission.admittedForPaper, true);
assert.equal(gatedGood.evidence?.eligibility, "PAPER");
assert.equal(gatedGood.evidence?.exchangeMic, "XMIL");
assert.equal(gatedGood.evidence?.sourceFamily, "broker-independent");

const noDualControl = evaluateIndependentGlobalSourceAdmission({
  ...base,
  entitlement: { ...base.entitlement, dualControlVerified: false },
}, now);
assert.equal(noDualControl.admittedForPaper, false);
assert.ok(noDualControl.reasons.some((r) => r.includes("dual control")));

const sameFamily = evaluateIndependentGlobalSourceAdmission({ ...base, provider: "twelve-data", sourceFamily: "twelve-data" }, now);
assert.equal(sameFamily.admittedForPaper, false);
assert.ok(sameFamily.reasons.some((r) => r.includes("independent")));
assert.equal(admitIndependentGlobalEvidence({ ...base, provider: "twelve-data", sourceFamily: "twelve-data" }, now).evidence?.eligibility, "VALIDATION_ONLY");

const delayedClaim = { ...base, realtime: false, entitlement: { ...base.entitlement, status: "DELAYED_ONLY" } };
const delayed = evaluateIndependentGlobalSourceAdmission(delayedClaim, now);
assert.equal(delayed.eligibility, "VALIDATION_ONLY");
assert.ok(delayed.reasons.some((r) => r.includes("not verified realtime")));
assert.equal(admitIndependentGlobalEvidence(delayedClaim, now).evidence?.eligibility, "VALIDATION_ONLY");

const wrongMic = evaluateIndependentGlobalSourceAdmission({ ...base, exchangeMic: "MIL" }, now);
assert.equal(wrongMic.admittedForPaper, false);

const stale = evaluateIndependentGlobalSourceAdmission({ ...base, observedAt: "2026-09-28T09:55:00.000Z" }, now);
assert.equal(stale.admittedForPaper, false);
assert.ok(stale.reasons.some((r) => r.includes("freshness")));

const noEvidence = evaluateIndependentGlobalSourceAdmission({ ...base, entitlement: { ...base.entitlement, evidenceRef: "", evidenceSha256: "" } }, now);
assert.equal(noEvidence.admittedForPaper, false);

const expired = evaluateIndependentGlobalSourceAdmission({ ...base, entitlement: { ...base.entitlement, validUntil: "2026-09-28T09:59:59.000Z" } }, now);
assert.equal(expired.admittedForPaper, false);
assert.ok(expired.reasons.some((r) => r.includes("expired")));

const missingValidity = evaluateIndependentGlobalSourceAdmission({ ...base, entitlement: { ...base.entitlement, validUntil: "" } }, now);
assert.equal(missingValidity.admittedForPaper, false);
assert.ok(missingValidity.reasons.some((r) => r.includes("validity")));

const displayOnly = evaluateIndependentGlobalSourceAdmission({ ...base, entitlement: { ...base.entitlement, usageScope: "DISPLAY_ONLY" } }, now);
assert.equal(displayOnly.admittedForPaper, false);
assert.ok(displayOnly.reasons.some((r) => r.includes("non-display")));

const noAutomatedUse = evaluateIndependentGlobalSourceAdmission({ ...base, entitlement: { ...base.entitlement, automatedUseAllowed: false } }, now);
assert.equal(noAutomatedUse.admittedForPaper, false);
assert.ok(noAutomatedUse.reasons.some((r) => r.includes("automated")));

const directaSafeClaim = { ...base, provider: "directa-readonly", sourceFamily: "directa", readOnly: true, datafeedEntitled: true, writeTradingCommandsAllowed: false };
const directaSafe = evaluateIndependentGlobalSourceAdmission(directaSafeClaim, now);
assert.equal(directaSafe.admittedForPaper, true);
assert.equal(admitIndependentGlobalEvidence(directaSafeClaim, now).evidence?.eligibility, "PAPER");

const directaNoEntitlementClaim = { ...directaSafeClaim, datafeedEntitled: false };
const directaNoEntitlement = evaluateIndependentGlobalSourceAdmission(directaNoEntitlementClaim, now);
assert.equal(directaNoEntitlement.admittedForPaper, false);
assert.ok(directaNoEntitlement.reasons.some((r) => r.includes("Directa datafeed entitlement")));
assert.equal(admitIndependentGlobalEvidence(directaNoEntitlementClaim, now).evidence?.eligibility, "VALIDATION_ONLY");

const directaWritesClaim = { ...directaSafeClaim, writeTradingCommandsAllowed: true };
const directaWrites = evaluateIndependentGlobalSourceAdmission(directaWritesClaim, now);
assert.equal(directaWrites.admittedForPaper, false);
assert.ok(directaWrites.reasons.some((r) => r.includes("writes")));
assert.equal(admitIndependentGlobalEvidence(directaWritesClaim, now).evidence?.eligibility, "VALIDATION_ONLY");

console.log("Fenice independent global source admission tests: PASS");
