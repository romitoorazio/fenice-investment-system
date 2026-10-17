import assert from "node:assert/strict";
import { resolveGlobalPaperEntitlementProof } from "../lib/trading/global-market-data-entitlement.ts";

const now = Date.parse("2026-09-28T09:00:00.000Z");
const hash = "a".repeat(64);
const registry = {
  version: 2,
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
    usageScope: "NON_DISPLAY_INTERNAL",
    automatedUseAllowed: true,
  }],
};
const runtime = {
  approvedMics: ["XMIL"],
  evidenceRef: "provider-account-audit:td-global-xmil-2026-09",
  evidenceSha256: hash,
  confirmedAt: "2026-09-28T08:58:00.000Z",
};

const envOnly = resolveGlobalPaperEntitlementProof({ entitlements: [] }, "XMIL", runtime, now);
assert.equal(envOnly.paperAllowed, false, "runtime/env claims alone must never promote a venue to PAPER");
assert.equal(envOnly.persistedEvidenceFound, false);

const persistedOnly = resolveGlobalPaperEntitlementProof(registry, "XMIL", {}, now);
assert.equal(persistedOnly.paperAllowed, false, "persisted evidence alone must still require runtime corroboration");
assert.equal(persistedOnly.persistedEvidenceFound, true);
assert.equal(persistedOnly.runtimeClaimMatched, false);
assert.equal(persistedOnly.runtimeClaimFresh, false);

const wrongRef = resolveGlobalPaperEntitlementProof(registry, "XMIL", { ...runtime, evidenceRef: "wrong-ref" }, now);
assert.equal(wrongRef.paperAllowed, false);

const wrongHash = resolveGlobalPaperEntitlementProof(registry, "XMIL", { ...runtime, evidenceSha256: "b".repeat(64) }, now);
assert.equal(wrongHash.paperAllowed, false);

const exact = resolveGlobalPaperEntitlementProof(registry, "XMIL", runtime, now);
assert.equal(exact.paperAllowed, true);
assert.deepEqual(exact.approvedMics, ["XMIL"]);
assert.equal(exact.evidenceRef, "provider-account-audit:td-global-xmil-2026-09");
assert.equal(exact.evidenceSha256, hash);
assert.equal(exact.validUntil, "2026-10-28T08:00:00.000Z");
assert.equal(exact.usageScope, "NON_DISPLAY_INTERNAL");
assert.equal(exact.automatedUseAllowed, true);
assert.equal(exact.runtimeClaimFresh, true);
assert.equal(exact.legalUseScopeVerified, true);

const wrongMic = resolveGlobalPaperEntitlementProof(registry, "XPAR", { ...runtime, approvedMics: ["XPAR"] }, now);
assert.equal(wrongMic.paperAllowed, false, "entitlement must be exact-MIC");

const expiredRegistry = structuredClone(registry);
expiredRegistry.entitlements[0].validUntil = "2026-09-27T08:00:00.000Z";
const expired = resolveGlobalPaperEntitlementProof(expiredRegistry, "XMIL", runtime, now);
assert.equal(expired.paperAllowed, false);
assert.equal(expired.expired, true);

const noExpiryRegistry = structuredClone(registry);
noExpiryRegistry.entitlements[0].validUntil = null;
const noExpiry = resolveGlobalPaperEntitlementProof(noExpiryRegistry, "XMIL", runtime, now);
assert.equal(noExpiry.paperAllowed, false);
assert.equal(noExpiry.expired, true);

const staleRuntime = resolveGlobalPaperEntitlementProof(registry, "XMIL", {
  ...runtime,
  confirmedAt: "2026-09-28T08:54:59.000Z",
}, now);
assert.equal(staleRuntime.paperAllowed, false);
assert.equal(staleRuntime.runtimeClaimFresh, false);

const futureRuntime = resolveGlobalPaperEntitlementProof(registry, "XMIL", {
  ...runtime,
  confirmedAt: "2026-09-28T09:00:01.000Z",
}, now);
assert.equal(futureRuntime.paperAllowed, false);
assert.equal(futureRuntime.runtimeClaimFresh, false);

const displayOnlyRegistry = structuredClone(registry);
displayOnlyRegistry.entitlements[0].usageScope = "DISPLAY_ONLY";
const displayOnly = resolveGlobalPaperEntitlementProof(displayOnlyRegistry, "XMIL", runtime, now);
assert.equal(displayOnly.paperAllowed, false);
assert.equal(displayOnly.legalUseScopeVerified, false);
assert.ok(displayOnly.reasons.some((reason) => reason.includes("non-display")));

const noAutomatedRegistry = structuredClone(registry);
noAutomatedRegistry.entitlements[0].automatedUseAllowed = false;
const noAutomated = resolveGlobalPaperEntitlementProof(noAutomatedRegistry, "XMIL", runtime, now);
assert.equal(noAutomated.paperAllowed, false);
assert.equal(noAutomated.legalUseScopeVerified, false);

const badMicFormat = resolveGlobalPaperEntitlementProof(registry, "XMILA", runtime, now);
assert.equal(badMicFormat.paperAllowed, false);
assert.ok(badMicFormat.reasons.some((reason) => reason.includes("four-character MIC")));

console.log("Fenice global market-data entitlement dual-control tests: PASS");
