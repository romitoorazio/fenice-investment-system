/**
 * FENICE UNICA — single read-only PAPER cycle scoreboard.
 * Does not stage orders, mutate ledgers, access secrets or connect to a broker.
 * A passing technical simulation is never counted as a V7 strategy fill.
 */
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";
import {replayV7PhaseBLedger} from "../lib/trading/paper-v7-phase-b-v6-parity.mjs";
import {replayV8Days} from "./run-v8-technical-evidence.mjs";
import {replayExecutionLabLedger} from "./run-paper-execution-lab.mjs";
import {replayShadowExits} from "./run-v8-shadow-exits.mjs";
import {reportV8VirtualPnL} from "./report-v8-virtual-pnl.mjs";
import {replayWorldForwardResearchLedger} from "../lib/trading/one-global-forward-research.mjs";
import {auditOneGlobalStrategyLedger} from "../lib/trading/one-global-strategy-ledger-audit.mjs";
import {assessOneGlobalStrategyAuthority} from "./run-one-global-strategy-paper.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const isNumber=v=>Number.isFinite(Number(v));
const upper=v=>String(v||"").toUpperCase();
const MINUTE=60000,DAY=86400000;
function isoTime(value){
  if(typeof value!=="string")return null;
  const ms=Date.parse(value);
  return Number.isFinite(ms)&&new Date(ms).toISOString()===value?ms:null;
}
const gap=(required,actual)=>Math.max(0,required-actual);
function freshEvidence(timestamp,nowMs,maxAgeMs){
  const at=isoTime(timestamp);
  return at!==null&&at<=nowMs&&nowMs-at<=maxAgeMs;
}
function validPaperApproval(authority,nowMs){
  const start=isoTime(authority?.effectiveFrom??authority?.approvedAt);
  const end=isoTime(authority?.expiresAt);
  return authority?.approved===true
    &&authority.liveTradingAllowed===false
    &&authority.brokerConnectivityAllowed===false
    &&start!==null&&end!==null&&start<=nowMs&&nowMs<end;
}
function checkB2DeclaredDays(days,approval,nowMs){
  const observed=new Set(),from=isoTime(approval?.effectiveFrom),until=isoTime(approval?.expiresAt);
  if(!Array.isArray(days?.days)||from===null||until===null||days.days.length>90)
    return {count:0,valid:false};
  let count=0;
  for(const row of days.days){
    const checked=isoTime(row?.checkedAt),date=String(row?.date||"");
    if(checked===null||checked>nowMs||checked<from||checked>=until
      ||date!==new Date(checked).toISOString().slice(0,10)||observed.has(date)
      ||row?.liveTradingAllowed!==false||row?.brokerConnectivityAllowed!==false
      ||row?.fingerprintPinned!==true
      ||!Number.isSafeInteger(row?.fillCount)||row.fillCount<0)
      return {count:0,valid:false};
    observed.add(date);
    if(row.validatedForwardDay===true&&row.marketEvidenceValid===true)count++;
  }
  return {count,valid:true};
}
export function evaluatePaperCycle({committee,terminal,coverage,approval,b2Ledger,b2Days,
  v8Status,worldLedger,v8Approval,v8Days,v8Samples,v8Exits,legacyRetirement,
  forwardResearchLedger,strategyLedger,globalSourceHealth,strategyAuthority=null,nowIso}){
  const inspectedAt=nowIso??new Date().toISOString();
  const nowMs=isoTime(inspectedAt);
  if(nowMs===null)throw Error("ONE_GLOBAL_CERTIFICATION_CLOCK_INVALID");
  // A still-unexpired historical approval is not an active writer.
  // ONE GLOBAL deliberately retired B2; never project its dates/fills
  // forward or represent it as an autonomous active PAPER campaign.
  const retirementValid=legacyRetirement?.version===1
    &&legacyRetirement.mode==="ONE_GLOBAL_LEGACY_RETIREMENT_READ_ONLY"
    &&legacyRetirement.stopAutomaticLegacyWriters===true
    &&legacyRetirement.retainsHistory===true
    &&legacyRetirement.previousApprovedProofsUnchanged===true
    &&legacyRetirement.activeTechnicalPaper==="V8_TECHNICAL_ONLY"
    &&Array.isArray(legacyRetirement.retiredCampaigns)
    &&["V6","V7_PHASE_B","V7_B2"].every(x=>legacyRetirement.retiredCampaigns.includes(x))
    &&legacyRetirement.enableLiveTrading===false
    &&legacyRetirement.brokerConnectivityAllowed===false
    &&legacyRetirement.liveTradingAllowed===false
    &&legacyRetirement.authorizePaidServices===false
    &&Number.isFinite(Date.parse(String(legacyRetirement.authorizedOn)+"T00:00:00Z"))
    &&Date.parse(String(legacyRetirement.authorizedOn)+"T00:00:00Z")<=nowMs;
  if(legacyRetirement!==undefined&&!retirementValid)
    throw Error("ONE_GLOBAL_LEGACY_RETIREMENT_SAFETY_INVALID");
  const coverageFresh=freshEvidence(coverage?.generatedAt,nowMs,30*MINUTE);
  const committeeFresh=freshEvidence(committee?.generatedAt,nowMs,24*60*MINUTE);
  const b2ApprovalCurrent=validPaperApproval(approval,nowMs);
  const b2Replay=replayV7PhaseBLedger(b2Ledger);
  if(!b2Replay.valid)throw Error("ONE_GLOBAL_B2_AUDIT_INVALID_"+b2Replay.reason);
  let technicalAccounting=null;
  let v8Replayed=null;
  if(v8Approval&&v8Days&&v8Samples&&v8Exits){
    const a=replayV8Days(v8Days,v8Approval);
    const b=replayExecutionLabLedger(v8Samples);
    const c=replayShadowExits({ledger:v8Exits,samples:v8Samples,days:v8Days,approval:v8Approval});
    if(!a.valid||!b.valid||!c.valid)throw Error("ONE_GLOBAL_V8_SOURCE_REPLAY_FAILED");
    if(v8Days.records.some(x=>isoTime(x.observedAt)>nowMs)
      ||v8Samples.events.some(x=>isoTime(x.occurredAt)>nowMs))
      throw Error("ONE_GLOBAL_V8_FUTURE_EVIDENCE_REJECTED");
    v8Replayed={days:a.validDays,samples:b.simulatedExecutions};
    technicalAccounting=reportV8VirtualPnL({
      approval:v8Approval,samples:v8Samples,days:v8Days,exits:v8Exits,
      nowIso:nowIso||new Date().toISOString(),
    });
  }
  const decisions=new Map((committee.topDecisions||[]).map(x=>[upper(x.symbol),x]));
  const assets=new Map((terminal.assets||[]).map(x=>[upper(x.symbol),x]));
  const permitted=approval.permittedDecisionStates||["ACCUMULA","MANTIENI","OSSERVA"];
  const currencies=approval.permittedCurrencies||["EUR","USD"];
  const minScore=Number(approval.minCommitteeScore??70);
  const minConfidence=Number(approval.minValidationDataConfidence??approval.minConfidence??90);
  const maxRisk=Number(approval.maxRiskScore??75);
  const candidates=(coverage.rows||[]).map(row=>{
    const symbol=upper(row.symbol),decision=decisions.get(symbol),asset=assets.get(symbol);
    const reasons=[];
    if(!coverageFresh)reasons.push("QUOTE_SNAPSHOT_STALE_FOR_PAPER");
    if(!committeeFresh)reasons.push("COMMITTEE_SNAPSHOT_STALE_FOR_PAPER");
    if(!b2ApprovalCurrent)reasons.push("B2_PAPER_APPROVAL_MISSING_OR_EXPIRED");
    if(row.paperEligible!==true||!["GREEN","CAUTION"].includes(upper(row.state))||
      Number(row.independentSourceFamilies||0)<2||!(Number(row.medianPrice)>0))
      reasons.push("INDEPENDENT_QUOTES_NOT_ELIGIBLE");
    if(!decision)reasons.push("NOT_IN_COMMITTEE_TOP_DECISIONS");
    if(!asset)reasons.push("TERMINAL_ASSET_MISSING");
    if(decision){
      if(!permitted.includes(upper(decision.decision)))reasons.push("COMMITTEE_DECISION_BLOCK");
      if(!isNumber(decision.committeeScore)||Number(decision.committeeScore)<minScore)
        reasons.push("COMMITTEE_SCORE_BELOW_MIN");
    }
    if(asset&&["ATTENDI","EVITA"].includes(upper(asset.decision)))
      reasons.push("TERMINAL_DECISION_BLOCK");
    if(decision&&asset){
      const confidence=Math.min(Number(decision.rawConfidenceBeforeCalibration??decision.confidence??0),Number(asset.confidence||0));
      if(confidence<minConfidence)reasons.push("VALIDATION_DATA_CONFIDENCE_LOW");
      if(Math.max(Number(decision.riskScore??100),Number(asset.riskScore??100))>maxRisk)
        reasons.push("RISK_SCORE_HIGH");
      if(!currencies.includes(upper(decision.currency||asset.currency)))
        reasons.push("CURRENCY_NOT_APPROVED");
    }
    return {symbol,committeeScore:decision?.committeeScore??null,committeeDecision:decision?.decision??null,
      quoteEligible:row.paperEligible===true,reasons,preliminaryEligible:reasons.length===0};
  }).sort((a,b)=>Number(b.quoteEligible)-Number(a.quoteEligible)||
    Number(b.committeeScore??-1)-Number(a.committeeScore??-1));
  const blockers={};
  for(const c of candidates)for(const reason of c.reasons)blockers[reason]=(blockers[reason]||0)+1;
  const venues=Object.entries(worldLedger.venues||{}).map(([mic,v])=>({
    mic,region:v.region,paperEligible:v.paperEligible===true,blockers:v.blockers||[]
  }));
  const v8Start=isoTime(v8Approval?.effectiveFrom);
  const v8ApprovalCurrent=validPaperApproval(v8Approval,nowMs)
    &&v8Approval?.mode==="PAPER_TECHNICAL_V8"
    &&v8Approval.prospectiveOnly===true&&v8Approval.allowBackfill===false
    &&v8Approval.minCalendarDays===30&&v8Approval.minEvidenceDays===25
    &&v8Approval.minTechnicalSamples===10
    &&v8Approval.creditTowardV6===false&&v8Approval.creditTowardB2===false;
  const v8TrustedDays=v8Replayed?.days??0;
  const v8TrustedSamples=v8Replayed?.samples??0;
  const v8ElapsedCalendarDays=v8Start===null?0:Math.max(0,Math.floor((nowMs-v8Start)/DAY));
  const elapsedMinimumsMet=v8Replayed!==null
    &&v8ElapsedCalendarDays>=Number(v8Approval?.minCalendarDays??30)
    &&v8TrustedDays>=Number(v8Approval?.minEvidenceDays??25)
    &&v8TrustedSamples>=Number(v8Approval?.minTechnicalSamples??10);
  const statusCountersConsistent=v8Replayed!==null
    &&v8Status?.campaignId===v8Approval?.campaignId
    &&v8Status?.validDays===v8TrustedDays
    &&v8Status?.validTechnicalSamples===v8TrustedSamples
    &&v8Status?.requiredValidDays===v8Approval?.minEvidenceDays
    &&v8Status?.requiredTechnicalSamples===v8Approval?.minTechnicalSamples
    &&v8Status?.requiredCalendarDays===v8Approval?.minCalendarDays
    &&v8Status?.countsTowardB2===false&&v8Status?.countsTowardV6===false
    &&v8Status?.automaticallyLiveReady===false
    &&v8Status?.investmentSignalQualityCertified===false
    &&v8Status?.liveTradingAllowed===false
    &&v8Status?.brokerConnectivityAllowed===false
    &&(v8Status?.readyForTechnicalReview!==true||elapsedMinimumsMet)
    &&(v8Status?.status!=="READY_FOR_INDEPENDENT_TECHNICAL_REVIEW"||elapsedMinimumsMet);
  const v8TechnicalReviewEligible=v8ApprovalCurrent&&statusCountersConsistent
    &&elapsedMinimumsMet;
  // Replay every existing, independent evidence chain before reporting its
  // stage as healthy. Green research sources are NOT executable PAPER rights.
  const forwardResearch=forwardResearchLedger
    ?replayWorldForwardResearchLedger(forwardResearchLedger):null;
  const strategy=auditOneGlobalStrategyLedger({ledger:strategyLedger,nowIso:inspectedAt});
  if(strategyLedger!==undefined&&!strategy.valid)
    throw Error("ONE_GLOBAL_STRATEGY_LEDGER_CHAIN_INVALID_"+strategy.reason);
  const buyDecisions=(committee?.allDecisions||[]).filter(x=>x?.decision==="COMPRA");
  if(!Array.isArray(committee?.allDecisions)||!Number.isSafeInteger(committee?.buyCandidateCount)
    ||buyDecisions.length!==committee.buyCandidateCount)
    throw Error("ONE_GLOBAL_COMMITTEE_BUY_COUNT_INCONSISTENT");
  const sourceResearchFresh=freshEvidence(globalSourceHealth?.generatedAt,nowMs,DAY);
  const sourceResearchGreen=sourceResearchFresh&&globalSourceHealth?.gate==="GREEN";
  const strategicApproval=assessOneGlobalStrategyAuthority(strategyAuthority,inspectedAt);
  const worldStrategyReady=Object.values(worldLedger.venues||{})
    .filter(v=>v?.paperEligible===true).length;
  const forwardLatest=forwardResearchLedger?.events?.at(-1)?.recordedAt??null;
  const b2DayAudit=checkB2DeclaredDays(b2Days,approval,nowMs);
  const trustedB2Days=b2DayAudit.count;
  const b2Start=isoTime(approval?.effectiveFrom);
  const b2ElapsedCalendarDays=b2Start===null?0:Math.max(0,Math.floor((nowMs-b2Start)/DAY));
  const archivedB2Warnings=[
    ...(!b2ApprovalCurrent?["B2_ARCHIVE_APPROVAL_EXPIRED_OR_UNSAFE"]:[]),
    ...(retirementValid?["B2_AUTOMATIC_WRITER_RETIRED_AND_HISTORY_ONLY"]
      :["B2_RETIREMENT_NOT_VERIFIED"]),
    ...(!b2DayAudit.valid?["B2_ARCHIVE_DAY_EVIDENCE_INVALID"]:[]),
    ...(b2Replay.fills<Number(approval?.targetPaperFills??10)
      ?["B2_ARCHIVE_FILLS_BELOW_HISTORICAL_TARGET"]:[]),
    ...(trustedB2Days<Number(approval?.minEvidenceDays??25)
      ?["B2_ARCHIVE_DAYS_BELOW_HISTORICAL_TARGET"]:[]),
    ...(b2ElapsedCalendarDays<Number(approval?.minCalendarDays??30)
      ?["B2_ARCHIVE_CALENDAR_WINDOW_NOT_MATURE"]:[]),
  ];
  // Active chain requirements are exclusively the existing V8 technical
  // campaign and independently authorized ONE GLOBAL strategy. Never
  // re-activate retired B2 or give its missing history a new certification role.
  const certificationBlockers=[
    ...(!sourceResearchGreen?["GLOBAL_RESEARCH_SOURCE_GATE_NOT_VERIFIED"]:[]),
    ...(!forwardResearch?["WORLD_FORWARD_RESEARCH_HASH_CHAIN_NOT_PRESENT"]:[]),
    ...(!coverageFresh?["PAPER_QUOTES_NOT_FRESH_IN_COMMITTED_SNAPSHOT"]:[]),
    ...(!committeeFresh?["COMMITTEE_SNAPSHOT_TOO_OLD"]:[]),
    ...(!(Number(committee?.buyCandidateCount)>0)?["COMMITTEE_NO_COMPRA_SIGNAL"]:[]),
    ...(committee?.executionGate!=="PRONTO_CON_CONFERMA"
      ?["COMMITTEE_EXECUTION_GATE_NOT_READY"]:[]),
    ...(!retirementValid?["LEGACY_RETIREMENT_POLICY_NOT_VERIFIED"]:[]),
    ...(!strategicApproval?["ONE_GLOBAL_STRATEGY_APPROVAL_MISSING"]:[]),
    ...(worldStrategyReady===0?["WORLD_STRATEGY_EXECUTABLE_VENUES_0"]:[]),
    ...(!strategy.journalPresent?["ONE_GLOBAL_STRATEGY_LEDGER_NOT_PRESENT"]:[]),
    ...(strategy.closedVirtualRoundTrips===0?["ONE_GLOBAL_CLOSED_STRATEGY_TRADES_0"]:[]),
    ...(!strategy.hasIndependentlyAuthenticatedExecutionReceipts
      ?["INDEPENDENT_STRATEGY_EXECUTION_RECEIPTS_MISSING"]:[]),
    ...(!v8ApprovalCurrent?["V8_TECHNICAL_APPROVAL_EXPIRED_OR_UNSAFE"]:[]),
    ...(!statusCountersConsistent?["V8_CACHED_STATUS_DISAGREES_WITH_SIGNED_EVIDENCE"]:[]),
    ...(v8TrustedDays<Number(v8Approval?.minEvidenceDays??25)
      ?["V8_SIGNED_VALID_DAYS_INSUFFICIENT"]:[]),
    ...(v8TrustedSamples<Number(v8Approval?.minTechnicalSamples??10)
      ?["V8_PROSPECTIVE_SAMPLES_INSUFFICIENT"]:[]),
    ...(v8ElapsedCalendarDays<Number(v8Approval?.minCalendarDays??30)
      ?["V8_MINIMUM_CALENDAR_TIME_NOT_ELAPSED"]:[]),
    "STRATEGY_PHASE9_INDEPENDENT_CLOSED_TRADES_UNCERTIFIED",
  ];
  return {
    version:1,mode:"FENICE_UNICA_READ_ONLY_PAPER_CYCLE",
    sources:{committeeAt:committee.generatedAt,terminalAt:terminal.generatedAt,coverageAt:coverage.generatedAt,
      v8At:v8Status.generatedAt,worldAt:worldLedger.generatedAt},
    strategyPaper:{b2Attempts:(b2Ledger.attempts||[]).length,
      verifiedB2Days:trustedB2Days,
      legacyCampaignStatus:"ARCHIVED_DIAGNOSTICS_ONLY",
      b2ForwardWriterRetired:retirementValid,
      b2ArchivedNotAutoCollecting:retirementValid,
      attemptsIntegrityVerified:true,
      filledBuyProbes:b2Replay.fills,
      fillsCreditedToV8:0,
      candidateCount:candidates.length,preliminaryEligibleCount:candidates.filter(x=>x.preliminaryEligible).length,
      note:"Preliminary gates only: FX, market-open, budget, OMS and pinned baseline must still pass"},
    technicalPaper:{status:v8TechnicalReviewEligible?"READY_FOR_INDEPENDENT_TECHNICAL_REVIEW"
      :!statusCountersConsistent?"UNVERIFIED_STATUS"
      :v8Status.status==="BLOCKED"?"BLOCKED":"COLLECTING",
      cachedStatus:v8Status.status,
      cachedStatusCountersVerified:statusCountersConsistent,
      approvalCurrent:v8ApprovalCurrent,
      validDays:v8TrustedDays,requiredValidDays:v8Approval?.minEvidenceDays??25,
      technicalSamples:v8TrustedSamples,requiredTechnicalSamples:v8Approval?.minTechnicalSamples??10,
      countsTowardB2:false,
      technicalExitCount:technicalAccounting?.closedTechnicalRoundtrips??0,
      realizedNetEuro:technicalAccounting?.realizedNetEuro??null,
      unrealizedAsOfEuro:technicalAccounting?.unrealizedNetEuro??null,
      unrealizedMarksCurrent:technicalAccounting?.allMarksCurrent??false,
      technicalSampleEntries:technicalAccounting?.sampleBuys??0,
      sourceHistoryReplayVerified:technicalAccounting!==null,
      investmentStrategyProfitsCertified:false,
      accountScope:"EXPERIMENTAL_TECHNICAL_ONLY"},
    world:{venues,eligibleVenues:venues.filter(x=>x.paperEligible).length,
      certifiedWorldPaperFills:worldLedger.summary?.certifiedPaperFills??0},
    candidates,blockers,
    chainOfEvidence:{
      sourceResearch:{asOf:globalSourceHealth?.generatedAt??null,
        reportedGate:globalSourceHealth?.gate??"UNKNOWN",
        freshWithin24Hours:sourceResearchFresh,
        researchGateGreen:sourceResearchGreen,executableRightsEstablished:false},
      worldwideRadar:{asOf:terminal.generatedAt,assetCount:(terminal.assets||[]).length,
        researchOnly:true},
      forwardResearch:{asOf:forwardLatest,hashChainVerified:forwardResearch?.valid===true,
        barObservations:forwardResearch?.observations??0,
        researchSetups:forwardResearch?.setups??0,
        paperExecutionEligible:false,phase9Credit:0},
      committee:{asOf:committee.generatedAt,sourceGate:committee.sourceGate,
        executionGate:committee.executionGate,reportedBuyCount:committee.buyCandidateCount,
        recalculatedBuyCount:buyDecisions.length,freshWithin24Hours:committeeFresh,
        dataQuality:committee.dataQuality??null},
      executableQuotes:{lastCommittedAt:coverage.generatedAt,
        snapshotFreshForPaper:coverageFresh,
        // Historic eligibility is never a live order quote entitlement.
        lastSnapshotEligibleSymbols:coverage.paperEligibleSymbols??null,
        currentWorldStrategyEntitlementsVerified:false},
      worldStrategyVenue:{
        tracked:Object.keys(worldLedger.venues||{}).length,
        independentlyEligible:worldStrategyReady,
        globalResearchIsNotPaperPermission:true},
      prospectiveStrategyPaper:{
        approvedWithSeparateProspectiveOwnerAuthority:strategicApproval,
        journalStatus:strategy.status,ledgerHash:strategy.lastLedgerHash??null,
        virtualBuys:strategy.virtualBuys,virtualSells:strategy.virtualSells,
        closedVirtualRoundTrips:strategy.closedVirtualRoundTrips,
        realizedNetEuro:strategy.realizedNetEuro,
        certifiedForwardTrades:strategy.forwardStrategyCertificationCredit,
        independentlyAuthenticatedReceipts:strategy.hasIndependentlyAuthenticatedExecutionReceipts},
      v8EngineeringSeparate:{signedValidDays:v8TrustedDays,
        signedVirtualSamples:v8TrustedSamples,
        closedTechnicalExits:technicalAccounting?.closedTechnicalRoundtrips??0,
        scope:"TECHNICAL_ONLY",strategyCredit:0},
      phase9:{certifiedClosedTrades:0,certificationGranted:false,
        directBrokerOrdersAllowed:false},
      retiredB2:{archived:retirementValid,readOnly:true,
        historicalWarnings:archivedB2Warnings,
        historicBuyProbes:b2Replay.fills},
    },
    certification:{
      ready:false,scope:"PROSPECTIVE_STRATEGY_PAPER_CERTIFICATION_NOT_YET_MET",
      evaluatedAt:inspectedAt,
      // Source snapshots committed to GitHub are not live session proof.
      // A real PAPER run may obtain fresher in-memory provider evidence,
      // but these older files can NEVER create an eligible candidate.
      savedQuoteCoverageFresh:coverageFresh,
      savedCommitteeFresh:committeeFresh,
      b2ApprovalCurrent,
      b2WriterRetired:retirementValid,
      b2ActiveAutoCollection:false,
      b2ApprovalDoesNotReactivateRetiredWriter:true,
      b2DailyRecordsBasicIntegrityValid:b2DayAudit.valid,
      b2ProspectiveDays:trustedB2Days,
      b2RequiredProspectiveDays:Number(approval?.minEvidenceDays??25),
      b2RemainingProspectiveDays:gap(Number(approval?.minEvidenceDays??25),trustedB2Days),
      b2ElapsedCalendarDays,
      b2RequiredCalendarDays:Number(approval?.minCalendarDays??30),
      b2RemainingCalendarDays:gap(Number(approval?.minCalendarDays??30),b2ElapsedCalendarDays),
      b2DaysOnlyHaveReportedValidationFlags:true,
      b2DaySourceCryptographicallySigned:false,
      b2ConfirmedStrategyFills:b2Replay.fills,
      b2RequiredStrategyFills:Number(approval?.targetPaperFills??10),
      b2RemainingStrategyFills:gap(Number(approval?.targetPaperFills??10),b2Replay.fills),
      v8ApprovalCurrent,verifiedTechnicalDays:v8TrustedDays,
      requiredTechnicalDays:Number(v8Approval?.minEvidenceDays??25),
      remainingTechnicalDays:gap(Number(v8Approval?.minEvidenceDays??25),v8TrustedDays),
      verifiedTechnicalSamples:v8TrustedSamples,
      requiredTechnicalSamples:Number(v8Approval?.minTechnicalSamples??10),
      remainingTechnicalSamples:gap(Number(v8Approval?.minTechnicalSamples??10),v8TrustedSamples),
      verifiedCalendarDaysElapsed:v8ElapsedCalendarDays,
      requiredCalendarDays:Number(v8Approval?.minCalendarDays??30),
      remainingCalendarDays:gap(Number(v8Approval?.minCalendarDays??30),v8ElapsedCalendarDays),
      cachedStatusMatchesCryptographicReplay:statusCountersConsistent,
      eligibleForIndependentV8TechnicalReview:v8TechnicalReviewEligible,
      committeeBuySignals:Number(committee?.buyCandidateCount??0),
      phase9CertifiedClosedStrategyTrades:0,
      doesNotCreditTechnicalV8AsStrategy:true,
      archivedLegacyFillsCredited:0,
      noPaperOrdersAuthorizedByReport:true,
      liveTradingAllowed:false,brokerConnectivityAllowed:false,
      blockers:certificationBlockers,
      retiredLegacyDiagnostics:archivedB2Warnings,
    },
    operations:{
      activePaperEngine:"V8_TECHNICAL_PAPER",
      nextGoal:"CLOSED_FORWARD_STRATEGY_PAPER_PROOF",
      realOrdersEnabled:false,
      phase9CertifiedStrategyRoundtrips:0,
      quoteCoverageAsOf:coverage.generatedAt,
      globalMarketsEligibleForExecutablePaper:venues.filter(x=>x.paperEligible).length,
      archivedEnginesDoNotWriteViaThisReport:true,
    },
    safeguards:{readOnly:true,liveTradingAllowed:false,brokerConnectivityAllowed:false,
      modifiesCampaigns:false,creditsTechnicalSamplesAsStrategyFills:false,
      technicalExitsCreditedAsPhase9Trades:false,
      historicalPaperEvidencePreserved:true}
  };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const load=async name=>JSON.parse(await readFile(resolve(root,"data",name),"utf8"));
  const keys={committee:"investment-committee.json",terminal:"terminal-intelligence.json",
    coverage:"execution-market-coverage.json",approval:"paper-v7-b2-approval.json",
    b2Ledger:"paper-v7-b2-forward-ledger.json",b2Days:"paper-v7-b2-forward-days.json",
    v8Status:"paper-v8-technical-status.json",worldLedger:"world-v7-validation-ledger.json",
    v8Approval:"paper-v8-technical-approval.json",
    v8Days:"paper-v8-technical-days.json",
    v8Samples:"paper-v8-technical-samples.json",
    v8Exits:"paper-v8-shadow-exits.json",
    legacyRetirement:"one-global-legacy-retirement.json",
    forwardResearchLedger:"one-global-forward-research-ledger.json",
    strategyLedger:"one-global-strategy-paper-ledger.json",
    globalSourceHealth:"global-source-health.json"};
  const inputs=Object.fromEntries(await Promise.all(Object.entries(keys).map(async ([key,file])=>[key,await load(file)])));
  const report=evaluatePaperCycle(inputs);
  console.log(JSON.stringify(report,null,2));
  if(report.safeguards.liveTradingAllowed!==false||report.safeguards.brokerConnectivityAllowed!==false)
    process.exitCode=2;
}
