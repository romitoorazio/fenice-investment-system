import assert from "node:assert/strict";
import { inspectCandidateBottlenecks, summaryMarkdown } from "./report-paper-candidate-bottlenecks.mjs";

const stamp="2026-10-19T19:23:00.000Z";
const approval={mode:"PAPER",liveTradingAllowed:false,brokerConnectivityAllowed:false,
  minCommitteeScore:70,minValidationDataConfidence:90,maxRiskScore:75,
  permittedDecisionStates:["ACCUMULA","MANTIENI","OSSERVA"],permittedCurrencies:["USD","EUR"]};
const input={
  nowIso:stamp,approval,
  coverage:{generatedAt:stamp,rows:[
    {symbol:"SPY",paperEligible:true,independentSourceFamilies:2,state:"CAUTION"},
    {symbol:"MSFT",paperEligible:true,independentSourceFamilies:2,state:"CAUTION"},
    {symbol:"ASML",paperEligible:false,independentSourceFamilies:0,state:"BLOCKED"}
  ]},
  committee:{generatedAt:stamp,allDecisions:[
    {symbol:"SPY",committeeScore:69,rawConfidenceBeforeCalibration:98,riskScore:29,decision:"OSSERVA",currency:"USD"},
    {symbol:"MSFT",committeeScore:75,rawConfidenceBeforeCalibration:98,riskScore:44,decision:"OSSERVA",currency:"USD"},
    {symbol:"ASML",committeeScore:82,rawConfidenceBeforeCalibration:98,riskScore:44,decision:"OSSERVA",currency:"USD"}
  ]},
  terminal:{generatedAt:stamp,assets:[
    {symbol:"SPY",confidence:98,riskScore:29,decision:"MANTIENI",currency:"USD"},
    {symbol:"MSFT",confidence:98,riskScore:44,decision:"ATTENDI",currency:"USD"},
    {symbol:"ASML",confidence:98,riskScore:44,decision:"MANTIENI",currency:"USD"}
  ]}
};
const report=inspectCandidateBottlenecks(input);
assert.equal(report.status,"HISTORICAL_NON_EXECUTABLE_DIAGNOSTIC");
assert.equal(report.liveSnapshotCoherent,true);
assert.equal(report.historicallyCovered,2);
assert.equal(report.historicallyCoveredMeetingScore,1);
const by=Object.fromEntries(report.candidates.map(x=>[x.symbol,x]));
assert.equal(by.SPY.scoreGap,1);
assert(by.SPY.blockers.includes("COMMITTEE_SCORE_BELOW_MINIMUM"));
assert(by.MSFT.blockers.includes("TERMINAL_STATE_BLOCKED"));
assert(by.ASML.blockers.includes("HISTORICAL_PAPER_QUOTE_QUORUM_MISSING"));
assert.equal(by.ASML.historicalPaperQuoteEligible,false);
assert.equal(report.liveTradingAllowed,false);
assert.equal(report.currentTradingAuthorization,false);
assert.equal(report.approvedPaperOrders,0);
assert.equal(report.paperFills,0);
assert.equal(report.changesV6,false);
assert(report.candidates.every(x=>x.currentlyExecutable===false));
assert.match(summaryMarkdown(report),/retrospective/);
assert.match(summaryMarkdown(report),/SPY/);
const stale=structuredClone(input);
stale.nowIso="2026-10-19T20:30:00.000Z";
assert.equal(inspectCandidateBottlenecks(stale).liveSnapshotCoherent,false);
assert.equal(inspectCandidateBottlenecks(stale).historicallyCovered,2);
const skewed=structuredClone(input);
skewed.committee.generatedAt="2026-10-19T19:17:00.000Z";
assert.equal(inspectCandidateBottlenecks(skewed).liveSnapshotCoherent,false);
assert(inspectCandidateBottlenecks(skewed).snapshotSkewSeconds>=360);
const future=structuredClone(input);
future.coverage.generatedAt="2026-10-19T19:24:00.000Z";
assert.equal(inspectCandidateBottlenecks(future).liveSnapshotCoherent,false);
const missing=structuredClone(input);
missing.committee.allDecisions=[];
assert(missing.committee.allDecisions.length===0);
assert(inspectCandidateBottlenecks(missing).candidates.every(x=>x.blockers.includes("COMMITTEE_SYMBOL_MISSING")));
const half=structuredClone(input);
half.coverage.rows[0].independentSourceFamilies=1;
assert(inspectCandidateBottlenecks(half).candidates.find(x=>x.symbol==="SPY").blockers.includes("HISTORICAL_PAPER_QUOTE_QUORUM_MISSING"));
const unapproved=structuredClone(input);
unapproved.approval.mode="LIVE";
assert.throws(()=>inspectCandidateBottlenecks(unapproved),/INVALID_APPROVED_RISK_POLICY/);
const malformed=structuredClone(input);
malformed.approval.minCommitteeScore="70";
assert.throws(()=>inspectCandidateBottlenecks(malformed),/INVALID_APPROVED_RISK_POLICY/);
assert.throws(()=>inspectCandidateBottlenecks({...input,nowIso:"yesterday"}),/INVALID_REPORT_CLOCK/);
console.log("PAPER archival blocker diagnostic: PASS; zero trading mutations, quorum and risk thresholds preserved.");
