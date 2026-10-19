import { readFile, writeFile, appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const name = (s) => String(s || "").trim().toUpperCase();
const validNumber = (n) => typeof n === "number" && Number.isFinite(n);
const value = (n) => validNumber(n) ? n : null;
const time = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}T/.test(s) && Number.isFinite(Date.parse(s))
  ? Date.parse(s) : null;

export function inspectCandidateBottlenecks({approval, coverage, terminal, committee, nowIso}) {
  const now=time(nowIso);
  if (now===null) throw Error("INVALID_REPORT_CLOCK");
  if(approval?.mode!=="PAPER" || approval.liveTradingAllowed!==false ||
     approval.brokerConnectivityAllowed!==false ||
     !validNumber(approval.minCommitteeScore) ||
     !validNumber(approval.minValidationDataConfidence) ||
     !validNumber(approval.maxRiskScore))throw Error("INVALID_APPROVED_RISK_POLICY");

  const sourceTimes=Object.fromEntries(Object.entries({
    marketCoverage:coverage?.generatedAt, terminal:terminal?.generatedAt, committee:committee?.generatedAt
  }).map(([key,stamp])=>{
    const parsed=time(stamp);
    return [key,{observedAt:parsed===null?null:stamp,ageSeconds:parsed===null?null:Math.round((now-parsed)/1000)}];
  }));
  const ages=Object.values(sourceTimes).map(x=>x.ageSeconds);
  const timeCoherent=ages.every(x=>x!==null && x>=0 && x<=120)
    && Math.max(...ages)-Math.min(...ages)<=120;
  const snapshotSkewSeconds=ages.every(x=>x!==null)?Math.max(...ages)-Math.min(...ages):null;

  const committeeRows=Array.isArray(committee?.allDecisions)?committee.allDecisions:
    Array.isArray(committee?.topDecisions)?committee.topDecisions:[];
  const committeeBy=new Map(committeeRows.filter(x=>name(x?.symbol)).map(x=>[name(x.symbol),x]));
  const terminalBy=new Map((terminal?.assets||[]).filter(x=>name(x?.symbol)).map(x=>[name(x.symbol),x]));
  const allowedStates=new Set((approval?.permittedDecisionStates||[]).map(name));
  const allowedCurrencies=new Set((approval?.permittedCurrencies||[]).map(name));
  const rows=(Array.isArray(coverage?.rows)?coverage.rows:[]).filter(x=>name(x?.symbol));
  const candidates=rows.map(row=>{
    const symbol=name(row.symbol), c=committeeBy.get(symbol), t=terminalBy.get(symbol);
    const score=value(c?.committeeScore);
    const committeeConfidence=value(c?.rawConfidenceBeforeCalibration??c?.confidence);
    const terminalConfidence=value(t?.confidence);
    const confidence=committeeConfidence===null||terminalConfidence===null?null:Math.min(committeeConfidence,terminalConfidence);
    const committeeRisk=value(c?.riskScore), terminalRisk=value(t?.riskScore);
    const risk=committeeRisk===null||terminalRisk===null?null:Math.max(committeeRisk,terminalRisk);
    const committeeState=name(c?.decision),terminalState=name(t?.decision);
    const currency=name(c?.currency||t?.currency);
    const blockers=[];
    if(!c)blockers.push("COMMITTEE_SYMBOL_MISSING");
    if(!t)blockers.push("TERMINAL_SYMBOL_MISSING");
    if(row.paperEligible!==true || Number(row.independentSourceFamilies)<2 ||
      !["GREEN","CAUTION"].includes(name(row.state)))
      blockers.push("HISTORICAL_PAPER_QUOTE_QUORUM_MISSING");
    if(score===null||score<approval.minCommitteeScore)blockers.push("COMMITTEE_SCORE_BELOW_MINIMUM");
    if(!allowedStates.has(committeeState))blockers.push("COMMITTEE_STATE_BLOCKED");
    if(!terminalState||["ATTENDI","EVITA"].includes(terminalState))blockers.push("TERMINAL_STATE_BLOCKED");
    if(confidence===null||confidence<approval.minValidationDataConfidence)blockers.push("CONFIDENCE_BELOW_MINIMUM");
    if(risk===null||risk>approval.maxRiskScore)blockers.push("RISK_ABOVE_MAXIMUM");
    if(!allowedCurrencies.has(currency))blockers.push("CURRENCY_NOT_PERMITTED");
    return {
      symbol,committeeScore:score,
      scoreGap:score===null?null:Math.max(0,approval.minCommitteeScore-score),
      confidence,risk,committeeState,terminalState,
      historicalPaperQuoteEligible:row.paperEligible===true,
      historicalIndependentFamilies:value(row.independentSourceFamilies),
      blockers,currentlyExecutable:false
    };
  }).sort((a,b)=>Number(b.historicalPaperQuoteEligible)-Number(a.historicalPaperQuoteEligible)
    || a.blockers.length-b.blockers.length
    || (a.scoreGap??Infinity)-(b.scoreGap??Infinity)
    || a.symbol.localeCompare(b.symbol));
  const counts={};
  for(const c of candidates)for(const blocker of c.blockers)counts[blocker]=(counts[blocker]||0)+1;
  return {
    version:1,generatedAt:nowIso,status:"HISTORICAL_NON_EXECUTABLE_DIAGNOSTIC",
    explanation:"Coverage, committee and terminal snapshots have different timestamps. No currently executable status can be inferred.",
    sourceTimes,snapshotSkewSeconds,liveSnapshotCoherent:timeCoherent,
    thresholdScore:approval.minCommitteeScore,thresholdConfidence:approval.minValidationDataConfidence,
    thresholdMaxRisk:approval.maxRiskScore,analyzedSymbols:candidates.length,
    historicallyCovered:candidates.filter(x=>x.historicalPaperQuoteEligible).length,
    historicallyCoveredMeetingScore:candidates.filter(x=>x.historicalPaperQuoteEligible
      && x.committeeScore!==null && x.committeeScore>=approval.minCommitteeScore).length,
    blockerCounts:counts,candidates,
    approvedPaperOrders:0,paperFills:0,liveOrders:0,liveTradingAllowed:false,
    brokerConnectivityAllowed:false,currentTradingAuthorization:false,
    changesV6:false,diagnosticOnly:true
  };
}

export function summaryMarkdown(report){
  const lines=["## FENICE PAPER — candidate bottleneck evidence","",
    "**Read-only retrospective:** never treat asynchronous archived prices as executable.",
    "V6 scores, confidence, risk, trading locks and order policy are unchanged.","",
    "Historically covered: "+report.historicallyCovered+"/"+report.analyzedSymbols,
    "Passing committee score in that historical coverage: "+report.historicallyCoveredMeetingScore,
    "Fresh/coherent snapshots: "+(report.liveSnapshotCoherent?"yes (no execution authority)":"NO"),
    "Inter-source snapshot skew: "+(report.snapshotSkewSeconds??"unknown")+" seconds",
    "New orders / fills generated by this diagnostic: 0","",
    "| Symbol | Historical quote | Committee score | Gap to approved score | Diagnostic blockers |",
    "|---|---|---:|---:|---|"];
  for(const c of report.candidates.slice(0,12))
    lines.push("| "+c.symbol+" | "+(c.historicalPaperQuoteEligible?"yes":"no")+" | "+
      (c.committeeScore??"?")+" | "+(c.scoreGap??"?")+" | "+(c.blockers.join(", ")||"none (still not executable)")+" |");
  return lines.join("\n")+"\n";
}
async function main(){
  const paths=["data/paper-validation-approval.json","data/execution-market-coverage.json",
    "data/terminal-intelligence.json","data/investment-committee.json"];
  const [approval,coverage,terminal,committee]=await Promise.all(paths.map(async p=>JSON.parse(await readFile(p,"utf8"))));
  const report=inspectCandidateBottlenecks({approval,coverage,terminal,committee,nowIso:new Date().toISOString()});
  const output=process.env.FENICE_CANDIDATE_BLOCKERS_REPORT||"paper-candidate-blockers.json";
  await writeFile(output,JSON.stringify(report,null,2)+"\n");
  if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,summaryMarkdown(report));
  console.log(JSON.stringify({state:report.status,historyCoverage:report.historicallyCovered,
    historicalScorePassing:report.historicallyCoveredMeetingScore,
    freshCoherent:report.liveSnapshotCoherent,
    nearest:report.candidates.slice(0,6).map(x=>({symbol:x.symbol,score:x.committeeScore,blockers:x.blockers})),
    realOrders:0,paperFills:0}));
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(e=>{console.error("PAPER_DIAGNOSTIC_FAILED: "+e.message);process.exitCode=1;});
}
