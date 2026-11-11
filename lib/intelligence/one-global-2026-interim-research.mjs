/**
 * ONE GLOBAL: actual 2026 issuer interim disclosures, never a full FY2026
 * statement or trading data. Strictly distinguish H1, 9M, calendar Q3,
 * fiscal Q3 and stock vs flows. No BUY/PAPER/Directa authorization.
 */
import {EUROPEAN_ISSUER_LEIS} from "./one-global-esef-discovery.mjs";
const DAY=86400000;
const uriHost=Object.freeze({
 "XMIL:ENEL":"www.enel.com","XPAR:MC":"www.lvmh.com",
 "XETR:SIE":"press.siemens.com",
});
const sourceKind=Object.freeze({
 "XMIL:ENEL":"ISSUER_HALF_YEAR_RESULTS_PRESS_RELEASE",
 "XPAR:MC":"ISSUER_9M_REVENUE_PRESS_RELEASE",
 "XETR:SIE":"ISSUER_FISCAL_Q3_RESULTS_PRESS_RELEASE",
});
const expectedReleases=Object.freeze({
 "XMIL:ENEL":"2026-07-30",
 "XPAR:MC":"2026-10-12",
 "XETR:SIE":"2026-08-06",
});
const metricLists=Object.freeze({
 "XMIL:ENEL":[
  ["REVENUE","H1_CUMULATIVE_FLOW","2026-01-01","2026-06-30"],
  ["ORDINARY_EBITDA","H1_CUMULATIVE_FLOW","2026-01-01","2026-06-30"],
  ["ORDINARY_GROUP_NET_INCOME","H1_CUMULATIVE_FLOW","2026-01-01","2026-06-30"],
  ["NET_FINANCIAL_DEBT","BALANCE_SHEET_STOCK","2026-06-30","2026-06-30"],
 ],
 "XPAR:MC":[
  ["REVENUE","NINE_MONTH_CUMULATIVE_FLOW","2026-01-01","2026-09-30"],
  ["REVENUE","CALENDAR_Q3_FLOW","2026-07-01","2026-09-30"],
 ],
 "XETR:SIE":[
  ["REVENUE","FISCAL_Q3_FLOW","2026-04-01","2026-06-30"],
  ["INDUSTRIAL_BUSINESS_PROFIT","FISCAL_Q3_FLOW","2026-04-01","2026-06-30"],
  ["NET_INCOME_TOTAL","FISCAL_Q3_FLOW","2026-04-01","2026-06-30"],
  ["GROUP_FREE_CASH_FLOW","FISCAL_Q3_FLOW","2026-04-01","2026-06-30"],
 ],
});
const validDay=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)
 &&Number.isFinite(Date.parse(x+"T00:00:00Z"))
 &&new Date(Date.parse(x+"T00:00:00Z")).toISOString().slice(0,10)===x;
const validIso=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))
 &&new Date(Date.parse(x)).toISOString()===x;
const percent=n=>Math.round(n*10000)/10000;
const key=m=>[m.code,m.kind,m.periodStart,m.periodEnd].join("/");
const authorizedHost=(raw,issuerKey)=>{
 let u;
 try{u=new URL(raw)}catch{throw Error("INTERIM_SOURCE_URL_INVALID")}
 const prefix={
  "XMIL:ENEL":"/media/explore/search-press-releases/press/2026/07/",
  "XPAR:MC":"/en/publications/",
  "XETR:SIE":"/global/en/pressrelease/",
 }[issuerKey];
 if(u.protocol!=="https:"||u.hostname!==uriHost[issuerKey]||u.username
  ||u.password||u.port||u.hash||u.search||!u.pathname.startsWith(prefix)
  ||u.pathname.length<=prefix.length+15)
  throw Error("INTERIM_SOURCE_DOMAIN_OR_PATH_UNVERIFIED");
 return u.href;
};
function policyMustStayLocked(policy){
 if(policy?.sourceOnly!==true||policy?.pinnedNotLive!==true
  ||policy?.noCrossPeriodValuation!==true)
  throw Error("INTERIM_RESEARCH_POLICY_MISSING");
 for(const k of ["committeeScoresModified","issuerFundamentalScoreEligible",
  "dcfEligible","strategyPaperEligible","brokerConnectivityAllowed",
  "liveTradingAllowed"])
  if(policy[k]!==false)throw Error("INTERIM_RIGHTS_ESCALATION_"+k);
 if(policy.phase9Credit!==0)throw Error("INTERIM_FAKE_PAPER_CREDIT");
}
export function validateOfficial2026InterimFacts({data,nowIso,fy2025}){
 if(!validIso(nowIso)||data?.version!==1
  ||data.mode!=="ONE_GLOBAL_OFFICIAL_2026_INTERIM_RESULTS_RESEARCH_ONLY"
  ||data.unit!=="EUR_MILLIONS"||data.currency!=="EUR"
  ||!validIso(data.reviewedAt)||Date.parse(data.reviewedAt)>Date.parse(nowIso)+300000
  ||!Array.isArray(data.issuers)||data.issuers.length!==3)
  throw Error("INTERIM_RESEARCH_SCHEMA_INVALID");
 policyMustStayLocked(data.policy);
 const original=new Map(EUROPEAN_ISSUER_LEIS.map(x=>[x.key,x]));
 const annual=new Map((fy2025?.companies||[]).map(x=>[x.key,x]));
 if(fy2025?.mode!=="ONE_GLOBAL_OFFICIAL_FY2025_ISSUER_RELEASES_RESEARCH_ONLY"
   ||annual.size!==3)throw Error("INTERIM_REFERENCE_ANNUAL_MISSING");
 const seenIssuers=new Set(),result=[];
 for(const issuer of data.issuers){
  const pinned=original.get(issuer?.key),priorAnnual=annual.get(issuer?.key);
  if(!pinned||!priorAnnual||seenIssuers.has(issuer.key)
    ||issuer.lei!==pinned.lei||issuer.lei!==priorAnnual.lei
    ||issuer.name!==pinned.issuer
    ||issuer.name!==priorAnnual.name)
    throw Error("INTERIM_ISSUER_LEI_IDENTITY_MISMATCH");
  seenIssuers.add(issuer.key);
  const url=authorizedHost(issuer.sourceUrl,issuer.key);
  const publisher={
   "XMIL:ENEL":"Enel S.p.A.","XPAR:MC":"LVMH","XETR:SIE":"Siemens AG"
  }[issuer.key];
  if(issuer.publisher!==publisher
    ||issuer.sourceKind!==sourceKind[issuer.key]
    ||issuer.publishedAt!==expectedReleases[issuer.key]
    ||!validDay(issuer.publishedAt)
    ||Date.parse(issuer.publishedAt+"T00:00:00Z")>Date.parse(nowIso))
    throw Error("INTERIM_SOURCE_RELEASE_DATE_INVALID");
  const expected=metricLists[issuer.key],observed=issuer.metrics;
  if(!Array.isArray(observed)||observed.length!==expected.length)
    throw Error("INTERIM_METRIC_COVERAGE_INVALID");
  const seenMetrics=new Set(),rows=[];
  for(const m of observed){
   if(!m||!validDay(m.periodStart)||!validDay(m.periodEnd)
    ||Date.parse(m.periodEnd+"T00:00:00Z")>Date.parse(issuer.publishedAt+"T00:00:00Z")
    ||Date.parse(m.periodStart+"T00:00:00Z")>Date.parse(m.periodEnd+"T00:00:00Z")
    ||!expected.some(([code,kind,start,end])=>m.code===code&&m.kind===kind
      &&m.periodStart===start&&m.periodEnd===end)
    ||seenMetrics.has(key(m)))
    throw Error("INTERIM_METRIC_KIND_PERIOD_MISMATCH");
   seenMetrics.add(key(m));
   const exact=issuer.key!=="XETR:SIE";
   if(typeof m.valueEurMillions!=="number"
     ||!Number.isSafeInteger(m.valueEurMillions)
     ||m.valueEurMillions<=0||m.valueEurMillions>1e8
     ||m.precisionEurMillions!==(exact?1:100)
     ||m.valueEurMillions%m.precisionEurMillions!==0)
    throw Error("INTERIM_METRIC_VALUE_PRECISION_INVALID");
   const p=m.prior;
   if(issuer.key==="XETR:SIE"&&p!==null)
    throw Error("INTERIM_SIEMENS_COMPARATIVE_NOT_IN_SOURCE");
   if(issuer.key!=="XETR:SIE"&&(!p||!Number.isSafeInteger(p.valueEurMillions)
     ||p.valueEurMillions<=0
     ||!validDay(p.periodStart)||!validDay(p.periodEnd)))
    throw Error("INTERIM_COMPARATIVE_INVALID");
   let comparisonType=null,yearOnYearPercent=null,sequentialStockPercent=null;
   if(p){
    comparisonType=p.relationship;
    if(m.code==="NET_FINANCIAL_DEBT"){
     if(m.kind!=="BALANCE_SHEET_STOCK"||p.relationship!=="PRIOR_YEAR_END_NOT_YOY"
       ||p.periodStart!=="2025-12-31"||p.periodEnd!=="2025-12-31"
       ||p.valueEurMillions!==priorAnnual.metrics
        .find(x=>x.code==="NET_FINANCIAL_DEBT")?.valueEurMillions)
      throw Error("INTERIM_DEBT_STOCK_PRIOR_FY_INVALID");
     sequentialStockPercent=percent((m.valueEurMillions/p.valueEurMillions-1)*100);
    }else{
     const expectedPriorStart=m.periodStart.replace(/^2026/,"2025"),
      expectedPriorEnd=m.periodEnd.replace(/^2026/,"2025");
     if(p.relationship!=="SAME_PERIOD_PREVIOUS_YEAR"
       ||p.periodStart!==expectedPriorStart||p.periodEnd!==expectedPriorEnd)
      throw Error("INTERIM_COMPARATIVE_WINDOW_MISMATCH");
     yearOnYearPercent=percent((m.valueEurMillions/p.valueEurMillions-1)*100);
    }
   }
   rows.push({
    code:m.code,kind:m.kind,periodStart:m.periodStart,periodEnd:m.periodEnd,
    valueEurMillions:m.valueEurMillions,precisionEurMillions:m.precisionEurMillions,
    currency:"EUR",comparisonType,priorEurMillions:p?.valueEurMillions??null,
    priorStart:p?.periodStart??null,priorEnd:p?.periodEnd??null,
    yearOnYearPercent,sequentialStockPercent,
    crossAnnualComparisonAllowed:false,
    auditedIFRSFinancialStatementFact:false,
    paperOrderAllowed:false,marketQuoteRightsVerified:false,
   });
  }
  if(rows.length!==expected.length)
   throw Error("INTERIM_REQUIRED_METRIC_NOT_SATISFIED");
  const reviewDate=issuer.reviewAfterScheduledRelease;
  if(issuer.key==="XMIL:ENEL"){
   if(reviewDate!=="2026-11-12")throw Error("INTERIM_ENEL_RELEASE_WATCH_INVALID");
  }else if(reviewDate!==null)throw Error("INTERIM_UNVERIFIED_FUTURE_RELEASE_DATE");
  const refreshDue=reviewDate!==null
   &&Date.parse(nowIso)>=Date.parse(reviewDate+"T00:00:00Z");
  result.push({key:issuer.key,issuer:issuer.name,lei:issuer.lei,
   sourceUrl:url,releaseDate:issuer.publishedAt,sourceKind:issuer.sourceKind,
   metrics:rows,metricCount:rows.length,
   nextReleaseReviewDueAt:reviewDate,refreshDue,
   latestInterimNotGuaranteed:refreshDue,
   filing2026FactsNotIndependentlyAudited:true,
   issuerReportedAdjustedAndIFRSDifferent:true,
   researchOnly:true,noCommitteeUpdates:true,noBrokerOrders:true,
   noPaperFills:true});
 }
 if(seenIssuers.size!==original.size)
  throw Error("INTERIM_ISSUERS_INCOMPLETE");
 return {
  mode:"ONE_GLOBAL_CURRENT_2026_INTERIM_PRIMARY_RELEASES_RESEARCH_ONLY",
  generatedAt:nowIso,sourceReviewAt:data.reviewedAt,count:result.length,
  metricCount:result.reduce((n,x)=>n+x.metricCount,0),
  rows:result,
  warnings:[
   "Issuer 2026 H1, nine-month and fiscal-quarter results have different calendars; do not compare with whole-year 2025 totals.",
   "Siemens 2026 Q3 headline values are rounded to €0.1bn, not exact audited IFRS line items.",
   "Enel net financial debt comparison is to 2025 year-end, not prior-year H1.",
   "These are published issuer press values, not latest live market quotes or executable strategy approvals.",
  ],
  policy:{researchOnly:true,current2026InterimSourceButNotFullYear:true,
   statementsIndependentlyAudited:false,DCFEligible:false,
   paperExecutionAllowed:false,brokerConnectivityAllowed:false,
   liveTradingAllowed:false,phase9Credit:0},
 };
}
