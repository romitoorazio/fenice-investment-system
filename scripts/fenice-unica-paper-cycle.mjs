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
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const isNumber=v=>Number.isFinite(Number(v));
const upper=v=>String(v||"").toUpperCase();
export function evaluatePaperCycle({committee,terminal,coverage,approval,b2Ledger,b2Days,
  v8Status,worldLedger,v8Approval,v8Days,v8Samples,v8Exits,nowIso}){
  const b2Replay=replayV7PhaseBLedger(b2Ledger);
  if(!b2Replay.valid)throw Error("ONE_GLOBAL_B2_AUDIT_INVALID_"+b2Replay.reason);
  let technicalAccounting=null;
  if(v8Approval&&v8Days&&v8Samples&&v8Exits){
    const a=replayV8Days(v8Days,v8Approval);
    const b=replayExecutionLabLedger(v8Samples);
    const c=replayShadowExits({ledger:v8Exits,samples:v8Samples,days:v8Days,approval:v8Approval});
    if(!a.valid||!b.valid||!c.valid)throw Error("ONE_GLOBAL_V8_SOURCE_REPLAY_FAILED");
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
  return {
    version:1,mode:"FENICE_UNICA_READ_ONLY_PAPER_CYCLE",
    sources:{committeeAt:committee.generatedAt,terminalAt:terminal.generatedAt,coverageAt:coverage.generatedAt,
      v8At:v8Status.generatedAt,worldAt:worldLedger.generatedAt},
    strategyPaper:{b2Attempts:(b2Ledger.attempts||[]).length,
      verifiedB2Days:(b2Days.days||[]).filter(x=>x.validatedForwardDay===true
        &&x.marketEvidenceValid===true&&x.liveTradingAllowed===false
        &&x.brokerConnectivityAllowed===false).length,
      legacyCampaignStatus:"ARCHIVED_DIAGNOSTICS_ONLY",
      attemptsIntegrityVerified:true,
      filledBuyProbes:b2Replay.fills,
      fillsCreditedToV8:0,
      candidateCount:candidates.length,preliminaryEligibleCount:candidates.filter(x=>x.preliminaryEligible).length,
      note:"Preliminary gates only: FX, market-open, budget, OMS and pinned baseline must still pass"},
    technicalPaper:{status:v8Status.status,validDays:v8Status.validDays,requiredValidDays:v8Status.requiredValidDays,
      technicalSamples:v8Status.validTechnicalSamples,requiredTechnicalSamples:v8Status.requiredTechnicalSamples,
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
    v8Exits:"paper-v8-shadow-exits.json"};
  const inputs=Object.fromEntries(await Promise.all(Object.entries(keys).map(async ([key,file])=>[key,await load(file)])));
  const report=evaluatePaperCycle(inputs);
  console.log(JSON.stringify(report,null,2));
  if(report.safeguards.liveTradingAllowed!==false||report.safeguards.brokerConnectivityAllowed!==false)
    process.exitCode=2;
}
