import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { freshExitLedger, replayShadowExits, recordV8ShadowExit } from "./run-v8-shadow-exits.mjs";

const read = name => JSON.parse(readFileSync("data/"+name, "utf8"));
const approval = read("paper-v8-technical-approval.json");
const samples = read("paper-v8-technical-samples.json");
const days = read("paper-v8-technical-days.json");
const seed = freshExitLedger();
const base = {samples,days,approval};
const check = ledger => replayShadowExits({...base,ledger});
const now1 = "2026-11-12T17:00:00.000Z";
const now2 = "2026-11-13T17:00:00.000Z";
const proofFor = at => {
  const p = structuredClone(days.records.at(-1).proof);
  p.capturedAt=at;
  p.market.observedAt=at;
  p.market.nextClose=new Date(Date.parse(at)+3600000).toISOString();
  p.coverage.generatedAt=at;
  p.executionReportAt=at;
  p.fx.observedAt=at;
  for (const row of p.instruments)
    for (const quote of row.quotes) quote.observedAt=at;
  return p;
};
assert.equal(check(seed).valid,true);
assert.equal(seed.activatedAt,null);
const activation=recordV8ShadowExit({...base,ledger:seed,nowIso:now1,proof:proofFor(now1)});
assert.equal(activation.status,"ACTIVATED_NO_BACKFILL");
assert.equal(activation.eventsAdded,0);
assert.equal(activation.ledger.events.length,0);
assert.equal(check(activation.ledger).valid,true);
const nextTime="2026-11-12T17:01:00.000Z";
const first = recordV8ShadowExit({...base,ledger:activation.ledger,nowIso:nextTime,
  proof:proofFor(nextTime)});
assert.equal(first.status,"TECHNICAL_EXIT_RECORDED");
assert.equal(first.eventsAdded,1);
assert.equal(first.ledger.events.length,1);
assert.equal(check(first.ledger).valid,true);
assert.equal(check(first.ledger).closedTechnicalRoundtrips,1);
assert.equal(first.ledger.events[0].certificationCredit,0);
assert.equal(first.ledger.events[0].strategySignalCertified,false);
assert.equal(first.ledger.liveTradingAllowed,false);
assert.equal(first.ledger.brokerConnectivityAllowed,false);
assert.equal(first.ledger.events[0].entryEventId,samples.events[0].id);
assert.equal(first.ledger.events[0].side,"SELL");
assert.equal(first.ledger.events[0].market,"US_EQUITIES");
const duplicate=recordV8ShadowExit({...base,ledger:first.ledger,nowIso:"2026-11-12T17:02:00.000Z",
  proof:proofFor("2026-11-12T17:02:00.000Z")});
assert.equal(duplicate.eventsAdded,0);
assert.equal(duplicate.reason,"EXIT_ALREADY_RECORDED_TODAY");
const second=recordV8ShadowExit({...base,ledger:first.ledger,nowIso:now2,
  proof:proofFor(now2)});
assert.equal(second.eventsAdded,1);
assert.equal(second.ledger.events.length,2);
assert.equal(check(second.ledger).valid,true);
assert.equal(check(second.ledger).distinctExitDays,2);
const tampered=structuredClone(first.ledger);
tampered.events[0].realizedPnLEuro=1000000;
assert.equal(check(tampered).valid,false);
const live=structuredClone(first.ledger);
live.brokerConnectivityAllowed=true;
assert.equal(check(live).valid,false);
const fakeEntry=structuredClone(first.ledger);
fakeEntry.events[0].entryEventHash="f".repeat(64);
assert.equal(check(fakeEntry).valid,false);
const fakeQuote=structuredClone(first.ledger);
fakeQuote.events[0].exitProof.instruments[0].quotes[0].price=1;
assert.equal(check(fakeQuote).valid,false);
const changedSource=structuredClone(first.ledger);
changedSource.events[0].exitProof.instruments[0].quotes[0].sourceFamily="yahoo";
assert.equal(check(changedSource).valid,false);
const unknownSample=structuredClone(first.ledger);
unknownSample.events[0].entryEventId="fabricated";
assert.equal(check(unknownSample).valid,false);
const stale=recordV8ShadowExit({...base,ledger:activation.ledger,nowIso:"2026-11-14T17:00:00.000Z",
  proof:proofFor(now2)});
assert.equal(stale.eventsAdded,0);
const zero=recordV8ShadowExit({...base,ledger:activation.ledger,
  nowIso:"2026-11-12T17:00:05.000Z",proof:null});
assert.equal(zero.eventsAdded,0);
assert.equal(check(zero.ledger).valid,true);
assert.equal(check(first.ledger).scope,"NOT_PHASE9_CERTIFIED");
console.log("PASS V8 forward technical exits: 17 evidence/safety checks, genuine prospective timestamps, EUR fee-aware PnL, broker OFF, no Phase9 credit");
