// Fenice six-point evidence dashboard: READ-ONLY and independent of frozen PAPER core.
// This report never promotes research data into executable evidence or computes
// financial returns without independently verified mark-to-market/exit prices.
import { readFile, writeFile, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { replayV7PhaseBLedger } from "../lib/trading/paper-v7-phase-b-v6-parity.mjs";

function ageSeconds(value, nowMs) {
  const when = Date.parse(String(value || ""));
  return Number.isFinite(when) && when <= nowMs
    ? Math.round((nowMs - when) / 1000) : null;
}
const round = n => Math.round((n + Number.EPSILON) * 100) / 100;

export function summarizeSixPointEvidence({
  approval, days, ledger, committee, instrumentMaster, executionCoverage,
  nowIso,
}) {
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(nowMs) || new Date(nowMs).toISOString() !== nowIso)
    throw Error("SIX_POINT_INVALID_OBSERVATION_CLOCK");
  const integrity = replayV7PhaseBLedger(ledger);
  const dayRows = Array.isArray(days?.days) ? days.days : [];
  const attempts = Array.isArray(ledger?.attempts) ? ledger.attempts : [];
  const invalidDayRows = dayRows.some((d, i) =>
    !d || typeof d.date !== "string" || d.date > nowIso.slice(0,10)
    || (i && dayRows[i - 1].date >= d.date)
    || d.liveTradingAllowed !== false || d.brokerConnectivityAllowed !== false);
  const safe = approval?.mode === "PAPER"
    && approval?.liveTradingAllowed === false
    && approval?.brokerConnectivityAllowed === false
    && ledger?.liveTradingAllowed === false
    && ledger?.brokerConnectivityAllowed === false
    && days?.liveTradingAllowed === false
    && days?.brokerConnectivityAllowed === false
    && !invalidDayRows && integrity.valid === true;
  const start = Date.parse(approval?.approvedAt || "");
  const end = Date.parse(approval?.expiresAt || "");
  const window = !Number.isFinite(start) || !Number.isFinite(end) ? "INVALID"
    : nowMs < start ? "FUTURE"
    : nowMs >= end ? "EXPIRED" : "ACTIVE";
  const regionCounts = {};
  for (const item of instrumentMaster?.instruments || [])
    regionCounts[String(item.region || "unknown")] = (regionCounts[String(item.region || "unknown")] || 0) + 1;
  const covered = Array.isArray(executionCoverage?.rows) ? executionCoverage.rows : [];
  const genuinelyEligible = covered.filter(row => row.paperEligible === true
    && Number(row.independentSourceFamilies) >= 2
    && ["GREEN","CAUTION"].includes(row.state));
  const top = (committee?.topDecisions || []).slice(0, 6).map(row=>({
    ticker: row.symbol, score: row.committeeScore, decision: row.decision,
    missingRequirements: (row.buyGapEvidence?.gaps || []).map(g => g.code),
    paperEligible: false, // research Committee is NOT proof of paper execution eligibility
  }));
  const gapTotals = {};
  for(const item of committee?.topDecisions || []) {
    for(const gap of item.buyGapEvidence?.gaps || [])
      gapTotals[gap.code] = (gapTotals[gap.code] || 0) + 1;
  }
  const fees = attempts.filter(e=>e.status === "PAPER_FILLED")
    .reduce((sum,e)=>sum + Number(e.feeEuro || 0),0);
  const positions = ledger?.positions && typeof ledger.positions==="object"
    ? Object.values(ledger.positions) : [];
  const bookCost = positions.reduce((sum,p)=>sum + Number(p.bookCostEuro||0),0);
  // The forward ledger is BUY-only and has no verified closing prices or
  // benchmark time series; cash decrease is not an investment loss.
  const net = {
    genuineFillCount: integrity.valid ? integrity.fills : null,
    paidVirtualFeesEuro: integrity.valid ? round(fees) : null,
    virtualCashEuro: integrity.valid ? ledger.cashEuro : null,
    openCostBasisIncludingFeesEuro: integrity.valid ? round(bookCost) : null,
    verifiedMarkToMarketEuro: null,
    realizedNetPnLEuro: null,
    verifiedNetReturnPercent: null,
    benchmarkReturnPercent: null,
    verifiedExcessReturnPercent: null,
    maxDrawdownPercent: null,
    reason: integrity.valid ? "NO_VERIFIED_EXIT_PRICES_OR_FORWARD_BENCHMARK_SERIES"
      : "JOURNAL_REPLAY_FAILED",
  };
  return {
    version: 1, type:"FENICE_READ_ONLY_SIX_POINT_EVIDENCE",
    generatedAt:nowIso,
    paperTradingAllowed:false,brokerConnectivityAllowed:false,liveTradingAllowed:false,
    executiveState:!safe?"INTEGRITY_BLOCKED"
      : window==="ACTIVE"?"PAPER_FORWARD_AUTHORIZED_NOT_CERTIFIED"
      : "PROSPECTIVE_CAMPAIGN_NOT_YET_ACTIVE",
    points:{
      "1_b2_forward":{
        campaignApproved: approval?.approved===true && approval?.humanConfirmation===true,
        approvalWindow:window,
        fingerprintPinnedInApproval:approval?.coreFingerprint?.complete===true,
        fingerprintContentRecomputed:false, // requires the separate CI fingerprint guard
        ledgerReplayValid:integrity.valid===true,
        recordedDays:dayRows.length,
        validEvidenceDays:dayRows.filter(d=>d.validatedForwardDay===true
          &&d.marketEvidenceValid===true).length,
        genuinelyRecordedFills:integrity.valid?integrity.fills:null,
        target: {minimumCalendarDays:approval?.minCalendarDays,
          minimumValidEvidenceDays:approval?.minEvidenceDays,
          minimumGenuineFills:approval?.targetPaperFills},
        lastObservation:dayRows.at(-1)??null,
        certificationReady:false,
      },
      "2_latency":{
        latestCoverageAt:executionCoverage?.generatedAt??null,
        latestCoverageAgeSeconds:ageSeconds(executionCoverage?.generatedAt,nowMs),
        providerToReceiptP95Ms:null,
        receiptToDecisionP95Ms:null,
        decisionToAuditP95Ms:null,
        state:"NOT_MEASURED_FROM_END_TO_END_PROVIDER_LOGS",
      },
      "3_intelligence":{
        committeeAt:committee?.generatedAt??null,
        committeeAgeSeconds:ageSeconds(committee?.generatedAt,nowMs),
        committeeBuyCount:committee?.buyCandidateCount??null,
        committeeMinimumBuyScore:78,
        paperCommitteeMinimumScore:approval?.minCommitteeScore??null,
        topResearch:top,
        primaryResearchBlockers: Object.entries(gapTotals).sort((a,b)=>b[1]-a[1])
          .slice(0,8).map(([code,count])=>({code,count})),
        policy:"NO_SCORE_LOOSENING_RESEARCH_IS_NOT_EXECUTION",
      },
      "4_global":{
        researchInstruments:Array.isArray(instrumentMaster?.instruments)
          ? instrumentMaster.instruments.length:0,
        researchRegions:regionCounts,
        executionProbedSymbols:covered.length,
        paperEligibleAtSourceTimestamp:genuinelyEligible.map(row=>row.symbol),
        latestExecutionEvidenceAt:executionCoverage?.generatedAt??null,
        europeAsiaAutomaticPaperFeedCertified:false,
        policy:"VENUE_SOURCE_FRESHNESS_AND_LICENSE_VERIFICATION_REQUIRED",
      },
      "5_financial":net,
      "6_dashboard":{
        vercelDeploymentSha:null,
        vercelBuildVerified:false,
        vercelProductionAlignedWithCurrentGitHubMain:null,
        reason:"VERCEL_IS_EXTERNAL_TO_READ_ONLY_REPOSITORY_REPORT",
      },
    },
  };
}
function renderSummary(r) {
  const p=r.points;
  return [
    "## FENICE — Six-point operational evidence (read-only)",
    "",
    "| Check | Observed |",
    "|---|---|",
    "| B2 campaign | "+r.executiveState+" |",
    "| B2 valid days / genuine fills | "+p["1_b2_forward"].validEvidenceDays+" / "+p["1_b2_forward"].genuinelyRecordedFills+" |",
    "| US quote coverage timestamp | "+(p["2_latency"].latestCoverageAt||"unavailable")+" |",
    "| End-to-end P95 latency | **not measured** |",
    "| Committee research COMPRA | "+String(p["3_intelligence"].committeeBuyCount)+" |",
    "| Regions researched | "+Object.entries(p["4_global"].researchRegions).map(([k,v])=>k+":"+v).join(", ")+" |",
    "| Source-timestamp-eligible US paper symbols | "+p["4_global"].paperEligibleAtSourceTimestamp.join(", ")+" (**historical only**) |",
    "| Verified net returns vs benchmark | **not measurable without prices & mark-to-market series** |",
    "| Live / broker orders | **BLOCKED** |",
    "",
    "This diagnostic does not call market providers, modify approvals, update ledgers, or deploy Vercel.",
  ].join("\n");
}
async function main() {
  const data = name=>readFile(resolve("data",name),"utf8").then(JSON.parse);
  const [approval,days,ledger,committee,instrumentMaster,executionCoverage]=await Promise.all([
    "paper-v7-b2-approval.json","paper-v7-b2-forward-days.json",
    "paper-v7-b2-forward-ledger.json","investment-committee.json",
    "instrument-master.json","execution-market-coverage.json",
  ].map(data));
  const result=summarizeSixPointEvidence({
    approval,days,ledger,committee,instrumentMaster,executionCoverage,
    nowIso:new Date().toISOString(),
  });
  const dest=process.env.FENICE_SIX_POINT_OUTPUT||"fenice-six-point-evidence.json";
  await writeFile(dest,JSON.stringify(result,null,2)+"\n",{mode:0o600});
  console.log(renderSummary(result));
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY,renderSummary(result)+"\n");
  if (result.executiveState==="INTEGRITY_BLOCKED")process.exitCode=2;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  await main();
