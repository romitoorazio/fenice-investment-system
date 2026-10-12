import assert from "node:assert/strict";
import { catalystMatchesAsset } from "../lib/intelligence/catalyst-matching.mjs";

const ethereum = { symbol: "ETH", name: "Ethereum" };

for (const discovery of [
  { name: "Temporal Gradient Inversion", signal: "A new method for private reconstruction" },
  { name: "Quantum Feature Selection", signal: "Biomedical methods and algorithms" },
  { name: "Ethena update", signal: "A different crypto asset" },
  { name: "Bethany Systems", signal: "Unrelated company announcement" },
]) {
  assert.equal(
    catalystMatchesAsset(ethereum, discovery),
    false,
    `substring-only evidence must not match ETH: ${discovery.name}`,
  );
}

assert.equal(
  catalystMatchesAsset(ethereum, { name: "Ethereum upgrade", signal: "Protocol release" }),
  true,
  "full asset name must match",
);
assert.equal(
  catalystMatchesAsset(ethereum, { name: "ETH staking update", signal: "Protocol release" }),
  true,
  "standalone ticker must match",
);
assert.equal(
  catalystMatchesAsset(
    { symbol: "NVDA", name: "NVIDIA CORP" },
    { name: "NVIDIA announces platform update", signal: "Company release" },
  ),
  true,
  "meaningful company-name tokens must match",
);
assert.equal(
  catalystMatchesAsset(
    { symbol: "SPY", name: "S&P 500 ETF" },
    { name: "Former German spy chief arrested", signal: "Political news" },
  ),
  false,
  "lowercase common words must not be mistaken for uppercase tickers",
);
assert.equal(
  catalystMatchesAsset(
    { symbol: "SPY", name: "S&P 500 ETF" },
    { name: "SPY ETF advances after market open", signal: "Market update" },
  ),
  true,
  "explicit uppercase ticker mentions must still match",
);
assert.equal(
  catalystMatchesAsset(
    { symbol: "SPY", name: "S&P 500 ETF" },
    { name: "$SPY breaks above resistance", signal: "Market update" },
  ),
  true,
  "cash-tagged ticker mentions must still match",
);
assert.equal(
  catalystMatchesAsset(
    { symbol: "TSM", name: "Taiwan Semiconductor Manufacturing Company Limited" },
    { name: "Unrelated semiconductor supplier update", signal: "Sector news" },
  ),
  false,
  "generic sector words in a company name must not create cross-company evidence",
);


import {
  compareDiscoveryEvidence,
  evaluateCatalystEvidence,
  parsePrimaryEventDate,
  primaryCatalystIdentity,
} from "../lib/intelligence/catalyst-evidence-policy.mjs";
import { readFile } from "node:fs/promises";

const nowMs = Date.parse("2026-10-12T20:00:00.000Z");
const asset = { symbol: "NVDA", name: "NVIDIA CORP" };
const official = {
  symbol: "NVDA",
  name: "NVDA · deposito SEC 8-K",
  signal: "Filing officiale, richiede analisi del documento",
  source: "SEC EDGAR · fonte primaria",
  sourceTier: 1,
  verification: "primary",
  date: "2026-10-10",
  url: "https://www.sec.gov/Archives/edgar/data/1045810/0001/form8k.htm",
  score: 88,
};
const unverified = {
  name: "NVIDIA AI investing bonanza",
  signal: "Breaking news about NVIDIA",
  source: "Google News RSS",
  date: "2026-10-11T16:00:00.000Z",
  url: "https://news.example.com/article",
  score: 95,
};
const noPrimary = evaluateCatalystEvidence(asset, [unverified], nowMs);
assert.equal(noPrimary.count, 0);
assert.equal(noPrimary.score, 48);
assert.equal(noPrimary.researchMentions, 1);
assert.equal(noPrimary.evidence.length, 0);
assert.equal(noPrimary.executionEligible, false);

const first = evaluateCatalystEvidence(asset, [official, unverified], nowMs);
assert.equal(first.count, 1);
assert.equal(first.recentCount, 1);
assert.equal(first.researchMentions, 2);
assert.equal(first.score, 56);
assert.equal(first.sourceUrls[0], official.url);
assert.equal(first.executionEligible, false);
assert.equal(evaluateCatalystEvidence(asset, [official, { ...official, id: "duplicate-url" }], nowMs).count, 1);

for (const [name, changes] of [
  ["missing attribution", { symbol: undefined }],
  ["wrong ticker", { symbol: "AAPL" }],
  ["stale filing", { date: "2026-09-20" }],
  ["future filing", { date: "2026-10-14" }],
  ["impossible calendar day", { date: "2026-02-30" }],
  ["no date", { date: null }],
  ["wrong tier", { sourceTier: 3 }],
  ["wrong verification", { verification: "unknown" }],
  ["non-HTTPS filing", { url: "http://www.sec.gov/Archives/edgar/data/1045810/0001/form8k.htm" }],
  ["evil lookalike", { url: "https://www.sec.gov.bad.example/Archives/edgar/data/1045810/0001/form8k.htm" }],
  ["credential-bearing URL", { url: "https://user:pass@www.sec.gov/Archives/edgar/data/1045810/0001/form8k.htm" }],
  ["non-official document", { url: "https://www.sec.gov.fake.example/Archives/edgar/data/1045810/0001/form8k.htm" }],
  ["wrong evidence source", { source: "Google News RSS · SEC" }],
  ["irrelevant SEC path", { url: "https://www.sec.gov/investor/anything" }],
]) {
  const candidate = { ...official, ...changes };
  assert.equal(
    evaluateCatalystEvidence(asset, [candidate], nowMs).count, 0,
    name + " must never create a strong catalyst",
  );
}

assert.equal(parsePrimaryEventDate("2026-10-10"), Date.parse("2026-10-10T00:00:00.000Z"));
assert.equal(parsePrimaryEventDate("2026-10-12T10:00:00Z"), Date.parse("2026-10-12T10:00:00.000Z"));
assert.equal(parsePrimaryEventDate("2026-02-30"), null);
assert.equal(parsePrimaryEventDate("2026-10-10T26:00:00Z"), null);
assert.equal(parsePrimaryEventDate("20261010T120000Z"), null);
assert.equal(primaryCatalystIdentity(official, nowMs)?.symbol, "NVDA");
assert.equal(primaryCatalystIdentity({ ...official, symbol: "nVdA" }, nowMs)?.symbol, "NVDA");

const primary = { sourceTier: 1, score: 60, name: "Verified SEC event" };
const weaker = { sourceTier: 3, score: 99, name: "Unverified headline" };
const sorted = [weaker, primary].sort(compareDiscoveryEvidence);
assert.equal(sorted[0].name, primary.name, "source tier 1 must precede editorial headlines even with lower scores");

const committeeRunner = await readFile(new URL("./run-investment-committee.mjs", import.meta.url), "utf8");
const primaryCollector = await readFile(new URL("./enrich-primary-events.mjs", import.meta.url), "utf8");
assert.match(committeeRunner, /evaluateCatalystEvidence\(asset, discoveries, now\.getTime\(\)\)/);
assert.match(primaryCollector, /\.sort\(compareDiscoveryEvidence\)/);
assert.doesNotMatch(primaryCollector, /\(b\.sourceTier \?\? 3\) - \(a\.sourceTier \?\? 3\)/);
assert.match(committeeRunner, /executionEligible: false/);

console.log("Fenice Investment Committee issuer-specific primary catalyst provenance and matching regression: PASS");
