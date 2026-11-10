import assert from "node:assert/strict";
import {EUROPEAN_ISSUER_LEIS,buildExactLeiFilingQuery,
  parseEuropeanFilings,discoverEuropeanFilings}
  from "../lib/intelligence/one-global-esef-discovery.mjs";
const now="2026-11-11T10:00:00.000Z";
assert.equal(EUROPEAN_ISSUER_LEIS.length,3);
assert.equal(new Set(EUROPEAN_ISSUER_LEIS.map(x=>x.lei)).size,3);
assert.equal(new Set(EUROPEAN_ISSUER_LEIS.map(x=>x.key)).size,3);
const identity=EUROPEAN_ISSUER_LEIS[0];
const u=new URL(buildExactLeiFilingQuery(identity));
assert.equal(u.hostname,"filings.xbrl.org");
assert.equal(u.searchParams.get("include"),"entity");
assert.equal(JSON.parse(u.searchParams.get("filter"))[0].val,identity.lei);
const entity={type:"entity",id:"row-lei",attributes:{
  identifier:identity.lei,name:"ENEL - SPA",
}};
const filing=(attrs={})=>({
  type:"filing",id:"verified-2025",
  relationships:{entity:{data:{type:"entity",id:"row-lei"}}},
  attributes:{country:"IT",period_end:"2025-12-31",
    processed:"2026-02-15T10:00:00.000Z",
    viewer_url:"https://filings.xbrl.org/filing/example/2025",
    json_url:"https://filings.xbrl.org/filing/example/2025.json",
    error_count:0,...attrs},
});
const payload={data:[filing()],included:[entity]};
const good=parseEuropeanFilings(identity,payload,now);
assert.equal(good.state,"LEI_INDEXED_REPORT_FOUND");
assert.equal(good.availableReports,1);
assert.equal(good.latestReport.periodEnd,"2025-12-31");
assert.equal(parseEuropeanFilings(identity,{
  ...payload,data:[filing({processed:"2025-04-29T15:28:31"})],
},now).state,"LEI_INDEXED_REPORT_FOUND");
assert.equal(parseEuropeanFilings(identity,{
  ...payload,data:[filing({processed:"2025-04-29 16:48:07.315087"})],
},now).state,"LEI_INDEXED_REPORT_FOUND",
  "Actual production XBRL API emits SQL-style UTC microseconds");
assert.equal(parseEuropeanFilings(identity,{
  ...payload,data:[filing({processed:"2025-04-29 16:48:07.315087"})],
},now).latestReport.processedAt,"2025-04-29T16:48:07.315Z");
assert.equal(parseEuropeanFilings(identity,{
  ...payload,data:[filing({processed:"2025-04-29T15:28:31.123456+00:00"})],
},now).state,"LEI_INDEXED_REPORT_FOUND");
assert.equal(parseEuropeanFilings(identity,{
  ...payload,data:[filing({processed:null,date_added:null})],
},now).state,"LEI_INDEXED_REPORT_FOUND",
  "Missing optional processing metadata must not hide an exact LEI annual report");
assert.equal(parseEuropeanFilings(identity,{
  ...payload,data:[filing({processed:null,date_added:"2025-04-29T15:28:31"})],
},now).latestReport.processingTimestampAvailable,true);
assert.equal(parseEuropeanFilings(identity,{
  ...payload,data:[filing({processed:"impossible",date_added:null})],
},now).state,"NO_VERIFIED_INDEXED_REPORT");
assert.equal(good.financialFactsReviewed,false);
assert.equal(good.latestReport.valuationEligible,false);
assert.equal(good.strategyPaperEligible,false);
for(const change of [
 {entity:{...entity,attributes:{...entity.attributes,identifier:"WRONG"}}},
 {filing:filing({country:"FR"})},
 {filing:filing({period_end:"2027-12-31"})},
 {filing:filing({processed:"2027-02-01T00:00:00.000Z"})},
 {filing:filing({viewer_url:"https://evil.example/filing",json_url:"http://bad.local"})},
]){
  const bad={...payload,
    included:[change.entity||entity],
    data:[change.filing||filing()]};
  const report=parseEuropeanFilings(identity,bad,now);
  assert.equal(report.state,"NO_VERIFIED_INDEXED_REPORT");
  assert.equal(report.latestReport,null);
}
assert.throws(()=>parseEuropeanFilings(identity,{data:[filing()]},now),
  /EU_FILINGS_SCHEMA_INVALID/);
const emptyIndex=parseEuropeanFilings(identity,{data:[]},now);
assert.equal(emptyIndex.state,"NO_VERIFIED_INDEXED_REPORT",
  "An empty German/other OAM index is not an API outage");
assert.equal(emptyIndex.availableReports,0);
assert.equal(emptyIndex.strategyPaperEligible,false);
assert.throws(()=>buildExactLeiFilingQuery({...identity,lei:"111"}),
  /EU_FILINGS_IDENTITY_INVALID/);
let calls=0;
const fake=async url=>{
  calls++;
  const lei=JSON.parse(new URL(url).searchParams.get("filter"))[0].val;
  const data={...payload,
    included:[{...entity,attributes:{...entity.attributes,identifier:lei}}],
    data:[filing({country:EUROPEAN_ISSUER_LEIS.find(i=>i.lei===lei).country})]};
  return {ok:true,headers:{get:key=>key==="content-type"?"application/vnd.api+json":null},
    text:async()=>JSON.stringify(data)};
};
const response=await discoverEuropeanFilings({nowIso:now,fetchImpl:fake});
assert.equal(calls,3);
assert.equal(response.found,3);
assert.equal(response.missing,0);
assert.equal(response.policy.phase9Credit,0);
assert.equal(response.policy.paperExecutionAllowed,false);
assert.equal(response.policy.committeeScoresModified,false);
assert(response.rows.every(x=>x.financialFactsReviewed===false));
const offline=await discoverEuropeanFilings({nowIso:now,
  fetchImpl:async()=>{throw Error("offline");}});
assert.equal(offline.found,0);
assert.equal(offline.missing,3);
assert.equal(offline.errors.length,3);
assert(offline.rows.every(x=>x.strategyPaperEligible===false));
console.log("PASS ONE GLOBAL ESEF primary issuer report discovery: exact LEI, country, date, trusted host, missing provider, and PAPER locks");
