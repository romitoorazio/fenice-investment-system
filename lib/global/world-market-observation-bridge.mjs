/** Read-only ONE GLOBAL interpretation of existing MAIN worldwide market-state diagnostics.
 * Exact MIC or ISO operating-MIC hints are NOT exchange calendar attestations.
 * No network I/O, quotes, broker access, PAPER ledger writes or simulated fills.
 */
import {VENUES} from "./venue-registry.mjs";
const REGIONS=["ASIA","EUROPE","AMERICAS"];
const regionOf=venue=>venue.zone.startsWith("Asia/")?"ASIA":
  venue.zone.startsWith("Europe/")?"EUROPE":"AMERICAS";
// ISO 10383: XTKS = Tokyo Stock Exchange segment; XJPX = operating MIC.
// Operator state NEVER proves a specific TSE segment is continuously trading.
const OPERATING_MIC_HINTS=Object.freeze({XTKS:"XJPX"});
const safeRecord=(record,mic)=>record&&typeof record==="object"&&!Array.isArray(record)&&
  record.exactMicState===true&&record.stateMic===mic&&record.authoritativeSessionVerified===false&&
  ["PROVIDER_REPORTED_OPEN","PROVIDER_REPORTED_CLOSED"].includes(record.state);
const fail=reason=>({ok:false,reason,mode:"GLOBAL_VENUE_STATUS_DIAGNOSTIC_ONLY",
  paperEligible:false,countsTowardRealPaper:false,liveTradingAllowed:false,brokerConnectivityAllowed:false});

export function assessGlobalVenueStateHints({source,nowIso,maxAgeMinutes=180}={}){
 const now=Date.parse(nowIso),at=Date.parse(source?.observedAt??"");
 if(!Number.isFinite(now)||!Number.isFinite(maxAgeMinutes)||maxAgeMinutes<1||maxAgeMinutes>1440)
  return fail("INVALID_OBSERVATION_POLICY");
 if(!source||source.version!==1||source.mode!=="WORLDWIDE_RESEARCH_DIAGNOSTIC"||
    source.paperEligible!==false||source.liveTradingAllowed!==false||
    source.brokerConnectivityAllowed!==false||source.marketStateAvailable!==true||
    !source.records||typeof source.records!=="object"||Array.isArray(source.records)||
    !Number.isSafeInteger(source.venuesTracked)||source.venuesTracked<0||
    !Number.isSafeInteger(source.venuesWithExactState)||source.venuesWithExactState<0||
    !Number.isSafeInteger(source.quoteRequests)||source.quoteRequests<0)
  return fail("SOURCE_REPORT_NOT_SAFE");
 if(!Number.isFinite(at)||at>now)return fail("SOURCE_TIMESTAMP_INVALID_OR_FUTURE");
 const ageMinutes=(now-at)/60000,sourceFresh=ageMinutes<=maxAgeMinutes;
 const rows=VENUES.map(venue=>{
  const exact=source.records[venue.mic];
  const operatingMic=OPERATING_MIC_HINTS[venue.mic]??null;
  const operator=operatingMic?source.records[operatingMic]:null;
  const exactFound=safeRecord(exact,venue.mic);
  const operatorFound=!exactFound&&operatingMic&&safeRecord(operator,operatingMic);
  const reportedMic=exactFound?venue.mic:operatorFound?operatingMic:null;
  const mapping=exactFound?"EXACT_MIC":operatorFound?"OPERATING_MIC_ONLY":"NOT_OBSERVED";
  const reportedState=sourceFresh&&reportedMic?
    (exactFound?exact:operator).state:null;
  const reason=!sourceFresh?"SOURCE_STALE":mapping==="OPERATING_MIC_ONLY"?
    "OPERATING_MIC_NOT_SEGMENT_CALENDAR":mapping==="NOT_OBSERVED"?
    "VENUE_NOT_OBSERVED":"PROVIDER_HINT_NOT_AUTHORITATIVE";
  return {mic:venue.mic,region:regionOf(venue),sourceMic:reportedMic,mapping,
    providerReportedState:reportedState,sourceFresh,reason,
    authoritativeSessionVerified:false,quotesValidated:0,paperEligible:false};
 });
 const regions=Object.fromEntries(REGIONS.map(region=>{
  const sub=rows.filter(row=>row.region===region);
  return [region,{requested:sub.length,exactMicHints:sub.filter(x=>x.mapping==="EXACT_MIC").length,
    operatingMicOnlyHints:sub.filter(x=>x.mapping==="OPERATING_MIC_ONLY").length,
    notObserved:sub.filter(x=>x.mapping==="NOT_OBSERVED").length,
    providerReportedOpen:sub.filter(x=>x.providerReportedState==="PROVIDER_REPORTED_OPEN").length,
    providerReportedClosed:sub.filter(x=>x.providerReportedState==="PROVIDER_REPORTED_CLOSED").length,
    authoritativeSessions:0,verifiedQuotes:0,certifiedPaperFills:0}];
 }));
 return {ok:true,reason:null,mode:"GLOBAL_VENUE_STATUS_DIAGNOSTIC_ONLY",
  sourceMode:source.mode,observedAt:source.observedAt,ageMinutes:Math.round(ageMinutes*100)/100,
  sourceFresh,sourceVenuesTracked:source.venuesTracked,sourceQuoteRequests:source.quoteRequests,
  regions,totals:{requested:rows.length,exactMicHints:rows.filter(x=>x.mapping==="EXACT_MIC").length,
    operatingMicOnlyHints:rows.filter(x=>x.mapping==="OPERATING_MIC_ONLY").length,
    notObserved:rows.filter(x=>x.mapping==="NOT_OBSERVED").length,
    authoritativeSessions:0,verifiedQuotes:0,certifiedPaperFills:0},
  rows,paperEligible:false,countsTowardRealPaper:false,liveTradingAllowed:false,
  brokerConnectivityAllowed:false};
}
