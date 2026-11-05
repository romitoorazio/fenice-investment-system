/** Independent, read-only diagnosis of strategy PAPER blockers. No network, secrets, or orders. */
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const root=new URL("../data/",import.meta.url);
const load=(name)=>JSON.parse(readFileSync(new URL(name,root),"utf8"));
export function diagnose({committee,coverage,terminal,approval,days,ledger},now=new Date().toISOString()){
 const nowMs=Date.parse(now),ageMinutes=t=>Number.isFinite(Date.parse(t))?(nowMs-Date.parse(t))/60000:Infinity;
 const decisions=new Map((committee.topDecisions||[]).map(d=>[d.symbol,d]));
 const assets=new Map((terminal.assets||[]).map(d=>[d.symbol,d]));
 const rows=(coverage.rows||[]).map(q=>{
  const d=decisions.get(q.symbol),a=assets.get(q.symbol),reasons=[];
  if(!q.paperEligible||Number(q.independentSourceFamilies)<2)reasons.push("NO_INDEPENDENT_QUOTE_QUORUM");
  if(!d)reasons.push("NOT_IN_COMMITTEE");
  else {
   if(Number(d.committeeScore)<Number(approval.minCommitteeScore??70))reasons.push("SCORE_BELOW_APPROVED_MINIMUM");
   if(!(approval.permittedDecisionStates||[]).includes(d.decision))reasons.push("DECISION_NOT_PERMITTED");
  }
  if(!a)reasons.push("NOT_IN_TERMINAL");
  else if(["ATTENDI","EVITA"].includes(a.decision))reasons.push("TERMINAL_DECISION_BLOCK");
  return {symbol:q.symbol,quoteFamilies:Number(q.independentSourceFamilies||0),committeeScore:d?.committeeScore??null,committeeDecision:d?.decision??null,blockers:reasons};
 });
 const reasons={};for(const row of rows)for(const b of row.blockers)reasons[b]=(reasons[b]||0)+1;
 const latest=days.days?.at(-1)||null;
 const quoteCauses={};
 for(const q of coverage.rows||[]){
  if(q.paperEligible===true)continue;
  const cause=Number(q.independentSourceFamilies||0)<2?"INSUFFICIENT_INDEPENDENT_QUOTES":Number(q.staleEvidence||0)>0?"STALE_QUOTES":Number(q.invalidEvidence||0)>0?"INVALID_QUOTES":Number(q.ineligibleEvidence||0)>0?"INELIGIBLE_QUOTES":"OTHER_QUOTE_GATE";
  (quoteCauses[cause]??=[]).push({symbol:q.symbol,eligibleFamilies:q.approvedIndependentPaperFamilies||[],reasons:q.reasons||[]});
 }
 return {mode:"PAPER_BOTTLENECK_READ_ONLY",observedAt:now,counts:{symbols:rows.length,quoteEligible:rows.filter(r=>r.quoteFamilies>=2).length,preliminaryReady:rows.filter(r=>!r.blockers.length).length,realStrategyPaperAttempts:ledger.attempts?.length||0},
 freshness:{coverageAgeMinutes:ageMinutes(coverage.generatedAt),committeeAgeMinutes:ageMinutes(committee.generatedAt),coverageFreshForStager:ageMinutes(coverage.generatedAt)>=0&&ageMinutes(coverage.generatedAt)<=30,committeeFreshForStager:ageMinutes(committee.generatedAt)>=0&&ageMinutes(committee.generatedAt)<=1440},
 lastDay:{date:latest?.date??null,reason:latest?.noNewFillReason??null,valid:latest?.validatedForwardDay===true},
 blockerCounts:reasons,quoteBlockersByCause:quoteCauses,rows,notes:["Snapshot diagnosis does not create PAPER fills.","Market-open, FX, calibrated confidence, capital and OMS gates require separate live evaluation.","Never lower strategy thresholds based on this report."],
 safeguards:{researchOnly:true,liveTradingAllowed:false,brokerConnectivityAllowed:false,ordersCreated:0}};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const data={committee:load("investment-committee.json"),coverage:load("execution-market-coverage.json"),terminal:load("terminal-intelligence.json"),approval:load("paper-v7-b2-approval.json"),days:load("paper-v7-b2-forward-days.json"),ledger:load("paper-v7-b2-forward-ledger.json")};
 console.log(JSON.stringify(diagnose(data),null,2));
}
