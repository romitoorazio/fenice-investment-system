import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reportV8VirtualPnL,shouldPublishV8VirtualPnL } from "./report-v8-virtual-pnl.mjs";
import { freshExitLedger, recordV8ShadowExit } from "./run-v8-shadow-exits.mjs";
const read=n=>JSON.parse(readFileSync("data/"+n,"utf8"));
const approval=read("paper-v8-technical-approval.json");
const samples=read("paper-v8-technical-samples.json");
const days=read("paper-v8-technical-days.json");
const original={approval,samples,days,exits:freshExitLedger(),nowIso:"2026-11-12T17:00:00.000Z"};
const r=reportV8VirtualPnL(original);
assert.equal(r.certificationCredit,0);
assert.equal(r.phase9CertifiedClosedTrades,0);
assert.equal(r.sampleBuys,samples.events.length);
assert.equal(r.closedTechnicalRoundtrips,0);
assert.equal(r.liveTradingAllowed,false);
assert.equal(r.brokerConnectivityAllowed,false);
assert.equal(r.realizedNetEuro,0);
assert.equal(r.rows.length,samples.events.length);
assert.equal(r.allMarksCurrent,false);
assert(r.rows.some(x=>x.state==="OPEN_MARKED_AS_OF_HISTORICAL_PROOF"));
assert(r.rows.every(x=>x.paperExecutionOnly&&x.certificationCredit===0));
const proof=structuredClone(days.records.at(-1).proof);
const at="2026-11-12T17:01:00.000Z";
proof.capturedAt=at;proof.market.observedAt=at;
proof.market.nextClose="2026-11-12T19:00:00.000Z";
proof.coverage.generatedAt=at;proof.executionReportAt=at;proof.fx.observedAt=at;
for (const p of proof.instruments) for (const q of p.quotes) q.observedAt=at;
const activated={...freshExitLedger(),activatedAt:"2026-11-11T17:00:00.000Z"};
const close=recordV8ShadowExit({approval,samples,days,ledger:activated,proof,nowIso:at});
assert.equal(close.eventsAdded,1);
const p=reportV8VirtualPnL({...original,exits:close.ledger,nowIso:at});
assert.equal(p.closedTechnicalRoundtrips,1);
assert.equal(p.realizedNetEuro,close.realizedPnLEuro);
assert.equal(p.rows.filter(x=>x.realizedPnLEuro!==null).length,1);
assert.equal(p.phase9CertifiedClosedTrades,0);
const forged=structuredClone(samples);forged.cashEuro=999999;
assert.throws(()=>reportV8VirtualPnL({...original,samples:forged}),/TAMPER/);
const broker=structuredClone(approval);broker.liveTradingAllowed=true;
assert.throws(()=>reportV8VirtualPnL({...original,approval:broker}),/TAMPER/);
// Repeated closed-market trigger cannot create a new main data commit purely
// from generatedAt or proof-age minute drift. Freshness status changes, source
// evidence, EUR gain/loss or exits MUST remain publishable.
const laterSame=structuredClone(r);
laterSame.generatedAt="2026-11-12T17:02:00.000Z";
for(const row of laterSame.rows)
  if(Number.isInteger(row.proofAgeMinutes))row.proofAgeMinutes+=2;
assert.equal(shouldPublishV8VirtualPnL({previous:r,next:laterSame}),false,
 "Time-only churn wastes GitHub writers and never improves market evidence");
assert.equal(shouldPublishV8VirtualPnL({previous:r,next:r}),false);
assert.equal(shouldPublishV8VirtualPnL({previous:null,next:r}),true);
const becameFresh=structuredClone(laterSame);
becameFresh.rows.find(x=>x.state==="OPEN_MARKED_AS_OF_HISTORICAL_PROOF").isFreshNow=true;
assert.equal(shouldPublishV8VirtualPnL({previous:r,next:becameFresh}),true,
 "Change in real freshness state must update the persisted report");
const sourceChanged=structuredClone(laterSame);
sourceChanged.rows.find(x=>x.sourceDayHash).sourceDayHash="a".repeat(64);
assert.equal(shouldPublishV8VirtualPnL({previous:r,next:sourceChanged}),true);
assert.equal(shouldPublishV8VirtualPnL({previous:r,next:p}),true,
 "A genuine NEW prospective technical exit must update realized EUR gain/loss");
const newPnl=structuredClone(laterSame);newPnl.realizedNetEuro=-99;
assert.equal(shouldPublishV8VirtualPnL({previous:r,next:newPnl}),true,
 "Negative results must never be suppressed by no-op filtering");
const unsafe=structuredClone(laterSame);unsafe.liveTradingAllowed=true;
assert.throws(()=>shouldPublishV8VirtualPnL({previous:r,next:unsafe}),
 /V8_PNL_PUBLICATION_UNSAFE_RESULT/);
const unsafePrevious=structuredClone(r);unsafePrevious.brokerConnectivityAllowed=true;
assert.throws(()=>shouldPublishV8VirtualPnL({previous:unsafePrevious,next:laterSame}),
 /V8_PNL_PRIOR_REPORT_SAFETY_TAMPER/);
const backwards=structuredClone(laterSame);
backwards.generatedAt="2026-11-11T17:02:00.000Z";
assert.throws(()=>shouldPublishV8VirtualPnL({previous:r,next:backwards}),
 /V8_PNL_PUBLICATION_CLOCK_REGRESSION/);
console.log("PASS EUR technical virtual PnL: audited closed/open distinction, historical marks, gain/loss, no strategy credit");
