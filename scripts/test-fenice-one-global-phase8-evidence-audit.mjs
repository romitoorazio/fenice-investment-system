import assert from "node:assert/strict";
import {appendPhase4Signals} from "../lib/global/phase4-signal-journal.mjs";
import {appendPhase5VirtualLedger} from "../lib/global/phase5-virtual-ledger.mjs";
import {advancePhase5ForwardResearch} from "../lib/global/phase5-forward-research.mjs";
import {assessPhase6ForwardRisk} from "../lib/global/phase6-risk-monitor.mjs";
import {buildPhase8EvidenceAudit,phase8AuditMarkdown} from "../lib/global/phase8-evidence-audit.mjs";
const now="2026-11-10T16:00:00Z";
const coverage={status:"COMPLETE",requested:8,received:8,ranked:8,
 minimumRequired:7,eligibleForResearchPersistence:true,verifiedForPaper:false};
const signals=appendPhase4Signals({candidates:[],capturedAt:now});
const signalJournal={schemaVersion:1,journal:signals.journal,headHash:signals.headHash};
const forwardEvaluation={persisted:{headHash:signals.headHash},
 evaluation:{schemaVersion:1,mode:"PHASE4_UNATTESTED_RESEARCH_EVALUATION",generatedAt:now,
 validatedHeadHash:signals.headHash,journalEntries:0,forward:{outcomes:[],rejected:[]},
 summary:{stats:[2,5,10,40].map(sessions=>({sessions,observed:0,pending:0}))}}};
const h=appendPhase5VirtualLedger({recordedAt:now});
const historicalLedger={schemaVersion:1,...h};
const historicalPortfolio={mode:"PHASE5_HISTORICAL_VIRTUAL_PORTFOLIO_NOT_LIVE",
 initialCashEuro:1000,endingCashEuro:1000,netPnlEuro:0,trades:[],
 reconciliation:{ledgerHeadHash:h.headHash,ledgerEntries:0,realPaperCertified:false},
 sourceCoverage:coverage,ordersGenerated:0,realPaperCertified:false,liveTradingAllowed:false};
const forwardRun=advancePhase5ForwardResearch({signalJournal:[],histories:[],nowIso:now});
const forwardLedger=forwardRun.ledger,forwardPortfolio={...forwardRun.summary,sourceCoverage:coverage};
const riskReport={...assessPhase6ForwardRisk({entries:[]}),ledgerHeadHash:forwardLedger.headHash,generatedAt:now};
const worldBrief={mode:"PHASE7_WORLD_RESEARCH_DAILY_BRIEF",generatedAt:now,
 certifiedPaper:false,brokerContacted:false,liveTradingAllowed:false,ordersGenerated:0,
 forward:{ledgerHeadHash:forwardLedger.headHash,closedTrades:0,netRealizedEuro:0},
 historicalSeparate:{netPnlEuro:0},risk:{status:"ACTIVE"},
 universe:{requested:8,received:8,ranked:8,venues:["XTKS","XHKG","XNSE","XMIL","XETR","XLON","XNAS","XNYS"]},
 rankedResearch:Array.from({length:8},()=>({}))};
const inputs={signalJournal,forwardEvaluation,historicalLedger,historicalPortfolio,
 forwardLedger,forwardPortfolio,riskReport,worldBrief,nowIso:now};
const a=buildPhase8EvidenceAudit(inputs);
assert.equal(a.engineeringAudit,"PASS");
assert.equal(a.certification,"NOT_CERTIFIED");
assert.equal(a.eligibleForCertifiedPaper,false);
assert.equal(a.eligibleForRealOrders,false);
assert.equal(a.ordersGenerated,0);
assert(a.blockers.includes("FORWARD_MATURED_OUTCOMES"));
assert(a.blockers.includes("INDEPENDENT_EXECUTABLE_QUOTES"));
assert.equal(a.measurements.forwardClosed,0);
assert.equal(a.measurements.forwardEvaluableSignals,0);
assert.equal(a.measurements.forwardExcludedSignals,0);
assert.equal(a.measurements.forwardNetEuro,0);
assert.equal(a.checks.find(s=>s.id==="RESEARCH_VENUE_COVERAGE").status,"PASS");
const excludedEval={...forwardEvaluation,evaluation:{...forwardEvaluation.evaluation,
 journalEntries:1,forward:{outcomes:[],rejected:[{index:0,reason:"BAD_SOURCE"}]}}};
const oneSignal=appendPhase4Signals({candidates:[{mic:"XMIL",instrumentId:"XMIL:TEST",
 observedAt:"2026-11-09T08:00:00Z",score:1,dataVerified:false,executable:false}],
 capturedAt:"2026-11-10T14:00:00Z"});
const excludedJournal={schemaVersion:1,journal:oneSignal.journal,headHash:oneSignal.headHash};
excludedEval.evaluation.validatedHeadHash=oneSignal.headHash;
excludedEval.persisted={headHash:oneSignal.headHash};
const excludedAudit=buildPhase8EvidenceAudit({...inputs,signalJournal:excludedJournal,
 forwardEvaluation:excludedEval});
assert.equal(excludedAudit.measurements.forwardExcludedSignals,1);
assert.equal(excludedAudit.measurements.forwardEvaluableSignals,0);
const md=phase8AuditMarkdown(a);
assert.match(md,/Fase 8: verbale/);
assert.match(md,/Ordini Directa:\*\* 0/);
assert.match(md,/INDEPENDENT_EXECUTABLE_QUOTES/);
assert.throws(()=>buildPhase8EvidenceAudit({...inputs,
 signalJournal:{...signalJournal,headHash:"tampered"}}),/SIGNAL_LEDGER/);
assert.throws(()=>buildPhase8EvidenceAudit({...inputs,
 forwardLedger:{...forwardLedger,headHash:"tampered"}}),/HEAD_MISMATCH/);
assert.throws(()=>buildPhase8EvidenceAudit({...inputs,
 forwardPortfolio:{...forwardPortfolio,ordersGenerated:1}}),/ORDERS_5/);
assert.throws(()=>buildPhase8EvidenceAudit({...inputs,
 historicalPortfolio:{...historicalPortfolio,realPaperCertified:true}}),/CERTIFICATION_3/);
assert.throws(()=>buildPhase8EvidenceAudit({...inputs,
 riskReport:{...riskReport,riskState:"WATCH"}}),/RISK_riskState/);
assert.throws(()=>buildPhase8EvidenceAudit({...inputs,
 worldBrief:{...worldBrief,forward:{...worldBrief.forward,ledgerHeadHash:"wrong"}}}),/WORLD_COVERAGE_AND_BRIEF/);
assert.throws(()=>buildPhase8EvidenceAudit({...inputs,nowIso:"2026-11-09T16:00:00Z"}),/REPORT_TIME/);
console.log("FENICE Phase8 integrity and certification fail-closed audit: PASS");
