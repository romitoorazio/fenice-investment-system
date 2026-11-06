import assert from "node:assert/strict";
import {readFile,mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {probeTwelveDataCoverage} from "../lib/global/provider-coverage-probe.mjs";
const nowIso="2026-11-06T10:00:00.000Z";
const instruments=[{mic:"XMIL",instrumentId:"XMIL:ENEL",symbol:"ENEL"},{mic:"XTKS",instrumentId:"XTKS:7203",symbol:"7203"}];
const fakeFetch=async url=>{
 const request=new URL(url),symbol=request.searchParams.get("symbol");
 assert.equal(request.searchParams.get("mic_code"),symbol==="ENEL"?"XMIL":"XTKS");
 return {ok:true,status:200,headers:{get:()=>"application/json"},json:async()=>symbol==="ENEL"?
 {symbol:"ENEL",mic_code:"XMIL",currency:"EUR",bid:9.1,ask:9.2,timestamp:Date.parse(nowIso)/1000,last_quote_at:Date.parse(nowIso)/1000}:
 {symbol:"7203",mic_code:"XTKS",currency:"JPY",close:3000,timestamp:Date.parse(nowIso)/1000,last_quote_at:Date.parse(nowIso)/1000}};
};
const result=await probeTwelveDataCoverage({instruments,apiKey:"test-key",fetchImpl:fakeFetch,nowIso});
assert.equal(result.mode,"READ_ONLY_PROVIDER_COVERAGE");
assert.equal(result.totals.attempted,2);
assert.equal(result.totals.validTransportQuotes,1);
assert.equal(result.totals.referenceOnlyQuotes,1);
assert.equal(result.totals.hardFailures,0);
assert.equal(result.totals.verifiedMarketEvidence,0);
assert.deepEqual(result.regions.ASIA,{requested:1,attempted:1,validTransportQuotes:0,referenceOnlyQuotes:1,hardFailures:0,unsupportedOrFailed:1,verifiedMarketEvidence:0});
assert.deepEqual(result.regions.EUROPE,{requested:1,attempted:1,validTransportQuotes:1,referenceOnlyQuotes:0,hardFailures:0,unsupportedOrFailed:0,verifiedMarketEvidence:0});
assert.deepEqual(result.regions.AMERICAS,{requested:0,attempted:0,validTransportQuotes:0,referenceOnlyQuotes:0,hardFailures:0,unsupportedOrFailed:0,verifiedMarketEvidence:0});
assert.equal(result.rejectionReasons.PROVIDER_REFERENCE_ONLY_NO_BID_ASK,1);
assert.equal(result.countsTowardRealPaper,false);
assert.equal(result.rows[0].verificationStatus,"PROVIDER_RESPONSE_UNVERIFIED");
assert.equal(result.rows[1].reason,"PROVIDER_REFERENCE_ONLY_NO_BID_ASK");
assert.equal(result.rows[1].referenceOnly,true);
assert.equal(result.rows[1].referenceObservation.last,3000);
assert.equal(result.rows[1].referenceObservation.currency,"JPY");
assert.equal(result.rows[1].referenceObservation.executableBidAsk,false);
assert.equal(result.rows[1].referenceObservation.countsTowardRealPaper,false);
assert.equal(result.rows[0].referenceOnly,false);
assert.equal(result.rows[0].referenceObservation,null);
assert.equal(JSON.stringify(result).includes("test-key"),false);
let calls=0;
const limited=await probeTwelveDataCoverage({instruments:[...instruments,{mic:"XNAS",instrumentId:"XNAS:MSFT",symbol:"MSFT"}],apiKey:"fixture",nowIso,
 fetchImpl:async()=>{calls++;return {ok:false,status:429,headers:{get:()=>"application/json"}};}});
assert.equal(calls,1,"Rate limiting must halt subsequent requests");
assert.equal(limited.totals.requested,3);
assert.equal(limited.totals.attempted,1);
assert.equal(limited.regions.ASIA.requested,1);
assert.equal(limited.regions.ASIA.attempted,0);
assert.equal(limited.regions.AMERICAS.requested,1);
assert.equal(limited.regions.AMERICAS.attempted,0);
assert.equal(limited.rows[1].requestSent,false);
assert.equal(limited.rows[0].reason,"PROVIDER_RATE_LIMITED");
assert.equal(limited.rows[1].reason,"PROVIDER_QUOTA_STOPPED");
assert.equal(limited.rows[2].reason,"PROVIDER_QUOTA_STOPPED");
assert.equal(limited.totals.verifiedMarketEvidence,0);
let apiQuotaCalls=0;
const apiQuota=await probeTwelveDataCoverage({instruments,apiKey:"fixture",nowIso,
 fetchImpl:async()=>{apiQuotaCalls++;return {ok:true,status:200,headers:{get:()=>"application/json"},json:async()=>({status:"error",code:"429",message:"quota exceeded"})};}});
assert.equal(apiQuotaCalls,1,"Provider JSON quota errors must stop further requests");
assert.equal(apiQuota.rows[0].reason,"PROVIDER_RATE_LIMITED");
assert.equal(apiQuota.rows[1].reason,"PROVIDER_QUOTA_STOPPED");
let networkCalls=0;
const networkDown=await probeTwelveDataCoverage({instruments,apiKey:"fixture",nowIso,
 fetchImpl:async()=>{networkCalls++;throw Error("simulated outage");}});
assert.equal(networkCalls,1,"Provider outage must not cascade requests");
assert.equal(networkDown.rows[0].reason,"PROVIDER_NETWORK_FAILURE");
assert.equal(networkDown.rows[1].reason,"PROVIDER_NETWORK_STOPPED");
assert.equal(networkDown.totals.attempted,1);
assert.equal(networkDown.totals.verifiedMarketEvidence,0);
let invalidUniverseRequests=0;
await assert.rejects(probeTwelveDataCoverage({instruments:[instruments[0],{mic:"BAD",instrumentId:"BAD:1",symbol:"X"}],apiKey:"fixture",fetchImpl:async()=>{invalidUniverseRequests++;throw Error("network must not be called");}}),/INVALID_PROBE_INSTRUMENT/);
assert.equal(invalidUniverseRequests,0);
await assert.rejects(probeTwelveDataCoverage({instruments:Array.from({length:11},(_,i)=>({mic:"XMIL",instrumentId:"XMIL:"+i,symbol:"X"+i})),apiKey:"fixture"}),/INVALID_PROBE_UNIVERSE/);
await assert.rejects(probeTwelveDataCoverage({instruments:[],apiKey:"x"}),/INVALID_PROBE_UNIVERSE/);

// Exercise the CLI failure path, not merely its source text. The report must be valid JSON
// with no credential leakage even when the universe file contains malformed JSON.
const temp=await mkdtemp(join(tmpdir(),"fenice-probe-failure-"));
try{
 const invalidPath=join(temp,"universe.json");
 await writeFile(invalidPath,"{malformed", {mode:0o600});
 const child=spawnSync(process.execPath,[new URL("./probe-fenice-global-provider.mjs",import.meta.url).pathname],{
  encoding:"utf8",timeout:10000,
  env:{...process.env,FENICE_GLOBAL_PROBE_UNIVERSE:invalidPath,TWELVE_DATA_API_KEY:"fixture-value"}
 });
 assert.equal(child.status,2);
 const failure=JSON.parse(child.stdout);
 assert.equal(failure.status,"FAILED");
 assert.equal(failure.reason,"PROBE_DIAGNOSTIC_ERROR");
 assert.equal(failure.countsTowardRealPaper,false);
 assert.equal(failure.totals.verifiedMarketEvidence,0);
 assert.equal((child.stdout+child.stderr).includes("fixture-value"),false);
 const missingKey=spawnSync(process.execPath,[new URL("./probe-fenice-global-provider.mjs",import.meta.url).pathname],{
  encoding:"utf8",timeout:10000,
  env:{...process.env,FENICE_GLOBAL_PROBE_UNIVERSE:invalidPath,TWELVE_DATA_API_KEY:""}
 });
 assert.equal(missingKey.status,2);
 assert.match(missingKey.stderr,/PROBE_NOT_CONFIGURED/);
 assert.equal(missingKey.stdout,"");

}finally{await rm(temp,{recursive:true,force:true});}
const workflow=await readFile(new URL("../.github/workflows/fenice-one-global-provider-diagnostics.yml",import.meta.url),"utf8");
const probeCli=await readFile(new URL("./probe-fenice-global-provider.mjs",import.meta.url),"utf8");
assert.match(probeCli,/reason:"PROBE_DIAGNOSTIC_ERROR"/);
assert.match(probeCli,/countsTowardRealPaper:false/);
assert.match(probeCli,/process\.exitCode=2/);
assert.match(workflow,/workflow_dispatch:/);
assert.match(workflow,/contents: read/);
assert.match(workflow,/TWELVE_DATA_API_KEY:.*secrets\.TWELVE_DATA_API_KEY/);
assert.match(workflow,/INVALID_PROBE_INSTRUMENT/);
assert.match(workflow,/timeout-minutes: 5/);
assert.match(workflow,/FENICE_GLOBAL_PROBE_UNIVERSE: \.\/fenice-global-probe-universe\.json/);
assert.match(workflow,/TWELVE_DATA_API_KEY_MISSING/);
assert.match(workflow,/exit 2/);
assert.match(workflow,/if: always\(\)/);
assert.doesNotMatch(workflow,/schedule:\s*\n/);
console.log("Fenice ONE GLOBAL provider coverage probe contracts: PASS");
