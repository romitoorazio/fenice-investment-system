import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {probeTwelveDataCoverage} from "../lib/global/provider-coverage-probe.mjs";
const nowIso="2026-11-06T10:00:00.000Z";
const instruments=[{mic:"XMIL",instrumentId:"XMIL:ENEL",symbol:"ENEL"},{mic:"XTKS",instrumentId:"XTKS:7203",symbol:"7203"}];
const fakeFetch=async url=>{
 const symbol=new URL(url).searchParams.get("symbol");
 return {ok:true,status:200,headers:{get:()=>"application/json"},json:async()=>symbol==="ENEL"?
 {symbol:"ENEL",currency:"EUR",bid:9.1,ask:9.2,timestamp:Date.parse(nowIso)/1000}:
 {symbol:"7203",currency:"JPY",close:3000,timestamp:Date.parse(nowIso)/1000}};
};
const result=await probeTwelveDataCoverage({instruments,apiKey:"test-key",fetchImpl:fakeFetch,nowIso});
assert.equal(result.mode,"READ_ONLY_PROVIDER_COVERAGE");
assert.equal(result.totals.attempted,2);
assert.equal(result.totals.validTransportQuotes,1);
assert.equal(result.totals.verifiedMarketEvidence,0);
assert.deepEqual(result.regions.ASIA,{attempted:1,validTransportQuotes:0,unsupportedOrFailed:1,verifiedMarketEvidence:0});
assert.deepEqual(result.regions.EUROPE,{attempted:1,validTransportQuotes:1,unsupportedOrFailed:0,verifiedMarketEvidence:0});
assert.deepEqual(result.regions.AMERICAS,{attempted:0,validTransportQuotes:0,unsupportedOrFailed:0,verifiedMarketEvidence:0});
assert.equal(result.rejectionReasons.PROVIDER_INVALID_SPREAD,1);
assert.equal(result.countsTowardRealPaper,false);
assert.equal(result.rows[0].verificationStatus,"PROVIDER_RESPONSE_UNVERIFIED");
assert.equal(result.rows[1].reason,"PROVIDER_INVALID_SPREAD");
assert.equal(JSON.stringify(result).includes("test-key"),false);
await assert.rejects(probeTwelveDataCoverage({instruments:[],apiKey:"x"}),/INVALID_PROBE_UNIVERSE/);
const workflow=await readFile(new URL("../.github/workflows/fenice-one-global-provider-diagnostics.yml",import.meta.url),"utf8");
assert.match(workflow,/workflow_dispatch:/);
assert.match(workflow,/contents: read/);
assert.match(workflow,/TWELVE_DATA_API_KEY:.*secrets\.TWELVE_DATA_API_KEY/);
assert.match(workflow,/INVALID_PROBE_INSTRUMENT/);
assert.match(workflow,/timeout-minutes: 5/);
assert.doesNotMatch(workflow,/schedule:\s*\n/);
console.log("Fenice ONE GLOBAL provider coverage probe contracts: PASS");
