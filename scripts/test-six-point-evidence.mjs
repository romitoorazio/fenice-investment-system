import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { freshV7PhaseBLedger } from "../lib/trading/paper-v7-phase-b-v6-parity.mjs";
import { summarizeSixPointEvidence } from "./report-six-point-evidence.mjs";

const start="2026-11-02T14:30:00.000Z",until="2026-12-17T14:30:00.000Z";
const approval={approved:true,humanConfirmation:true,mode:"PAPER",
  approvedAt:start,expiresAt:until,liveTradingAllowed:false,
  brokerConnectivityAllowed:false,minCalendarDays:30,minEvidenceDays:25,
  targetPaperFills:10,minCommitteeScore:70,coreFingerprint:{complete:true}};
const days={mode:"V7_PHASE_B_FORWARD_DAYS",liveTradingAllowed:false,
  brokerConnectivityAllowed:false,days:[]};
const ledger=freshV7PhaseBLedger();
const committee={generatedAt:"2026-10-30T19:00:00.000Z",buyCandidateCount:0,
  topDecisions:[{symbol:"SPY",committeeScore:63,decision:"ATTENDI",
    buyGapEvidence:{gaps:[{code:"COMMITTEE_SCORE_BELOW_78"},
      {code:"TERMINAL_NOT_ACCUMULA"}]}},
    {symbol:"QQQ",committeeScore:60,decision:"ATTENDI",
    buyGapEvidence:{gaps:[{code:"COMMITTEE_SCORE_BELOW_78"}]}}]};
const instrumentMaster={instruments:[
  {ticker:"ENEL:XMIL",region:"europe"},
  {ticker:"AAPL:XNAS",region:"north-america"},
  {ticker:"7203:XTKS",region:"asia-pacific"}]};
const executionCoverage={generatedAt:"2026-10-30T19:00:00.000Z",
  rows:[{symbol:"SPY",paperEligible:true,independentSourceFamilies:2,state:"CAUTION"},
  {symbol:"QQQ",paperEligible:false,independentSourceFamilies:1,state:"BLOCKED"}]};
const input={approval,days,ledger,committee,instrumentMaster,executionCoverage,
  nowIso:"2026-11-01T12:00:00.000Z"};
const original=JSON.stringify(input);
const report=summarizeSixPointEvidence(input);
assert.equal(report.executiveState,"PROSPECTIVE_CAMPAIGN_NOT_YET_ACTIVE");
assert.equal(report.liveTradingAllowed,false);
assert.equal(report.paperTradingAllowed,false);
assert.equal(report.points["1_b2_forward"].recordedDays,0);
assert.equal(report.points["1_b2_forward"].genuinelyRecordedFills,0);
assert.equal(report.points["1_b2_forward"].certificationReady,false);
assert.equal(report.points["2_latency"].providerToReceiptP95Ms,null);
assert.equal(report.points["3_intelligence"].committeeMinimumBuyScore,78);
assert.equal(report.points["3_intelligence"].paperCommitteeMinimumScore,70);
assert.equal(report.points["3_intelligence"].primaryResearchBlockers[0].count,2);
assert.deepEqual(report.points["4_global"].paperEligibleAtSourceTimestamp,["SPY"]);
assert.equal(report.points["4_global"].researchRegions["europe"],1);
assert.equal(report.points["4_global"].researchRegions["asia-pacific"],1);
assert.equal(report.points["4_global"].europeAsiaAutomaticPaperFeedCertified,false);
const financial=report.points["5_financial"];
assert.equal(financial.virtualCashEuro,10000);
assert.equal(financial.paidVirtualFeesEuro,0);
assert.equal(financial.verifiedNetReturnPercent,null,
  "No fills or verified exit prices cannot produce 0% or imaginary returns");
assert.equal(financial.verifiedExcessReturnPercent,null);
assert.equal(financial.maxDrawdownPercent,null);
assert.equal(report.points["6_dashboard"].vercelProductionAlignedWithCurrentGitHubMain,null);
assert.equal(JSON.stringify(input),original,"Read-only report cannot mutate inputs");
const live=summarizeSixPointEvidence({...input,nowIso:"2026-11-03T15:00:00.000Z"});
assert.equal(live.executiveState,"PAPER_FORWARD_AUTHORIZED_NOT_CERTIFIED");
const tampered=summarizeSixPointEvidence({...input,ledger:{...ledger,cashEuro:9000}});
assert.equal(tampered.executiveState,"INTEGRITY_BLOCKED");
assert.equal(tampered.points["5_financial"].verifiedNetReturnPercent,null);
const future=summarizeSixPointEvidence({
  ...input,executionCoverage:{...executionCoverage,generatedAt:"2026-11-05T00:00:00.000Z"}});
assert.equal(future.points["2_latency"].latestCoverageAgeSeconds,null,
  "Future timestamps may never be reported as fresh");
const fakeDay=summarizeSixPointEvidence({...input,days:{...days,days:[
  {date:"2026-11-05",validatedForwardDay:true,marketEvidenceValid:true,
    liveTradingAllowed:false,brokerConnectivityAllowed:false}]}});
assert.equal(fakeDay.executiveState,"INTEGRITY_BLOCKED");
assert.throws(()=>summarizeSixPointEvidence({...input,nowIso:"invalid"}));
const workflow=readFileSync(".github/workflows/fenice-six-point-evidence.yml","utf8");
assert(workflow.includes("contents: read"));
assert(!workflow.includes("contents: write"));
assert(workflow.includes("node scripts/test-six-point-evidence.mjs"));
assert(workflow.includes("node scripts/report-six-point-evidence.mjs"));
console.log("FENICE six-point report: PASS (no price fabrication, region provenance, true empty PnL, no LIVE)");
