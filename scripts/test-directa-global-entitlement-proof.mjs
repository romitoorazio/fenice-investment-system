import assert from "node:assert/strict";
import { resolveDirectaGlobalEntitlementProof } from "../lib/trading/directa-global-entitlement-proof.ts";

const now = Date.parse("2026-09-28T10:00:00.000Z");
const record = {
  exchangeMic: "XMIL",
  status: "VERIFIED",
  realtimeHistoricalAllowed: true,
  evidenceRef: "fixture:directa-realtime-xmil",
  evidenceSha256: "c".repeat(64),
  reviewedAt: "2026-09-27T10:00:00.000Z",
  validUntil: "2026-10-28T10:00:00.000Z",
};
const registry = {
  version: 1,
  policy: "DEFAULT_DENY_DUAL_CONTROL",
  entitlements: [record],
};
const runtime = {
  apiRealtimeHistoricalConfirmed: true,
  confirmedMarketMics: ["XMIL"],
  evidenceRef: record.evidenceRef,
  evidenceSha256: record.evidenceSha256,
};

const good = resolveDirectaGlobalEntitlementProof(registry, "XMIL", runtime, now);
assert.equal(good.verified, true);
assert.equal(good.persistedEvidenceFound, true);
assert.equal(good.runtimeClaimMatched, true);

const runtimeOnly = resolveDirectaGlobalEntitlementProof({ policy: "DEFAULT_DENY_DUAL_CONTROL", entitlements: [] }, "XMIL", runtime, now);
assert.equal(runtimeOnly.verified, false);

const persistedOnly = resolveDirectaGlobalEntitlementProof(registry, "XMIL", {}, now);
assert.equal(persistedOnly.verified, false);
assert.equal(persistedOnly.persistedEvidenceFound, true);
assert.equal(persistedOnly.runtimeClaimMatched, false);

const wrongMic = resolveDirectaGlobalEntitlementProof(registry, "XPAR", runtime, now);
assert.equal(wrongMic.verified, false);

const wrongRef = resolveDirectaGlobalEntitlementProof(registry, "XMIL", { ...runtime, evidenceRef: "fixture:other" }, now);
assert.equal(wrongRef.verified, false);

const wrongHash = resolveDirectaGlobalEntitlementProof(registry, "XMIL", { ...runtime, evidenceSha256: "d".repeat(64) }, now);
assert.equal(wrongHash.verified, false);

const expired = resolveDirectaGlobalEntitlementProof({
  ...registry,
  entitlements: [{ ...record, validUntil: "2026-09-28T09:59:59.000Z" }],
}, "XMIL", runtime, now);
assert.equal(expired.verified, false);
assert.equal(expired.expired, true);

const revoked = resolveDirectaGlobalEntitlementProof({
  ...registry,
  entitlements: [{ ...record, status: "REVOKED" }],
}, "XMIL", runtime, now);
assert.equal(revoked.verified, false);

console.log("Fenice Directa global entitlement proof tests: PASS");
