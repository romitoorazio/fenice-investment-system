import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { yahooRegularSessionResearchQuote, yahooWorldIntradayResearchQuote, committeeSessionResearchQuote } from "../lib/intelligence/yahoo-regular-research-quote.mjs";

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
assert.match(committee,/priceEvidence: committeeSessionResearchQuote\(asset, terminalGeneratedAt, now\.getTime\(\)\)/);
assert.match(committee,/NO_VERIFIED_REGULAR_TRADE/);
assert.match(shadow,/quote\?\.evidenceType !== "YAHOO_REGULAR_TRADE_META_RESEARCH_ONLY"/);
assert.match(shadow,/Math\.abs\(current - observed\)/);
// Yahoo research quote guards still run on the Terminal, but the 7d/30d
// shadow scorecard now runs after the daily Horizon Split (or fallback cron).
// Re-running it every intraday Terminal refresh caused deployment cascades.
assert.match(yaml,/Fenice V7 Horizon Split/);
assert.ok(yaml.includes('cron: "22 23 * * 1-5"'), "Keep daily shadow fallback");
assert.doesNotMatch(yaml,/      - Fenice World Terminal/);
console.log("FENICE100K Yahoo regular-market quote provenance, V7 isolation and terminal hook: PASS");


const usAsset = {symbol:"SPY", currency:"USD", technical:{symbol:"SPY", currency:"USD", market:"USA",
  timestampSemantics:"DAILY_CANDLE_SESSION_BUCKET_NOT_LAST_TRADE", researchQuote:good}};
const atDecision = (asset, snapshotAt = now.toISOString(), decisionMs = now.getTime()) =>
  committeeSessionResearchQuote(asset, snapshotAt, decisionMs);
assert.deepEqual(atDecision(usAsset), {...good, referencePriceSemantics:"DAILY_ADJUSTED_CANDLE_CLOSE"});
assert.equal(atDecision(usAsset, "2026-10-13T14:58:59.000Z"), null);
assert.equal(atDecision(usAsset, "2026-10-13T15:02:00.000Z"), null);
assert.equal(atDecision(usAsset, now.toISOString(), Date.parse(good.observedAt) + 30*60_000 + 1), null);
assert.equal(atDecision(usAsset, "2026-02-30T15:01:00.000Z"), null);
assert.equal(atDecision({...usAsset, symbol:"QQQ"}), null);

const { WORLD_YAHOO_RESEARCH_SYMBOLS } = await import("../lib/intelligence/world-terminal-universe.mjs");
for (const [key, mapping] of Object.entries(WORLD_YAHOO_RESEARCH_SYMBOLS)) {
  const [exchangeMic, ticker] = key.split(":");
  const definition = [ticker,mapping.query,ticker,"Azioni",exchangeMic,{
    exchangeMic,currency:mapping.currency,providerTicker:mapping.query,
    providerCurrency:mapping.providerCurrency ?? mapping.currency,
    priceScaleToListing:mapping.priceScaleToListing ?? 1,
    researchOnly:true,paperExecutionAllowed:false,brokerSubmissionAllowed:false,
    exactMicExecutionVerified:false,
  }];
  const foreign = {...meta,symbol:mapping.query,currency:definition[5].providerCurrency,regularMarketPrice:1000};
  const q = yahooWorldIntradayResearchQuote(foreign,definition,now);
  assert.equal(q.price,1000*(mapping.priceScaleToListing ?? 1),key);
  assert.equal(q.currency,mapping.currency,key);
  assert.equal(q.exchangeMic,exchangeMic,key);
  assert.equal(q.evidenceType,"YAHOO_WORLD_REGULAR_TRADE_RESEARCH_ONLY");
  const asset = {symbol:ticker, currency:mapping.currency, technical:{symbol:ticker, yahooSymbol:mapping.query,
    currency:mapping.currency, exchangeMic, researchOnly:true, worldIntradayResearchQuote:q}};
  assert.deepEqual(atDecision(asset), {...q, referencePriceSemantics:null}, key);
  for (const changes of [{exchangeMic:"XXXX"}, {currency:"XXX"}, {feedCount:2}, {source:"unidentified"},
    {exactMicExecutionVerified:true}, {executionEligible:true}, {brokerSubmissionAllowed:true},
    {liveTradingAllowed:true}, {paperCertificationEligible:true}, {observedAt:"invalid"}, {price:0},
    {evidenceType:"YAHOO_REGULAR_TRADE_META_RESEARCH_ONLY"}]) {
    assert.equal(atDecision({...asset, technical:{...asset.technical, worldIntradayResearchQuote:{...q, ...changes}}}), null, key);
  }
  assert.equal(atDecision({...asset, technical:{...asset.technical, yahooSymbol:"WRONG"}}), null, key);
  assert.equal(atDecision({...asset, technical:{...asset.technical, worldIntradayResearchQuote:null, researchQuote:good}}), null, key);

  for(const flag of ["executionEligible","paperCertificationEligible","brokerSubmissionAllowed","liveTradingAllowed","exactMicExecutionVerified"]) assert.equal(q[flag],false);
  assert.equal(yahooWorldIntradayResearchQuote({...foreign,symbol:"WRONG"},definition,now),null);
  assert.equal(yahooWorldIntradayResearchQuote({...foreign,currency:"XXX"},definition,now),null);
  assert.equal(yahooWorldIntradayResearchQuote({...foreign,regularMarketPrice:"1000"},definition,now),null);
  assert.equal(yahooWorldIntradayResearchQuote({...foreign,regularMarketTime:undefined},definition,now),null);
  assert.equal(yahooWorldIntradayResearchQuote(foreign,definition,new Date("2026-10-13T15:31:00Z")),null);
  assert.equal(yahooWorldIntradayResearchQuote(foreign,definition,new Date("2026-10-13T14:58:00Z")),null);
  const forged=structuredClone(definition);forged[5].priceScaleToListing=2;
  assert.equal(yahooWorldIntradayResearchQuote(foreign,forged,now),null);
}
assert.match(terminal,/worldIntradayResearchQuote: worldResearch\?\.researchOnly === true/);
assert.match(terminal,/const researchQuote = worldResearch\?\.researchOnly===true \? null/);
console.log("Worldwide intraday research isolation: PASS");
