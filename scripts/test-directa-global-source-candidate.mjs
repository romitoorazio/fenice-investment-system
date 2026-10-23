import assert from "node:assert/strict";
import { evaluateDirectaGlobalSourceCandidate } from "../lib/trading/directa-global-source-candidate.ts";

const now = Date.parse("2026-09-28T10:00:30.000Z");
const quote = {
  ticker: "ENEL",
  isin: "IT0003128367",
  lastPrice: 8.125,
  priceObservedAt: "2026-09-28T10:00:00.000Z",
};
const venueRecord = {
  broker: "directa",
  brokerTicker: "ENEL",
  isin: "IT0003128367",
  exchangeMic: "XMIL",
  currency: "EUR",
  status: "VERIFIED",
  evidenceRef: "fixture:directa-enel-xmil",
  evidenceSha256: "b".repeat(64),
  reviewedAt: "2026-09-27T10:00:00.000Z",
  validUntil: "2026-10-28T10:00:00.000Z",
};
const entitlementRecord = {
  exchangeMic: "XMIL",
  status: "VERIFIED",
  realtimeHistoricalAllowed: true,
  evidenceRef: "fixture:directa-realtime-xmil",
  evidenceSha256: "c".repeat(64),
  reviewedAt: "2026-09-27T10:00:00.000Z",
  validUntil: "2026-10-28T10:00:00.000Z",
  usageScope: "NON_DISPLAY_INTERNAL",
  automatedUseAllowed: true,
};
const venueRegistry = { policy: "DEFAULT_DENY_BROKER_VENUE_IDENTITY", identities: [venueRecord] };
const entitlementRegistry = { policy: "DEFAULT_DENY_DUAL_CONTROL", entitlements: [entitlementRecord] };
const runtime = {
  apiRealtimeHistoricalConfirmed: true,
  confirmedMarketMics: ["XMIL"],
  evidenceRef: entitlementRecord.evidenceRef,
  evidenceSha256: entitlementRecord.evidenceSha256,
  confirmedAt: "2026-09-28T10:00:00.000Z",
};

const good = evaluateDirectaGlobalSourceCandidate(quote, venueRegistry, entitlementRegistry, runtime, now);
assert.equal(good.venueIdentity.exactVenueVerified, true);
assert.equal(good.entitlement.verified, true);
assert.equal(good.entitlement.legalUseScopeVerified, true);
assert.equal(good.admission.admission.admittedForPaper, true);
assert.equal(good.admission.evidence?.eligibility, "PAPER");
assert.equal(good.admission.evidence?.exchangeMic, "XMIL");
assert.equal(good.admission.evidence?.sourceFamily, "directa");

const noPersistedEvidence = evaluateDirectaGlobalSourceCandidate(
  quote,
  { policy: "DEFAULT_DENY_BROKER_VENUE_IDENTITY", identities: [] },
  { policy: "DEFAULT_DENY_DUAL_CONTROL", entitlements: [] },
  runtime,
  now,
);
assert.equal(noPersistedEvidence.admission.admission.admittedForPaper, false);
assert.equal(noPersistedEvidence.admission.evidence, null, "without verified broker venue identity Fenice must create no market evidence at all");

const wrongIsin = evaluateDirectaGlobalSourceCandidate({ ...quote, isin: "IT0000000000" }, venueRegistry, entitlementRegistry, runtime, now);
assert.equal(wrongIsin.venueIdentity.exactVenueVerified, false);
assert.equal(wrongIsin.admission.evidence, null, "mismatched ISIN must fail before evidence construction");

const badRuntime = evaluateDirectaGlobalSourceCandidate(quote, venueRegistry, entitlementRegistry, { ...runtime, evidenceSha256: "d".repeat(64) }, now);
assert.equal(badRuntime.entitlement.verified, false);
assert.equal(badRuntime.admission.evidence?.eligibility, "VALIDATION_ONLY");

const staleRuntime = evaluateDirectaGlobalSourceCandidate(
  quote,
  venueRegistry,
  entitlementRegistry,
  { ...runtime, confirmedAt: "2026-09-28T09:54:00.000Z" },
  now,
);
assert.equal(staleRuntime.entitlement.runtimeClaimFresh, false);
assert.equal(staleRuntime.entitlement.verified, false);
assert.equal(staleRuntime.admission.admission.admittedForPaper, false);
assert.equal(staleRuntime.admission.evidence?.eligibility, "VALIDATION_ONLY");

const displayOnly = evaluateDirectaGlobalSourceCandidate(
  quote,
  venueRegistry,
  { ...entitlementRegistry, entitlements: [{ ...entitlementRecord, usageScope: "DISPLAY_ONLY" }] },
  runtime,
  now,
);
assert.equal(displayOnly.entitlement.verified, false);
assert.equal(displayOnly.admission.admission.admittedForPaper, false);
assert.equal(displayOnly.admission.evidence?.eligibility, "VALIDATION_ONLY");

const stale = evaluateDirectaGlobalSourceCandidate({ ...quote, priceObservedAt: "2026-09-28T09:55:00.000Z" }, venueRegistry, entitlementRegistry, runtime, now);
assert.equal(stale.admission.admission.admittedForPaper, false);
assert.equal(stale.admission.evidence?.eligibility, "VALIDATION_ONLY");

const badTimestamp = evaluateDirectaGlobalSourceCandidate({ ...quote, priceObservedAt: "10:00:00" }, venueRegistry, entitlementRegistry, runtime, now);
assert.equal(badTimestamp.admission.admission.admittedForPaper, false);
assert.equal(badTimestamp.admission.evidence, null);

console.log("Fenice Directa global source candidate tests: PASS");
