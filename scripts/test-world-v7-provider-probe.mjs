import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { WORLD_V7_PILOT, classifyMarketState, classifyQuote, classifyStockCatalogue, buildPilotObservation,
  emptyPilotObservation } from "../lib/market/world-v7-provider-probe.mjs";
const now="2026-10-20T08:30:00.000Z";
const state=[{code:"XMIL",is_market_open:true}];
const quote={symbol:"ENEL",mic_code:"XMIL",currency:"EUR",close:"8.83",timestamp:Date.parse(now)/1000-10};
const target=WORLD_V7_PILOT.XMIL;
const good=buildPilotObservation("XMIL",now,state,quote);
assert.equal(good.state.reportedOpen,true);
assert.equal(good.state.exactMic,true);
assert.equal(good.state.authoritativeExchangeProof,false);

const catalog={status:"ok",count:1,data:[{symbol:"ENEL",mic_code:"XMIL",currency:"EUR",
  access:{global:"Basic",plan:"Pro",plan_business:"Venture"}}]};
const listing=classifyStockCatalogue(target,catalog);
assert.equal(listing.status,"EXACT_LISTING_IN_CATALOGUE");
assert.equal(listing.exactIdentity,true);
assert.equal(listing.requiredPlan,"Pro");
assert.equal(listing.paperRightsVerified,false);
assert.equal(classifyStockCatalogue(target,{...catalog,data:[{...catalog.data[0],mic_code:"XNAS"}]}).status,"SYMBOL_MIC_NOT_IN_PROVIDER_CATALOGUE");
assert.equal(classifyStockCatalogue(target,{...catalog,data:[...catalog.data,...catalog.data]}).status,"AMBIGUOUS_EXACT_MIC");
assert.equal(classifyStockCatalogue(target,{...catalog,data:[{...catalog.data[0],currency:"USD"}]}).status,"CATALOGUE_CURRENCY_MISMATCH");
assert.equal(classifyStockCatalogue(target,{code:403,status:"error"}).status,"NO_ACCESS");
assert.equal(classifyQuote(target,{code:400,status:"error",message:"This symbol is not available with your current plan, upgrade now"},now).status,"PLAN_ACCESS_DENIED");
assert.equal(classifyQuote(target,{code:400,status:"error",message:"Unsupported exchange"},now).status,"NOT_FOUND_OR_INVALID_IDENTIFIER");
const trueInput=buildPilotObservation("XMIL",now,state,quote,catalog);
assert.equal(trueInput.catalogue.requiredPlan,"Pro");
assert.equal(trueInput.paperReady,false);
assert.equal(good.quote.researchFresh,true);
assert.equal(good.quote.ageSeconds,10);
assert.equal(good.quote.providerPricePresent,true);
assert.equal(good.quote.paperEligible,false);
assert.equal(good.paperReady,false);
assert.equal(good.quoteFamiliesApproved,0);
assert.equal(good.privatePricePublished,false);
assert(!JSON.stringify(good).includes("8.83"),"no licensed provider quote price in report");
assert(good.blockers.includes("SECOND_INDEPENDENT_ENTITLED_QUOTE_MISSING"));
assert.equal(classifyMarketState(target,[{code:"XETR",is_market_open:true}],now).status,"UNVERIFIED_RESPONSE");
assert.equal(classifyMarketState(target,[...state,...state],now).status,"UNVERIFIED_RESPONSE");
assert.equal(classifyMarketState(target,[{code:"XMIL",is_market_open:"true"}],now).status,"UNVERIFIED_RESPONSE");
assert.equal(classifyMarketState(target,[{code:"XMIL",is_market_open:false}],now).reportedOpen,false);
assert.equal(classifyMarketState(target,{code:429,status:"error"},now).status,"RATE_LIMIT");
assert.equal(classifyQuote(target,{...quote,mic_code:undefined},now).status,"MIC_UNVERIFIED");
assert.equal(classifyQuote(target,{...quote,mic_code:"XETR"},now).status,"MIC_UNVERIFIED");
assert.equal(classifyQuote(target,{...quote,symbol:"AAPL"},now).status,"SYMBOL_MISMATCH");
assert.equal(classifyQuote(target,{...quote,currency:"USD"},now).status,"CURRENCY_MISMATCH");
assert.equal(classifyQuote(target,{...quote,timestamp:quote.timestamp-600},now).status,"STALE_OR_FUTURE_TRADE");
assert.equal(classifyQuote(target,{...quote,timestamp:quote.timestamp+600},now).status,"STALE_OR_FUTURE_TRADE");
assert.equal(classifyQuote(target,{...quote,timestamp:undefined},now).status,"TIMESTAMP_MISSING");
assert.equal(classifyQuote(target,{...quote,close:"0"},now).status,"PRICE_UNAVAILABLE");
assert.equal(classifyQuote(target,{code:403,status:"error"},now).status,"NO_ACCESS");
assert.equal(classifyQuote(target,{code:400,status:"error"},now).status,"NOT_FOUND_OR_INVALID_IDENTIFIER");
const closed=buildPilotObservation("XETR",now,[{code:"XETR",is_market_open:false}],
  {...quote,symbol:"SIE",mic_code:"XETR"});
assert(closed.blockers.includes("PROVIDER_REPORTED_CLOSED"));
const tokyo=buildPilotObservation("XTKS",now,[{code:"XTKS",is_market_open:true}],
  {...quote,symbol:"7203",mic_code:"XTKS",currency:"JPY"});
assert(tokyo.blockers.includes("INDEPENDENT_FX_EUR_QUOTE_MISSING"));
assert.equal(WORLD_V7_PILOT.XTKS.providerMic,"XJPX");
const tokyoCorrect=buildPilotObservation("XTKS",now,[{code:"XJPX",is_market_open:true}],
  {...quote,symbol:"7203",mic_code:"XJPX",currency:"JPY"},
  {status:"ok",data:[{symbol:"7203",mic_code:"XJPX",currency:"JPY",access:{plan:"Pro"}}]});
assert.equal(tokyoCorrect.state.exactMic,true);
assert.equal(tokyoCorrect.state.operatingMicIsNotSegmentProof,true);
assert.equal(tokyoCorrect.catalogue.exactIdentity,true);
assert(tokyoCorrect.blockers.includes("OPERATING_MIC_DOES_NOT_PROVE_SEGMENT_OPEN"));
assert.equal(tokyoCorrect.paperReady,false);
assert.equal(emptyPilotObservation("XTKS",now).quote.status,"CREDENTIAL_NOT_CONFIGURED");
assert.throws(()=>emptyPilotObservation("XNYS",now),/NOT|INVALID_WORLD_V7_OBSERVATION_REQUEST/);
const outfile="/tmp/fenice-world-v7-probe-test.json";
const output=execFileSync(process.execPath,["scripts/probe-world-v7-market-data.mjs","--venue=XMIL","--output="+outfile],
  {encoding:"utf8",env:{...process.env,TWELVE_DATA_API_KEY:""}}).trim();
const dry=JSON.parse(output);
assert.equal(dry.usedNetwork,false);
assert.equal(dry.paperReady,false);
assert.equal(dry.pricePublished,false);
console.log("WORLD V7 provider rights, advertised plan, quote freshness, venue identity, secrets-free and dry-run tests: PASS");
