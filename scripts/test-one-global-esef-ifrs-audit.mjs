import assert from "node:assert/strict";
import {EUROPEAN_ISSUER_LEIS} from "../lib/intelligence/one-global-esef-discovery.mjs";
import {auditXbrlAnnualFacts,auditEuropeanXbrlFacts}
  from "../lib/intelligence/one-global-esef-ifrs-audit.mjs";

const now="2026-11-11T07:00:00.000Z";
const identity=EUROPEAN_ISSUER_LEIS[0];
const filing={sourceLei:identity.lei,periodEnd:"2024-12-31",
  reportUrl:"https://filings.xbrl.org/filing/example",
  factsJsonUrl:"https://filings.xbrl.org/example/annual.json"};
const docSha="b".repeat(64);
const ns={lei:"http://standards.iso.org/iso/17442",
  "ifrs-full":"http://xbrl.ifrs.org/taxonomy/2024-03-27/ifrs-full",
  iso4217:"http://www.xbrl.org/2003/iso4217"};
const FY="2024-01-01T00:00:00/2025-01-01T00:00:00";
const instant="2024-12-31T00:00:00";
const fact=(concept,value,period=FY,more={})=>({
  value:String(value),decimals:"-3",
  dimensions:{concept:"ifrs-full:"+concept,entity:"lei:"+identity.lei,
    period,unit:"iso4217:EUR",...more},
});
const oim={documentInfo:{documentType:"https://xbrl.org/2021/xbrl-json",
  namespaces:ns},facts:{
  r:fact("Revenue",150),
  n:fact("ProfitLoss",20),
  ocf:fact("CashFlowsFromUsedInOperatingActivities",30),
  a:fact("Assets",300,instant),
  l:fact("Liabilities",200,instant),
  e:fact("Equity",100,instant),
}};
const audit=extra=>auditXbrlAnnualFacts({
  identity,filing,oim:extra||oim,documentSha256:docSha,nowIso:now});
const good=audit();
assert.equal(good.researchCompleteness,6);
assert.equal(good.metrics.revenue.value,150);
assert.equal(good.metrics.netIncome.value,20);
assert.equal(good.metrics.operatingCashFlow.value,30);
assert.equal(good.balanceSheetReconciliation.passed,true);
assert.equal(good.balanceSheetReconciliation.differenceEuro,0);
assert.equal(good.state,"RESEARCH_ONLY_UNCERTIFIED_OR_STALE",
  "A 2024 filing in November 2026 is old; cannot drive current valuation");
assert.equal(good.issuerFundamentalScoreEligible,false);
assert.equal(good.scoreOrDecisionModified,false);
assert.equal(good.strategyPaperEligible,false);
assert.equal(good.phase9Credit,0);
assert.equal(good.liveTradingAllowed,false);
assert.throws(()=>auditXbrlAnnualFacts({...{
  identity,filing:{...filing,sourceLei:"FAKE"},oim,
  documentSha256:docSha,nowIso:now}}),/ESEF_AUDIT_IDENTITY_OR_PROVENANCE_INVALID/);
assert.throws(()=>auditXbrlAnnualFacts({
  identity,filing:{...filing,factsJsonUrl:"http://malicious.invalid/annual.json"},
  oim,documentSha256:docSha,nowIso:now,
}),/ESEF_AUDIT_IDENTITY_OR_PROVENANCE_INVALID/);
assert.throws(()=>audit({documentInfo:{namespaces:ns},facts:{}}),/ESEF_AUDIT_OIM_SCHEMA_INVALID/);
const entityMismatch=structuredClone(oim);
entityMismatch.facts.r.dimensions.entity="lei:OTHER";
assert.equal(audit(entityMismatch).metrics.revenue,null);
const wrongCurrency=structuredClone(oim);
wrongCurrency.facts.r.dimensions.unit="iso4217:USD";
assert.equal(audit(wrongCurrency).metrics.revenue,null);
const segment=structuredClone(oim);
segment.facts.r.dimensions["ifrs-full:OperatingSegmentsMember"]="ifrs-full:Energy";
assert.equal(audit(segment).metrics.revenue,null);
assert.equal(audit(segment).excludedDimensional,1);
const alias=structuredClone(oim);
alias.facts.r2=fact("RevenueFromContractsWithCustomers",160);
assert.equal(audit(alias).metrics.revenue,null);
assert.deepEqual(audit(alias).ambiguousMetrics,["revenue"]);
const wrongPeriod=structuredClone(oim);
wrongPeriod.facts.r.dimensions.period="2023-01-01T00:00:00/2024-01-01T00:00:00";
assert.equal(audit(wrongPeriod).metrics.revenue,null);
const wrongNamespace=structuredClone(oim);
wrongNamespace.documentInfo.namespaces["ifrs-full"]="https://fake.invalid/taxonomy/2024/ifrs-full";
assert.equal(audit(wrongNamespace).metrics.revenue,null);
const conflict=structuredClone(oim);
conflict.facts.l.value="180";
assert.equal(audit(conflict).balanceSheetReconciliation.passed,false);
const indexResponse=lei=>({
  data:lei===EUROPEAN_ISSUER_LEIS[2].lei?[]:[{
    id:"one",type:"filing",attributes:{
      period_end:"2024-12-31",country:lei===identity.lei?"IT":"FR",
      processed:"2025-04-29 16:48:07.315087",
      viewer_url:"https://filings.xbrl.org/filing/verified",
      json_url:"https://filings.xbrl.org/report/verified.json",
    },
    relationships:{entity:{data:{id:"entity1",type:"entity"}}},
  }],
  included:[{id:"entity1",type:"entity",attributes:{identifier:lei}}],
});
let indexRequests=0,jsonRequests=0;
const fetchStub=async rawUrl=>{
  const url=new URL(rawUrl);
  if(url.pathname==="/api/filings"){
    indexRequests++;
    const lei=JSON.parse(url.searchParams.get("filter"))[0].val;
    return {ok:true,headers:{get:x=>x==="content-type"?"application/json":null},
      text:async()=>JSON.stringify(indexResponse(lei))};
  }
  assert.equal(url.pathname,"/report/verified.json");
  jsonRequests++;
  const lei=jsonRequests===1?identity.lei:EUROPEAN_ISSUER_LEIS[1].lei;
  const local=structuredClone(oim);
  for(const f of Object.values(local.facts))f.dimensions.entity="lei:"+lei;
  return {ok:true,headers:{get:x=>x==="content-type"?"application/json":null},
    text:async()=>JSON.stringify(local)};
};
const tested=await auditEuropeanXbrlFacts({nowIso:now,fetchImpl:fetchStub});
assert.equal(indexRequests,3);
assert.equal(jsonRequests,2);
assert.equal(tested.discoveredIssuers,2);
assert.equal(tested.parsedIssuers,2);
assert.equal(tested.officialAnnualSourceGaps.length,1);
const enel2025Gap=tested.officialAnnualSourceGaps[0];
assert.equal(enel2025Gap.key,"XMIL:ENEL");
assert.equal(enel2025Gap.officialAnnualPeriodEnd,"2025-12-31");
assert.equal(enel2025Gap.latestIndexedPeriodEnd,"2024-12-31");
assert.equal(enel2025Gap.financialFactsReconciled,false);
assert.equal(enel2025Gap.dcfEligible,false);
assert.equal(enel2025Gap.paperExecutionAllowed,false);
assert.equal(enel2025Gap.nextAction,
 "PARSE_OFFICIAL_CONSOLIDATED_IXBRL_ZIP_AND_RECONCILE_PERIODS_AND_CONTEXTS");
assert.equal(tested.rows[0].researchCompleteness,6);
assert.equal(tested.rows[1].researchCompleteness,6);
assert.equal(tested.rows[2].state,"INDEX_FILING_NOT_VERIFIED");
assert.equal(tested.policy.noCommitteeScoreUpdates,true);
assert.equal(tested.policy.noPaperFills,true);
const outage=await auditEuropeanXbrlFacts({nowIso:now,fetchImpl:async()=>{throw Error("offline")}});
assert.equal(outage.parsedIssuers,0);
assert.equal(outage.officialAnnualSourceGaps.length,1,
 "An independent-index outage does not erase a separately documented official source");
assert.equal(outage.officialAnnualSourceGaps[0].financialFactsReconciled,false);
assert.equal(outage.rows.length,3);
assert.equal(outage.errors.length,0,
  "Index errors remain in discovery diagnostics; do not hallucinate facts");
assert(outage.rows.every(x=>x.state==="INDEX_FILING_NOT_VERIFIED"));
const huge=await auditEuropeanXbrlFacts({nowIso:now,fetchImpl:async rawUrl=>{
  const u=new URL(rawUrl);
  if(u.pathname==="/api/filings"){
    const lei=JSON.parse(u.searchParams.get("filter"))[0].val;
    return {ok:true,headers:{get:k=>k==="content-type"?"application/json":null},
      text:async()=>JSON.stringify(indexResponse(lei))};
  }
  return {ok:true,headers:{get:k=>k==="content-type"?"application/json"
    :k==="content-length"?"33000000":null},
    text:async()=>{throw Error("MUST_NOT_DOWNLOAD_OVERSIZED_UNTRUSTED_FACTS");}};
}});
assert.equal(huge.parsedIssuers,0);
assert(huge.errors.every(e=>e.code==="XBRL_JSON_TOO_LARGE_DECLARED_33MB"),
  "Large XBRL documents must be rejected before downloading them");
console.log("PASS ONE GLOBAL IFRS fact audit: precise LEI/year/EUR/unit, consolidated contexts, balance sheet, conflict, stale 2024, and zero PAPER authorization");
