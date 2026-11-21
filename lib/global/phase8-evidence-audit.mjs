/** FENICE Phase 8: conservative, read-only evidence audit. Never certifies executable PAPER. */
import {appendPhase4Signals} from "./phase4-signal-journal.mjs";
import {validatePhase5PersistedLedger} from "./phase5-virtual-ledger.mjs";
import {validatePhase5ForwardLedger} from "./phase5-forward-research.mjs";
import {assessPhase6ForwardRisk} from "./phase6-risk-monitor.mjs";
export const PHASE8_MODE="PHASE8_EVIDENCE_AUDIT_RESEARCH_ONLY";
export const PHASE8_CRITERIA=Object.freeze({closedTrades:10,winningTrades:1,losingTrades:1,distinctVenues:3,distinctExitDays:3,venueSample:8});
const err=s=>{throw Error("PHASE8_INTEGRITY_FAILURE_"+s);};
const validTime=s=>typeof s==="string"&&Number.isFinite(Date.parse(s));
const check=(ok,reason)=>{if(!ok)err(reason);};
export function buildPhase8EvidenceAudit({signalJournal,forwardEvaluation,historicalLedger,
 historicalPortfolio,forwardLedger,forwardPortfolio,riskReport,worldBrief,
 nowIso=new Date().toISOString()}={}){
 check(validTime(nowIso),"CLOCK");
 const inputs=[signalJournal,forwardEvaluation,historicalLedger,historicalPortfolio,
  forwardLedger,forwardPortfolio,riskReport,worldBrief];
 check(inputs.every(x=>x&&typeof x==="object"&&!Array.isArray(x)),"MISSING_SOURCE");
 for(const [i,x] of inputs.entries()){
  check(x.ordersGenerated===undefined||x.ordersGenerated===0,"ORDERS_"+i);
  check(x.liveTradingAllowed===undefined||x.liveTradingAllowed===false,"LIVE_"+i);
  check(x.realPaperCertified===undefined||x.realPaperCertified===false,"CERTIFICATION_"+i);
 }
 const validatedSignals=appendPhase4Signals({journal:signalJournal.journal,candidates:[],capturedAt:nowIso});
 check(signalJournal.schemaVersion===1&&signalJournal.headHash===validatedSignals.headHash,"SIGNAL_LEDGER");
 const ev=forwardEvaluation.evaluation;
 check(ev?.mode==="PHASE4_UNATTESTED_RESEARCH_EVALUATION"&&
  ev.validatedHeadHash===signalJournal.headHash&&ev.journalEntries===signalJournal.journal.length&&
  forwardEvaluation.persisted?.headHash===signalJournal.headHash&&
  Array.isArray(ev.summary?.stats)&&ev.summary.stats.length===4&&
  Array.isArray(ev.forward?.outcomes)&&Array.isArray(ev.forward?.rejected)&&
  ev.forward.outcomes.length+ev.forward.rejected.length===ev.journalEntries,"FORWARD_EVALUATION");
 const acceptedOutcomes=ev.forward.outcomes.length;
 for(const stat of ev.summary.stats)check([2,5,10,40].includes(stat.sessions)&&
  Number.isSafeInteger(stat.observed)&&Number.isSafeInteger(stat.pending)&&stat.observed>=0&&stat.pending>=0&&
  stat.observed+stat.pending===acceptedOutcomes,"FORWARD_COUNTS");
 const historicalRows=validatePhase5PersistedLedger(historicalLedger,nowIso);
 check(historicalPortfolio.mode==="PHASE5_HISTORICAL_VIRTUAL_PORTFOLIO_NOT_LIVE"&&
  Array.isArray(historicalPortfolio.trades)&&
  historicalPortfolio.reconciliation?.ledgerHeadHash===historicalLedger.headHash&&
  historicalPortfolio.reconciliation?.ledgerEntries===historicalRows.length&&
  historicalPortfolio.reconciliation?.realPaperCertified===false&&
  Number.isFinite(historicalPortfolio.netPnlEuro)&&Number.isFinite(historicalPortfolio.endingCashEuro)&&
  Number.isFinite(historicalPortfolio.initialCashEuro)&&
  Math.abs(historicalPortfolio.initialCashEuro+historicalPortfolio.netPnlEuro-
   historicalPortfolio.endingCashEuro)<0.001,"HISTORICAL_PORTFOLIO");
 const original=new Map(historicalRows.map(r=>[r.trade.key,r.trade]));
 for(const t of historicalPortfolio.trades){
  const key=[t.instrumentId,t.entryAt,t.exitAt].join("|");
  check(original.get(key)?.netPnlEuro===t.netPnlEuro,"HISTORICAL_TRADE_LINK");
 }
 check(Math.abs(historicalPortfolio.trades.reduce((n,t)=>n+t.netPnlEuro,0)-
  historicalPortfolio.netPnlEuro)<0.001,"HISTORICAL_PNL");
 const fwd=validatePhase5ForwardLedger(forwardLedger,nowIso);
 check(forwardPortfolio.mode==="PHASE5_FORWARD_UNATTESTED_VIRTUAL_RESEARCH"&&
  forwardPortfolio.ledgerHeadHash===forwardLedger.headHash&&
  forwardPortfolio.totalEvents===forwardLedger.entries.length&&
  forwardPortfolio.closedTrades===fwd.accounting.closedTrades&&
  forwardPortfolio.openPositions?.length===fwd.accounting.openPositions.length&&
  forwardPortfolio.cashEuro===fwd.accounting.cashEuro&&
  forwardPortfolio.realizedNetPnlEuro===fwd.accounting.realizedNetPnlEuro&&
  forwardPortfolio.wins===fwd.accounting.wins&&forwardPortfolio.losses===fwd.accounting.losses&&
  forwardPortfolio.paperFillAuthorized===false,"FORWARD_ACCOUNTING");
 const recomputedRisk=assessPhase6ForwardRisk({entries:forwardLedger.entries,
  initialCashEuro:forwardLedger.policy.initialCashEuro});
 check(riskReport.ledgerHeadHash===forwardLedger.headHash&&riskReport.mode===recomputedRisk.mode,"RISK_LEDGER");
 for(const field of ["riskState","haltNewVirtualEntries","maxRealizedDrawdownPct",
  "closedTrades","wins","losses","realizedNetPnlEuro"]){
  check(riskReport[field]===recomputedRisk[field]&&
    forwardPortfolio.riskState?.[field]===recomputedRisk[field],"RISK_"+field);
 }
 const coverage=historicalPortfolio.sourceCoverage;
 check(worldBrief.mode==="PHASE7_WORLD_RESEARCH_DAILY_BRIEF"&&
  worldBrief.certifiedPaper===false&&worldBrief.brokerContacted===false&&
  worldBrief.forward?.ledgerHeadHash===forwardLedger.headHash&&
  worldBrief.forward?.closedTrades===fwd.accounting.closedTrades&&
  worldBrief.forward?.netRealizedEuro===fwd.accounting.realizedNetPnlEuro&&
  worldBrief.historicalSeparate?.netPnlEuro===historicalPortfolio.netPnlEuro&&
  worldBrief.risk?.status===recomputedRisk.riskState&&
  coverage?.requested===8&&coverage.verifiedForPaper===false&&
  coverage.received===worldBrief.universe?.received&&
  coverage.ranked===worldBrief.universe?.ranked&&
  Array.isArray(worldBrief.rankedResearch)&&worldBrief.rankedResearch.length===coverage.ranked,
  "WORLD_COVERAGE_AND_BRIEF");
 for(const x of [ev,forwardPortfolio,riskReport,worldBrief])
  check(validTime(x.generatedAt)&&Date.parse(x.generatedAt)<=Date.parse(nowIso),"REPORT_TIME");
 const closeRows=forwardLedger.entries.filter(r=>r.event?.type==="CLOSE");
 const venues=new Set(closeRows.map(r=>r.event.mic));
 const days=new Set(closeRows.map(r=>r.event.barAt?.slice(0,10)));
 const closed=fwd.accounting.closedTrades;
 const outcomeReady=closed>=PHASE8_CRITERIA.closedTrades&&
  fwd.accounting.wins>=PHASE8_CRITERIA.winningTrades&&
  fwd.accounting.losses>=PHASE8_CRITERIA.losingTrades&&
  venues.size>=PHASE8_CRITERIA.distinctVenues&&days.size>=PHASE8_CRITERIA.distinctExitDays;
 const row=(id,ok,observed,expected)=>({id,status:ok?"PASS":"PENDING",observed,expected});
 const checks=[
  row("SIGNAL_JOURNAL_INTEGRITY",true,signalJournal.journal.length+" valid entries","HASH_LINKED"),
  row("HISTORICAL_LEDGER_INTEGRITY",true,historicalRows.length+" valid entries","RECONCILED"),
  row("FORWARD_LEDGER_INTEGRITY",true,forwardLedger.entries.length+" valid events","RECONCILED"),
  row("RISK_CONTROLS_MATCH",true,recomputedRisk.riskState,"RECOMPUTED"),
  row("BROKER_ISOLATION",true,"0 orders","DIRECTA_LOCKED"),
  row("RESEARCH_VENUE_COVERAGE",coverage.received===8&&coverage.ranked===8,
   coverage.received+"/"+coverage.requested,"8/8 RESEARCH SAMPLE"),
  row("FORWARD_MATURED_OUTCOMES",outcomeReady,
   closed+" closed, "+fwd.accounting.wins+" wins, "+fwd.accounting.losses+" losses, "+
    venues.size+" venues, "+days.size+" exit dates",
   "10 CLOSED; BOTH SIGNS; 3 VENUES; 3 DATES"),
  // Unattested Yahoo daily bars and ECB indicative FX are NEVER executable evidence.
  row("INDEPENDENT_EXECUTABLE_QUOTES",false,"0 independently attested providers","2+ INDEPENDENT ATTESTED PROVIDERS")
 ];
 const blockers=checks.filter(x=>x.status!=="PASS").map(x=>x.id);
 return {schemaVersion:1,mode:PHASE8_MODE,generatedAt:nowIso,
  engineeringAudit:"PASS",certification:"NOT_CERTIFIED",certifiedPaper:false,
  realPaperCertified:false,eligibleForCertifiedPaper:false,eligibleForRealOrders:false,
  liveTradingAllowed:false,ordersGenerated:0,brokerContacted:false,
  checks,blockers,
  measurements:{signals:signalJournal.journal.length,researchVenues:coverage.received,
   rankedVenues:coverage.ranked,forwardClosed:closed,forwardWins:fwd.accounting.wins,
   forwardLosses:fwd.accounting.losses,forwardOpened:fwd.accounting.openPositions.length,
   forwardNetEuro:fwd.accounting.realizedNetPnlEuro,historicalNetEuro:historicalPortfolio.netPnlEuro,
   historicalLegacyProvisional:historicalLedger.integrityAudit?.potentiallyUnsettled?.length??0,
   forwardEvaluableSignals:acceptedOutcomes,forwardExcludedSignals:ev.forward.rejected.length,
   forwardObservedAt2Sessions:ev.summary.stats.find(s=>s.sessions===2)?.observed??0,
   forwardObservedAt5Sessions:ev.summary.stats.find(s=>s.sessions===5)?.observed??0,
   riskState:recomputedRisk.riskState,distinctClosedVenues:venues.size,distinctExitDates:days.size},
  provenance:{priceHistory:"YAHOO_PUBLIC_RESEARCH_UNATTESTED",fx:"ECB_INDICATIVE_NOT_EXECUTABLE",
   independentExecutableSourceFamilies:0,worldMarketScope:"8-SYMBOL_SAMPLE_NOT_FULL_MARKET",
   evidenceClassification:"RESEARCH_ONLY"},
  lineage:{signalHash:signalJournal.headHash,historicalHash:historicalLedger.headHash,
   forwardHash:forwardLedger.headHash,phase7At:worldBrief.generatedAt},
  disclaimer:"Technical integrity audit complete; financial validity and certified forward PAPER remain unproven. No broker order authorization."};
}
export function phase8AuditMarkdown(a){
 if(a?.mode!==PHASE8_MODE||a.certification!=="NOT_CERTIFIED"||
  a.ordersGenerated!==0||!Array.isArray(a.checks))err("FORMAT");
 const m=a.measurements;
 const lines=["# FENICE ONE GLOBAL — Fase 8: verbale di verifica", "",
  "**Data:** "+a.generatedAt,
  "**Audit tecnico:** "+a.engineeringAudit,
  "**PAPER certificato:** NO | **Ordini Directa:** 0", "",
  "## Controlli", "",
  "| Verifica | Esito | Evidenza |","|---|---|---|"];
 for(const c of a.checks)lines.push("| "+c.id+" | "+c.status+" | "+c.observed+" |");
 lines.push("","## Performance e provenienza",
  "- Segnali forward valutabili: "+m.forwardEvaluableSignals+"; esclusi motivatamente: "+m.forwardExcludedSignals,
  "- Operazioni forward chiuse: "+m.forwardClosed+"; positive: "+m.forwardWins+"; negative: "+m.forwardLosses,
  "- Risultato forward simulato: €"+m.forwardNetEuro.toFixed(4),
  "- Backtest storico, completamente separato: €"+m.historicalNetEuro.toFixed(4),
  "- Campione mondiale: "+m.researchVenues+"/8 borse, non una scansione di tutte le azioni.",
  "- Due vecchie osservazioni storiche potenzialmente provvisorie: "+m.historicalLegacyProvisional,
  "- Prezzi Yahoo non attestati; cambi BCE indicativi, non eseguibili.",
  "","## Blocchi alla certificazione");
 for(const b of a.blockers)lines.push("- "+b);
 lines.push("","## Integrità registri",
  "- Segnali: "+a.lineage.signalHash,
  "- Storico: "+a.lineage.historicalHash,
  "- Forward: "+a.lineage.forwardHash,
  "","**L'audit della Fase 8 è implementato ed eseguito; non autorizza PAPER certificato o ordini reali.**","");
 return lines.join("\n");
}
