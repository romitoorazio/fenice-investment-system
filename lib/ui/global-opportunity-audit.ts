/**
 * FENICE100K — global opportunity EVIDENCE audit. Never generates an order,
 * price, expected return or certification. Every input is historical/static.
 */
export type Snapshot = {
  generatedAt?: string;
  allDecisions?: Array<{
    symbol?: string; name?: string; decision?: string; terminalDecision?: string;
    committeeScore?: number; riskScore?: number; confidence?: number; currency?: string;
    priceEvidence?: { observedAt?: string | null; executionEligible?: boolean };
    valuation?: { status?: string }; bullCase?: string[]; bearCase?: string[];
    reviewTriggers?: string[];
  }>;
};
type Instrument = {ticker?: string | null;status?:string;region?:string;exchangeMic?:string|null;currency?:string;assetClass?:string;lastVerifiedAt?:string|null};
type TechnicalAsset = {symbol?:string;technical?:{observedAt?:string;timestampSemantics?:string;source?:string}};
type RefRegion = {regionId?:string;targetCountries?:number;providerMatchedCountries?:number;instrumentCount?:number};
type RefCountry = {regionId?:string;providerCovered?:boolean;instrumentCount?:number;instrumentTypes?:Record<string,number|undefined>};
type Ref = { generatedAt?:string; regionCoverage?:RefRegion[]; countryCoverage?:RefCountry[]; safety?:{researchOnly?:boolean;paperExecutionAllowed?:boolean;liveTradingAllowed?:boolean;brokerConnectivityAllowed?:boolean;isolatedFromPaperV6InstrumentMaster?:boolean;changesPaperV6Fingerprint?:boolean}};
type Master = {generatedAt?:string;coverage?:string;instruments?:Instrument[]};
type Terminal = {generatedAt?:string;assets?:TechnicalAsset[]};
type Global = {regions?:Array<{id:string;name:string;countries?:string[]}>};
const venueRegion:Record<string,string> = {XNYS:"north-america",XNAS:"north-america",ARCX:"north-america",XTSE:"north-america",XMIL:"europe",XETR:"europe",XPAR:"europe",XLON:"europe",XTKS:"asia-pacific",XSHG:"asia-pacific",XHKG:"asia-pacific",XSES:"asia-pacific",XNSE:"asia-pacific",XASX:"asia-pacific",BVMF:"latin-america-caribbean",XJSE:"middle-east-africa"};
function time(value:unknown):number|null {
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))return null;
  const ms=Date.parse(value);
  return Number.isFinite(ms)&&new Date(ms).toISOString()===value?ms:null;
}
const ageHours=(value:unknown,now:number):number|null=>{
  const ms=time(value);const age=ms===null?NaN:(now-ms)/3600000;
  return Number.isFinite(age)&&age>=0?Math.round(age*10)/10:null;
};
const score=(x:unknown):x is number=>typeof x==="number"&&Number.isFinite(x)&&x>=0&&x<=100;
const symbol=(s:unknown):s is string=>typeof s==="string"&&/^[A-Z0-9][A-Z0-9._-]{0,19}$/.test(s);
const safeText=(x:unknown)=>typeof x==="string"?x.trim().slice(0,240):"";
const codeList=(xs:unknown)=>Array.isArray(xs)?xs.filter(x=>typeof x==="string").slice(0,3).map(safeText):[];
export function evaluateGlobalOpportunityAudit(
  committee:Snapshot, master:Master, terminal:Terminal, reference:Ref, universe:Global,
  now:number=Date.now()
){
  if(!Number.isFinite(now)||now<0)throw Error("INVALID_WORLD_AUDIT_CLOCK");
  const commAge=ageHours(committee.generatedAt,now);
  const masterAge=ageHours(master.generatedAt,now);
  const termAge=ageHours(terminal.generatedAt,now);
  const refAge=ageHours(reference.generatedAt,now);
  const committeeCurrent=commAge!==null&&commAge<=36;
  const referenceCurrent=refAge!==null&&refAge<=72;
  const sourceLocksValid=reference.safety?.researchOnly===true
    && reference.safety?.paperExecutionAllowed===false
    && reference.safety?.liveTradingAllowed===false
    && reference.safety?.brokerConnectivityAllowed===false
    && reference.safety?.isolatedFromPaperV6InstrumentMaster===true
    && reference.safety?.changesPaperV6Fingerprint===false;
  const regionMap=new Map((universe.regions??[]).map(x=>[x.id,x]));
  const regions=(reference.regionCoverage??[]).filter(x=>regionMap.has(x.regionId??"")).map(region=>{
    const definition=regionMap.get(region.regionId??"");
    const countries=(reference.countryCoverage??[]).filter(x=>x.regionId===region.regionId&&x.providerCovered===true);
    const total=countries.reduce((n,x)=>n+(x.instrumentCount??0),0);
    const internallyConsistent=sourceLocksValid
      && Number.isSafeInteger(region.providerMatchedCountries)&&region.providerMatchedCountries!>=0
      && region.providerMatchedCountries!<= (definition?.countries?.length??-1)
      && region.targetCountries===definition?.countries?.length
      && countries.length===region.providerMatchedCountries&&total===region.instrumentCount
      && countries.every(x=>Number.isSafeInteger(x.instrumentCount)&&x.instrumentCount!>=0
        && Number.isSafeInteger(x.instrumentTypes?.["Common Stock"]??0)
        && Number.isSafeInteger(x.instrumentTypes?.Warrant??0)
        && (x.instrumentTypes?.["Common Stock"]??0)>=0
        && (x.instrumentTypes?.Warrant??0)>=0);
    const stockCount=internallyConsistent?countries.reduce((n,x)=>n+(x.instrumentTypes?.["Common Stock"]??0),0):null;
    const warrantCount=internallyConsistent?countries.reduce((n,x)=>n+(x.instrumentTypes?.Warrant??0),0):null;
    return {
      id:region.regionId!,name:definition?.name??region.regionId!,
      coveredCountries:internallyConsistent?region.providerMatchedCountries!:null,
      targetCountries:definition?.countries?.length??0,
      ordinaryStockReferences:stockCount,warrantReferences:warrantCount,
      state:!internallyConsistent?"EVIDENCE_INVALID" as const:
        !referenceCurrent?"SOURCE_REFRESH_REQUIRED" as const:"REFERENCE_ONLY" as const,
      missingControls:["VENUE_CLOCK","INSTRUMENT_QUOTES","DATA_ENTITLEMENTS","FX_AND_COSTS","INDEPENDENT_VALIDATION"],
      orderAllowed:false as const,paperAllowed:false as const,
    };
  });
  const identities=new Map<string,Instrument[]>();
  for(const x of master.instruments??[]){
    if(!symbol(x.ticker)||x.status!=="active")continue;
    identities.set(x.ticker,[...(identities.get(x.ticker)??[]),x]);
  }
  const tech=new Map<string,TechnicalAsset[]>();
  for(const x of terminal.assets??[]) {
    if(!symbol(x.symbol))continue;
    tech.set(x.symbol,[...(tech.get(x.symbol)??[]),x]);
  }
  const seen=new Set<string>();
  const rows=[];
  for(const x of committee.allDecisions??[]) {
    if(!symbol(x.symbol)||seen.has(x.symbol))continue;
    seen.add(x.symbol);
    const instruments=identities.get(x.symbol)??[];
    const id=instruments.length===1?instruments[0]:null;
    const techRows=tech.get(x.symbol)??[];
    const asset=techRows.length===1?techRows[0]:null;
    const identityVerified=!!id&&id.status==="active"&&typeof id.exchangeMic==="string"
      && venueRegion[id.exchangeMic]!==undefined&&id.currency===x.currency;
    const scoreValid=score(x.committeeScore)&&score(x.riskScore)&&score(x.confidence);
    const priceAge=ageHours(x.priceEvidence?.observedAt,now);
    const technicalAge=ageHours(asset?.technical?.observedAt,now);
    const priceVerified=false as const; // Never promote persisted data to live quotes.
    const blocks:string[]=[];
    if(!committeeCurrent)blocks.push("COMMITTEE_OLDER_THAN_36H");
    if(!identityVerified)blocks.push("VENUE_OR_CURRENCY_IDENTITY_UNVERIFIED");
    if(!asset)blocks.push("TERMINAL_EVIDENCE_MISSING");
    if(!scoreValid)blocks.push("INVALID_SCORE_INPUTS");
    if(technicalAge===null||technicalAge>72)blocks.push("TECHNICAL_CANDLE_EXPIRED");
    if(!priceVerified||priceAge===null)blocks.push("NO_FRESH_EXECUTION_QUOTE");
    if(!referenceCurrent)blocks.push("WORLD_REFERENCE_CATALOGUE_OUTDATED");
    if(!sourceLocksValid)blocks.push("WORLD_REFERENCE_SAFETY_INVALID");
    if(x.decision==="EVITA")blocks.push("COMMITTEE_AVOID");
    const possibleResearchReview=committeeCurrent&&scoreValid&&identityVerified
      &&asset!==null&&x.decision!=="EVITA";
    rows.push({
      symbol:x.symbol,name:safeText(x.name)||x.symbol,
      issuerRegion:id?.region??null,venueMic:id?.exchangeMic??null,
      venueRegion:identityVerified?venueRegion[id!.exchangeMic!]:null,
      currency:identityVerified?id?.currency??null:null,
      assetClass:id?.assetClass??null,
      committeeDecision:safeText(x.decision)||"NON_VERIFICATO",
      technicalDecision:safeText(x.terminalDecision)||"NON_VERIFICATO",
      committeeScore:scoreValid?x.committeeScore!:null,
      confidence:scoreValid?x.confidence!:null,
      riskScore:scoreValid?x.riskScore!:null,
      priceEvidenceAgeHours:priceAge,
      technicalCandleAgeHours:technicalAge,
      identityVerified,possibleResearchReview,
      blocks,thesisPositive:codeList(x.bullCase)[0]??null,
      thesisNegative:codeList(x.bearCase)[0]??null,
      reviewTrigger:codeList(x.reviewTriggers)[0]??null,
      quoteVerifiedForExecution:false as const,
      futureReturnForecast:null,brokerOrderAllowed:false as const,
      paperExecutionAllowed:false as const,liveTradingAllowed:false as const,
    });
  }
  rows.sort((a,b)=>Number(b.possibleResearchReview)-Number(a.possibleResearchReview)
    || (b.committeeScore??-1)-(a.committeeScore??-1)
    || a.symbol.localeCompare(b.symbol));
  return {
    generatedAt:new Date(now).toISOString(),
    dataQuality:{
      committeeGeneratedAt:time(committee.generatedAt)===null?null:committee.generatedAt,
      committeeAgeHours:commAge,
      committeeCurrent,committeeScannedCount:rows.length,
      terminalAgeHours:termAge,masterAgeHours:masterAge,referenceAgeHours:refAge,
      referenceCurrent,sourceLocksValid,
    },
    summary:{
      rankedResearchReviews:rows.filter(r=>r.possibleResearchReview).length,
      reviewedInCommittee:rows.length,
      verifiedLiveQuotes:0,
      instrumentIdentitiesVerified:rows.filter(x=>x.identityVerified).length,
      globalListedSharesScoredByCommittee:0, // issuer-catalogue alone has no committee thesis
      tradeReady:0,
    },
    regions,rows,
    policy:{
      type:"COMMITTEE_RESEARCH_PRIORITY_NOT_WORLD_STOCK_RANKING" as const,
      scoreIsNotExpectedReturn:true as const,
      candleTimestampNotTrade:true as const,
      missingPriceNeverReplacedByReference:true as const,
      sourceCatalogDoesNotProveTrading:true as const,
      brokerOrdersAllowed:false as const,paperExecutionAllowed:false as const,
      liveTradingAllowed:false as const,
    },
  };
}
