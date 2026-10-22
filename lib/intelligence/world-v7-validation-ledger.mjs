// V7 worldwide forward-only SOURCE evidence. Never PAPER order evidence.
const MAX_MS=4*3600000,DAY=86400000;
const VENUES=Object.freeze({
 XNAS:"north-america",XNYS:"north-america",ARCX:"north-america",
 XMIL:"europe",XETR:"europe",XTKS:"asia-pacific",
 BVMF:"latin-america",XASX:"oceania",
});
const REGIONS=[...new Set(Object.values(VENUES))];
const iso=x=>typeof x==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)
  &&!Number.isNaN(Date.parse(x))&&new Date(Date.parse(x)).toISOString()===x?Date.parse(x):null;
const sym=x=>typeof x==="string"&&/^[A-Z0-9._-]{1,24}$/.test(x);
const day=x=>new Date(x).toISOString().slice(0,10);
const validTime=(x,now)=>{const n=iso(x);return n!==null&&n<=now&&now-n<=MAX_MS;};
const initial=()=>({version:1,mode:"WORLD_V7_FORWARD_DIAGNOSTIC",
  generatedAt:null,diagnosticOnly:true,paperEligible:false,
  certifiedPaperFills:0,brokerSubmissionAllowed:false,liveTradingAllowed:false,observations:[]});
function validateOld(old){
 if(old.version!==1||old.mode!=="WORLD_V7_FORWARD_DIAGNOSTIC"||
   old.diagnosticOnly!==true||old.paperEligible!==false||
   old.certifiedPaperFills!==0||old.brokerSubmissionAllowed!==false||
   old.liveTradingAllowed!==false||!Array.isArray(old.observations)||
   old.observations.length>900)throw Error("INVALID_WORLD_V7_LEDGER");
 const seen=new Set();
 for(const r of old.observations){
  if(!r||!Object.hasOwn(VENUES,r.mic)||
    !["US_DUAL_FEED","EOD_RESEARCH","ACCESS_CHECK"].includes(r.kind)||
    iso(r.at)===null||r.paperEligible!==false||r.certifiedPaperFills!==0||
    r.region!==VENUES[r.mic])throw Error("INVALID_WORLD_V7_OBSERVATION");
  const k=r.mic+"|"+r.kind+"|"+r.at;
  if(seen.has(k))throw Error("DUPLICATE_WORLD_V7_OBSERVATION");
  seen.add(k);
 }
}
export function updateWorldV7ValidationLedger(previous,{us=null,eod=null,access=null}={},{now=new Date()}={}){
 const timestamp=now instanceof Date?now.getTime():NaN;
 if(!Number.isFinite(timestamp))throw Error("INVALID_WORLD_V7_CLOCK");
 const old=previous??initial();validateOld(old);
 const rows=old.observations.filter(r=>iso(r.at)<=timestamp&&
   r.at.slice(0,10)>=day(timestamp-90*DAY)).map(r=>({...r}));
 const seen=new Set(rows.map(r=>r.mic+"|"+r.kind+"|"+r.at));
 let added=0;
 function put(mic,kind,at,data){
  if(!Object.hasOwn(VENUES,mic)||!validTime(at,timestamp))return;
  const k=mic+"|"+kind+"|"+at;
  if(seen.has(k))return;
  if(rows.length>=900)throw Error("WORLD_V7_LEDGER_FULL");
  const r={mic,region:VENUES[mic],kind,at,...data,paperEligible:false,certifiedPaperFills:0};
  rows.push(r);seen.add(k);added++;
 }
 if(us?.version===1&&us.diagnosticOnly===true&&us.liveTradingAllowed===false&&
   us.brokerSubmissionAllowed===false&&us.forwardPaperFills===0&&
   us.independentEntitlementCertified===false&&
   us.providerQuoteRightsCertified===false&&us.changesV6===false&&
   validTime(us.generatedAt,timestamp)&&Array.isArray(us.observations)){
   const groups=new Map();
   for(const v of us.observations){
    if(!["XNAS","XNYS","ARCX"].includes(v?.mic)||!sym(v.symbol)||
      v.lastSampleAt!==us.generatedAt||
      !Array.isArray(v.sampleTimes)||!v.sampleTimes.includes(us.generatedAt)||
      typeof v.latestCompatible!=="boolean")continue;
    const g=groups.get(v.mic)||{tested:0,compatible:0};
    g.tested++;g.compatible+=Number(v.latestCompatible);groups.set(v.mic,g);
   }
   for(const [mic,g] of groups)put(mic,"US_DUAL_FEED",us.generatedAt,{
    state:g.compatible===g.tested?"DUAL_FEED_CONCORDANT":
      g.compatible>0?"DUAL_FEED_PARTIAL":"DUAL_FEED_UNAVAILABLE",
    researchObserved:g.compatible>0,tested:g.tested,compatible:g.compatible,
    proof:"ALPACA_IEX_AND_TWELVE_DATA_ACCESS_DIAGNOSTIC"});
 }
 if(eod?.version===1&&eod.mode==="WORLD_V7_EOD_RESEARCH_ONLY"&&
   eod.liveTradingAllowed===false&&eod.realtimePaperEligible===false&&
   eod.brokerConnectivityAllowed===false&&
   eod.historicalReplay?.forwardVerifiedPaperFills===0&&
   eod.historicalReplay?.marketDataRightsCertified===false&&
   validTime(eod.generatedAt,timestamp)){
   for(const mic of ["XMIL","XETR","XTKS"]){
    const v=eod.records?.[mic];
    if(v?.venue!==mic||v.mode!=="WORLD_V7_EOD_RESEARCH_ONLY"||
      v.liveTradingAllowed!==false||v.paperFillCount!==0||
      v.licensedPaperSource!==false||v.exactMicCertified!==false||
      !sym(v.ticker)||v.currency!==(mic==="XTKS"?"JPY":"EUR")||
      iso(v.analyzedAt)===null||
      Date.parse(v.analyzedAt)>Date.parse(eod.generatedAt)||
      Date.parse(eod.generatedAt)-Date.parse(v.analyzedAt)>10*60000)continue;
    const bars=["TENTATIVE_COMPLETED_DAILY_RESEARCH","COMPLETE_EOD_RESEARCH"].includes(v.status)
      &&Number.isSafeInteger(v.completeSessions)&&v.completeSessions>=25&&
      /^\d{4}-\d\d-\d\d$/.test(v.lastCompleteBarDate||"")&&
      v.lastCompleteBarDate<day(Date.parse(eod.generatedAt))&&
      Date.parse(eod.generatedAt)-Date.parse(v.lastCompleteBarDate+"T00:00:00Z")<=6*DAY;
    put(mic,"EOD_RESEARCH",v.analyzedAt,{
     state:bars?"PROVISIONAL_COMPLETED_EOD":"EOD_NOT_ADMISSIBLE",
     researchObserved:bars, symbol:v.ticker,
     lastBarDate:bars?v.lastCompleteBarDate:null,barCount:bars?v.completeSessions:0,
     reason:bars?null:(sym(v.status)?v.status:"UNKNOWN"),
     proof:"ALPHA_VANTAGE_UNCERTIFIED_HISTORICAL_ONLY"});
   }
 }
 if(access?.schemaVersion===1&&access.mode==="PROVIDER_ACCESS_DIAGNOSTIC_ONLY"&&
    access.paperReady===false&&access.liveTradingAllowed===false&&
    access.brokerConnectivityAllowed===false){
  for(const mic of ["XMIL","XETR","XTKS"]){
   const v=access.records?.[mic];
   if(v?.venue!==mic||v.provider!=="twelve-data"||v.quoteFamiliesApproved!==0||
     v.paperReady!==false||v.liveTradingAllowed!==false||
     v.quote?.paperEligible!==false||v.privatePricePublished!==false||
     v.target?.mic!==mic||!sym(v.target.symbol))continue;
   put(mic,"ACCESS_CHECK",v.recordedAt,{
     state:"ONE_PROVIDER_ACCESS_ONLY",researchObserved:false,
     symbol:v.target.symbol,
     reason:sym(v.quote.status)?v.quote.status:"UNKNOWN",
     advertisedPlan:["Basic","Grow","Pro","Ultra"].includes(v.catalogue?.requiredPlan)?
       v.catalogue.requiredPlan:null,proof:"TWELVE_DATA_CATALOGUE_UNLICENSED"});
  }
 }
 rows.sort((a,b)=>a.at.localeCompare(b.at)||a.mic.localeCompare(b.mic));
 const venues={};
 for(const [mic,region] of Object.entries(VENUES)){
  const mine=rows.filter(r=>r.mic===mic);
  const positive=mine.filter(r=>r.researchObserved);
  const days=new Set(positive.map(r=>r.lastBarDate||r.at.slice(0,10)));
  venues[mic]={region,latestState:mine.at(-1)?.state??"NO_OBSERVATION",
    latestAt:mine.at(-1)?.at??null,events:mine.length,researchDays:days.size,
    paperEligible:false,certifiedPaperFills:0,
    blockers:region==="north-america"?
      ["PAPER_DATA_RIGHTS_NOT_CERTIFIED","FORWARD_STRATEGY_NOT_VALIDATED"]:
      region==="europe"?
      ["EXACT_MIC_AND_LICENCE_NOT_CERTIFIED","TWO_REALTIME_QUOTES_MISSING"]:
      region==="asia-pacific"?
      ["VENUE_IDENTIFICATION","TWO_REALTIME_QUOTES_MISSING","JPY_EUR_REALTIME_FX_MISSING"]:
      ["NO_QUALIFIED_PILOT_FEED","PAPER_RIGHTS_NOT_CERTIFIED"]};
 }
 const regionResearchDays=Object.fromEntries(REGIONS.map(region=>[region,
   new Set(rows.filter(r=>r.region===region&&r.researchObserved)
     .map(r=>r.lastBarDate||r.at.slice(0,10))).size]));
 return {added,ledger:{...initial(),generatedAt:added?now.toISOString():old.generatedAt,
   observations:rows,venues,summary:{
     regions:REGIONS,venuesTracked:Object.keys(VENUES).length,
     researchDaysByRegion:regionResearchDays,
     venuesWithResearchEvidence:Object.values(venues).filter(v=>v.researchDays>0).length,
     totalEvents:rows.length,certifiedPaperFills:0,
     note:"US dual realtime diagnostics, EOD closed-bar research and single-provider access checks are different evidence types. None grants PAPER rights."}}};
}
