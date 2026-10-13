import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { yahooRegularSessionResearchQuote } from "../lib/intelligence/yahoo-regular-research-quote.mjs";

const now = new Date("2026-10-13T15:01:00.000Z");
const ts = value => Math.floor(Date.parse(value) / 1000);
const meta = {
  symbol:"SPY",currency:"USD",regularMarketPrice:501.25,
  regularMarketTime:ts("2026-10-13T14:59:00.000Z"),
  currentTradingPeriod:{regular:{
    start:ts("2026-10-13T13:30:00.000Z"),
    end:ts("2026-10-13T20:00:00.000Z"),
  }},
};
const good = yahooRegularSessionResearchQuote(meta,{yahooSymbol:"SPY",market:"USA",now});
assert.equal(good.price,501.25);
assert.equal(good.observedAt,"2026-10-13T14:59:00.000Z");
assert.equal(good.evidenceType,"YAHOO_REGULAR_TRADE_META_RESEARCH_ONLY");
assert.equal(good.paperCertificationEligible,false);
assert.equal(good.brokerSubmissionAllowed,false);
assert.equal(good.liveTradingAllowed,false);
assert.equal(good.executionEligible,false);
assert.equal(good.feedCount,1,"one Yahoo family must not masquerade as cross-checked execution-grade");

const invalid = [
  ["missing meta",null],
  ["daily candle timestamp is not a quote", {...meta, regularMarketTime:undefined, timestamp:ts("2026-10-13T13:30:00.000Z")}],
  ["stale previous day quote", {...meta,regularMarketTime:ts("2026-10-12T19:59:00.000Z")}],
  ["future observation", {...meta,regularMarketTime:ts("2026-10-13T15:03:00.000Z")}],
  ["invalid time 1", {...meta,regularMarketTime:"2026-10-13T14:59:00Z"}],
  ["invalid time 2", {...meta,regularMarketTime:NaN}],
  ["pre-market quote", {...meta,regularMarketTime:ts("2026-10-13T13:20:00.000Z")}],
  ["after-hours quote", {...meta,regularMarketTime:ts("2026-10-13T20:01:00.000Z")}],
  ["absent market period", {...meta,currentTradingPeriod:undefined}],
  ["market period swapped", {...meta,currentTradingPeriod:{regular:{start:ts("2026-10-13T20:00:00.000Z"),end:ts("2026-10-13T13:30:00.000Z")}}}],
  ["invalid price null", {...meta,regularMarketPrice:null}],
  ["invalid price zero", {...meta,regularMarketPrice:0}],
  ["invalid price negative", {...meta,regularMarketPrice:-1}],
  ["invalid price NaN", {...meta,regularMarketPrice:NaN}],
  ["wrong provider symbol", {...meta,symbol:"QQQ"}],
  ["wrong quote currency", {...meta,currency:"EUR"}],
];
for (const [name,entry] of invalid) {
  assert.equal(yahooRegularSessionResearchQuote(entry,{yahooSymbol:"SPY",market:"USA",now}),null,name);
}
assert.equal(yahooRegularSessionResearchQuote(meta,{yahooSymbol:"SPY",market:"Crypto globale",now}),null);
assert.equal(yahooRegularSessionResearchQuote(meta,{yahooSymbol:"SPY",market:"USA",now:new Date("bad")}),null);
assert.equal(yahooRegularSessionResearchQuote(meta,{yahooSymbol:"SPY",market:"USA",now:new Date("2026-10-13T15:31:00.000Z")}),null);

const terminal = await readFile(new URL("./run-terminal-engine.mjs",import.meta.url),"utf8");
const committee = await readFile(new URL("./run-investment-committee.mjs",import.meta.url),"utf8");
const shadow = await readFile(new URL("../lib/intelligence/horizon-shadow-evaluator.mjs",import.meta.url),"utf8");
const yaml = await readFile(new URL("../.github/workflows/v7-horizon-shadow-evaluation.yml",import.meta.url),"utf8");
assert.match(terminal,/yahooRegularSessionResearchQuote\(result\.meta/);
assert.match(terminal,/DAILY_CANDLE_SESSION_BUCKET_NOT_LAST_TRADE/);
assert.match(committee,/priceEvidence: asset\.technical\?\.researchQuote/);
assert.match(committee,/NO_VERIFIED_REGULAR_TRADE/);
assert.match(shadow,/quote\?\.evidenceType !== "YAHOO_REGULAR_TRADE_META_RESEARCH_ONLY"/);
assert.match(shadow,/Math\.abs\(current - observed\)/);
assert.match(yaml,/Fenice World Terminal/);
console.log("FENICE100K Yahoo regular-market quote provenance, V7 isolation and terminal hook: PASS");
