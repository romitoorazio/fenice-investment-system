import assert from "node:assert/strict";
import {gatherPhase9IndependentEod} from "../lib/global/phase9-independent-eod.mjs";
const day=d=>d+"T14:30:00.000Z";
const days=["2026-11-05","2026-11-06","2026-11-09","2026-11-10"];
const history={mic:"XNAS",instrumentId:"XNAS:MSFT",currency:"USD",synthetic:false,
 provenanceVerified:false,sourceUrl:"https://query1.finance.yahoo.com/v8/finance/chart/MSFT?range=1mo&interval=1d",
 closes:days.map((d,i)=>({observedAt:day(d),close:100+i}))};
const av={"Time Series (Daily)":Object.fromEntries(days.map((d,i)=>[d,{"4. close":String(100+i)}]))};
const td={status:"ok",values:days.map((d,i)=>({datetime:d,close:String(100+i)})).reverse()};
const keys={twelveData:"FAKE_TWELVE_KEY",alphaVantage:"FAKE_ALPHA_KEY"},nowIso="2026-11-10T17:00:00Z";
const get=async url=>({ok:true,status:200,json:async()=>url.startsWith("https://api.twelvedata.com/")?td:av});
const x=await gatherPhase9IndependentEod({histories:[history],keys,nowIso,fetchImpl:get});
assert.equal(x.independentlyComparedEodProviders,2);
assert.equal(x.researchCrossVendorAgreement,true);
assert.equal(x.providerResults[0].status,"CONSISTENT_EOD");
assert.equal(x.providerResults[1].status,"CONSISTENT_EOD");
assert.equal(x.providerResults[0].latestComparedDate,"2026-11-09");
assert.equal(x.confirmedExecutablePriceProviders,0);
assert.equal(x.certifiedPaper,false);assert.equal(x.ordersGenerated,0);
assert(!JSON.stringify(x).includes("FAKE_"));
const none=await gatherPhase9IndependentEod({histories:[history],keys:{},nowIso,fetchImpl:get});
assert.equal(none.independentlyComparedEodProviders,0);
assert(none.providerResults.every(y=>y.status==="NOT_CONFIGURED"));
const mismatched=await gatherPhase9IndependentEod({histories:[history],keys,nowIso,
 fetchImpl:async url=>({ok:true,status:200,json:async()=>url.startsWith("https://api.twelvedata.com/")?
  {status:"ok",values:days.map((d,i)=>({datetime:d,close:String((100+i)*1.08)}))}:av})});
assert.equal(mismatched.independentlyComparedEodProviders,1);
assert.equal(mismatched.researchCrossVendorAgreement,false);
assert.equal(mismatched.confirmedExecutablePriceProviders,0);
const stale=await gatherPhase9IndependentEod({histories:[history],keys,nowIso:"2026-11-24T17:00:00Z",fetchImpl:get});
assert.equal(stale.independentlyComparedEodProviders,0);
const future=await gatherPhase9IndependentEod({histories:[{...history,closes:[...history.closes,
 {observedAt:"2026-11-11T14:30:00Z",close:999}]}],keys,nowIso,fetchImpl:get});
assert.equal(future.publicYahooReferenceAvailable,false);
assert.equal(future.independentlyComparedEodProviders,0);
const bad=await gatherPhase9IndependentEod({histories:[history],keys,nowIso,
 fetchImpl:async()=>({ok:false,status:429})});
assert(bad.providerResults.every(x=>x.status==="RATE_LIMIT"));
const denied=await gatherPhase9IndependentEod({histories:[history],keys,nowIso,
 fetchImpl:async()=>({ok:true,status:200,json:async()=>({Information:"Premium required"})})});
assert(denied.providerResults.every(x=>x.status==="PROVIDER_REJECTED"));
const missing=await gatherPhase9IndependentEod({histories:[],keys,nowIso,fetchImpl:get});
assert.equal(missing.independentlyComparedEodProviders,0);
assert.equal(missing.publicYahooReferenceAvailable,false);
await assert.rejects(gatherPhase9IndependentEod({histories:[],nowIso:"bad"}),/PHASE9_SOURCE_INVALID_POLICY/);
console.log("FENICE Phase9 independent Twelve Data / Alpha Vantage EOD source audit: PASS (not executable)");
