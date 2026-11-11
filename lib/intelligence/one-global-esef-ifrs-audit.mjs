/**
 * FENICE ONE GLOBAL - tightly scoped IFRS XBRL-JSON fact screening.
 * This is document research only. Facts can be stale or entity-specific;
 * no Committee, DCF, PAPER or Directa privileges are acquired.
 *
 * xBRL-JSON: https://www.xbrl.org/guidance/xbrl-json-tutorial/
 */
import {createHash} from "node:crypto";
import {EUROPEAN_ISSUER_LEIS,discoverEuropeanFilings} from "./one-global-esef-discovery.mjs";

const METRIC_CONCEPTS=Object.freeze({
  revenue:["Revenue","RevenueFromContractsWithCustomers"],
  netIncome:["ProfitLoss"],
  operatingCashFlow:["CashFlowsFromUsedInOperatingActivities"],
  totalAssets:["Assets"],
  totalLiabilities:["Liabilities"],
  totalEquity:["Equity"],
});
const DAY=86400000;
// Bounded headroom for large ESEF annual-report xBRL-JSON payloads.
const MAX_BYTES=32_000_000;
const validDay=value=>typeof value==="string"
  &&/^\d{4}-\d{2}-\d{2}$/.test(value)
  &&Number.isFinite(Date.parse(value+"T00:00:00Z"))
  &&new Date(value+"T00:00:00Z").toISOString().slice(0,10)===value;
const iso=value=>typeof value==="string"&&Number.isFinite(Date.parse(value))
  &&new Date(Date.parse(value)).toISOString()===value;
const digest=text=>createHash("sha256").update(text).digest("hex");
const addDays=(date,n)=>new Date(Date.parse(date+"T00:00:00Z")+n*DAY).toISOString().slice(0,10);
function entityMatches(dim,namespaces,lei){
  if(typeof dim!=="string"||!dim.includes(":"))return false;
  const split=dim.indexOf(":");
  const ns=namespaces[dim.slice(0,split)];
  return dim.slice(split+1)===lei
    &&typeof ns==="string"&&/iso\/17442|lei\/2012/i.test(ns);
}
function validIfrsConcept(raw,namespaces){
  if(typeof raw!=="string"||!raw.includes(":"))return null;
  const pos=raw.indexOf(":"),ns=namespaces[raw.slice(0,pos)];
  const local=raw.slice(pos+1);
  if(typeof ns!=="string"||!/(?:^|\/)ifrs-full(?:$|\/)/.test(ns)
    ||!/xbrl\.ifrs\.org\/taxonomy\//.test(ns))return null;
  return local;
}
function numeric(raw){
  if(typeof raw!=="string"||!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][-+]?\d+)?$/.test(raw))return null;
  const n=Number(raw);
  return Number.isFinite(n)&&Math.abs(n)<=1e15?n:null;
}
function periodClass(period,periodEnd){
  if(typeof period!=="string"||!validDay(periodEnd))return null;
  const next=addDays(periodEnd,1);
  if(period===periodEnd+"T00:00:00"||period===next+"T00:00:00")return "instant";
  const match=/^(\d{4}-\d{2}-\d{2})T00:00:00\/(\d{4}-\d{2}-\d{2})T00:00:00$/.exec(period);
  if(!match||match[2]!==next||!validDay(match[1]))return null;
  const days=(Date.parse(next+"T00:00:00Z")-Date.parse(match[1]+"T00:00:00Z"))/DAY;
  return days>=330&&days<=380?"annual":null;
}
export function auditXbrlAnnualFacts({identity,filing,oim,documentSha256,nowIso}){
  const now=Date.parse(nowIso);
  if(!iso(nowIso)||!identity||!filing||!validDay(filing.periodEnd)
    ||filing.sourceLei!==identity.lei
    ||typeof filing.factsJsonUrl!=="string"
    ||!/^https:\/\/filings\.xbrl\.org\//.test(filing.factsJsonUrl)
    ||typeof documentSha256!=="string"||!/^[a-f0-9]{64}$/.test(documentSha256))
    throw Error("ESEF_AUDIT_IDENTITY_OR_PROVENANCE_INVALID");
  const facts=oim?.facts,namespaces=oim?.documentInfo?.namespaces;
  if(!facts||Array.isArray(facts)||typeof facts!=="object"
    ||!namespaces||typeof namespaces!=="object"
    ||oim.documentInfo.documentType!=="https://xbrl.org/2021/xbrl-json"
    ||Object.keys(facts).length>120000)
    throw Error("ESEF_AUDIT_OIM_SCHEMA_INVALID");
  const currency="EUR";
  const unitNamespace=Object.keys(namespaces)
    .filter(k=>/xbrl\.org\/2003\/iso4217/.test(namespaces[k]||""));
  const metrics={};
  const accepted={};
  for(const key of Object.keys(METRIC_CONCEPTS)){
    metrics[key]=null;
    accepted[key]=[];
  }
  let related=0,excludedDimensional=0,wrongPeriod=0;
  for(const fact of Object.values(facts)){
    const dims=fact?.dimensions;
    if(!dims||typeof dims!=="object"
      ||!entityMatches(dims.entity,namespaces,identity.lei))continue;
    related++;
    const local=validIfrsConcept(dims.concept,namespaces);
    const matches=Object.entries(METRIC_CONCEPTS)
      .filter(([,aliases])=>aliases.includes(local));
    if(!matches.length)continue;
    const keys=Object.keys(dims);
    if(keys.some(k=>!["concept","entity","period","unit"].includes(k))){
      excludedDimensional++;continue;
    }
    const period=periodClass(dims.period,filing.periodEnd);
    const isInstant=["totalAssets","totalLiabilities","totalEquity"];
    if(!period||matches.some(([k])=>(isInstant.includes(k)?"instant":"annual")!==period)){
      wrongPeriod++;continue;
    }
    const unit=dims.unit,sep=typeof unit==="string"?unit.indexOf(":"):-1;
    if(sep<1||!unitNamespace.includes(unit.slice(0,sep))
      ||unit.slice(sep+1)!==currency)continue;
    const value=numeric(fact.value);
    if(value===null)continue;
    for(const [k]of matches)accepted[k].push({value,concept:dims.concept,
      period:dims.period,decimals:fact.decimals??null});
  }
  const ambiguous=[];
  for(const [metric,values] of Object.entries(accepted)){
    if(!values.length)continue;
    // Inconsistency between concept aliases, contexts or duplicate facts
    // must NOT be silently resolved with a preferred or highest value.
    const uniq=[...new Set(values.map(x=>x.value))];
    if(uniq.length!==1){
      ambiguous.push(metric);continue;
    }
    metrics[metric]={
      value:uniq[0],currency,
      concepts:[...new Set(values.map(x=>x.concept))].sort(),
      sourcePeriodEnd:filing.periodEnd,
      // No segment dimensions does not prove consolidated vs parent-only statements.
      unsegmentedIssuerEntityContext:true,
      consolidatedReportingPerimeterIndependentlyVerified:false,
      rawFacts:values.length,extractedFromPublishedXbrlJson:true,
      separatelyAuditedAgainstAnnualReport:false,
    };
  }
  const a=metrics.totalAssets?.value,l=metrics.totalLiabilities?.value,
    e=metrics.totalEquity?.value;
  const canReconcile=[a,l,e].every(x=>typeof x==="number");
  const diff=canReconcile?a-l-e:null;
  const tolerance=canReconcile?Math.max(1,Math.abs(a)*0.005):null;
  const balanceSheetReconciles=canReconcile&&Math.abs(diff)<=tolerance;
  const sourceAgeDays=Math.floor((now-Date.parse(filing.periodEnd+"T00:00:00Z"))/DAY);
  const reportOnly=!canReconcile||!balanceSheetReconciles||sourceAgeDays>450
    ||ambiguous.length>0;
  return {
    key:identity.key,issuer:identity.issuer,lei:identity.lei,
    sourceReportUrl:filing.reportUrl,
    sourceFactsJsonUrl:filing.factsJsonUrl,
    documentSha256,periodEnd:filing.periodEnd,sourceAgeDays,
    relatedEntityFacts:related,excludedDimensional,wrongPeriod,
    currency,metrics,ambiguousMetrics:ambiguous,
    balanceSheetReconciliation:{
      available:canReconcile,passed:balanceSheetReconciles,
      differenceEuro:diff,relativeDifferencePercent:canReconcile&&a!==0
        ?Math.round(Math.abs(diff/a)*10000)/100:null,
    },
    researchCompleteness:6-Object.values(metrics).filter(x=>x===null).length,
    state:reportOnly?"RESEARCH_ONLY_UNCERTIFIED_OR_STALE":"IFRS_NUMERIC_RESEARCH_RECONCILED",
    issuerFundamentalScoreEligible:false,
    scoreOrDecisionModified:false,priceOrFxExecutionVerified:false,
    strategyPaperEligible:false,phase9Credit:0,
    brokerOrdersAllowed:false,liveTradingAllowed:false,
  };
}
export async function auditEuropeanXbrlFacts({nowIso,fetchImpl=fetch,timeoutMs=12000}){
  if(!iso(nowIso))throw Error("ESEF_AUDIT_CLOCK_INVALID");
  const source=await discoverEuropeanFilings({nowIso,fetchImpl});
  const report={mode:"ONE_GLOBAL_ESEF_IFRS_RESEARCH_FACTS_ONLY",
    generatedAt:nowIso,sourceIndex:"XBRL International filings.xbrl.org",
    discoveredIssuers:source.found,rows:[],errors:[],
    policy:{noNewBrokerOrders:true,noPaperFills:true,noCommitteeScoreUpdates:true,
      noAnnualFactSufficiencyClaim:true,liveTradingAllowed:false,phase9Credit:0}};
  for(const identity of EUROPEAN_ISSUER_LEIS){
    const found=source.rows.find(x=>x.key===identity.key);
    const filing=found?.latestReport;
    if(found?.state!=="LEI_INDEXED_REPORT_FOUND"||!filing?.factsJsonUrl){
      report.rows.push({key:identity.key,issuer:identity.issuer,
        state:filing?"JSON_FACT_LINK_NOT_VERIFIED":"INDEX_FILING_NOT_VERIFIED",
        periodEnd:filing?.periodEnd||null,financialFactsReviewed:false,
        strategyPaperEligible:false,liveTradingAllowed:false});continue;
    }
    const url=new URL(filing.factsJsonUrl);
    if(url.protocol!=="https:"||url.hostname!=="filings.xbrl.org"
      ||!url.pathname.endsWith(".json")){
      report.rows.push({key:identity.key,state:"UNSAFE_FACTS_URL",periodEnd:filing.periodEnd,
        financialFactsReviewed:false,strategyPaperEligible:false});continue;
    }
    const controller=new AbortController(),cancel=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetchImpl(url.href,{signal:controller.signal,headers:{
        Accept:"application/json",
        "User-Agent":"FeniceInvestmentSystem/1.0 (+https://github.com/romitoorazio/fenice-investment-system)",
      }});
      if(!response.ok)throw Error("HTTP_"+response.status);
      const type=response.headers?.get?.("content-type")||"";
      if(!/(?:json|octet-stream)/i.test(type))throw Error("NON_JSON_CONTENT_TYPE");
      const declared=Number(response.headers?.get?.("content-length"));
      if(Number.isFinite(declared)&&declared>MAX_BYTES)
        throw Error("XBRL_JSON_TOO_LARGE_DECLARED_"+Math.ceil(declared/1e6)+"MB");
      const raw=await response.text();
      if(raw.length>MAX_BYTES)throw Error("XBRL_JSON_TOO_LARGE");
      const oim=JSON.parse(raw);
      const result=auditXbrlAnnualFacts({identity,filing,oim,documentSha256:digest(raw),nowIso});
      report.rows.push(result);
    }catch(error){
      report.errors.push({key:identity.key,
        code:String(error?.message||"XBRL_FETCH_FAILED").slice(0,95)});
      report.rows.push({key:identity.key,state:"FACTS_UNAVAILABLE_OR_INVALID",
        periodEnd:filing.periodEnd,financialFactsReviewed:false,
        strategyPaperEligible:false,liveTradingAllowed:false});
    }finally{clearTimeout(cancel);}
  }
  // Explicitly expose the lag between an official issuer-origin ESEF
  // package and the independent provider's JSON filing index. The official
  // ZIP is NOT an xBRL-JSON facts feed: do not try to reuse stale 2024
  // numeric facts for a 2025 valuation or mark the ZIP as reconciled.
  report.officialAnnualSourceGaps=source.rows
    .filter(row=>row.officialAnnualEsefResearchGap?.officialPeriodMissingFromIndependentIndex
      ||row.officialAnnualEsefResearchGap?.independentIndexUnavailable)
    .map(row=>({
      key:row.key,issuerLei:row.lei,
      latestIndexedPeriodEnd:row.officialAnnualEsefResearchGap.latestIndexedPeriodEnd,
      independentIndexUnavailable:row.officialAnnualEsefResearchGap.independentIndexUnavailable,
      sourceGapConfirmed:row.officialAnnualEsefResearchGap.officialPeriodMissingFromIndependentIndex,
      officialAnnualPeriodEnd:row.officialAnnualEsefResearchGap.documentedAnnualPeriodEnd,
      officialLandingPage:row.officialAnnualEsefResearchGap.officialLandingPage,
      officialEsefZipUrl:row.officialAnnualEsefResearchGap.officialAnnualEsefZipUrl,
      nextAction:"PARSE_OFFICIAL_CONSOLIDATED_IXBRL_ZIP_AND_RECONCILE_PERIODS_AND_CONTEXTS",
      financialFactsReconciled:false,committeeScoreEligible:false,
      dcfEligible:false,paperExecutionAllowed:false,
    }));
  report.parsedIssuers=report.rows.filter(x=>x.metrics).length;
  return report;
}
