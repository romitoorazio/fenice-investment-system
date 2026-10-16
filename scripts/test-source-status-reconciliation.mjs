import assert from "node:assert/strict";
import { reconcileSourceStatus } from "../lib/ui/source-status-reconciliation.ts";

const now = Date.parse("2026-10-16T18:00:00Z");
const legacy = { generatedAt: "2026-10-16T16:30:00Z", sources: [
  { id: "finra-fixed-income", status: "failed", detail: "HTTP 403", checkedAt: "2026-10-16T16:29:48Z" },
  { id: "alpha-vantage", status: "healthy", checkedAt: "2026-10-16T16:29:10Z" },
] };
const global = { generatedAt: "2026-10-16T17:41:00Z", sources: [
  { id: "finra-fixed-income", name: "FINRA", status: "healthy", detail: "HTTP 200", checkedAt: "2026-10-16T17:41:00Z" },
  { id: "gdelt", status: "degraded", checkedAt: "2026-10-16T17:40:00Z" },
] };
const merged = reconcileSourceStatus(legacy, global, now);
const finra = merged.sources.find(x => x.id === "finra-fixed-income");
assert.equal(finra?.status, "healthy", "new authenticated FINRA evidence must replace stale 403");
assert.equal(finra?.reportOrigin, "global");
assert.equal(finra?.checkedAt, "2026-10-16T17:41:00.000Z");
assert.equal(merged.summary.checkedSources, 3, "same provider must never be double-counted");
assert.equal(merged.summary.healthy, 2);
assert.equal(merged.summary.degraded, 1);
assert.equal(merged.policy.liveTradingAllowed, false);

const oldGlobal = reconcileSourceStatus(legacy, {
  generatedAt: "2026-10-16T16:28:00Z",
  sources: [{ id: "finra-fixed-income", status: "healthy", checkedAt: "2026-10-16T16:27:00Z" }],
}, now);
assert.equal(oldGlobal.sources.find(x => x.id === "finra-fixed-income")?.status, "failed",
  "older global success must never override a later failed probe");

const impossibleFuture = reconcileSourceStatus(legacy, {
  generatedAt: "2026-10-16T17:41:00Z",
  sources: [{ id: "finra-fixed-income", status: "healthy", checkedAt: "2026-10-17T00:00:00Z" }],
}, now);
assert.equal(impossibleFuture.sources.find(x => x.id === "finra-fixed-income")?.status, "failed",
  "future-dated fabricated success must be ignored");

const olderThanDay = reconcileSourceStatus(legacy, global, now + 2 * 86_400_000);
assert.equal(olderThanDay.sources.find(x => x.id === "finra-fixed-income")?.status, "unknown",
  "old success is not evidence of current availability");
assert.equal(olderThanDay.summary.stale, 3);
const badTimestamp = reconcileSourceStatus(
  { generatedAt: "2026-10-16T16:30:00Z", sources: [{ id: "x", status: "healthy", checkedAt: "bad" }] },
  null, now,
);
assert.equal(badTimestamp.sources[0].status, "unknown");
assert.equal(badTimestamp.sources[0].checkedAt, null);
assert.throws(() => reconcileSourceStatus(legacy, global, NaN), /INVALID_SOURCE_STATUS_CLOCK/);
console.log("Fenice per-provider source status reconciliation: PASS");
