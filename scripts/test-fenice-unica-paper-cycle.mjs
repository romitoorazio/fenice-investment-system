import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {evaluatePaperCycle} from "./fenice-unica-paper-cycle.mjs";
const read=name=>JSON.parse(readFileSync(new URL("../data/"+name,import.meta.url),"utf8"));
const inputs={
 committee:read("investment-committee.json"),terminal:read("terminal-intelligence.json"),
 coverage:read("execution-market-coverage.json"),approval:read("paper-v7-b2-approval.json"),
 b2Ledger:read("paper-v7-b2-forward-ledger.json"),b2Days:read("paper-v7-b2-forward-days.json"),
 v8Status:read("paper-v8-technical-status.json"),
 worldLedger:read("world-v7-validation-ledger.json"),
 v8Approval:read("paper-v8-technical-approval.json"),
 v8Days:read("paper-v8-technical-days.json"),
 v8Samples:read("paper-v8-technical-samples.json"),
 v8Exits:read("paper-v8-shadow-exits.json"),
 legacyRetirement:read("one-global-legacy-retirement.json"),
 forwardResearchLedger:read("one-global-forward-research-ledger.json"),
 strategyLedger:read("one-global-strategy-paper-ledger.json"),
 globalSourceHealth:read("global-source-health.json"),
 // Test time is after the persistent, signed V8 evidence, rather than a
 // forever-frozen Nov 10 reference that rejects genuine subsequent sessions.
 nowIso:null
};
const latestEvidence=Math.max(
 Date.parse("2026-11-10T18:44:00.000Z"),
 Date.parse(inputs.v8Status.generatedAt)+1000,
 ...inputs.v8Days.records.map(x=>Date.parse(x.observedAt)+1000),
 ...inputs.v8Samples.events.map(x=>Date.parse(x.occurredAt)+1000),
 ...inputs.v8Exits.events.map(x=>Date.parse(x.closedAt)+1000),
 Date.parse(inputs.coverage.generatedAt)+31*60000,
 Date.parse(inputs.committee.generatedAt)+1000,
 Date.parse(inputs.terminal.generatedAt)+1000,
 ...inputs.forwardResearchLedger.events.map(e=>Date.parse(e.recordedAt)+1000),
);
assert(Number.isFinite(latestEvidence));
inputs.nowIso=new Date(latestEvidence).toISOString();
const report=evaluatePaperCycle(inputs);
assert.equal(report.chainOfEvidence.sourceResearch.reportedGate,
  inputs.globalSourceHealth.gate);
assert.equal(report.chainOfEvidence.sourceResearch.executableRightsEstablished,false,
  "Research source quality is NOT world PAPER execution rights");
assert.equal(report.chainOfEvidence.forwardResearch.hashChainVerified,true);
assert.equal(report.chainOfEvidence.forwardResearch.barObservations,
  inputs.forwardResearchLedger.events.filter(x=>x.kind==="BAR_OBSERVATION").length);
assert.equal(report.chainOfEvidence.forwardResearch.paperExecutionEligible,false);
assert.equal(report.chainOfEvidence.committee.reportedBuyCount,
  inputs.committee.allDecisions.filter(x=>x.decision==="COMPRA").length);
assert.equal(report.chainOfEvidence.executableQuotes.snapshotFreshForPaper,false);
assert.equal(report.chainOfEvidence.worldStrategyVenue.independentlyEligible,0);
assert.equal(report.chainOfEvidence.prospectiveStrategyPaper.journalStatus,"EMPTY_APPROVAL_REQUIRED");
assert.equal(report.chainOfEvidence.prospectiveStrategyPaper.certifiedForwardTrades,0);
assert.equal(report.chainOfEvidence.prospectiveStrategyPaper.independentlyAuthenticatedReceipts,false);
assert.equal(report.chainOfEvidence.phase9.directBrokerOrdersAllowed,false);
assert.equal(report.chainOfEvidence.v8EngineeringSeparate.signedValidDays,
  inputs.v8Days.records.length);
const forgedResearch=structuredClone(inputs);
forgedResearch.forwardResearchLedger.lastHash="f".repeat(64);
assert.throws(()=>evaluatePaperCycle(forgedResearch),/FORWARD_RESEARCH_LEDGER_TIP_INVALID/);
const alteredStrategy=structuredClone(inputs);
alteredStrategy.strategyLedger.cashEuro=9999;
assert.throws(()=>evaluatePaperCycle(alteredStrategy),/ONE_GLOBAL_STRATEGY_LEDGER_CHAIN_INVALID/);
const inaccurateCommittee=structuredClone(inputs);
inaccurateCommittee.committee.buyCandidateCount+=1;
assert.throws(()=>evaluatePaperCycle(inaccurateCommittee),
  /ONE_GLOBAL_COMMITTEE_BUY_COUNT_INCONSISTENT/);
const unsafeResearch=structuredClone(inputs);
unsafeResearch.forwardResearchLedger.paperEligible=true;
assert.throws(()=>evaluatePaperCycle(unsafeResearch),
  /FORWARD_RESEARCH_LEDGER_SCHEMA_INVALID/);
assert.equal(report.safeguards.readOnly,true);
assert.equal(report.safeguards.liveTradingAllowed,false);
assert.equal(report.safeguards.brokerConnectivityAllowed,false);
assert.equal(report.safeguards.creditsTechnicalSamplesAsStrategyFills,false);
assert.equal(report.strategyPaper.b2Attempts,inputs.b2Ledger.attempts.length);
assert.equal(report.strategyPaper.verifiedB2Days,
  inputs.b2Days.days.filter(x=>x.validatedForwardDay===true
    &&x.marketEvidenceValid===true).length,
  "B2 forward days are marked validatedForwardDay, not validDay");
assert(report.strategyPaper.verifiedB2Days>=2);
assert.equal(report.strategyPaper.legacyCampaignStatus,"ARCHIVED_DIAGNOSTICS_ONLY");
assert.equal(report.strategyPaper.fillsCreditedToV8,0);
assert.equal(report.technicalPaper.sourceHistoryReplayVerified,true);
assert.equal(report.technicalPaper.technicalExitCount,inputs.v8Exits.events.length);
assert.equal(report.technicalPaper.realizedNetEuro,
  Math.round(inputs.v8Exits.events.reduce((n,e)=>n+e.realizedPnLEuro,0)*10000)/10000);
assert(report.technicalPaper.unrealizedAsOfEuro===null
  ||Number.isFinite(report.technicalPaper.unrealizedAsOfEuro));
assert.equal(typeof report.technicalPaper.unrealizedMarksCurrent,"boolean");
assert.equal(report.operations.activePaperEngine,"V8_TECHNICAL_PAPER");
assert.equal(report.operations.phase9CertifiedStrategyRoundtrips,0);
assert.equal(report.operations.globalMarketsEligibleForExecutablePaper,
  Object.values(inputs.worldLedger.venues).filter(v=>v.paperEligible===true).length);
assert.equal(report.safeguards.technicalExitsCreditedAsPhase9Trades,false);
const forged=structuredClone(inputs);
forged.v8Exits.events[0].realizedPnLEuro=1000000;
assert.throws(()=>evaluatePaperCycle(forged),/ONE_GLOBAL_V8_SOURCE_REPLAY_FAILED/);
const legacyFraud=structuredClone(inputs);
legacyFraud.b2Ledger.cashEuro=123456;
assert.throws(()=>evaluatePaperCycle(legacyFraud),/ONE_GLOBAL_B2_AUDIT_INVALID/);
assert.equal(report.technicalPaper.technicalSamples,inputs.v8Status.validTechnicalSamples);
assert.equal(report.world.certifiedWorldPaperFills,inputs.worldLedger.summary.certifiedPaperFills);
assert.equal(report.candidates.length,inputs.coverage.rows.length);
const spy=report.candidates.find(x=>x.symbol==="SPY");
if(spy && spy.committeeScore<Number(inputs.approval.minCommitteeScore??70))
 assert(spy.reasons.includes("COMMITTEE_SCORE_BELOW_MIN"));
const broken=structuredClone(inputs);
broken.coverage.rows=broken.coverage.rows.map(x=>({...x,paperEligible:false}));
assert.equal(evaluatePaperCycle(broken).strategyPaper.preliminaryEligibleCount,0);
// Certification MUST recompute counters from protected forward-day and
// independent virtual sample ledgers, not trust a JSON summary that can be
// outdated or maliciously inflated.
assert.equal(report.certification.ready,false);
assert.equal(report.certification.liveTradingAllowed,false);
assert.equal(report.certification.brokerConnectivityAllowed,false);
assert.equal(report.certification.phase9CertifiedClosedStrategyTrades,0);
assert.equal(report.certification.archivedLegacyFillsCredited,0);
assert.equal(report.certification.doesNotCreditTechnicalV8AsStrategy,true);
assert.equal(report.certification.verifiedTechnicalDays,inputs.v8Days.records.length);
assert.equal(report.certification.verifiedTechnicalSamples,inputs.v8Samples.events.length);
assert.equal(report.certification.remainingTechnicalDays,
  inputs.v8Approval.minEvidenceDays-inputs.v8Days.records.length);
assert.equal(report.certification.remainingTechnicalSamples,
  inputs.v8Approval.minTechnicalSamples-inputs.v8Samples.events.length);
assert.equal(report.certification.eligibleForIndependentV8TechnicalReview,false);
assert.equal(report.certification.cachedStatusMatchesCryptographicReplay,true);
assert.equal(report.certification.b2DailyRecordsBasicIntegrityValid,true);
assert.equal(report.certification.b2WriterRetired,true);
assert.equal(report.certification.b2ActiveAutoCollection,false);
assert.equal(report.strategyPaper.b2ForwardWriterRetired,true);
assert.equal(report.certification.b2ApprovalDoesNotReactivateRetiredWriter,true);
assert(!report.certification.blockers.some(x=>x.startsWith("B2_")),
  "Retired B2 history must not be an active global strategy gate");
assert(report.certification.retiredLegacyDiagnostics.includes(
  "B2_AUTOMATIC_WRITER_RETIRED_AND_HISTORY_ONLY"));
const forgedRetirement=structuredClone(inputs);
forgedRetirement.legacyRetirement.stopAutomaticLegacyWriters=false;
assert.throws(()=>evaluatePaperCycle(forgedRetirement),
 /ONE_GLOBAL_LEGACY_RETIREMENT_SAFETY_INVALID/,
 "Malformed retirement policy cannot silently revive the archived B2 writer");
assert.equal(report.certification.b2ConfirmedStrategyFills,0);
assert.equal(report.certification.b2ProspectiveDays,2);
assert.equal(report.certification.savedQuoteCoverageFresh,false,
  "Committed provider quotes from Nov 5 cannot pass a Nov 10 intraday PAPER gate");
assert(report.certification.blockers.includes("PAPER_QUOTES_NOT_FRESH_IN_COMMITTED_SNAPSHOT"));
assert(report.candidates.every(x=>x.preliminaryEligible===false));
const forgedStatus=structuredClone(inputs);
forgedStatus.v8Status.validDays=25;
forgedStatus.v8Status.validTechnicalSamples=10;
forgedStatus.v8Status.readyForTechnicalReview=true;
forgedStatus.v8Status.status="READY_FOR_INDEPENDENT_TECHNICAL_REVIEW";
const inflated=evaluatePaperCycle(forgedStatus);
assert.equal(inflated.technicalPaper.validDays,inputs.v8Days.records.length);
assert.equal(inflated.technicalPaper.technicalSamples,inputs.v8Samples.events.length);
assert.equal(inflated.certification.cachedStatusMatchesCryptographicReplay,false);
assert.equal(inflated.certification.eligibleForIndependentV8TechnicalReview,false);
assert(inflated.certification.blockers.includes("V8_CACHED_STATUS_DISAGREES_WITH_SIGNED_EVIDENCE"));
const falseReady=structuredClone(inputs);
falseReady.v8Status.readyForTechnicalReview=true;
falseReady.v8Status.status="READY_FOR_INDEPENDENT_TECHNICAL_REVIEW";
assert.equal(evaluatePaperCycle(falseReady).certification.cachedStatusMatchesCryptographicReplay,false,
  "Even unchanged counters cannot impersonate independent technical-review readiness");
const expiredB2=structuredClone(inputs);
expiredB2.approval.expiresAt="2026-11-10T18:00:00.000Z";
const expiredReport=evaluatePaperCycle(expiredB2);
assert.equal(expiredReport.certification.b2ApprovalCurrent,false);
assert(!expiredReport.certification.blockers.some(x=>x.startsWith("B2_")));
assert(expiredReport.certification.retiredLegacyDiagnostics.includes(
  "B2_ARCHIVE_APPROVAL_EXPIRED_OR_UNSAFE"));
assert(expiredReport.candidates.every(x=>x.preliminaryEligible===false));
const duplicatedB2=structuredClone(inputs);
duplicatedB2.b2Days.days.push(structuredClone(duplicatedB2.b2Days.days.at(-1)));
const duplicatedReport=evaluatePaperCycle(duplicatedB2);
assert.equal(duplicatedReport.certification.b2DailyRecordsBasicIntegrityValid,false);
assert.equal(duplicatedReport.certification.b2ProspectiveDays,0);
const futureB2=structuredClone(inputs);
futureB2.b2Days.days.at(-1).checkedAt="2026-12-10T17:37:27.536Z";
assert.equal(evaluatePaperCycle(futureB2).certification.b2ProspectiveDays,0);
const forgedFutureV8=structuredClone(inputs);
forgedFutureV8.nowIso="2026-11-10T08:00:00.000Z";
assert.throws(()=>evaluatePaperCycle(forgedFutureV8),/ONE_GLOBAL_V8_FUTURE_EVIDENCE_REJECTED/,
  "Do not count signatures from a future date in current certification");
const expiredV8=structuredClone(inputs);
expiredV8.nowIso="2027-01-03T16:00:00.000Z";
assert.equal(evaluatePaperCycle(expiredV8).certification.v8ApprovalCurrent,false);
assert.equal(evaluatePaperCycle(expiredV8).certification.eligibleForIndependentV8TechnicalReview,false);
console.log("Fenice Unica PAPER cycle diagnostics: PASS");
