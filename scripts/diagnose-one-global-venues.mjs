/**
 * ONE GLOBAL — factual global venue readiness scoreboard, never an execution feed.
 * Sanctioned research-only sources stay research-only even when fresh.
 * Source/quote/entitlement reclassification is NOT done here.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const MIC=["XNAS","XNYS","ARCX","XMIL","XETR","XTKS","BVMF","XASX"];
const INTL=["XMIL","XETR","XTKS"];
const age=(value,now)=>{
  const ms=typeof value==="string"?Date.parse(value):NaN;
  if(!Number.isFinite(ms)||ms>now)return null;
  return Math.round((now-ms)/60000);
};
const iso=value=>typeof value==="string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)
  &&Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString()===value;
const unique=items=>[...new Set(items)];

export function diagnoseOneGlobalVenues({globalLedger,providerObservation,eodResearch,usCoverage,nowIso}){
  const now=iso(nowIso)?Date.parse(nowIso):NaN;
  if(!Number.isFinite(now))throw Error("ONE_GLOBAL_VENUE_REPORT_CLOCK_INVALID");
  if(globalLedger?.diagnosticOnly!==true||globalLedger.paperEligible!==false
    ||globalLedger.certifiedPaperFills!==0||globalLedger.liveTradingAllowed!==false
    ||globalLedger.brokerSubmissionAllowed!==false||globalLedger?.mode!=="WORLD_V7_FORWARD_DIAGNOSTIC"
    ||!globalLedger.venues||typeof globalLedger.venues!=="object"
    ||MIC.some(m=>!globalLedger.venues[m]||globalLedger.venues[m].paperEligible!==false
      ||globalLedger.venues[m].certifiedPaperFills!==0))
    throw Error("ONE_GLOBAL_WORLD_LEDGER_UNVERIFIED_OR_ESCALATED");
  if(providerObservation?.mode!=="PROVIDER_ACCESS_DIAGNOSTIC_ONLY"
    ||providerObservation.paperReady!==false
    ||providerObservation.liveTradingAllowed!==false
    ||providerObservation.brokerConnectivityAllowed!==false
    ||!providerObservation.records||typeof providerObservation.records!=="object")
    throw Error("ONE_GLOBAL_PROVIDER_DIAGNOSTIC_RIGHTS_CONFLICT");
  if(eodResearch?.mode!=="WORLD_V7_EOD_RESEARCH_ONLY"
    ||eodResearch.realtimePaperEligible!==false
    ||eodResearch.liveTradingAllowed!==false
    ||eodResearch.brokerConnectivityAllowed!==false
    ||!eodResearch.records||typeof eodResearch.records!=="object")
    throw Error("ONE_GLOBAL_EOD_RESEARCH_RIGHTS_CONFLICT");
  if(usCoverage?.policy?.liveTradingAllowed!==false
    ||!iso(usCoverage?.generatedAt))
    throw Error("ONE_GLOBAL_US_COVERAGE_RIGHTS_OR_TIMESTAMP_INVALID");
  const coverageAgeMinutes=age(usCoverage.generatedAt,now);
  const usCoverageFresh=coverageAgeMinutes!==null&&coverageAgeMinutes<=30;
  const rows=MIC.map(mic=>{
    const v=globalLedger.venues[mic];
    const p=providerObservation.records[mic]??null;
    const e=eodResearch.records[mic]??null;
    const historyMinutes=age(v.latestAt,now);
    const providerMinutes=age(p?.recordedAt,now);
    const eodMinutes=age(e?.analyzedAt,now);
    if(p&&(p.venue!==mic||p.paperReady!==false
      ||p.liveTradingAllowed!==false||p.brokerConnectivityAllowed!==false
      ||p.quote?.paperEligible!==false||p.privatePricePublished!==false
      ||p.quoteFamiliesApproved!==0))
      throw Error("ONE_GLOBAL_PROVIDER_RECORD_TAMPER_"+mic);
    if(e&&(e.venue!==mic||e.licensedPaperSource!==false
      ||e.dataUsedForOrderExecution!==false||e.liveTradingAllowed!==false
      ||e.paperFillCount!==0||e.EodResearchIsNotRealtimeQuote!==true))
      throw Error("ONE_GLOBAL_EOD_RECORD_TAMPER_"+mic);
    const reasons=[...(v.blockers||[])];
    if(historyMinutes===null)reasons.push("NO_CURRENT_VALIDATED_VENUE_HISTORY");
    else if(historyMinutes>1440)reasons.push("VENUE_HISTORY_OLDER_THAN_24H");
    if(INTL.includes(mic)){
      if(!p)reasons.push("INDEPENDENT_PROVIDER_ACCESS_DIAGNOSTIC_MISSING");
      else {
        if(providerMinutes===null||providerMinutes>1440)
          reasons.push("PROVIDER_ACCESS_OBSERVATION_OLDER_THAN_24H");
        if(p.state?.authoritativeExchangeProof!==true)
          reasons.push("PROVIDER_MARKET_STATE_NOT_AUTHORITATIVE");
        if(p.quote?.status!=="VALID_REALTIME_LICENSED_PROOF")
          reasons.push("NO_EXECUTABLE_REALTIME_QUOTE_PROOF");
        const providerMic=p.target?.providerMic;
        if(p.target?.mic!==mic||!p.target?.canonicalSegmentProof
          ||providerMic!==mic||p.state?.operatingMicIsNotSegmentProof===true)
          reasons.push("EXACT_TRADING_SEGMENT_NOT_PROVEN");
        if(["Pro","Grow","Ultra"].includes(p.catalogue?.requiredPlan))
          reasons.push("PROVIDER_CATALOGUE_INDICATES_PAID_TIER");
      }
      if(!e)reasons.push("NO_VERIFIED_DAILY_RESEARCH_REFERENCE");
      else{
        if(eodMinutes===null||eodMinutes>72*60)reasons.push("EOD_RESEARCH_OBSERVATION_OLDER_THAN_72H");
        if(e.providerSymbolConfirmed!==true||e.exactMicCertified!==true)
          reasons.push("HISTORICAL_LISTING_MAPPING_UNCERTIFIED");
        if(!e.lastCompleteBarDate)reasons.push("NO_COMPLETE_DAILY_HISTORY");
      }
      if(mic==="XTKS" && eodResearch.fxHistory?.pricingExecutionEligible!==true)
        reasons.push("JPY_EUR_EXECUTABLE_FX_MISSING");
    }else if(["XNAS","XNYS","ARCX"].includes(mic)){
      if(!usCoverageFresh)reasons.push("US_QUOTE_COVERAGE_NOT_CURRENT");
      reasons.push("STRATEGY_RIGHTS_SEPARATE_FROM_TECHNICAL_V8");
    }
    if(!INTL.includes(mic)&&!["XNAS","XNYS","ARCX"].includes(mic))
      reasons.push("NO_QUALIFIED_GLOBAL_QUOTE_PIPELINE");
    const hasResearch=Number(v.researchDays||0)>0;
    return {
      mic,region:v.region,asOf:v.latestAt??null,ageMinutes:historyMinutes,
      lastObservedState:v.latestState,
      researchDays:v.researchDays||0,researchAvailable:hasResearch,
      exactVenueAuthorized:false,
      prospectiveStrategyPaperEligible:false,
      certifiedTrades:0,
      providerDiagnostic:p?{
        provider:p.provider,asOf:p.recordedAt,ageMinutes:providerMinutes,
        status:p.quote.status,providerMic:p.target?.providerMic||null,
        requiredPlanAdvertised:p.catalogue?.requiredPlan||null,
        quotedPricePublished:false,pricingRightsApproved:false,
      }:null,
      dailyResearch:e?{
        asOf:e.analyzedAt,ageMinutes:eodMinutes,status:e.status,
        provisionalMapping:e.provisionalResearchMapping===true,
        lastCompleteBarDate:e.lastCompleteBarDate,
        executionEligible:false,
      }:null,
      blockers:unique(reasons),
    };
  });
  const nextSteps={
    XMIL:["Verify exact ENEL/XMIL security mapping (prior symbol mismatch)",
      "Identify two independent permitted real-time sources; Twelve Data catalog advertises Pro tier",
      "Prove the official exchange session and quote usage rights"],
    XETR:["Verify DTE/XETR mapping; daily bars are provisional historical research",
      "Find qualified second realtime provider; catalogue advertises Grow tier",
      "Obtain valid exact exchange session proof and execution-entitled quote pairs"],
    XTKS:["Resolve XTKS segment versus XJPX aggregate exchange-state identity",
      "Verify exact 7203/XTKS listing and independent live quote sources",
      "Obtain JPY→EUR executable FX and paper usage permission"],
  };
  return {
    version:1,generatedAt:nowIso,mode:"ONE_GLOBAL_VENUE_READINESS_RESEARCH_ONLY",
    sourceTimestamps:{
      worldLedger:globalLedger.generatedAt,
      providerAccess:providerObservation.generatedAt,
      eodResearch:eodResearch.generatedAt,
      usCoverage:usCoverage.generatedAt,
    },
    summary:{
      venuesTracked:rows.length,
      researchVenues:rows.filter(x=>x.researchAvailable).length,
      eligibleStrategyVenues:0,certifiedStrategyFills:0,
      priorityVenues:IntlOrdered(),
      usCoverageFresh,
      note:"Historical/EOD reference, catalog listing and technical V8 quote proof do not authorize strategy trading.",
    },
    venues:rows,nextSteps,
    safety:{
      paperReadinessCertified:false,liveTradingAllowed:false,brokerConnectivityAllowed:false,
      strategyOrderAuthorizationGranted:false,technicalV8CreditedAsWorldStrategy:false,
      marketPricesPublished:false,providerEntitlementsFabricated:false,
    },
  };
}
function IntlOrdered(){return [...INTL];}
async function main(){
  const read=name=>JSON.parse(readFileSync(resolve(ROOT,"data",name),"utf8"));
  const report=diagnoseOneGlobalVenues({
    globalLedger:read("world-v7-validation-ledger.json"),
    providerObservation:read("world-v7-provider-observation.json"),
    eodResearch:read("world-v7-eod-research.json"),
    usCoverage:read("execution-market-coverage.json"),
    nowIso:new Date().toISOString(),
  });
  const output=process.argv.find(arg=>arg.startsWith("--output="))?.slice(9)
    ||"/tmp/fenice-one-global-venues.json";
  mkdirSync(dirname(output),{recursive:true});
  writeFileSync(output,JSON.stringify(report,null,2)+"\n",{mode:0o600});
  console.log("ONE GLOBAL world readiness: "+JSON.stringify({
    venues:report.summary.venuesTracked,
    research:report.summary.researchVenues,
    qualifiedStrategyPaper:0,USCoverageFresh:report.summary.usCoverageFresh,
    priority:report.venues.filter(v=>INTL.includes(v.mic)).map(v=>({
      mic:v.mic,providerAccessAgeMinutes:v.providerDiagnostic?.ageMinutes??null,
      reportedPlan:v.providerDiagnostic?.requiredPlanAdvertised??null,
      firstBlocker:v.blockers[0],
    })),
    directBrokerAccess:false,
  }));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
