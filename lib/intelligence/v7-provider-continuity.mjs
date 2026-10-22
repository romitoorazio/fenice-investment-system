/**
 * V7 external-provider continuity evidence, FORWARD-ONLY and diagnostic.
 * Never certifies legal entitlements, simulates fills, changes V6 or submits orders.
 * New observations are appended from authenticated provider lab reports after
 * their market session is observed, never reconstructed from prior snapshots.
 */
const MS_DAY=86_400_000;
const MIC=/^[A-Z0-9]{4}$/;
const SYMBOL=/^[A-Z0-9._-]{1,25}$/;
const iso=v=>typeof v==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&!Number.isNaN(Date.parse(v))
  &&new Date(v).toISOString()===v?Date.parse(v):null;
const flags=Object.freeze({
  diagnosticOnly:true,independentEntitlementCertified:false,
  providerQuoteRightsCertified:false,forwardPaperFills:0,
  changesV6:false,brokerSubmissionAllowed:false,liveTradingAllowed:false,
});
export function accumulateV7ProviderContinuity(previous,report,{now=new Date()}={}){
  const time=now instanceof Date?now.getTime():NaN;
  if(!Number.isFinite(time))throw Error("V7_CONTINUITY_INVALID_CLOCK");
  const old=previous??{version:1,observations:[]};
  if(old.version!==1||!Array.isArray(old.observations)||old.observations.length>2000
    ||old.observations.some(x=>!x||typeof x!=="object"||!SYMBOL.test(x.symbol||"")
       ||!MIC.test(x.mic||"")||typeof x.date!=="string"||!Array.isArray(x.sampleTimes)))
    throw Error("V7_CONTINUITY_INVALID_PREVIOUS_LEDGER");
  if(!report||report.diagnosticOnly!==true||report.liveTradingAllowed!==false
    ||report.brokerConnectivityAllowed!==false||report.paperStateModified!==false
    ||report.campaignEvidenceModified!==false)
    throw Error("V7_CONTINUITY_UNSAFE_REPORT");
  const generated=iso(report.generatedAt);
  if(generated===null||generated>time||time-generated>30*60_000)
    throw Error("V7_CONTINUITY_STALE_OR_FUTURE_REPORT");
  const reportDay=new Date(generated).toISOString().slice(0,10);
  const dateCutoff=new Date(time-90*MS_DAY).toISOString().slice(0,10);
  const observations=old.observations.map(x=>({...x,sampleTimes:[...x.sampleTimes]}))
    .filter(x=>x.date>=dateCutoff);
  // Do not make a false success from a CLOSED/UNKNOWN clock or
  // from a syntactically complete but unauthoritative session claim.
  const session=report.marketSession;
  const at=iso(session?.evidence?.observedAt);
  const usable=report.state==="OPEN_SESSION_SAMPLED"
    &&report.quoteProvidersQueried===true&&report.sessionFreshAtReport===true
    &&session?.evidence?.venue==="US_EQUITIES"&&session.evidence.state==="OPEN"
    &&session.evidence.authoritative===true
    &&session.decision?.allowed===true&&session.decision.state==="OPEN"
    &&at!==null&&at<=generated&&generated-at<=60_000;
  const skipped=!usable;
  if(usable){
    if(!Array.isArray(report.targets)||report.targets.length>8
      ||!Number.isFinite(report.maxAgeSeconds)||report.maxAgeSeconds>120
      ||report.maxAgeSeconds<=0||!Number.isFinite(report.maxSpreadPercent)
      ||report.maxSpreadPercent<=0||report.maxSpreadPercent>0.75)
      throw Error("V7_CONTINUITY_INVALID_PROBE_ENVELOPE");
    const unique=new Set();
    for(const x of report.targets){
      const symbol=x.symbol, mic=x.exchangeMic;
      if(!SYMBOL.test(symbol||"")||!MIC.test(mic||"")
        ||!["XNAS","XNYS","ARCX","BATS","IEXG"].includes(mic)
        ||unique.has(symbol)||x.alpacaCandidate!==true||x.twelveDataCandidate!==true)
        throw Error("V7_CONTINUITY_INVALID_INSTRUMENT");
      unique.add(symbol);
      const sourceA=x.alpaca||{},sourceB=x.twelveData||{};
      const a=iso(sourceA.observedAt),b=iso(sourceB.observedAt);
      const freshA=a!==null&&a<=generated&&generated-a<=120_000
        &&sourceA.freshVerifiedQuote===true&&sourceA.ok===true
        &&sourceA.provenance==="authenticated-alpaca-iex-latest-quote"
        &&["IEX_QUOTE_MIDPOINT","IEX_TRADE_LAST"].includes(sourceA.priceBasis);
      const freshB=b!==null&&b<=generated&&generated-b<=120_000
        &&sourceB.freshVerifiedQuote===true&&sourceB.ok===true
        &&sourceB.provenance==="authenticated-twelve-data-batch-quote"
        &&sourceB.timestampVerified===true&&sourceB.venueVerified===true;
      const spread=Number(x.crossSourceSpreadPercent);
      const spreadOk=typeof x.crossSourceSpreadPercent==="number"
        &&Number.isFinite(spread)&&spread>=0&&spread<=report.maxSpreadPercent
        &&x.withinCurrentQuorumSpreadLimit===true;
      const compatible=freshA&&freshB&&spreadOk&&x.dualSourceFeasible===true
        &&x.quorumCompatible===true;
      const position=observations.findIndex(y=>y.date===reportDay&&y.symbol===symbol);
      const record=position>=0?observations[position]:{
        date:reportDay,symbol,mic,firstSampleAt:report.generatedAt,
        lastSampleAt:report.generatedAt,sampleTimes:[],checks:0,
        compatibleSamples:0,latestCompatible:false,
      };
      if(record.mic!==mic)throw Error("V7_CONTINUITY_VENUE_CHANGED_SAME_DAY");
      if(record.sampleTimes.includes(report.generatedAt))continue; // idempotent GH retry
      if(record.sampleTimes.length>=24)continue; // cap per day
      if(record.lastSampleAt>report.generatedAt)throw Error("V7_CONTINUITY_OUT_OF_ORDER_REPORT");
      record.sampleTimes.push(report.generatedAt);
      record.checks+=1;
      record.compatibleSamples+=compatible?1:0;
      record.lastSampleAt=report.generatedAt;
      record.latestCompatible=Boolean(compatible);
      if(position<0)observations.push(record);
    }
  }
  observations.sort((a,b)=>a.date.localeCompare(b.date)||a.symbol.localeCompare(b.symbol));
  const dates=[...new Set(observations.map(x=>x.date))];
  const qualifiedDates=[...new Set(observations.filter(x=>x.compatibleSamples>0).map(x=>x.date))];
  const summary={
    observedDays:dates.length,daysWithAnyDualProviderConfirmation:qualifiedDates.length,
    instrumentsObserved:[...new Set(observations.map(x=>x.symbol))].sort(),
    instrumentsWithAnyConfirmation:[...new Set(observations.filter(x=>x.compatibleSamples>0).map(x=>x.symbol))].sort(),
    totalRecordedSamples:observations.reduce((n,x)=>n+x.checks,0),
    totalCompatibleSamples:observations.reduce((n,x)=>n+x.compatibleSamples,0),
    minimumContinuousDaysForReview:20,
    eligibleForPaperCertification:false,
    reason:"Observed simultaneous dual-feed feasibility does not certify contractual rights, strategy signals, order execution or 20 independent sessions.",
  };
  return {ledger:{version:1,purpose:"PROVIDER_CONTINUITY_DIAGNOSTIC_FORWARD_ONLY",
    generatedAt:usable?report.generatedAt:old.generatedAt??null,
    ...flags,observations,summary},
    admitted:usable,skipped,changed:usable&&observations.some(x=>x.sampleTimes.includes(report.generatedAt)&&!(old.observations.some(o=>o.date===x.date&&o.symbol===x.symbol&&o.sampleTimes.includes(report.generatedAt))))};
}
