/** Independent, read-only diagnosis of strategy PAPER blockers. No network, secrets, or orders. */
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const root=new URL("../data/",import.meta.url);
const load=(name)=>JSON.parse(readFileSync(new URL(name,root),"utf8"));
export function diagnose({committee,coverage,terminal,approval,days,ledger},now=new Date().toISOString()){
 const nowMs=Date.parse(now),ageMinutes=t=>Number.isFinite(Date.parse(t))?(nowMs-Date.parse(t))/60000:Infinity;
 const decisions=new Map((committee.topDecisions||[]).map(d=>[d.symbol,d]));
 const assets=new Map((terminal.assets||[]).map(d=>[d.symbol,d]));
 const validScore=value=>value!==null&&value!==undefined&&String(value).trim()!==""&&Number.isFinite(Number(value));
 const rows=(coverage.rows||[]).map(q=>{
  const d=decisions.get(q.symbol),a=assets.get(q.symbol),reasons=[];
  if(!q.paperEligible||Number(q.independentSourceFamilies)<2)reasons.push("NO_INDEPENDENT_QUOTE_QUORUM");
  if(!d)reasons.push("NOT_IN_COMMITTEE");
  else {
   if(!validScore(d.committeeScore))reasons.push("MISSING_COMMITTEE_SCORE");
   else if(Number(d.committeeScore)<Number(approval.minCommitteeScore??70))reasons.push("SCORE_BELOW_APPROVED_MINIMUM");
   if(!(approval.permittedDecisionStates||[]).includes(d.decision))reasons.push("DECISION_NOT_PERMITTED");
  }
  if(!a)reasons.push("NOT_IN_TERMINAL");
  else if(["ATTENDI","EVITA"].includes(a.decision))reasons.push("TERMINAL_DECISION_BLOCK");
  return {symbol:q.symbol,quoteFamilies:Number(q.independentSourceFamilies||0),quoteEligible:q.paperEligible===true&&Number(q.independentSourceFamilies)>=2,committeeScore:d?.committeeScore??null,committeeDecision:d?.decision??null,blockers:reasons};
 });
 const coverageSymbols=new Set((coverage.rows||[]).map(q=>q.symbol));
 const committeeSymbols=new Set((committee.topDecisions||[]).map(d=>d.symbol));
 const missingFromCommittee=[...coverageSymbols].filter(symbol=>!committeeSymbols.has(symbol));
 const missingFromCoverage=[...committeeSymbols].filter(symbol=>!coverageSymbols.has(symbol));
 const quoteReadyButMissingCommittee=rows.filter(row=>row.quoteEligible&&!committeeSymbols.has(row.symbol)).map(row=>row.symbol);
 const quoteReadyButDecisionBlocked=rows.filter(row=>row.quoteEligible&&committeeSymbols.has(row.symbol)&&row.blockers.some(reason=>["SCORE_BELOW_APPROVED_MINIMUM","DECISION_NOT_PERMITTED","TERMINAL_DECISION_BLOCK"].includes(reason))).map(row=>({symbol:row.symbol,committeeScore:row.committeeScore,committeeDecision:row.committeeDecision,blockers:row.blockers.filter(reason=>reason!=="NO_INDEPENDENT_QUOTE_QUORUM")}));
 const reasons={};for(const row of rows)for(const b of row.blockers)reasons[b]=(reasons[b]||0)+1;
 const latest=days.days?.at(-1)||null;
 const decisionBlockers=(committee.topDecisions||[]).map(d=>({
  symbol:d.symbol,
  decision:d.decision??null,
  score:validScore(d.committeeScore)?Number(d.committeeScore):null,
  minScore:Number(approval.minCommitteeScore??70),
  scoreGap:validScore(d.committeeScore)?Math.max(0,Number(approval.minCommitteeScore??70)-Number(d.committeeScore)):null,
  reasons:[
   ...(!validScore(d.committeeScore)?["MISSING_COMMITTEE_SCORE"]:Number(d.committeeScore)<Number(approval.minCommitteeScore??70)?["SCORE_BELOW_APPROVED_MINIMUM"]:[]),
   ...(!(approval.permittedDecisionStates||[]).includes(d.decision)?["DECISION_NOT_PERMITTED"]:[])
  ]
 })).filter(d=>d.reasons.length>0).sort((a,b)=>(a.scoreGap??Infinity)-(b.scoreGap??Infinity));
 const researchGapCounts={};
 const researchGapsBySymbol=(committee.topDecisions||[]).map(d=>{
  const gaps=Array.isArray(d.buyGapEvidence?.gaps)?d.buyGapEvidence.gaps:[];
  for(const gap of gaps){const code=String(gap?.code||"UNKNOWN");researchGapCounts[code]=(researchGapCounts[code]||0)+1;}
  return {symbol:d.symbol,scope:d.buyGapEvidence?.scope||null,status:d.buyGapEvidence?.status||null,gaps:gaps.map(g=>({code:g.code,actual:g.actual??null,requiredMin:g.requiredMin??null,requiredMax:g.requiredMax??null,required:g.required??null}))};
 }).filter(d=>d.gaps.length>0);
 const quoteCauses={};
 for(const q of coverage.rows||[]){
  if(q.paperEligible===true&&Number(q.independentSourceFamilies)>=2)continue;
  const cause=Number(q.independentSourceFamilies||0)<2?"INSUFFICIENT_INDEPENDENT_QUOTES":Number(q.staleEvidence||0)>0?"STALE_QUOTES":Number(q.invalidEvidence||0)>0?"INVALID_QUOTES":Number(q.ineligibleEvidence||0)>0?"INELIGIBLE_QUOTES":"OTHER_QUOTE_GATE";
  (quoteCauses[cause]??=[]).push({symbol:q.symbol,eligibleFamilies:q.approvedIndependentPaperFamilies||[],reasons:q.reasons||[]});
 }
 return {mode:"PAPER_BOTTLENECK_READ_ONLY",observedAt:now,counts:{symbols:rows.length,quoteEligible:rows.filter(r=>r.quoteEligible).length,preliminaryReady:rows.filter(r=>!r.blockers.length).length,freshPreliminaryCandidatesPresent:rows.filter(r=>!r.blockers.length).length>0&&ageMinutes(coverage.generatedAt)>=0&&ageMinutes(coverage.generatedAt)<=30&&ageMinutes(committee.generatedAt)>=0&&ageMinutes(committee.generatedAt)<=1440,realStrategyPaperAttempts:ledger.attempts?.length||0},
 freshness:{coverageAgeMinutes:ageMinutes(coverage.generatedAt),committeeAgeMinutes:ageMinutes(committee.generatedAt),coverageFreshForStager:ageMinutes(coverage.generatedAt)>=0&&ageMinutes(coverage.generatedAt)<=30,committeeFreshForStager:ageMinutes(committee.generatedAt)>=0&&ageMinutes(committee.generatedAt)<=1440},
 lastDay:{date:latest?.date??null,reason:latest?.noNewFillReason??null,valid:latest?.validatedForwardDay===true},
 universeMismatch:{coverageMissingCommittee:missingFromCommittee,committeeMissingCoverage:missingFromCoverage,quoteReadyButMissingCommittee,quoteReadyButDecisionBlocked},blockerCounts:reasons,quoteBlockersByCause:quoteCauses,decisionBlockers,researchGapCounts,researchGapsBySymbol,rows,notes:["Snapshot diagnosis does not create PAPER fills. FreshPreliminaryCandidatesPresent means fresh preliminary screening only, never order authorization.","Market-open, FX, calibrated confidence, capital and OMS gates require separate live evaluation.","Committee topDecisions may be a truncated shortlist; missing symbols are diagnostic only, not automatic trading candidates.","Research buy-gap thresholds are separate from approved PAPER execution thresholds; do not merge or lower them.","Never lower strategy thresholds based on this report."],
 safeguards:{researchOnly:true,liveTradingAllowed:false,brokerConnectivityAllowed:false,ordersCreated:0}};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const data={committee:load("investment-committee.json"),coverage:load("execution-market-coverage.json"),terminal:load("terminal-intelligence.json"),approval:load("paper-v7-b2-approval.json"),days:load("paper-v7-b2-forward-days.json"),ledger:load("paper-v7-b2-forward-ledger.json")};
 console.log(JSON.stringify(diagnose(data),null,2));
}
