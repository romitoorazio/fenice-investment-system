import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {runWorldPaperV7} from "../lib/trading/world-paper-v7.mjs";
import {auditOneGlobalStrategyLedger as audit} from "../lib/trading/one-global-strategy-ledger-audit.mjs";

const initial=JSON.parse(readFileSync(new URL("../data/one-global-strategy-paper-ledger.json",import.meta.url),"utf8"));
const firstAt="2026-11-10T14:00:00.000Z";
const nextAt="2026-11-11T14:00:00.000Z";
assert.deepEqual(initial,{cashEuro:1000,positions:{},events:[],lastHash:"GENESIS"});
assert.equal(audit({ledger:null,nowIso:nextAt}).status,"NOT_STARTED");
assert.equal(audit({ledger:initial,nowIso:nextAt}).status,"EMPTY_APPROVAL_REQUIRED");
assert.equal(audit({ledger:initial,nowIso:nextAt}).forwardStrategyCertificationCredit,0);
const listing={ticker:"ENEL",exchangeMic:"XMIL",region:"europe",country:"IT",currency:"EUR",
  assetClass:"equity",status:"active",paperExecutionAllowed:true};
const expires="2026-12-01T00:00:00.000Z";
const e=family=>({sourceFamily:family,provider:family,exchangeMic:"XMIL",currency:"EUR",
  evidenceRef:"test-only-not-a-real-right",evidenceSha256:"a".repeat(64),
  automatedUseAllowed:true,usageScope:"NON_DISPLAY_INTERNAL",validUntil:expires});
const entitlements={sources:[e("alpha"),e("beta")],
  sessions:[{exchangeMic:"XMIL",source:"synthetic-test-clock",
    marketStateEntitled:true,validUntil:expires}],fx:[]};
const market=(at,price)=>({
  sessions:[{exchangeMic:"XMIL",source:"synthetic-test-clock",
    state:"OPEN",authoritative:true,observedAt:new Date(Date.parse(at)-5000).toISOString()}],
  quotes:["alpha","beta"].map((f,i)=>({
    symbol:"ENEL",exchangeMic:"XMIL",currency:"EUR",sourceFamily:f,provider:f,
    price:price+i*.001,observedAt:new Date(Date.parse(at)-10000).toISOString(),
    realtime:true,provenanceVerified:true,exactVenueVerified:true,
    entitlement:{status:"VERIFIED",automatedUseAllowed:true,dualControlVerified:true,
      usageScope:"NON_DISPLAY_INTERNAL",evidenceRef:"test-only-not-a-real-right",
      evidenceSha256:"a".repeat(64),validUntil:expires},
  })),
});
const execute=(nowIso,price,id,side,previousLedger)=>runWorldPaperV7({
  nowIso,instruments:[listing],...market(nowIso,price),entitlements,
  paperRunAuthorized:true,previousLedger,
  intents:[{id,symbol:"ENEL",exchangeMic:"XMIL",side,
    strategyId:"one-global-committee-forward",createdAt:nowIso,
    maxNotionalEuro:side==="BUY"?40:80,approvedForWorldPaper:true,
    fractionalPaperAllowed:true}],
});
const entry=execute(firstAt,10,"oneglobal-"+"b".repeat(24),"BUY",initial);
assert.equal(entry.summary.filledPaperOrders,1,"Test fixture must produce a genuine engine-simulated entry");
assert.equal(entry.paperLedger.events[0].simulated,true);
const exit=execute(nextAt,12.4,"oneglobal-exit-"+"c".repeat(24),"SELL",entry.paperLedger);
assert.equal(exit.summary.filledPaperOrders,1);
assert.equal(exit.paperLedger.positions["XMIL:ENEL"].quantity,0);
const accepted=audit({ledger:exit.paperLedger,nowIso:"2026-11-11T14:05:00.000Z"});
assert.equal(accepted.status,"REPLAY_VALID_UNCERTIFIED");
assert.equal(accepted.valid,true);
assert.equal(accepted.virtualBuys,1);
assert.equal(accepted.virtualSells,1);
assert.equal(accepted.closedVirtualRoundTrips,1);
assert.equal(accepted.distinctVirtualExitMarkets,1);
assert.equal(accepted.distinctVirtualExitDays,1);
assert(accepted.realizedNetEuro>0);
assert.deepEqual(accepted.observedVirtualSourceFamilies,["alpha","beta"]);
assert.equal(accepted.hasIndependentlyAuthenticatedExecutionReceipts,false);
assert.equal(accepted.forwardStrategyCertificationCredit,0);
assert.equal(accepted.liveTradingAllowed,false);
assert.equal(accepted.brokerConnectivityAllowed,false);
assert.equal(audit({ledger:entry.paperLedger,nowIso:nextAt}).closedVirtualRoundTrips,0);
const future=audit({ledger:exit.paperLedger,nowIso:"2026-11-10T15:00:00.000Z"});
assert.equal(future.status,"INVALID");
assert.equal(future.reason,"FUTURE_OR_BACKDATED_STRATEGY_EVENT");
const tampered=structuredClone(exit.paperLedger);tampered.cashEuro+=100;
assert.equal(audit({ledger:tampered,nowIso:nextAt}).status,"INVALID");
const digest=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
const rehash=ledger=>{
  let previous="GENESIS";
  for(const event of ledger.events){
    event.prevHash=previous;
    const body=Object.fromEntries(Object.entries(event).filter(([k])=>k!=="hash"));
    event.hash=digest(body);previous=event.hash;
  }
  ledger.lastHash=previous;
};
const fakeSources=structuredClone(exit.paperLedger);
fakeSources.events[0].evidenceFamilies=["alpha","alpha"];rehash(fakeSources);
assert.equal(audit({ledger:fakeSources,nowIso:nextAt}).reason,"UNATTRIBUTED_VIRTUAL_SOURCE_LABELS",
  "Self-hash cannot turn correlated source labels into independent receipts");

for (const [label, families] of [
  ["case-only duplicate",["alpha","ALPHA"]],
  ["leading-space duplicate",["alpha"," alpha"]],
  ["trailing-space duplicate",["alpha","alpha "]],
  ["case-and-whitespace duplicate",["alpha"," ALPHA "]],
  ["duplicate hidden among three",["alpha","beta","BETA"]],
  ["repeated third family",["alpha","beta","beta"]],
  ["blank family",["alpha","   "]],
  ["embedded whitespace",["alpha","beta provider"]],
  ["control character",["alpha","beta\\n"]],
  ["Unicode lookalike",["alpha","betа"]],
  ["excessive family count",Array.from({length:9},(_,i)=>"provider-"+i)],
]) {
  const forged=structuredClone(exit.paperLedger);
  forged.events[0].evidenceFamilies=families;
  rehash(forged);
  const verdict=audit({ledger:forged,nowIso:nextAt});
  assert.equal(verdict.valid,false,label);
  assert.equal(verdict.reason,"UNATTRIBUTED_VIRTUAL_SOURCE_LABELS",label);
  assert.equal(verdict.forwardStrategyCertificationCredit,0,label);
}
const mixedCaseDistinct=structuredClone(exit.paperLedger);
mixedCaseDistinct.events[0].evidenceFamilies=["Alpha","BETA"];
rehash(mixedCaseDistinct);
const normalized=audit({ledger:mixedCaseDistinct,nowIso:nextAt});
assert.equal(normalized.valid,true,"distinct provider identifiers may use presentation case");
assert.deepEqual(normalized.observedVirtualSourceFamilies,["alpha","beta"]);
assert.equal(normalized.hasIndependentlyAuthenticatedExecutionReceipts,false);
assert.equal(normalized.forwardStrategyCertificationCredit,0);

const fakeStrategy=structuredClone(exit.paperLedger);
fakeStrategy.events[0].intentId="external-paper-buy";rehash(fakeStrategy);
assert.equal(audit({ledger:fakeStrategy,nowIso:nextAt}).reason,"NON_STRATEGY_OR_LIVE_EVENT");
const live=structuredClone(exit.paperLedger);
live.events[0].liveTradingAllowed=true;rehash(live);
assert.equal(audit({ledger:live,nowIso:nextAt}).status,"INVALID");
const noClock=audit({ledger:exit.paperLedger,nowIso:"bad"});
assert.equal(noClock.status,"INVALID");
console.log("PASS ONE GLOBAL forward ledger audit: independently replayable virtual profit/loss and closes, but zero Phase 9 credit, no forged source labels, no broker");
