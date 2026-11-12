/**
 * FENICE ONE GLOBAL — read-only, time-aware EOD PAPER launch preflight.
 *
 * Clock-based market windows are never proof of an exchange's actual open
 * state, quote availability, price provenance or a valid PAPER fill.
 * Owner consent only applies to virtual simulation, not to market data rights.
 * The result contains zero proprietary prices, no secrets, no broker calls.
 */
import {readFileSync, appendFileSync} from "node:fs";
const VENUES=Object.freeze([
  {mic:"XMIL",zone:"Europe/Rome",open:9*60+1,close:17*60+30},
  {mic:"XETR",zone:"Europe/Berlin",open:9*60,close:17*60+30},
  {mic:"XTKS",zone:"Asia/Tokyo",open:9*60,close:15*60+30,
    lunchStart:11*60+30,lunchEnd:12*60+30},
  {mic:"XNYS",zone:"America/New_York",open:9*60+30,close:16*60},
  {mic:"XNAS",zone:"America/New_York",open:9*60+30,close:16*60},
]);
const at=iso=>typeof iso==="string"&&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(iso)&&
  Number.isFinite(Date.parse(iso))?Date.parse(iso):null;
const local=(date,zone)=>Object.fromEntries(new Intl.DateTimeFormat("en-GB",{
  timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",
  hour:"2-digit",minute:"2-digit",weekday:"short",hourCycle:"h23",
}).formatToParts(date).map(part=>[part.type,part.value]));
const diffHours=(now,iso)=>{
  const then=at(iso);
  return then===null||then>now?null:Math.round((now-then)/36000)/100;
};
const dedup=values=>[...new Set(values)];
export function assessOneGlobalEodOpenPreflight({nowIso,eod,provider,committee,ownerPaperConsent=false}={}){
  const now=at(nowIso);
  if(now===null || eod?.mode!=="WORLD_V7_EOD_RESEARCH_ONLY"||
    eod?.liveTradingAllowed!==false||
    provider?.mode!=="PROVIDER_ACCESS_DIAGNOSTIC_ONLY"||
    provider?.liveTradingAllowed!==false||
    committee?.engine!=="Fenice Investment Committee v1")
    throw Error("EOD_OPEN_PREFLIGHT_INPUT_INVALID");
  const researchAgeHours=diffHours(now,eod.generatedAt);
  const committeeAgeHours=diffHours(now,committee.generatedAt);
  const approvedForPAPERObservation=ownerPaperConsent===true;
  const candidates=Number.isSafeInteger(committee.buyCandidateCount)
    ?committee.buyCandidateCount:0;
  const venues=VENUES.map(spec=>{
    const point=local(new Date(now),spec.zone);
    const minute=Number(point.hour)*60+Number(point.minute);
    const weekday=!["Sat","Sun"].includes(point.weekday);
    const withinRegularHours=weekday && minute>=spec.open && minute<spec.close
      &&(!spec.lunchStart||minute<spec.lunchStart||minute>=spec.lunchEnd);
    const row=eod.records?.[spec.mic]||null;
    const access=provider.records?.[spec.mic]||null;
    const observationAgeHours=diffHours(now,access?.recordedAt);
    const blockers=[];
    // A scheduled window is not an authoritative market clock. Even on a
    // regular business weekday a holiday or exchange halt can occur.
    blockers.push("EXCHANGE_SESSION_NOT_INDEPENDENTLY_CONFIRMED");
    if(!withinRegularHours)blockers.push("OUTSIDE_REGULAR_SESSION_WINDOW");
    if(row?.exactMicCertified!==true)
      blockers.push("EXACT_MIC_AND_PROVIDER_SYMBOL_NOT_CERTIFIED");
    if(!row || !["COMPLETE_EOD_RESEARCH","TENTATIVE_COMPLETED_DAILY_RESEARCH"].includes(row.status))
      blockers.push("COMPLETED_EOD_PROVIDER_DATA_MISSING");
    if(row?.licensedPaperSource!==true)
      blockers.push("EOD_DATA_USAGE_RIGHTS_NOT_CERTIFIED");
    if(observationAgeHours===null||observationAgeHours>24)
      blockers.push("PROVIDER_ACCESS_DIAGNOSTIC_STALE");
    blockers.push("TWO_INDEPENDENT_PUBLISHED_CLOSE_RECEIPTS_MISSING");
    if(researchAgeHours===null||researchAgeHours>24)
      blockers.push("WORLD_EOD_RESEARCH_SNAPSHOT_STALE");
    if(committeeAgeHours===null||committeeAgeHours>24)
      blockers.push("COMMITTEE_NOT_FRESH");
    if(candidates===0)blockers.push("NO_COMMITTEE_COMPRA_SIGNAL");
    if(!approvedForPAPERObservation)blockers.push("OWNER_PAPER_CONSENT_NOT_PRESENT");
    return {mic:spec.mic,exchangeLocalDate:point.year+"-"+point.month+"-"+point.day,
      exchangeLocalTime:point.hour+":"+point.minute,
      regularWindowExpected:withinRegularHours,
      actualExchangeOpenProven:false,
      sourceStatus:row?.status??"NOT_OBSERVED",
      lastCompletedResearchDate:row?.lastCompleteBarDate??null,
      accessDiagnosticAgeHours:observationAgeHours,
      blockers:dedup(blockers),paperSignalCommitted:false,
      eodPaperFillRecorded:false};
  });
  const windows=venues.filter(v=>v.regularWindowExpected).map(v=>v.mic);
  return {
    version:1,mode:"ONE_GLOBAL_EOD_PAPER_OPERATIONAL_PREFLIGHT_ONLY",
    generatedAt:nowIso,ownerConsentScope:approvedForPAPERObservation
      ?"PRIVATE_VIRTUAL_PAPER_ONLY":"NO_CONSENT_EVIDENCE_IN_THIS_RUN",
    initialVirtualCapitalEuro:1000,
    committeeBuyCandidates:candidates,
    committeeAgeHours,researchAgeHours,
    marketWindowsExpected:windows,
    venues,nearTermDecision:"NO_PAPER_ORDER",
    reason:"MARKET_WINDOW_IS_NOT_PRICE_OR_EXECUTION_PROOF",
    independentlyLicensedDataAvailable:false,
    independentProviderReceiptsVerified:0,
    virtualBuys:0,virtualSells:0,certifiedTrades:0,
    phase9CertificationCredit:0,
    sourceRightsIndependentlyCertified:false,
    liveTradingAllowed:false,brokerConnectivityAllowed:false,
    noDirectaSubmission:true,noRawPricesPublished:true,
  };
}
if(process.argv[1] && import.meta.url===new URL("file://"+process.argv[1]).href){
  const r=assessOneGlobalEodOpenPreflight({
    nowIso:new Date().toISOString(),
    eod:JSON.parse(readFileSync("data/world-v7-eod-research.json","utf8")),
    provider:JSON.parse(readFileSync("data/world-v7-provider-observation.json","utf8")),
    committee:JSON.parse(readFileSync("data/investment-committee.json","utf8")),
    ownerPaperConsent:process.argv.includes("--paper-only-owner-consent"),
  });
  const output={
    timestamp:r.generatedAt,consent:r.ownerConsentScope,
    marketWindowsExpected:r.marketWindowsExpected,
    committeeBuyCandidates:r.committeeBuyCandidates,
    venues:r.venues.map(v=>({
      mic:v.mic,exchangeLocalTime:v.exchangeLocalTime,
      expectedRegularWindow:v.regularWindowExpected,
      sourceStatus:v.sourceStatus,blockers:v.blockers,
    })),
    decision:r.nearTermDecision,actualExchangeOpenProven:false,
    paperFills:0,certifiedTrades:0,liveTradingAllowed:false,
    brokerConnectivityAllowed:false,noRawPricesPublished:true,
  };
  console.log(JSON.stringify(output));
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    "## ONE GLOBAL — live-clock EOD PAPER preflight (no orders)\n\n"+
    "Owner consent in this check: "+r.ownerConsentScope+"\n\n"+
    output.venues.map(v=>"- "+v.mic+": window="+v.expectedRegularWindow+
      " | "+v.blockers.join(", ")).join("\n")+
    "\n\n**NO PAPER FILL / NO DIRECTA ORDERS**. Only exchange-local clock windows; "+
    "real sessions, licenses, price receipts and signals must be verified separately.\n");
}
