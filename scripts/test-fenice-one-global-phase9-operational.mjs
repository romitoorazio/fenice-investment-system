import assert from "node:assert/strict";
import {appendPhase4Signals} from "../lib/global/phase4-signal-journal.mjs";
import {advancePhase5ForwardResearch} from "../lib/global/phase5-forward-research.mjs";
import {buildPhase9Report,formatPhase9Report} from "../lib/global/phase9-operational-report.mjs";

const day=d=>d+"T08:00:00.000Z";
const dates=["2026-10-30","2026-11-02","2026-11-03","2026-11-04",
 "2026-11-05","2026-11-06","2026-11-09","2026-11-10","2026-11-11"];
const base={mic:"XMIL",instrumentId:"XMIL:SIM",currency:"EUR",
 sourceUrl:"https://query1.finance.yahoo.com/v8/finance/chart/SIM",
 synthetic:false,provenanceVerified:false,
 closes:dates.map((d,i)=>({observedAt:day(d),close:100+i*2}))};
const signal=appendPhase4Signals({candidates:[{mic:"XMIL",instrumentId:"XMIL:SIM",
 observedAt:day("2026-10-30"),score:4,dataVerified:false,executable:false}],
 capturedAt:"2026-11-02T15:00:00.000Z"}).journal;
const history=now=>({...base,closes:base.closes.filter(x=>Date.parse(x.observedAt)<=Date.parse(now))});
const advance=(now,existing=null)=>advancePhase5ForwardResearch({nowIso:now,
 signalJournal:signal,histories:[history(now)],existing});
const init=advance("2026-11-04T13:00:00Z");
assert.equal(init.summary.openPositions.length,1);
const evidence=run=>({mode:"PHASE8_EVIDENCE_AUDIT_RESEARCH_ONLY",generatedAt:run.summary.generatedAt,
 engineeringAudit:"PASS",certification:"NOT_CERTIFIED",eligibleForRealOrders:false,
 eligibleForCertifiedPaper:false,lineage:{forwardHash:run.ledger.headHash},
 measurements:{forwardClosed:run.summary.closedTrades,forwardNetEuro:run.summary.realizedNetPnlEuro,
  forwardWins:run.summary.wins,forwardLosses:run.summary.losses,
  forwardOpened:run.summary.openPositions.length}});
const args=(run,now,histories=[history(now)])=>({forwardLedger:run.ledger,
 forwardPortfolio:run.summary,phase8:evidence(run),histories,nowIso:now});
const early=buildPhase9Report(args(init,"2026-11-04T13:01:00Z"));
assert.equal(early.open.count,1);assert.equal(early.open.complete,false);
assert.equal(early.portfolio.indicativeEquityEuro,null);
assert(early.blockers.includes("SOME_OPEN_POSITIONS_NOT_MARKABLE"));
const marked=buildPhase9Report(args(init,"2026-11-07T13:00:00Z"));
assert.equal(marked.open.count,1);
assert.equal(marked.open.marks.length,1);
assert.equal(marked.open.complete,true);
assert.equal(marked.open.marks[0].markAt,day("2026-11-06"));
assert(marked.open.marks[0].netUnrealizedEuro>0);
assert(marked.portfolio.indicativeEquityEuro>1000);
assert.equal(marked.realized.closed,0);
assert.equal(marked.certification,"NOT_CERTIFIED");
assert.equal(marked.ordersGenerated,0);
assert.equal(marked.sourceStatus.independentExecutableFamilies,0);
const replay=buildPhase9Report(args(init,"2026-11-07T13:01:00Z"));
assert.equal(replay.lineage.forwardHeadHash,marked.lineage.forwardHeadHash);
assert.equal(replay.portfolio.indicativeEquityEuro,marked.portfolio.indicativeEquityEuro);
const settled=advance("2026-11-11T13:00:00Z",init.ledger);
assert.equal(settled.summary.closedTrades,1);
const after=buildPhase9Report(args(settled,"2026-11-11T13:01:00Z"));
assert.equal(after.realized.closed,1);
assert.equal(after.realized.wins,1);
assert.equal(after.open.count,0);
assert.equal(after.portfolio.indicativeEquityEuro,after.portfolio.cashEuro);
assert.equal(after.realized.netEuro,settled.summary.realizedNetPnlEuro);
assert.match(formatPhase9Report(after),/Fase 9: controllo operativo/);
assert.match(formatPhase9Report(after),/PAPER certificato: NO/);
assert.throws(()=>buildPhase9Report({...args(init,"2026-11-07T13:00:00Z"),
 independentExecutableEvidence:[{provider:"fake",bid:123}]}),/UNVERIFIED_EXECUTABLE_EVIDENCE/);
assert.throws(()=>buildPhase9Report({...args(init,"2026-11-07T13:00:00Z"),
 phase8:{...evidence(init),eligibleForRealOrders:true}}),/RECONCILIATION/);
assert.throws(()=>buildPhase9Report({...args(init,"2026-11-07T13:00:00Z"),
 forwardLedger:{...init.ledger,headHash:"tampered"}}),/HEAD_MISMATCH/);
const dupHistory=history("2026-11-07T13:00:00Z");
assert.throws(()=>buildPhase9Report(args(init,"2026-11-07T13:00:00Z",[dupHistory,dupHistory])),/DUPLICATE_INSTRUMENT/);
const invalid={...history("2026-11-07T13:00:00Z"),closes:history("2026-11-07T13:00:00Z").closes.map(
 x=>x.observedAt===day("2026-11-06")?{...x,close:-1}:x)};
const missing=buildPhase9Report(args(init,"2026-11-07T13:00:00Z",[invalid]));
assert.equal(missing.open.complete,false);
assert.equal(missing.portfolio.indicativeTotalNetEuro,null);
const provisional={...history("2026-11-07T13:00:00Z"),closes:[
 ...history("2026-11-07T13:00:00Z").closes,{observedAt:day("2026-11-07"),close:999}]};
const filtered=buildPhase9Report(args(init,"2026-11-07T13:00:00Z",[provisional]));
assert.equal(filtered.open.marks[0].markAt,day("2026-11-06"));
assert.equal(filtered.open.marks[0].closeLocal,marked.open.marks[0].closeLocal);
console.log("FENICE Phase9 forward realized/unrealized, hash replay, settled bar and broker isolation: PASS");
