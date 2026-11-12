import assert from "node:assert/strict";
import {
  newOneGlobalEodPaperLedger,recordOneGlobalEodSignal,
  settleOneGlobalEodSignal,replayOneGlobalEodPaperLedger,
  summarizeOneGlobalEodPaper,validPrivateEodAuthority,
} from "../lib/trading/one-global-eod-paper.mjs";

const i=(n)=>n.toString(16).padStart(64,"0");
const signal=(now,opts={})=>({
  signalId:"fenice-eod-pilot-001",key:"XMIL:ENEL",mic:"XMIL",
  side:"BUY",currency:"EUR",decisionAt:now,
  referenceSessionDate:"2026-11-12",
  referenceCloseAt:"2026-11-12T16:30:00.000Z",
  referencePublishedAt:"2026-11-12T17:00:00.000Z",
  sourceSnapshotHash:i(23),maxNotionalEuro:50,
  strategyReason:"UPTREND_CONFIRMATION",...opts,
});
const atSignal="2026-11-12T18:10:00.000Z";
const atFill="2026-11-13T17:45:00.000Z";
const authority={mode:"ONE_GLOBAL_FORWARD_EOD_PRIVATE_PAPER",
  ownerConsent:true,approvedForVirtualSimulation:true,
  approvalEvidence:{kind:"EXPLICIT_OWNER_CONSENT",reviewedCommit:"a".repeat(40)},
  executionMethod:"NEXT_COMPLETED_SESSION_CLOSE_PLUS_IMPACT",
  allowBackfill:false,liveTradingAllowed:false,brokerConnectivityAllowed:false,
  realBrokerOrdersAllowed:false,strategyPerformanceCertified:false,
  approvedAt:"2026-11-12T18:15:00.000Z",
  expiresAt:"2026-12-12T00:00:00.000Z",
};
const rights=()=>["alpha-one","beta-two"].map((id,j)=>({
  providerId:id,mic:"XMIL",currency:"EUR",evidenceSha256:i(j+1),
  usageScope:"PRIVATE_PERSONAL_PAPER_SIMULATION",
  reviewedByOwner:true,automatedUseAllowed:true,
  validUntil:"2027-01-01T00:00:00.000Z",
}));
const evidence=(priceA=10,priceB=10.002,opts={})=>({
  sessionDate:"2026-11-13",sessionOpenedAt:"2026-11-13T08:00:00.000Z",
  sessionClosedAt:"2026-11-13T16:30:00.000Z",
  providerReceipts:[
    {providerId:"alpha-one",sourceFamily:"alpha-one",key:"XMIL:ENEL",mic:"XMIL",
      currency:"EUR",close:priceA,publishedAt:"2026-11-13T16:38:00.000Z",
      payloadSha256:i(4),simulatedOrSynthetic:false},
    {providerId:"beta-two",sourceFamily:"beta-two",key:"XMIL:ENEL",mic:"XMIL",
      currency:"EUR",close:priceB,publishedAt:"2026-11-13T16:41:00.000Z",
      payloadSha256:i(5),simulatedOrSynthetic:false},
  ],...opts,
});
const start=newOneGlobalEodPaperLedger();
const original=JSON.stringify(start);
assert.equal(start.cashEuro,1000);
assert.equal(replayOneGlobalEodPaperLedger(start).valid,true);
assert.equal(validPrivateEodAuthority(null,atFill),false);
assert.equal(validPrivateEodAuthority(authority,atFill),true);
assert.equal(validPrivateEodAuthority({...authority,realBrokerOrdersAllowed:true},atFill),false);
assert.equal(validPrivateEodAuthority({...authority,allowBackfill:true},atFill),false);
assert.equal(validPrivateEodAuthority({...authority,approvalEvidence:{kind:"BACKTEST"}},atFill),false);
assert.equal(validPrivateEodAuthority({...authority,expiresAt:"2027-04-01T00:00:00.000Z"},atFill),false);
const decision=recordOneGlobalEodSignal({
  previousLedger:start,nowIso:atSignal,signal:signal(atSignal)});
assert.equal(start.events.length,0,"input remains immutable");
assert.equal(JSON.stringify(start),original);
assert.equal(decision.ledger.events.length,1);
assert.equal(decision.ledger.events[0].kind,"SIGNAL");
assert.equal(decision.certified,false);
assert.equal(decision.ledger.phase9Credit,0);
assert.equal(replayOneGlobalEodPaperLedger(decision.ledger).pendingSignals[0],"XMIL:ENEL");
const settleInput={
  previousLedger:decision.ledger,nowIso:atFill,signalHash:decision.signalHash,
  marketEvidence:evidence(),ownerReviewedRights:rights(),authority,
};
const buy=settleOneGlobalEodSignal(settleInput);
assert.equal(buy.ledger.events.length,2);
assert.equal(decision.ledger.events.length,1);
assert.equal(buy.ledger.events[1].side,"BUY");
assert.equal(buy.accounting.virtualBuys,1);
assert.equal(buy.ledger.positions["XMIL:ENEL"].quantity>0,true);
assert.equal(buy.ledger.cashEuro<950,true);
assert.equal(buy.ledger.cashEuro>940,true);
assert.equal(buy.ledger.events[1].notionalEuro<=50.0001,true);
assert.equal(buy.ledger.events[1].feeEuro,1);
assert.equal(buy.ledger.events[1].simulatedExecutionMethod,
  "NEXT_COMPLETED_SESSION_CLOSE_PLUS_IMPACT");
assert.equal(buy.accounting.closedVirtualRoundTrips,0);
assert.equal(buy.accounting.certifiedClosedTrades,0);
assert.equal(buy.accounting.marketDataRightsIndependentlyCertified,false);
assert.equal(buy.ledger.liveTradingAllowed,false);
assert.equal(buy.ledger.brokerConnectivityAllowed,false);
const s1=summarizeOneGlobalEodPaper(buy.ledger);
assert.equal(s1.virtualBuys,1);
assert.equal(s1.pendingSignals,0);
assert.equal(s1.strategyCertified,false);
assert.equal(s1.phase9Credit,0);
const settlementFail=(changes,why)=>assert.throws(()=>
  settleOneGlobalEodSignal({...settleInput,...changes}),/EOD_PAPER_/,why);
settlementFail({authority:null},"unapproved source data must not lead to fills");
settlementFail({authority:{...authority,liveTradingAllowed:true}},"LIVE never authorized");
settlementFail({marketEvidence:evidence(10,12)},"divergent close must be refused");
settlementFail({marketEvidence:evidence(10,10.001,{
  sessionDate:"2026-11-12"})},"same-session close can never fill");
settlementFail({marketEvidence:evidence(10,10.001,{
  sessionOpenedAt:"2026-11-12T18:30:00.000Z"})},
  "can't use a session that started after the decision but before its date");
settlementFail({marketEvidence:evidence(10,10.001,{
  sessionOpenedAt:"2026-11-12T17:00:00.000Z"})},
  "late signals cannot execute on already-open session");
settlementFail({marketEvidence:evidence(10,10.001,{
  providerReceipts:evidence().providerReceipts.map((q,j)=>
    j===1?{...q,providerId:"alpha-one",sourceFamily:"alpha-one"}:q)})},
  "source-family aliases cannot make two sources");
settlementFail({marketEvidence:evidence(10,10.001,{
  providerReceipts:evidence().providerReceipts.map((q,j)=>
    j===1?{...q,sourceFamily:"ALPHA-ONE"}:q)})},
  "case aliases must be deduplicated");
settlementFail({marketEvidence:evidence(10,10.001,{
  providerReceipts:evidence().providerReceipts.map((q,j)=>
    j===1?{...q,simulatedOrSynthetic:true}:q)})},
  "synthetic sources cannot be counted as real providers");
settlementFail({marketEvidence:evidence(10,10.001,{
  providerReceipts:evidence().providerReceipts.map((q,j)=>
    j===1?{...q,simulatedOrSynthetic:undefined}:q)})},
  "lack of explicit provenance is insufficient");
settlementFail({ownerReviewedRights:rights().map((r,j)=>j===1?
  {...r,reviewedByOwner:false}:r)},"unreviewed usage license blocked");
settlementFail({ownerReviewedRights:rights().map((r,j)=>j===1?
  {...r,evidenceSha256:"unverified"}:r)},"invalid rights fingerprint");
settlementFail({marketEvidence:evidence(10,10.001,{
  providerReceipts:evidence().providerReceipts.map((q,j)=>j===0?
    {...q,publishedAt:"2026-11-13T16:20:00.000Z"}:q)})},
  "before-close quote is not a completed close");
settlementFail({nowIso:"2026-11-13T16:20:00.000Z"},
  "no future fill before exchange close");
settlementFail({signalHash:"a".repeat(64)},"no unreviewed signal reuse");
const tampered=structuredClone(buy.ledger);
tampered.events[1].feeEuro=0;
assert.throws(()=>replayOneGlobalEodPaperLedger(tampered),/EOD_PAPER_LEDGER_HASH_OR_CLOCK_INVALID/);
const changedCash=structuredClone(buy.ledger);changedCash.cashEuro=10000;
assert.throws(()=>replayOneGlobalEodPaperLedger(changedCash),/LEDGER_REPLAY_ACCOUNT_MISMATCH/);
const repeated=structuredClone(buy.ledger);
const repeatedSignal=recordOneGlobalEodSignal({
  previousLedger:repeated,nowIso:"2026-11-13T18:10:00.000Z",
  signal:signal("2026-11-13T18:10:00.000Z",{
    signalId:"fenice-eod-exit-0002",side:"SELL",
    strategyReason:"DOWNTREND_EXIT",
    referenceSessionDate:"2026-11-13",
    referenceCloseAt:"2026-11-13T16:30:00.000Z",
    referencePublishedAt:"2026-11-13T17:00:00.000Z",
  }),
});
assert.equal(repeatedSignal.ledger.events.length,3);
assert.equal(repeatedSignal.ledger.events[2].side,"SELL");
const sellEvidence=evidence(10.501,10.502,{
  sessionDate:"2026-11-16",
  sessionOpenedAt:"2026-11-16T08:00:00.000Z",
  sessionClosedAt:"2026-11-16T16:30:00.000Z",
  providerReceipts:evidence(10.501,10.502).providerReceipts.map(q=>({
    ...q,close:q.providerId==="alpha-one"?10.501:10.502,
    publishedAt:"2026-11-16T16:40:00.000Z",
  })),
});
const sell=settleOneGlobalEodSignal({
  previousLedger:repeatedSignal.ledger,
  nowIso:"2026-11-16T17:30:00.000Z",
  signalHash:repeatedSignal.signalHash,marketEvidence:sellEvidence,
  ownerReviewedRights:rights(),authority
});
assert.equal(sell.accounting.virtualSells,1);
assert.equal(sell.accounting.closedVirtualRoundTrips,1);
assert.equal(sell.accounting.realizedNetEuro>0,true);
assert.equal(sell.ledger.positions["XMIL:ENEL"],undefined);
assert.equal(sell.accounting.certifiedClosedTrades,0);
assert.equal(sell.accounting.phase9Credit,0);
assert.equal(sell.ledger.cashEuro>1000,true);
assert.equal(summarizeOneGlobalEodPaper(sell.ledger).strategyCertified,false);
assert.throws(()=>recordOneGlobalEodSignal({
  previousLedger:start,nowIso:atSignal,
  signal:signal(atSignal,{referencePublishedAt:"2026-11-12T20:00:00.000Z"})}),
 /EOD_PAPER_SIGNAL_INVALID_OR_LOOKAHEAD/);
assert.throws(()=>recordOneGlobalEodSignal({
  previousLedger:start,nowIso:atSignal,
  signal:signal(atSignal,{decisionAt:"2026-11-12T15:00:00.000Z"})}),
 /EOD_PAPER_DECISION_NOT_PROSPECTIVE/);
assert.throws(()=>recordOneGlobalEodSignal({
  previousLedger:decision.ledger,nowIso:atSignal,
  signal:signal(atSignal,{signalId:"fenice-eod-repeat-signal"})}),
 /EOD_PAPER_PENDING_SIGNAL_ALREADY_EXISTS/);
// Portfolio applies the same 5% limit to each market, with no US preference.
assert.throws(()=>recordOneGlobalEodSignal({
  previousLedger:start,nowIso:atSignal,
  signal:signal(atSignal,{maxNotionalEuro:250})}),
 /EOD_PAPER_SIGNAL_INVALID_OR_LOOKAHEAD/);
console.log("PASS ONE GLOBAL forward EOD private: signals -> next CLOSE+impact BUY -> EXIT EUR; 2 independent receipts, owner rights, no lookahead, hashed ledger, risk, zero Phase9/Directa LIVE");
