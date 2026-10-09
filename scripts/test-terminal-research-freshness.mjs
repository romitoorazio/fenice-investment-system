import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildRuntimeTerminal } from "../lib/terminal-runtime.ts";

const fixture = JSON.parse(await readFile(new URL("../data/terminal-intelligence.json", import.meta.url), "utf8"));
assert(Array.isArray(fixture.assets) && fixture.assets.length > 0, "terminal fixture must contain assets");
assert(fixture.assets.some(item => /Yahoo Finance chart/i.test(item.technical.source)), "test must use actual daily chart input");

const recent = structuredClone(fixture);
recent.mode = "live"; // prove that old published snapshots are normalized
for (const asset of recent.assets) asset.technical.observedAt = new Date(Date.now() - 30_000).toISOString();
const research = buildRuntimeTerminal(recent);
assert.equal(research.mode, "research", "legacy LIVE mode must not imply realtime brokerage");
assert(research.assets.every(item => item.technical.freshness.status === "aggiornato"), "freshly fetched daily candles must not look realtime");
assert(research.warnings.some(w => w.includes("execution-grade")), "dashboard must clearly disclose daily research-only pricing");

const future = structuredClone(fixture);
future.mode = "live";
for (const asset of future.assets) asset.technical.observedAt = new Date(Date.now() + 3_600_000).toISOString();
const blockedFuture = buildRuntimeTerminal(future);
assert(blockedFuture.assets.every(item => item.technical.freshness.status === "non disponibile"), "future-dated prices must fail closed");
assert(blockedFuture.assets.every(item => ["ATTENDI", "EVITA"].includes(item.decision)), "even speculative assets must not pass on future-dated prices");
assert(blockedFuture.assets.every(item => item.targetWeightPercent === 0), "never allocate study capital on invalid timestamps");
assert.equal(blockedFuture.allocationCheck.reservePercent, 100);

const stale = structuredClone(fixture);
for (const asset of stale.assets) asset.technical.observedAt = new Date(Date.now() - 15 * 86_400_000).toISOString();
const blockedStale = buildRuntimeTerminal(stale);
assert(blockedStale.assets.every(item => ["obsoleto", "non disponibile"].includes(item.technical.freshness.status)));
assert(blockedStale.assets.every(item => item.targetWeightPercent === 0), "expired technical observations must not fund speculative positions");
assert.equal(blockedStale.allocationCheck.reservePercent, 100);

console.log("Fenice terminal EOD/realtime honesty and fail-closed capital allocation tests: PASS");
