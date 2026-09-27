import assert from "node:assert/strict";
import { resolveGlobalPaperEntitlementProof } from "../lib/trading/global-market-data-entitlement.ts";

const now = Date.parse("2026-09-28T09:00:00.000Z");
const hash = "a".repeat(64);
const registry = {
  version: 1,
  policy: "DEFAULT_DENY_DUAL_CONTROL",
  provider: "twelve-data",
  updatedAt: "2026-09-28T08:00:00.000Z",
  entitlements: [{
    provider: "twelve-data",
    exchangeMic: "XMIL",
    status: "VERIFIED",
    paperAllowed: true,
    evidenceRef: "provider-account-audit:td-global-xmil-2026-09",
    evidenceSha256: hash,
    reviewedAt: "2026-09-28T08:00:00.000Z",
    validUntil: "2026-10-28T08:00:00.000Z",
  }],
};

const envOnly = resolveGlobalPaperEntitlementProof({ entitlements: [] }, "XMIL", {
  approvedMics: ["XMIL"],
  evidenceRef: "provider-account-audit:td-global-xmil-2026-09",
  evidenceSha256: hash,
}, now);
assert.equal(envOnly.paperAllowed, false, "runtime/env claims alone must never promote a venue to PAPER");
assert.equal(envOnly.persistedEvidenceFound, false);

const persistedOnly = resolveGlobalPaperEntitlementProof(registry, "XMIL", {}, now);
assert.equal(persistedOnly.paperAllowed, false, "persisted evidence alone must still require runtime corroboration");
assert.equal(persistedOnly.persistedEvidenceFound, true);
assert.equal(persistedOnly.runtimeClaimMatched, false);

const wrongRef = resolveGlobalPaperEntitlementProof(registry, "XMIL", {
  approvedMics: ["XMIL"],
  evidenceRef: "wrong-ref",
  evidenceSha256: hash,
}, now);
assert.equal(wrongRef.paperAllowed, false);

const wrongHash = resolveGlobalPaperEntitlementProof(registry, "XMIL", {
  approvedMics: ["XMIL"],
  evidenceRef: "provider-account-audit:td-global-xmil-2026-09",
  evidenceSha256: "b".repeat(64),
}, now);
assert.equal(wrongHash.paperAllowed, false);

const exact = resolveGlobalPaperEntitlementProof(registry, "XMIL", {
  approvedMics: ["XMIL"],
  evidenceRef: "provider-account-audit:td-global-xmil-2026-09",
  evidenceSha256: hash,
}, now);
assert.equal(exact.paperAllowed, true);
assert.deepEqual(exact.approvedMics, ["XMIL"]);
assert.equal(exact.evidenceRef, "provider-account-audit:td-global-xmil-2026-09");
assert.equal(exact.evidenceSha256, hash);

const wrongMic = resolveGlobalPaperEntitlementProof(registry, "XPAR", {
  approvedMics: ["XPAR"],
  evidenceRef: "provider-account-audit:td-global-xmil-2026-09",
  evidenceSha256: hash,
}, now);
assert.equal(wrongMic.paperAllowed, false, "entitlement must be exact-MIC");

const expiredRegistry = structuredClone(registry);
expiredRegistry.entitlements[0].validUntil = "2026-09-27T08:00:00.000Z";
const expired = resolveGlobalPaperEntitlementProof(expiredRegistry, "XMIL", {
  approvedMics: ["XMIL"],
  evidenceRef: "provider-account-audit:td-global-xmil-2026-09",
  evidenceSha256: hash,
}, now);
assert.equal(expired.paperAllowed, false);
assert.equal(expired.expired, true);

console.log("Fenice global market-data entitlement dual-control tests: PASS");
