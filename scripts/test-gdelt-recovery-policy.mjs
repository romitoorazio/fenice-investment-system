import assert from "node:assert/strict";
import { collectThemesWithCircuit } from "../lib/intelligence/gdelt-theme-collector.mjs";
import { readFile } from "node:fs/promises";
import {
  shouldAttemptGdeltRecovery,
  isGdeltProviderBlock,
  parseGdeltSeenAt,
  normalizeGdeltResearchArticles,
} from "../lib/intelligence/gdelt-recovery-policy.mjs";

const now = Date.parse("2026-10-12T19:20:00.000Z");
const recentCheck = status => ({ sources: [{
  id: "gdelt",
  status,
  checkedAt: "2026-10-12T19:15:00.000Z",
}] });
for (const state of ["healthy", "degraded", "failed"]) {
  assert.equal(shouldAttemptGdeltRecovery(recentCheck(state), now), false, "never duplicate a recent upstream GDELT check");
}
assert.equal(shouldAttemptGdeltRecovery(recentCheck("failed"), now + 16 * 60_000), true, "permit a later hourly research recovery");
assert.equal(shouldAttemptGdeltRecovery({ sources: [] }, now), true);
assert.equal(shouldAttemptGdeltRecovery(recentCheck("unknown"), now), true);
assert.equal(shouldAttemptGdeltRecovery({ sources: [{ id: "gdelt", status: "failed", checkedAt: "invalid" }] }, now), false, "unverifiable upstream timestamps cannot authorize an immediate extra call");
assert.equal(shouldAttemptGdeltRecovery({ sources: [{ id: "gdelt", status: "failed", checkedAt: "2026-10-12T19:21:00Z" }] }, now), false, "clock skew must not trigger network retry");
assert.equal(shouldAttemptGdeltRecovery(null, Number.NaN), false);
assert(isGdeltProviderBlock(new Error("HTTP 429")));
assert(isGdeltProviderBlock("HTTP 403 Forbidden"));
assert(isGdeltProviderBlock("HTTP 503"));
assert(isGdeltProviderBlock("too many requests"));
assert(!isGdeltProviderBlock(new Error("HTTP 404")));
assert(!isGdeltProviderBlock(new Error("fetch failed")));

assert.equal(parseGdeltSeenAt("20261012T190000Z"), "2026-10-12T19:00:00.000Z");
assert.equal(parseGdeltSeenAt("2026-10-12T19:00:00Z"), "2026-10-12T19:00:00.000Z");
assert.equal(parseGdeltSeenAt("20260230T190000Z"), null);
assert.equal(parseGdeltSeenAt("20261012T290000Z"), null);
assert.equal(parseGdeltSeenAt("2026-10-12"), null);

const good = { title: "Official tech sector news", url: "https://news.example.org/article/1", seendate: "20261012T190000Z", domain: "untrusted-supplied-domain" };
const examples = [
  good,
  { ...good }, // duplicate URL
  { ...good, title: "", url: "https://news.example.org/empty" },
  { ...good, url: "http://news.example.org/insecure" },
  { ...good, url: "javascript:alert(1)" },
  { ...good, url: "https://user:pass@news.example.org/secret" },
  { ...good, url: "https://news.example.org/future", seendate: "20261013T190000Z" },
  { ...good, url: "https://news.example.org/stale", seendate: "20260921T190000Z" },
  { ...good, url: "https://news.example.org/no-time", seendate: null },
  { ...good, title: "Another news", url: "https://news.example.org/article/2", seendate: "2026-10-12T18:00:00Z" },
];
const parsed = normalizeGdeltResearchArticles({ articles: examples }, { nowMs: now });
assert.equal(parsed.length, 2, "only fresh, uniquely identified, safe HTTPS news may enter research");
assert.equal(parsed[0].domain, "news.example.org", "derive domain from URL, never trust upstream display label");
assert.equal(parsed[0].seendate, "2026-10-12T19:00:00.000Z");
assert.deepEqual(normalizeGdeltResearchArticles({ articles: examples }, { nowMs: now, limit: 1 }), parsed.slice(0, 1));
assert.deepEqual(normalizeGdeltResearchArticles({ articles: [] }, { nowMs: now }), []);
assert.throws(() => normalizeGdeltResearchArticles({ foo: "no articles" }, { nowMs: now }), /ArtList/);
assert.throws(() => normalizeGdeltResearchArticles(null, { nowMs: now }), /ArtList/);
assert.deepEqual(normalizeGdeltResearchArticles({ articles: [good] }, { nowMs: Number.NaN }), []);

const reliability = await readFile(new URL("./run-reliability-layer.mjs", import.meta.url), "utf8");
assert.match(reliability, /shouldAttemptGdeltRecovery\(upstreamHealth, Date\.now\(\)\)/);
assert.match(reliability, /normalizeGdeltResearchArticles\(data, \{ nowMs: Date\.now\(\) \}\)/);
assert.match(reliability, /isGdeltProviderBlock\(error\)/);
assert.match(reliability, /const \{ text \} = await fetchText\(url, 8000\)/);
assert.doesNotMatch(reliability, /for \(let attempt = 1; attempt <= 3; attempt \+= 1\)/);
assert.match(reliability, /createHash\('sha256'\)\.update\(article\.url\)/);

const primaryCalls = [];
const rssCalls = [];
const bounded = await collectThemesWithCircuit(["macro", "ai", "biotech", "energy"], {
  fetchPrimary: async theme => {
    primaryCalls.push(theme);
    if (theme === "ai") throw new Error("HTTP 429: free GDELT quota");
    return [{ theme }];
  },
  fetchFallback: async theme => {
    rssCalls.push(theme);
    return [{ theme, discoveryOnly: true }];
  },
  isProviderBlocked: isGdeltProviderBlock,
});
assert.deepEqual(primaryCalls, ["macro", "ai"], "a 429 must suppress all remaining same-run GDELT requests");
assert.deepEqual(rssCalls, ["ai", "biotech", "energy"], "remaining themes use the discovery-only fallback");
assert.equal(bounded.circuitOpen, true);
assert.equal(bounded.skippedPrimary, 2);
assert.deepEqual(bounded.results.map(row => row.status), ["fulfilled", "fulfilled", "fulfilled", "fulfilled"]);
assert.deepEqual(bounded.results.map(row => row.value.primary), [true, false, false, false]);
const nonBlockingCalls = [];
const nonBlocking = await collectThemesWithCircuit(["a", "b"], {
  fetchPrimary: async theme => {
    nonBlockingCalls.push(theme);
    if (theme === "a") throw new Error("HTTP 404");
    return [{ theme }];
  },
  fetchFallback: async theme => [{ theme, discoveryOnly: true }],
  isProviderBlocked: isGdeltProviderBlock,
});
assert.deepEqual(nonBlockingCalls, ["a", "b"], "non-rate-limit errors must not trip the provider circuit");
assert.equal(nonBlocking.circuitOpen, false);
assert.equal(nonBlocking.skippedPrimary, 0);
const doubleFailure = await collectThemesWithCircuit(["a", "b"], {
  fetchPrimary: async () => { throw new Error("HTTP 503"); },
  fetchFallback: async () => { throw new Error("RSS unavailable"); },
  isProviderBlocked: isGdeltProviderBlock,
});
assert.deepEqual(doubleFailure.results.map(row => row.status), ["rejected", "rejected"]);
assert.equal(doubleFailure.skippedPrimary, 1);
const broadNews = await readFile(new URL("./enrich-broad-news.mjs", import.meta.url), "utf8");
assert.match(broadNews, /collectThemesWithCircuit\(themes/);
assert.doesNotMatch(broadNews, /Promise\.allSettled\(themes\.map\(fetchThemeWithFallback\)\)/);
assert.match(broadNews, /providerCircuitOpen: circuitOpen/);

console.log("Fenice GDELT optional research budget, validity and no-execution regression: PASS");
