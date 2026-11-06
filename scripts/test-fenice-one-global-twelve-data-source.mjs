import assert from "node:assert/strict";
import {fetchTwelveDataGlobalQuote} from "../lib/global/twelve-data-quote-source.mjs";
const nowIso="2026-11-06T10:00:00Z",timestamp=Date.parse("2026-11-06T09:59:30Z")/1000;
const args={mic:"XMIL",instrumentId:"XMIL:TEST",symbol:"TEST",apiKey:"PRIVATE_TOKEN",nowIso};
const run=payload=>fetchTwelveDataGlobalQuote({...args,fetchImpl:async(url)=>{assert.ok(url.includes("apikey=PRIVATE_TOKEN"));assert.equal(new URL(url).searchParams.get("mic_code"),"XMIL");return {ok:true,status:200,headers:{get:()=> "application/json"},json:async()=>({mic_code:"XMIL",last_quote_at:timestamp,...payload})};}});
const valid=await run({symbol:"TEST",currency:"EUR",bid:"100",ask:"100.2",timestamp});
assert.equal(valid.ok,true);
assert.equal(valid.quote.bid,100);
assert.equal(valid.quote.sourceUrl.includes("PRIVATE_TOKEN"),false);
const referenceOnly=await run({symbol:"TEST",currency:"EUR",close:"100",timestamp});
assert.equal(referenceOnly.ok,false);
assert.equal(referenceOnly.reason,"PROVIDER_REFERENCE_ONLY_NO_BID_ASK");
assert.equal(referenceOnly.reference.last,100);
assert.equal(referenceOnly.reference.mic,"XMIL");
assert.equal(referenceOnly.reference.executableBidAsk,false);
assert.equal(referenceOnly.reference.countsTowardRealPaper,false);
assert.equal(referenceOnly.reference.verificationStatus,"PROVIDER_RESPONSE_UNVERIFIED");
assert.equal((await run({symbol:"TEST",currency:"EUR",close:"100",timestamp,last_quote_at:timestamp+600})).reference,undefined,
 "A future reference quote is not reliable research coverage");
assert.equal((await run({symbol:"TEST",currency:"EUR",close:"100",timestamp,mic_code:"XNYS"})).reference,undefined,
 "Do not classify a wrong-venue reference as covered");
assert.equal((await run({symbol:"TEST",currency:"EUR",close:"100",timestamp,bid:100})).reason,"PROVIDER_INVALID_SPREAD",
 "A one-sided spread is malformed, not a normal OHLC-only reference");
assert.equal((await run({symbol:"TEST",currency:"EUR",close:"not-a-number",timestamp})).reason,"PROVIDER_INVALID_SPREAD");
assert.equal((await run({symbol:"TEST",currency:"EUR",close:"100",timestamp,last_quote_at:null})).reference,undefined);
assert.equal((await run({symbol:"OTHER",currency:"EUR",bid:"100",ask:"100.2",timestamp})).reason,"PROVIDER_INSTRUMENT_MISMATCH");
assert.equal((await run({status:"error",code:429,message:"API credits exhausted"})).reason,"PROVIDER_RATE_LIMITED");
assert.equal((await run({symbol:"TEST",currency:"EUR",bid:"100",ask:"100.2",last_quote_at:timestamp-600})).reason,"PROVIDER_STALE_OR_FUTURE_QUOTE");
assert.equal((await run({symbol:"TEST",bid:"100",ask:"100.2",timestamp})).reason,"PROVIDER_INSTRUMENT_MISMATCH");
assert.equal((await run({symbol:"TEST",currency:"USD",bid:"100",ask:"100.2",timestamp})).reason,"PROVIDER_INSTRUMENT_MISMATCH");
assert.equal((await run({symbol:"TEST",currency:"EUR",bid:"100",ask:"100.2",last_quote_at:999999999999999})).reason,"PROVIDER_STALE_OR_FUTURE_QUOTE");
assert.equal((await run({symbol:"TEST",mic_code:"XETR",currency:"EUR",bid:"100",ask:"100.2",timestamp})).reason,"PROVIDER_INSTRUMENT_MISMATCH");
assert.equal((await run({symbol:"TEST",mic_code:null,currency:"EUR",bid:"100",ask:"100.2",timestamp})).reason,"PROVIDER_INSTRUMENT_MISMATCH");
assert.equal((await run({symbol:"TEST",currency:"EUR",bid:"100",ask:"100.2",timestamp,last_quote_at:null})).reason,"PROVIDER_STALE_OR_FUTURE_QUOTE");
assert.equal((await run({symbol:"TEST",currency:"EUR",bid:"100",ask:"100.2",timestamp:timestamp-600,last_quote_at:timestamp})).ok,true);
console.log("Fenice ONE GLOBAL Twelve Data quote bridge contracts: PASS");
