import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {runDurablePaperShadow} from "../lib/global/durable-paper-shadow.mjs";
import {loadDurableVirtualLedger} from "../lib/global/durable-virtual-ledger.mjs";
const dir=await mkdtemp(join(tmpdir(),"fenice-global-shadow-")),file=join(dir,"shadow.json");
const nowIso="2026-11-06T10:00:00.000Z";
const identity={campaignId:"synthetic-contract",mic:"XMIL",instrumentId:"XMIL:TEST",sessionDate:"2026-11-06",strategyVersion:"v1",signalId:"s1"};
const calendarObservation={mic:"XMIL",zone:"Europe/Rome",sourceId:"synthetic-calendar",authoritative:true,observedAt:"2026-11-06T09:59:30.000Z",tradingDay:true,phase:"CONTINUOUS",opensAt:"2026-11-06T08:00:00.000Z",closesAt:"2026-11-06T16:30:00.000Z"};
const quotes=["a","b"].map((family,i)=>({mic:"XMIL",currency:"EUR",instrumentId:"XMIL:TEST",sourceId:"synthetic-quote-"+family,family,observedAt:"2026-11-06T09:59:30.000Z",bid:100+i*.01,ask:100.1+i*.01}));
const fxEvidence={sourceId:"synthetic-fx",base:"EUR",quote:"EUR",rate:1,observedAt:"2026-11-06T09:59:30.000Z"};
const fill={occurredAt:"2026-11-06T09:59:40.000Z",side:"BUY",price:100.1,quantity:2,fees:1,fxToEur:1};
const input={file,identity,calendarObservation,quotes,fxEvidence,fill,nowIso};
try{
 const first=await runDurablePaperShadow(input);
 assert.equal(first.added,true);assert.equal(first.persisted,true);
 assert.equal(first.evidenceClassification,"SYNTHETIC_TEST_ONLY");assert.equal(first.countsTowardRealPaper,false);
 assert.equal((await loadDurableVirtualLedger(file)).events.length,1);
 const dup=await runDurablePaperShadow(input);assert.equal(dup.added,false);
 const invalid=await runDurablePaperShadow({...input,identity:{...identity,signalId:"s2"},quotes:quotes.map(q=>({...q,verificationStatus:"PROVIDER_RESPONSE_UNVERIFIED"}))});
 assert.equal(invalid.added,false);assert.equal(invalid.reason,"PAPER_UNVERIFIED_PROVIDER_QUOTE");
 assert.equal((await loadDurableVirtualLedger(file)).events.length,1);
}finally{await rm(dir,{recursive:true,force:true});}
console.log("Fenice ONE GLOBAL durable synthetic shadow integration: PASS");
