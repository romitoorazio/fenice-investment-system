/**
 * FENICE ONE GLOBAL — venue-based committee research coverage.
 *
 * An issuer's home country is NOT its execution venue: ASML (XNAS) and TSM
 * (XNYS) are US-listed instruments for this diagnostic. Every row remains
 * a research task, never an order, signal, licensed quote, or PAPER fill.
 */
import {assessPinnedIssuer2025Results} from "./one-global-fy2025-release-audit.mjs";
import {validateOfficial2026InterimFacts} from "./one-global-2026-interim-research.mjs";

const VENUE_REGION={
  XNAS:"north-america",XNYS:"north-america",ARCX:"north-america",
  XMIL:"europe",XETR:"europe",XPAR:"europe",XSWX:"europe",
  XTKS:"asia-pacific",XSHG:"asia-pacific",XNSE:"asia-pacific",
  XHKG:"asia-pacific",XASX:"oceania",
  BVMF:"latin-america-caribbean",XJSE:"middle-east-africa",
};
const REGIONS=["europe","asia-pacific","latin-america-caribbean","middle-east-africa","oceania","north-america"];
const US_VENUES=new Set(["XNAS","XNYS","ARCX"]);
const DAY=86400000;
const symbol=v=>typeof v==="string"&&/^[A-Z0-9][A-Z0-9._-]{0,23}$/.test(v);
const mic=v=>typeof v==="string"&&/^[A-Z0-9]{4}$/.test(v);
const currency=v=>typeof v==="string"&&/^[A-Z]{3}$/.test(v);
const time=v=>{
  if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v))return null;
  const n=Date.parse(v);
  return Number.isFinite(n)&&new Date(n).toISOString()===v?n:null;
};
const unique=x=>[...new Set(x)];
function evidenceFresh(raw,now,maxAge){
  const n=time(raw);
  return n!==null&&n<=now&&now-n<=maxAge;
}
const hasCommittee=decision=>decision!==null
  &&Number.isFinite(decision.committeeScore)
  &&typeof decision.decision==="string";
function chooseBalanced(rows,count){
  const allRegions=[...REGIONS,...unique(rows.map(x=>x.venueRegion).filter(x=>!REGIONS.includes(x)))];
  // Regional round robin prevents US and even European names from swallowing
  // the world queue. Within a region prefer issuer material already on file
  // that needs *reconciliation*, then the fewest unresolved research tasks.
  const buckets=allRegions.map(region=>rows.filter(row=>row.venueRegion===region).sort((a,b)=>
    Number(b.interimReleaseFollowUpDue)-Number(a.interimReleaseFollowUpDue)||
    Number(b.pinnedIssuerAnnualAndInterimResearchAvailable)-Number(a.pinnedIssuerAnnualAndInterimResearchAvailable)||
    a.researchTasks.length-b.researchTasks.length||a.key.localeCompare(b.key)));
  const result=[];
  while(result.length<count&&buckets.some(x=>x.length)){
    for(const bucket of buckets){
      if(bucket.length&&result.length<count)result.push(bucket.shift());
    }
  }
  return result;
}
export function auditOneGlobalCommitteeWorldCoverage({master,seeds,committee,terminal,
  fundamentals,eod,world,annualIssuerReleases=null,interimIssuerReleases=null,nowIso}){
  const now=time(nowIso);
  if(now===null)throw Error("WORLD_COMMITTEE_CLOCK_INVALID");
  if(!Array.isArray(master?.instruments)||!Array.isArray(seeds?.instruments)
    ||!Array.isArray(committee?.allDecisions)||!Array.isArray(terminal?.assets)
    ||!Array.isArray(fundamentals?.companies))
    throw Error("WORLD_COMMITTEE_INPUT_MISSING");
  if(world?.mode!=="WORLD_V7_FORWARD_DIAGNOSTIC"||
    world?.diagnosticOnly!==true||world?.paperEligible!==false||
    world?.certifiedPaperFills!==0||world?.liveTradingAllowed!==false||
    world?.brokerSubmissionAllowed!==false||!world?.venues||
    Object.values(world.venues).some(v=>v?.paperEligible!==false||v.certifiedPaperFills!==0))
    throw Error("WORLD_COMMITTEE_GLOBAL_LEDGER_UNSAFE");
  if(eod?.mode!=="WORLD_V7_EOD_RESEARCH_ONLY"||
    eod?.realtimePaperEligible!==false||eod?.liveTradingAllowed!==false||
    eod?.brokerConnectivityAllowed!==false)
    throw Error("WORLD_COMMITTEE_EOD_RIGHTS_UNSAFE");
  // Audited *source format/identity* only. Pinned issuer press releases
  // are NOT audited IFRS filings, an executable quote, or a DCF basis.
  // The pinned issuer schemas must not accept extra fields that *pretend*
  // to grant financial-statement, PAPER, broker, or LIVE authority. Even an
  // ignored extra flag could otherwise mislead downstream consumers.
  if(annualIssuerReleases||interimIssuerReleases){
    const annualKeys=new Set(["primaryIssuerReleaseOnly","pinnedValuesAreNotLiveFetch",
      "financialStatementAuditCompleted","equivalentAccountingMetricsAcrossIssuers",
      "committeeScoresModified","issuerFundamentalScoreEligible","dcfEligible",
      "paperExecutionAllowed","brokerConnectivityAllowed","liveTradingAllowed",
      "phase9Credit"]);
    const interimKeys=new Set(["sourceOnly","pinnedNotLive","noCrossPeriodValuation",
      "committeeScoresModified","issuerFundamentalScoreEligible","dcfEligible",
      "strategyPaperEligible","brokerConnectivityAllowed","liveTradingAllowed",
      "phase9Credit"]);
    const annualPolicy=annualIssuerReleases?.policy;
    const interimPolicy=interimIssuerReleases?.policy;
    const policyFieldsValid=(policy,allowed)=>policy&&typeof policy==="object"
      &&!Array.isArray(policy)&&Object.keys(policy).length===allowed.size
      &&Object.keys(policy).every(key=>allowed.has(key));
    if(!policyFieldsValid(annualPolicy,annualKeys)
      ||!policyFieldsValid(interimPolicy,interimKeys)
      ||annualPolicy.paperExecutionAllowed!==false
      ||annualPolicy.brokerConnectivityAllowed!==false
      ||annualPolicy.liveTradingAllowed!==false
      ||annualPolicy.financialStatementAuditCompleted!==false
      ||annualPolicy.dcfEligible!==false
      ||interimPolicy.strategyPaperEligible!==false
      ||interimPolicy.brokerConnectivityAllowed!==false
      ||interimPolicy.liveTradingAllowed!==false
      ||interimPolicy.dcfEligible!==false)
      throw Error("WORLD_COMMITTEE_ISSUER_RELEASE_RIGHTS_INVALID");
  }
  if(Boolean(annualIssuerReleases)!==Boolean(interimIssuerReleases))
    throw Error("WORLD_COMMITTEE_PRIMARY_RELEASE_PAIR_REQUIRED");
  const annual=annualIssuerReleases
    ?assessPinnedIssuer2025Results({data:annualIssuerReleases,nowIso}):null;
  const interim=interimIssuerReleases
    ?validateOfficial2026InterimFacts({data:interimIssuerReleases,
      fy2025:annualIssuerReleases,nowIso}):null;
  if(annual&&(annual.policy.issuerReleaseFactsOnly!==true||
    annual.policy.paperExecutionAllowed!==false||
    annual.policy.liveTradingAllowed!==false||
    interim.policy.researchOnly!==true||
    interim.policy.statementsIndependentlyAudited!==false||
    interim.policy.DCFEligible!==false||
    interim.policy.paperExecutionAllowed!==false||
    interim.policy.liveTradingAllowed!==false))
    throw Error("WORLD_COMMITTEE_ISSUER_RELEASE_RIGHTS_INVALID");
  const annualByKey=new Map(annual?.companies.map(row=>[row.key,row])||[]);
  const interimByKey=new Map(interim?.rows.map(row=>[row.key,row])||[]);
  const all=[...master.instruments,...seeds.instruments]
    .filter(x=>x?.status==="active"&&x?.assetClass==="equity"&&
      symbol(x.ticker)&&mic(x.exchangeMic)&&currency(x.currency));
  const freq=new Map();
  for(const x of all)freq.set(x.ticker,(freq.get(x.ticker)||0)+1);
  const exactKeys=new Set();
  const rows=[];
  for(const x of all){
    const key=x.exchangeMic+":"+x.ticker;
    if(exactKeys.has(key))throw Error("WORLD_COMMITTEE_DUPLICATE_LISTING");
    exactKeys.add(key);
    const venueRegion=VENUE_REGION[x.exchangeMic]||"unclassified";
    const venueNonUS=!US_VENUES.has(x.exchangeMic);
    const committeeMatches=freq.get(x.ticker)===1
      ?committee.allDecisions.filter(c=>c?.symbol===x.ticker):[];
    const committeeDecision=committeeMatches.length===1?committeeMatches[0]:null;
    const committeeAvailable=hasCommittee(committeeDecision)
      &&evidenceFresh(committee.generatedAt,now,36*3600000);
    const asset=terminal.assets.filter(t=>t?.symbol===x.ticker);
    const hasDailyTechnical=asset.length===1&&
      evidenceFresh(asset[0].technical?.observedAt,now,72*3600000)
      &&typeof asset[0].technical?.source==="string"&&asset[0].technical.source!=="";
    const filing=fundamentals.companies.filter(f=>f?.ticker===x.ticker);
    const hasPrimaryFinancials=filing.length===1&&filing[0].source==="SEC EDGAR Company Facts"
      &&evidenceFresh(filing[0].observedAt,now,90*DAY);
    const idCurrent=evidenceFresh(x.lastVerifiedAt,now,90*DAY)
      &&Array.isArray(x.identifiers)
      &&x.identifiers.some(i=>i?.type==="ticker"&&i?.value===x.ticker&&i.source);
    const eodCandidate=eod?.records?.[x.exchangeMic];
    const exactEod=eodCandidate?.ticker===x.ticker&&eodCandidate?.venue===x.exchangeMic
      ?eodCandidate:null;
    const certifiedDailyBar=exactEod?.providerSymbolConfirmed===true
      &&exactEod?.exactMicCertified===true
      &&typeof exactEod.lastCompleteBarDate==="string";
    const annualSource=annualByKey.get(key)??null;
    const interimSource=interimByKey.get(key)??null;
    // Both must agree on the exact issuer LEI in the independently validated
    // pinned research inputs. A symbol/name match alone is insufficient.
    if(Boolean(annualSource)!==Boolean(interimSource)||
      (annualSource&&annualSource.lei!==interimSource.lei))
      throw Error("WORLD_COMMITTEE_ISSUER_RELEASE_ENTITY_MISMATCH");
    const pinnedIssuerAnnualAndInterimResearchAvailable=!!annualSource&&!!interimSource;
    const interimReleaseFollowUpDue=interimSource?.refreshDue===true;
    const researchTasks=[];
    if(!idCurrent)researchTasks.push("VERIFY_EXACT_TICKER_MIC_ISIN_CURRENCY");
    if(!hasPrimaryFinancials)researchTasks.push(
      pinnedIssuerAnnualAndInterimResearchAvailable
        ?"RECONCILE_PINNED_ISSUER_RELEASES_TO_AUDITED_FINANCIAL_STATEMENTS"
        :"FIND_PRIMARY_ISSUER_FINANCIALS");
    if(interimReleaseFollowUpDue)researchTasks.push("REFRESH_OFFICIAL_ISSUER_INTERIM_RELEASE_AFTER_DUE_DATE");
    if(!hasDailyTechnical&&!certifiedDailyBar)
      researchTasks.push("VERIFY_DAILY_PRICE_SERIES_AND_SYMBOL");
    if(!committeeAvailable)researchTasks.push("BUILD_EXACT_LISTING_COMMITTEE_RESEARCH");
    // Missing execution rights are tracked separately, not used to suppress
    // an issuer whose Committee row already exists but lacks fundamentals.
    const executionTasks=["VERIFY_INDEPENDENT_REALTIME_QUOTE_RIGHTS",
      "VERIFY_EXACT_VENUE_OPEN_SESSION"];
    if(x.currency!=="EUR")executionTasks.push("VERIFY_EXECUTABLE_FX_TO_EUR");
    executionTasks.push("SEPARATE_FORWARD_STRATEGY_PAPER_APPROVAL");
    const tasks=[...researchTasks,...executionTasks];
    rows.push({
      key,symbol:x.ticker,venueMic:x.exchangeMic,venueRegion,
      issuerCountry:x.country||null,currency:x.currency,
      foreignIssuerUsListing:US_VENUES.has(x.exchangeMic)&&x.country!=="US",
      nonUSVenue:venueNonUS,sourceKind:seeds.instruments.includes(x)?"GLOBAL_SEED":"INSTRUMENT_MASTER",
      exactIdentityRecent:!!idCurrent,primaryFinancialsRecent:!!hasPrimaryFinancials,
      pinnedIssuerAnnualAndInterimResearchAvailable,
      interimReleaseFollowUpDue,
      issuerReleaseAccountingReconciledToAuditedFilings:false,
      issuerReleaseDCFEligible:false,
      dailyResearchRecent:!!hasDailyTechnical||!!certifiedDailyBar,
      eodResearchStatus:exactEod?.status??null,
      committeeResearchPresent:committeeAvailable,
      committeeDecision:committeeAvailable?committeeDecision.decision:null,
      committeeScore:committeeAvailable?committeeDecision.committeeScore:null,
      researchTasks,executionTasks,missingTasks:tasks,
      readiness:"RESEARCH_ONLY_NOT_EXECUTION_ELIGIBLE",
      paperEligible:false,certifiedStrategyTrades:0,brokerSubmissionAllowed:false,
      liveTradingAllowed:false,
    });
  }
  const nonUS=rows.filter(r=>r.nonUSVenue);
  const missingNonUS=nonUS.filter(r=>!r.committeeResearchPresent);
  // The previous queue included ONLY missing Committee rows. As a result an
  // already-covered foreign issuer lacking audited fundamentals disappeared
  // entirely from the research pipeline, often indefinitely.
  const actionableNonUS=nonUS.filter(r=>r.researchTasks.length>0);
  const currentCommitteeNames=unique(committee.allDecisions.filter(x=>symbol(x?.symbol)).map(x=>x.symbol));
  const counts=Object.fromEntries(REGIONS.map(region=>[region,{
    localVenueEquities:nonUS.filter(x=>x.venueRegion===region).length,
    inCommittee:nonUS.filter(x=>x.venueRegion===region&&x.committeeResearchPresent).length,
    excludedFromCommittee:missingNonUS.filter(x=>x.venueRegion===region).length,
  }]));
  const queue=chooseBalanced(actionableNonUS,12);
  return {
    version:1,mode:"ONE_GLOBAL_COMMITTEE_WORLD_COVERAGE_DIAGNOSTIC",
    generatedAt:nowIso,committeeAsOf:committee.generatedAt??null,
    sourceTimestamps:{master:master.generatedAt??null,terminal:terminal.generatedAt??null,
      eod:eod.generatedAt??null,globalLedger:world.generatedAt??null},
    summary:{
      listedEquities:rows.length,
      committeeResearchCandidates:currentCommitteeNames.length,
      nonUSVenueEquities:nonUS.length,
      nonUSVenueCommitteeCovered:nonUS.filter(r=>r.committeeResearchPresent).length,
      nonUSVenueExcludedFromCommittee:missingNonUS.length,
      nonUSVenueActionableResearchGaps:actionableNonUS.length,
      alreadyInCommitteeButStillNeedsResearch:actionableNonUS
        .filter(r=>r.committeeResearchPresent).length,
      issuerReleasePairOnFile:nonUS.filter(r=>r.pinnedIssuerAnnualAndInterimResearchAvailable).length,
      issuerReleaseFollowUpsDue:nonUS.filter(r=>r.interimReleaseFollowUpDue).length,
      foreignIssuerUSListings:rows.filter(r=>r.foreignIssuerUsListing).length,
      forwardStrategyPaperEligible:0,certifiedClosedStrategyTrades:0,
      regionalCounts:counts,
      meaning:"Issuer nationality does not prove domestic market coverage; no research-only row authorizes a trade.",
    },
    // Round-robin across world venue regions, not a ranking of projected returns.
    researchQueue:queue.map(r=>({
      key:r.key,region:r.venueRegion,currency:r.currency,
      committeeAlreadyPresent:r.committeeResearchPresent,
      pinnedOfficialIssuerReleasePair:r.pinnedIssuerAnnualAndInterimResearchAvailable,
      interimReleaseFollowUpDue:r.interimReleaseFollowUpDue,
      researchTasks:r.researchTasks,executionTasks:r.executionTasks,
      missingTasks:r.missingTasks,
      sourceFactsNotAuditedIFRS:true,committeeBuyEligibleFromThisEvidence:false,
      expectedProfit:null,tradeSignal:false,executionAuthorized:false,
    })),
    rows,safety:{
      researchOnly:true,liveTradingAllowed:false,brokerConnectivityAllowed:false,
      paperAuthorizationGranted:false,v8TechnicalProofCredited:false,
      historicalBackfill:false,marketPricesPublished:false,
    },
  };
}
