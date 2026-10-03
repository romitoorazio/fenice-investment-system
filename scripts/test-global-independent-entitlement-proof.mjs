import assert from "node:assert/strict";
import { resolveIndependentGlobalEntitlementProof } from "../lib/trading/global-independent-entitlement-proof.ts";

const now = Date.parse("2026-09-28T10:00:00.000Z");
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
const registry = { version: 1, policy: "DEFAULT_DENY_DUAL_CONTROL", entitlements: [record] };
const runtime = {
  provider: "euronext-stream",
  sourceFamily: "euronext-stream",
  approvedMics: ["EXGM"],
  evidenceRef: record.evidenceRef,
  evidenceSha256: record.evidenceSha256,
  confirmedAt: "2026-09-28T09:58:00.000Z",
};

const good = resolveIndependentGlobalEntitlementProof(registry, "euronext-stream", "euronext-stream", "EXGM", runtime, now);
assert.equal(good.verified, true);
assert.equal(good.persistedEvidenceFound, true);
assert.equal(good.runtimeClaimMatched, true);
assert.equal(good.runtimeClaimFresh, true);
assert.equal(good.legalUseScopeVerified, true);
assert.equal(good.usageScope, "NON_DISPLAY_INTERNAL");
assert.equal(good.automatedUseAllowed, true);

const runtimeOnly = resolveIndependentGlobalEntitlementProof({ entitlements: [] }, "euronext-stream", "euronext-stream", "EXGM", runtime, now);
assert.equal(runtimeOnly.verified, false);
assert.equal(runtimeOnly.persistedEvidenceFound, false);

const persistedOnly = resolveIndependentGlobalEntitlementProof(registry, "euronext-stream", "euronext-stream", "EXGM", {}, now);
assert.equal(persistedOnly.verified, false);
assert.equal(persistedOnly.runtimeClaimFresh, false);

const wrongProvider = resolveIndependentGlobalEntitlementProof(registry, "deutsche-boerse-cloud-stream", "euronext-stream", "EXGM", runtime, now);
assert.equal(wrongProvider.verified, false);

const wrongFamily = resolveIndependentGlobalEntitlementProof(registry, "euronext-stream", "other-family", "EXGM", runtime, now);
assert.equal(wrongFamily.verified, false);

const wrongMic = resolveIndependentGlobalEntitlementProof(registry, "euronext-stream", "euronext-stream", "XPAR", { ...runtime, approvedMics: ["XPAR"] }, now);
assert.equal(wrongMic.verified, false);

const badMic = resolveIndependentGlobalEntitlementProof(registry, "euronext-stream", "euronext-stream", "EXGMI", runtime, now);
assert.equal(badMic.verified, false);

const wrongRef = resolveIndependentGlobalEntitlementProof(registry, "euronext-stream", "euronext-stream", "EXGM", { ...runtime, evidenceRef: "wrong" }, now);
assert.equal(wrongRef.verified, false);

const wrongHash = resolveIndependentGlobalEntitlementProof(registry, "euronext-stream", "euronext-stream", "EXGM", { ...runtime, evidenceSha256: "f".repeat(64) }, now);
assert.equal(wrongHash.verified, false);

const staleRuntime = resolveIndependentGlobalEntitlementProof(registry, "euronext-stream", "euronext-stream", "EXGM", { ...runtime, confirmedAt: "2026-09-28T09:54:59.000Z" }, now);
assert.equal(staleRuntime.verified, false);
assert.equal(staleRuntime.runtimeClaimFresh, false);

const futureRuntime = resolveIndependentGlobalEntitlementProof(registry, "euronext-stream", "euronext-stream", "EXGM", { ...runtime, confirmedAt: "2026-09-28T10:00:01.000Z" }, now);
assert.equal(futureRuntime.verified, false);
assert.equal(futureRuntime.runtimeClaimFresh, false);

const expiredRegistry = structuredClone(registry);
expiredRegistry.entitlements[0].validUntil = "2026-09-28T09:59:59.000Z";
const expired = resolveIndependentGlobalEntitlementProof(expiredRegistry, "euronext-stream", "euronext-stream", "EXGM", runtime, now);
assert.equal(expired.verified, false);
assert.equal(expired.expired, true);

const noExpiryRegistry = structuredClone(registry);
noExpiryRegistry.entitlements[0].validUntil = null;
const noExpiry = resolveIndependentGlobalEntitlementProof(noExpiryRegistry, "euronext-stream", "euronext-stream", "EXGM", runtime, now);
assert.equal(noExpiry.verified, false);
assert.equal(noExpiry.expired, true);

const displayOnlyRegistry = structuredClone(registry);
displayOnlyRegistry.entitlements[0].usageScope = "DISPLAY_ONLY";
const displayOnly = resolveIndependentGlobalEntitlementProof(displayOnlyRegistry, "euronext-stream", "euronext-stream", "EXGM", runtime, now);
assert.equal(displayOnly.verified, false);
assert.equal(displayOnly.legalUseScopeVerified, false);

const noAutomatedRegistry = structuredClone(registry);
noAutomatedRegistry.entitlements[0].automatedUseAllowed = false;
const noAutomated = resolveIndependentGlobalEntitlementProof(noAutomatedRegistry, "euronext-stream", "euronext-stream", "EXGM", runtime, now);
assert.equal(noAutomated.verified, false);

console.log("Fenice independent global entitlement dual-control tests: PASS");
