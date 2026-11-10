/**
 * Phase 9 evidence audit. Observation only; this module cannot stage PAPER
 * orders, fetch credentials, contact Directa or credit engineering backtests.
 * It intentionally distinguishes B2 filled BUY probes, V8 technical samples,
 * and genuine forward CLOSED trades with independent execution proof.
 */
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { computeV7B2Fingerprint } from "../lib/trading/paper-v7-b2-fingerprint.mjs";
import { replayV7PhaseBLedger } from "../lib/trading/paper-v7-phase-b-v6-parity.mjs";
import { replayShadowExits } from "./run-v8-shadow-exits.mjs";

const FILE = fileURLToPath(import.meta.url);
const ROOT = resolve(FILE, "../..");
const isIso = value => typeof value === "string"
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
  && Number.isFinite(Date.parse(value));
const isSafe = value => value?.liveTradingAllowed === false
  && value?.brokerConnectivityAllowed === false;
const asArray = value => Array.isArray(value) ? value : [];
const uniq = values => [...new Set(values)].sort();
const sourceFamily = value => typeof value === "string" ? value.trim().toLowerCase() : "";

export function auditPhase9({
  approval, b2Ledger, b2Days, fingerprint, baselineAncestor,
  v8Status, v8Days, v8Approval, v8Samples, shadowExitLedger, coverage, nowIso,
}) {
  const reasons = [];
  const add = code => { if (!reasons.includes(code)) reasons.push(code); };
  const nowMs = isIso(nowIso) ? Date.parse(nowIso) : NaN;
  if (!Number.isFinite(nowMs)) add("AUDIT_CLOCK_INVALID");
  if (![approval, b2Ledger, b2Days, v8Status, v8Days].every(isSafe))
    add("LIVE_OR_BROKER_SAFETY_FAILURE");

  const b2Replay = replayV7PhaseBLedger(b2Ledger);
  if (!b2Replay.valid) add("B2_LEDGER_INVALID");
  if (b2Days?.mode !== "V7_PHASE_B_FORWARD_DAYS"
    || !Array.isArray(b2Days.days)
    || b2Days.days.some((day, index, days) =>
      !/^\d{4}-\d{2}-\d{2}$/.test(day?.date || "")
      || (index > 0 && days[index - 1].date >= day.date)
      || !isSafe(day))) add("B2_DAY_EVIDENCE_INVALID");

  const pinned = baselineAncestor === true && fingerprint?.complete === true
    && approval?.coreFingerprint?.complete === true
    && fingerprint.domain === approval.coreFingerprint.domain
    && fingerprint.digest === approval.coreFingerprint.digest
    && JSON.stringify(fingerprint.files) === JSON.stringify(approval.coreFingerprint.files);
  if (!pinned) add("B2_FROZEN_CORE_FINGERPRINT_NOT_PINNED");
  if (approval?.approved !== true || approval?.humanConfirmation !== true
    || approval?.mode !== "PAPER" || approval?.allowBackfill !== false)
    add("B2_FORWARD_APPROVAL_INVALID");
  if (!Number.isFinite(nowMs) || !Number.isFinite(Date.parse(approval?.expiresAt || ""))
    || nowMs >= Date.parse(approval.expiresAt)) add("B2_APPROVAL_EXPIRED");

  // These are independent engineering observations only. Never treat them as
  // PAPER forward orders, executed trades or investment strategy returns.
  const techRecords = v8Days?.mode === "V8_TECHNICAL_PAPER_DAYS"
    ? asArray(v8Days.records).filter(row => row?.certificationScope === "V8_TECHNICAL_ONLY"
      && row?.liveTradingAllowed === false && row?.brokerConnectivityAllowed === false)
    : [];
  const familiesObserved = uniq(techRecords.flatMap(row =>
    asArray(row?.proof?.instruments).flatMap(instrument =>
      asArray(instrument?.quotes).filter(quote => quote?.provenanceVerified === true
        && quote?.eligibility === "PAPER").map(quote => sourceFamily(quote.sourceFamily))
    )).filter(Boolean));
  const lastCoverageAt = Date.parse(coverage?.generatedAt || "");
  const coverageFresh = Number.isFinite(nowMs) && Number.isFinite(lastCoverageAt)
    && lastCoverageAt <= nowMs && nowMs - lastCoverageAt <= 120000;
  const freshPaperFamilies = coverageFresh ? uniq(asArray(coverage?.rows)
    .filter(row => row?.paperEligible === true)
    .flatMap(row => asArray(row.approvedIndependentPaperFamilies))
    .map(sourceFamily).filter(Boolean)) : [];

  const b2ValidatedDays = b2Days?.mode === "V7_PHASE_B_FORWARD_DAYS"
    ? asArray(b2Days.days).filter(day => day?.validatedForwardDay === true
      && day?.marketEvidenceValid === true && isSafe(day)).length : 0;
  const b2BuyFills = b2Replay.valid ? b2Replay.fills : 0;

  // Genuine prospective V8 engineering exits may generate measured virtual EUR
  // profit or loss. They do NOT become certified strategy trades for phase 9.
  const shadow = shadowExitLedger === undefined ? null : replayShadowExits({
    ledger: shadowExitLedger, samples: v8Samples, days: v8Days, approval: v8Approval,
  });
  if (shadow && !shadow.valid) add("V8_TECHNICAL_EXIT_JOURNAL_INVALID");

  // The currently persisted B2 journal records buy/fill attempts, not
  // independently reconciled ENTRY -> EXIT round trips. It would be dishonest
  // to infer a closed trade from a fill or any backtest/engineering ledger.
  const certifiedClosedTrades = 0;
  const certifiedTradeMarketCount = 0;
  const certifiedTradeDayCount = 0;
  const certifiedExecutableSourceFamilies = 0;

  if (certifiedClosedTrades < 10) add("FORWARD_CLOSED_TRADES_0_OF_10");
  if (certifiedTradeMarketCount < 3) add("FORWARD_MARKETS_0_OF_3");
  if (certifiedTradeDayCount < 3) add("FORWARD_TRADE_DAYS_0_OF_3");
  if (certifiedExecutableSourceFamilies < 2) add("CERTIFIED_EXECUTABLE_SOURCES_0_OF_2");
  if (!coverageFresh) add("CURRENT_COVERAGE_NOT_FRESH");

  return {
    schemaVersion: 1,
    phase: 9,
    generatedAt: nowIso,
    state: reasons.length ? "NOT_CERTIFIED" : "CERTIFIED",
    reasonCodes: reasons,
    requirements: {
      closedForwardTrades: { observed: certifiedClosedTrades, required: 10, scope: "REAL_FORWARD_ONLY" },
      distinctTradeMarkets: { observed: certifiedTradeMarketCount, required: 3 },
      distinctForwardTradeDays: { observed: certifiedTradeDayCount, required: 3 },
      certifiedExecutableSourceFamilies: { observed: certifiedExecutableSourceFamilies, required: 2 },
    },
    diagnostics: {
      b2FingerprintPinned: pinned,
      expectedB2Digest: approval?.coreFingerprint?.digest || null,
      observedB2Digest: fingerprint?.digest || null,
      b2BuyFills,
      b2ValidatedDays,
      v8TechnicalDays: techRecords.length,
      v8ReportedValidDays: Number.isSafeInteger(v8Status?.validDays) ? v8Status.validDays : null,
      technicalQuoteSourceFamiliesObserved: familiesObserved,
      freshPaperCoverageFamilies: freshPaperFamilies,
      lastCoverageAt: coverage?.generatedAt || null,
      coverageFresh,
      b2BuyFillsCreditedAsClosedTrades: 0,
      v8TechnicalSamplesCreditedAsForwardTrades: 0,
      v8TechnicalRoundtripsObserved: shadow?.valid ? shadow.closedTechnicalRoundtrips : 0,
      v8TechnicalRealizedNetEuro: shadow?.valid ? shadow.realizedEuro : null,
      v8TechnicalExitsCreditedAsStrategyTrades: 0,
    },
    policy: {
      liveTradingAllowed: false,
      brokerConnectivityAllowed: false,
      historicalBackfillAllowed: false,
      technicalSamplesAreCertification: false,
      ciSuccessIsTradingProof: false,
    },
  };
}

async function main() {
  const read = name => JSON.parse(readFileSync(resolve(ROOT, "data", name), "utf8"));
  const approval = read("paper-v7-b2-approval.json");
  const fingerprint = await computeV7B2Fingerprint(ROOT);
  let baselineAncestor = false;
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", approval.baselineCommit, "HEAD"],
      { cwd: ROOT, stdio: "ignore" });
    baselineAncestor = true;
  } catch { /* A shallow checkout cannot certify the pinned baseline. */ }
  const report = auditPhase9({
    approval,
    b2Ledger: read("paper-v7-b2-forward-ledger.json"),
    b2Days: read("paper-v7-b2-forward-days.json"),
    fingerprint,
    baselineAncestor,
    v8Status: read("paper-v8-technical-status.json"),
    v8Days: read("paper-v8-technical-days.json"),
    v8Approval: read("paper-v8-technical-approval.json"),
    v8Samples: read("paper-v8-technical-samples.json"),
    shadowExitLedger: read("paper-v8-shadow-exits.json"),
    coverage: read("execution-market-coverage.json"),
    nowIso: new Date().toISOString(),
  });
  const json = JSON.stringify(report, null, 2) + "\n";
  console.log(json);
  const outAt = process.argv.indexOf("--output");
  if (outAt >= 0 && process.argv[outAt + 1])
    writeFileSync(resolve(process.argv[outAt + 1]), json);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      "## FENICE Fase 9 — " + report.state + "\n"
      + "- PAPER forward **chiusi**: " + report.requirements.closedForwardTrades.observed + "/10\n"
      + "- Mercati: " + report.requirements.distinctTradeMarkets.observed + "/3\n"
      + "- Giornate: " + report.requirements.distinctForwardTradeDays.observed + "/3\n"
      + "- Fonti di esecuzione certificate: " + report.requirements.certifiedExecutableSourceFamilies.observed + "/2\n"
      + "- Uscite virtuali tecniche V8: " + report.diagnostics.v8TechnicalRoundtripsObserved
      + "; profitto/perdita simulato €: " + report.diagnostics.v8TechnicalRealizedNetEuro + "\n"
      + "- Fingerprint B2 corrispondente: " + (report.diagnostics.b2FingerprintPinned ? "SÌ" : "NO") + "\n"
      + "- Motivi: `" + report.reasonCodes.join("`, `") + "`\n"
      + "\n> Le evidenze V8 e i fill BUY B2 non dimostrano trade forward chiusi. Directa resta bloccata.\n");
  }
  if (report.reasonCodes.includes("B2_LEDGER_INVALID")
    || report.reasonCodes.includes("LIVE_OR_BROKER_SAFETY_FAILURE")
    || report.reasonCodes.includes("B2_DAY_EVIDENCE_INVALID")
    || report.reasonCodes.includes("V8_TECHNICAL_EXIT_JOURNAL_INVALID")) process.exitCode = 2;
}
if (process.argv[1] && resolve(process.argv[1]) === FILE) await main();
