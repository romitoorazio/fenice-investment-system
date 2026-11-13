/** Fase 2: reproducible synthetic-only end-to-end closure proof. Never real PAPER certification. */
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {runDurablePaperShadow} from "../lib/global/durable-paper-shadow.mjs";
import {loadDurableVirtualLedger} from "../lib/global/durable-virtual-ledger.mjs";
import {summarizeVirtualPaperLedger} from "../lib/global/virtual-accounting.mjs";
import {replayVirtualLedger} from "../lib/global/virtual-ledger.mjs";
const dir=await mkdtemp(join(tmpdir(),"fenice-phase2-synthetic-"));
const file=join(dir,"ledger.json");
const nowIso="2026-11-06T10:00:00.000Z";
const identity={campaignId:"PHASE2_SYNTHETIC_ONLY",mic:"XMIL",instrumentId:"XMIL:TEST",sessionDate:"2026-11-06",strategyVersion:"phase2-e2e-v1",signalId:"buy-1"};
const calendarObservation={mic:"XMIL",zone:"Europe/Rome",sourceId:"synthetic-calendar",authoritative:true,observedAt:"2026-11-06T09:59:30.000Z",tradingDay:true,phase:"CONTINUOUS",opensAt:"2026-11-06T08:00:00.000Z",closesAt:"2026-11-06T16:30:00.000Z"};
const quotes=["a","b"].map((family,i)=>({mic:"XMIL",currency:"EUR",instrumentId:"XMIL:TEST",sourceId:"synthetic-quote-"+family,family,observedAt:"2026-11-06T09:59:30.000Z",bid:100+i*.01,ask:100.1+i*.01}));
const fxEvidence={sourceId:"synthetic-fx",base:"EUR",quote:"EUR",rate:1,observedAt:"2026-11-06T09:59:30.000Z"};
const fill={occurredAt:"2026-11-06T09:59:40.000Z",side:"BUY",price:100.1,quantity:2,fees:1,fxToEur:1};
const base={file,identity,calendarObservation,quotes,fxEvidence,nowIso,initialCapitalEur:1000,feeCurrency:"QUOTE_CURRENCY"};
try {
 const buy=await runDurablePaperShadow({...base,fill});
 assert.equal(buy.added,true);assert.equal(buy.persisted,true);assert.equal(buy.countsTowardRealPaper,false);
 const duplicate=await runDurablePaperShadow({...base,fill});
 assert.equal(duplicate.added,false);assert.equal(duplicate.reason,"DUPLICATE_PAPER_SIGNAL");
 const sell=await runDurablePaperShadow({...base,identity:{...identity,signalId:"sell-1"},fill:{...fill,side:"SELL",price:100.01,quantity:2,occurredAt:"2026-11-06T09:59:41.000Z"}});
 assert.equal(sell.added,true);assert.equal(sell.persisted,true);assert.equal(sell.countsTowardRealPaper,false);
 const ledger=await loadDurableVirtualLedger(file);
 assert.equal(replayVirtualLedger(ledger).valid,true);
 const accounting=summarizeVirtualPaperLedger({ledger,initialCapitalEur:1000,feeCurrency:"QUOTE_CURRENCY",expectedCampaignId:identity.campaignId});
 assert.equal(accounting.ok,true);
 assert.equal(accounting.eventCount,2);
 assert.equal(accounting.positions.length,0);
 assert.equal(accounting.realizedNetPnlEur,-2.18);
 assert.equal(accounting.bookEquityEur,997.82);
 assert.equal(accounting.investmentPerformanceCertified,false);
 const report={phase:"2",closure:"SYNTHETIC_TECHNICAL_ONLY",passed:true,realSourcePaperCertified:false,liveTradingAllowed:false,brokerConnectivityAllowed:false,venue:"XMIL",syntheticSignals:2,duplicateBlocked:true,ledgerReplayVerified:true,initialCapitalEur:1000,realizedNetPnlEur:accounting.realizedNetPnlEur,bookEquityEur:accounting.bookEquityEur,openPositions:0,remainingForRealPaper:["INDEPENDENT_EXECUTABLE_QUOTES","AUTHORITATIVE_VENUE_CALENDAR","REAL_SOURCE_FX_AND_FILL_ATTESTATION","SCHEDULED_REAL_SOURCE_PAPER"]};
 console.log(JSON.stringify(report,null,2));
}finally{await rm(dir,{recursive:true,force:true});}
