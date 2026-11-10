/**
 * ONE GLOBAL: free official-authority-derived annual filing index by exact LEI.
 * A discovered filing NEVER implies that individual IFRS facts were reviewed,
 * that its issuer fundamentals are complete, or that PAPER rights exist.
 * Source: https://filings.xbrl.org/docs/api
 */
export const EUROPEAN_ISSUER_LEIS=Object.freeze([
  {key:"XMIL:ENEL",issuer:"Enel S.p.A.",country:"IT",
   lei:"WOCMU6HCI0OJWNPRZS33",
   identitySource:"https://www.enel.com/content/dam/enel-com/documenti/investitori/investire-in-enel/programmi-principali/medium-term-notes/2026/base-prospectus_23december2025.pdf"},
  {key:"XPAR:MC",issuer:"LVMH Moet Hennessy Louis Vuitton SE",country:"FR",
   lei:"IOG4E947OATN0KJYSD45",
   identitySource:"https://lei.bloomberg.com/leis/view/IOG4E947OATN0KJYSD45"},
  {key:"XETR:SIE",issuer:"Siemens Aktiengesellschaft",country:"DE",
   lei:"W38RGI023J3WT1HWRP32",
   identitySource:"https://www.eqs-news.com/"},
]);
const HOST="filings.xbrl.org";
const MAX=10;
const iso=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))
  &&new Date(Date.parse(x)).toISOString()===x;
const day=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)
  &&Number.isFinite(Date.parse(x+"T00:00:00.000Z"))
  &&new Date(x+"T00:00:00.000Z").toISOString().slice(0,10)===x;
// Provider indices can return ISO 8601 without a timezone or microseconds.
// Interpret timezone-less service timestamps as UTC ONLY for index discovery;
// this cannot grant financial fact certification or market quote rights.
function processedUtc(raw){
  if(typeof raw!=="string"||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})?$/.test(raw))
    return null;
  const ms=Date.parse(raw.endsWith("Z")||/[+-]\d{2}:\d{2}$/.test(raw)?raw:raw+"Z");
  return Number.isFinite(ms)?new Date(ms).toISOString():null;
}
function safeReportUrl(value){
  if(typeof value!=="string"||value.length>800)return null;
  try{
    const u=new URL(value,"https://"+HOST);
    return u.hostname===HOST&&u.protocol==="https:"&&!u.username
      &&!u.password&&!u.port?u.href:null;
  }catch{return null;}
}
export function buildExactLeiFilingQuery(identity){
  if(!/^[A-Z0-9]{20}$/.test(identity?.lei||"")
    ||!/^X[A-Z0-9]{3}$/.test(identity?.key?.split(":")[0]||""))
    throw Error("EU_FILINGS_IDENTITY_INVALID");
  const url=new URL("https://"+HOST+"/api/filings");
  url.searchParams.set("include","entity");
  url.searchParams.set("sort","-processed");
  url.searchParams.set("page[size]",String(MAX));
  url.searchParams.set("filter",JSON.stringify([
    {name:"entity.identifier",op:"eq",val:identity.lei},
    {name:"period_end",op:"ge",val:"2023-01-01"},
  ]));
  return url.href;
}
export function parseEuropeanFilings(identity,body,nowIso){
  if(!iso(nowIso))throw Error("EU_FILINGS_CLOCK_INVALID");
  if(!body||!Array.isArray(body.data)||!Array.isArray(body.included)
    ||body.data.length>MAX||body.included.length>100)
    throw Error("EU_FILINGS_SCHEMA_INVALID");
  const entities=new Map(body.included.filter(x=>x?.type==="entity")
    .map(x=>[x.id,x.attributes]));
  const good=[],reasons=[];
  for(const filing of body.data){
    const id=filing?.relationships?.entity?.data?.id;
    const entity=entities.get(id),a=filing?.attributes;
    if(filing?.type!=="filing"||!a||entity?.identifier!==identity.lei){
      reasons.push("ENTITY_LEI_MISMATCH");continue;
    }
    const normalizedProcessed=processedUtc(a.processed);
    const processed=normalizedProcessed===null?NaN:Date.parse(normalizedProcessed);
    if(!day(a.period_end)||Date.parse(a.period_end+"T00:00:00.000Z")>Date.parse(nowIso)
      ||normalizedProcessed===null||processed>Date.parse(nowIso)+300000){
      reasons.push("INVALID_OR_FUTURE_PERIOD");continue;
    }
    if(a.country!==identity.country){
      reasons.push("WRONG_REGISTER_COUNTRY");continue;
    }
    const document=safeReportUrl(a.viewer_url)||safeReportUrl(a.json_url);
    if(!document){reasons.push("MISSING_OR_UNSAFE_REPORT_LINK");continue;}
    good.push({
      periodEnd:a.period_end,processedAt:normalizedProcessed,reportUrl:document,
      sourceLei:identity.lei,officialAuthorityDerivedIndex:true,
      indexedValidationErrors:Number.isSafeInteger(a.error_count)?a.error_count:null,
      financialFactsReconciled:false,valuationEligible:false,
      paperOrderAllowed:false,
    });
  }
  good.sort((a,b)=>b.periodEnd.localeCompare(a.periodEnd)
    ||b.processedAt.localeCompare(a.processedAt));
  return {
    key:identity.key,issuer:identity.issuer,lei:identity.lei,
    identitySource:identity.identitySource,
    state:good.length?"LEI_INDEXED_REPORT_FOUND":"NO_VERIFIED_INDEXED_REPORT",
    availableReports:good.length,latestReport:good[0]||null,
    rejected:Object.fromEntries([...new Set(reasons)].sort().map(x=>
      [x,reasons.filter(y=>x===y).length])),
    researchOnly:true,financialFactsReviewed:false,committeeScoreEligible:false,
    strategyPaperEligible:false,brokerOrdersAllowed:false,
  };
}
export async function discoverEuropeanFilings({nowIso,fetchImpl=fetch,timeoutMs=9000}){
  if(!iso(nowIso))throw Error("EU_FILINGS_CLOCK_INVALID");
  const result={
    mode:"ONE_GLOBAL_ESEF_ISSUER_DOCUMENT_DISCOVERY_ONLY",
    generatedAt:nowIso,source:"XBRL International filings.xbrl.org",
    sourceKind:"INDEX_OF_OFFICIAL_AUTHORITY_DERIVED_REPORTS",
    rows:[],found:0,missing:0,errors:[],
    policy:{financialFactsReconciled:false,committeeScoresModified:false,
      paperExecutionAllowed:false,liveTradingAllowed:false,
      brokerConnectivityAllowed:false,phase9Credit:0},
  };
  for(const identity of EUROPEAN_ISSUER_LEIS){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetchImpl(buildExactLeiFilingQuery(identity),{
        signal:controller.signal,headers:{
          Accept:"application/vnd.api+json",
          "User-Agent":"FeniceInvestmentSystem/1.0 (+https://github.com/romitoorazio/fenice-investment-system)",
        }});
      if(!response.ok)throw Error("HTTP_"+response.status);
      const type=response.headers?.get?.("content-type")||"";
      if(!/json/i.test(type))throw Error("INVALID_JSON_CONTENT_TYPE");
      const declared=Number(response.headers?.get?.("content-length"));
      if(Number.isFinite(declared)&&declared>3_000_000)throw Error("FILE_TOO_LARGE");
      const body=await response.text();
      if(body.length>3_000_000)throw Error("FILE_TOO_LARGE");
      result.rows.push(parseEuropeanFilings(identity,JSON.parse(body),nowIso));
    }catch(error){
      result.errors.push({key:identity.key,
        code:String(error?.message||"SOURCE_UNAVAILABLE").slice(0,90)});
      result.rows.push({
        key:identity.key,issuer:identity.issuer,lei:identity.lei,
        state:"INDEX_UNAVAILABLE",latestReport:null,availableReports:0,
        researchOnly:true,financialFactsReviewed:false,
        committeeScoreEligible:false,strategyPaperEligible:false,
        brokerOrdersAllowed:false,
      });
    }finally{clearTimeout(timer);}
  }
  result.found=result.rows.filter(x=>x.state==="LEI_INDEXED_REPORT_FOUND").length;
  result.missing=result.rows.length-result.found;
  return result;
}
