/**
 * FENICE ONE GLOBAL: audit pinned FY2025 issuer press-release observations.
 * Distinguishes issuer-reported adjusted measures from IFRS. Research-only.
 * Never overwrites fundamentals, DCF, Committee, strategy PAPER or Directa.
 */
import {EUROPEAN_ISSUER_LEIS} from "./one-global-esef-discovery.mjs";
const DAY=86400000;
const HOST_BY_VENUE=Object.freeze({
 "XMIL:ENEL":"www.enel.com",
 "XPAR:MC":"www.lvmh.com",
 "XETR:SIE":"press.siemens.com",
});
const SUPPORTED_CODES=new Set([
 "REVENUE","ORDINARY_EBITDA","ORDINARY_GROUP_NET_INCOME",
 "NET_FINANCIAL_DEBT","PROFIT_RECURRING_OPERATIONS","GROUP_SHARE_NET_PROFIT",
 "OPERATING_FREE_CASH_FLOW","EQUITY","INDUSTRIAL_BUSINESS_PROFIT",
 "NET_INCOME_TOTAL","FCF_CONTINUING_DISCONTINUED",
]);
const validDay=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)
 &&Number.isFinite(Date.parse(x+"T00:00:00Z"))
 &&new Date(Date.parse(x+"T00:00:00Z")).toISOString().slice(0,10)===x;
const validIso=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))
 &&new Date(Date.parse(x)).toISOString()===x;
const days=(end,now)=>Math.floor((now-Date.parse(end+"T00:00:00Z"))/DAY);
const round=x=>Math.round(x*10000)/10000;
function officialUrl(value,key){
 if(typeof value!=="string"||value.length>550)throw Error("FY2025_RELEASE_URL_INVALID");
 let url;
 try{url=new URL(value)}catch{throw Error("FY2025_RELEASE_URL_INVALID")}
 if(url.protocol!=="https:"||url.hostname!==HOST_BY_VENUE[key]||url.username
  ||url.password||url.port||url.hash||url.search)
  throw Error("FY2025_RELEASE_URL_NOT_OFFICIAL");
 const prefixes={
  "XMIL:ENEL":"/media/explore/search-press-releases/press/2026/03/",
  "XPAR:MC":"/en/publications/",
  "XETR:SIE":"/global/en/pressrelease/",
 };
 if(!url.pathname.startsWith(prefixes[key])||url.pathname.length<50)
  throw Error("FY2025_RELEASE_URL_PATH_INVALID");
 return url.href;
}
function assertPolicy(policy){
 const locks=["primaryIssuerReleaseOnly","pinnedValuesAreNotLiveFetch"];
 for(const k of locks)if(policy?.[k]!==true)
  throw Error("FY2025_RESEARCH_POLICY_MISSING_"+k);
 const denied=["financialStatementAuditCompleted","equivalentAccountingMetricsAcrossIssuers",
 "committeeScoresModified","issuerFundamentalScoreEligible","dcfEligible",
 "paperExecutionAllowed","brokerConnectivityAllowed","liveTradingAllowed"];
 for(const k of denied)if(policy[k]!==false)
  throw Error("FY2025_RESEARCH_POLICY_ESCALATED_"+k);
 if(policy.phase9Credit!==0)throw Error("FY2025_PAPER_CREDIT_FORBIDDEN");
}
export function assessPinnedIssuer2025Results({data,nowIso}){
 if(!validIso(nowIso)||!data||data.version!==1
  ||data.mode!=="ONE_GLOBAL_OFFICIAL_FY2025_ISSUER_RELEASES_RESEARCH_ONLY"
  ||data.currency!=="EUR"||data.valueUnit!=="EUR_MILLIONS"
  ||!validIso(data.reviewedAt)||Date.parse(data.reviewedAt)>Date.parse(nowIso)+300000
  ||data.referenceNature!=="PINNED_ISSUER_PUBLIC_RESULTS_MANUALLY_VERIFIED_NOT_AUTOMATED_QUOTE"
  ||!Array.isArray(data.companies)||data.companies.length!==3)
  throw Error("FY2025_SOURCE_SCHEMA_INVALID");
 assertPolicy(data.policy);
 const official=new Map(EUROPEAN_ISSUER_LEIS.map(x=>[x.key,x]));
 const keyed=new Set();
 const rows=[];
 for(const issuer of data.companies){
  const pinned=official.get(issuer?.key);
  if(!pinned||keyed.has(issuer.key)||issuer.lei!==pinned.lei
    ||issuer.fiscalYear!==2025||issuer.name!==pinned.issuer)
    throw Error("FY2025_ISSUER_LEI_OR_IDENTITY_MISMATCH");
  keyed.add(issuer.key);
  const source=officialUrl(issuer.sourceUrl,issuer.key);
  if(issuer.sourceKind!=="ISSUER_FULL_YEAR_RESULTS_PRESS_RELEASE"
    ||issuer.sourcePublisher!==({"XMIL:ENEL":"Enel S.p.A.","XPAR:MC":"LVMH",
     "XETR:SIE":"Siemens AG"})[issuer.key]
    ||!validDay(issuer.publishedAt)||!validDay(issuer.periodStart)
    ||!validDay(issuer.periodEnd)
    ||Date.parse(issuer.publishedAt+"T00:00:00Z")>Date.parse(nowIso)
    ||Date.parse(issuer.publishedAt+"T00:00:00Z")<Date.parse(issuer.periodEnd+"T00:00:00Z")
    ||days(issuer.periodEnd,Date.parse(issuer.publishedAt+"T00:00:00Z"))>600)
    throw Error("FY2025_ISSUER_RELEASE_TIME_INVALID");
  const siemens=issuer.key==="XETR:SIE";
  if(issuer.periodEnd!==(siemens?"2025-09-30":"2025-12-31")
    ||issuer.periodStart!==(siemens?"2024-10-01":"2025-01-01")
    ||issuer.fiscalBasis!==(siemens?"SEPTEMBER_YEAR_END":"CALENDAR_YEAR"))
    throw Error("FY2025_FISCAL_CALENDAR_MISMATCH");
  if(!Array.isArray(issuer.metrics)||issuer.metrics.length<4||issuer.metrics.length>10)
    throw Error("FY2025_METRIC_LIST_INVALID");
  const seen=new Set(),metrics=[];
  for(const m of issuer.metrics){
   if(!m||!SUPPORTED_CODES.has(m.code)||seen.has(m.code)
    ||typeof m.label!=="string"||m.label.length<5||m.label.length>110
    ||typeof m.valueEurMillions!=="number"
    ||!Number.isSafeInteger(m.valueEurMillions)||Math.abs(m.valueEurMillions)>1e8
    ||![1,100].includes(m.precisionEurMillions)
    ||m.valueEurMillions%m.precisionEurMillions!==0
    ||(siemens&&m.precisionEurMillions!==100)
    ||(!siemens&&m.precisionEurMillions!==1))
    throw Error("FY2025_METRIC_PRECISION_OR_IDENTITY_INVALID");
   seen.add(m.code);
   const basis=m.comparativeBasis;
   if(!["REPORTED_PRIOR_YEAR","2024_RESTATED_EXCLUDING_DISPOSED_ASSETS",
      "NO_PINNED_COMPARATIVE"].includes(basis))
    throw Error("FY2025_COMPARATIVE_BASIS_UNKNOWN");
   const prior=m.comparativePriorYearEurMillions;
   if(basis==="NO_PINNED_COMPARATIVE"&&prior!==undefined)
    throw Error("FY2025_FABRICATED_COMPARATIVE");
   if(basis!=="NO_PINNED_COMPARATIVE"&&
     (typeof prior!=="number"||!Number.isSafeInteger(prior)
      ||prior===0||Math.abs(prior)>1e8))
    throw Error("FY2025_COMPARATIVE_INVALID");
   if(basis==="2024_RESTATED_EXCLUDING_DISPOSED_ASSETS"&&issuer.key!=="XMIL:ENEL")
    throw Error("FY2025_RESTATEMENT_WRONG_ISSUER");
   // Avoid reclassifying adjusted EBITDA, recurring operations, and cash flow.
   metrics.push({code:m.code,label:m.label,valueEurMillions:m.valueEurMillions,
    currency:"EUR",valueUnit:"EUR_MILLIONS",
    sourcePrecisionEurMillions:m.precisionEurMillions,
    comparativeBasis:basis,
    comparative2024EurMillions:prior??null,
    arithmeticChangePercent:prior===undefined?null:round((m.valueEurMillions/prior-1)*100),
    accountsForScopeOfDisposals:basis==="2024_RESTATED_EXCLUDING_DISPOSED_ASSETS",
    xbrlStatementFactReconciled:false,
    financialStatementAuditCompleted:false,
    isLiveMarketQuote:false,paperExecutionEligible:false});
  }
  if(!seen.has("REVENUE"))throw Error("FY2025_ISSUER_REVENUE_MISSING");
  const annualAge=days(issuer.periodEnd,Date.parse(nowIso));
  rows.push({key:issuer.key,lei:issuer.lei,issuer:issuer.name,
    sourceUrl:source,sourcePublishedAt:issuer.publishedAt,
    fiscalPeriodStart:issuer.periodStart,fiscalPeriodEnd:issuer.periodEnd,
    annualPeriodAgeDays:annualAge,
    fiscalBasis:issuer.fiscalBasis,
    metrics,
    currency:"EUR",
    latestInterimPeriodNotInspected:true,
    notEquivalentNetIncomeDefinitions:true,
    2025AnnualFiguresNotContemporaneousTradingEvidence:true,
    sourceKind:"ISSUER_PRESS_RELEASE_RESEARCH_ONLY",
    accountingFactAuditState:"ISSUER_REPORTED_NOT_RECONCILED_TO_2025_IFRS_FILINGS",
    committeeScoreEligible:false,dcfEligible:false,
    paperEligible:false,liveTradingAllowed:false});
 }
 if(keyed.size!==official.size)throw Error("FY2025_PINNED_ISSUERS_INCOMPLETE");
 return {
  mode:"ONE_GLOBAL_FY2025_ISSUER_RELEASE_EVIDENCE_ONLY",
  evaluatedAt:nowIso,pinnedResearchReviewedAt:data.reviewedAt,
  count:rows.length,metricsCount:rows.reduce((s,x)=>s+x.metrics.length,0),
  companies:rows,
  warnings:[
   "Figures manually pinned from 2025 official release pages; not live extraction, not a 2026 investment recommendation.",
   "Siemens FY ends September 30; Enel and LVMH end December 31.",
   "Ordinary net income, net profit (Group share), total net income and industrial operating profit have different definitions.",
   "Any valuation/DCF requires separately reconciled annual, interim, share count and FX evidence. No licensed quote rights."
  ],
  policy:{issuerReleaseFactsOnly:true,notXbrl2025Audited:true,
   noPublishedMarketQuotes:true,noStrategySignals:true,
   phase9Credit:0,paperExecutionAllowed:false,brokerConnectivityAllowed:false,
   liveTradingAllowed:false},
 };
}
