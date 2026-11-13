import assert from "node:assert/strict";
import {selectEcbAudReference} from "../lib/market/one-global-ecb-aud.mjs";
import {
  newOneGlobalEodPaperLedger,recordOneGlobalEodSignal,
  settleOneGlobalEodSignal,cancelOneGlobalEodInvalidSignal,
  replayOneGlobalEodPaperLedger,
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
      currency:"EUR",sessionDate:"2026-11-13",close:priceA,publishedAt:"2026-11-13T16:38:00.000Z",
      payloadSha256:i(4),simulatedOrSynthetic:false},
    {providerId:"beta-two",sourceFamily:"beta-two",key:"XMIL:ENEL",mic:"XMIL",
      currency:"EUR",sessionDate:"2026-11-13",close:priceB,publishedAt:"2026-11-13T16:41:00.000Z",
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
// A stored research SIGNAL may remain hash-valid, but a late intraday
// decision must never be settled as a previous-close -> next-session EOD fill.
const afterNextOpen="2026-11-12T14:36:22.791Z";
const latePilot=recordOneGlobalEodSignal({
  previousLedger:newOneGlobalEodPaperLedger(),nowIso:afterNextOpen,
  signal:signal(afterNextOpen,{
    signalId:"fenice-eod-late-window-test",
    referenceSessionDate:"2026-11-11",
    referenceCloseAt:"2026-11-11T16:30:00.000Z",
    referencePublishedAt:"2026-11-11T17:00:00.000Z",
  }),
});
assert.equal(replayOneGlobalEodPaperLedger(latePilot.ledger).valid,true);
assert.throws(()=>settleOneGlobalEodSignal({
  ...settleInput,previousLedger:latePilot.ledger,
  signalHash:latePilot.signalHash,
}),/EOD_PAPER_SIGNAL_OUTSIDE_PROSPECTIVE_EOD_WINDOW/,
 "an intraday next-session decision cannot be converted to future EOD PAPER");
assert.throws(()=>recordOneGlobalEodSignal({
  previousLedger:newOneGlobalEodPaperLedger(),nowIso:afterNextOpen,
  signal:signal(afterNextOpen,{
    signalId:"fenice-eod-before-close-test",
    referenceSessionDate:"2026-11-12",
    referenceCloseAt:"2026-11-12T16:30:00.000Z",
    referencePublishedAt:"2026-11-12T17:00:00.000Z",
  }),
}),/EOD_PAPER_SIGNAL_INVALID_OR_LOOKAHEAD/,
 "same-day before-reference-close pilot must remain rejected");
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
    sessionDate:"2026-11-16",publishedAt:"2026-11-16T16:40:00.000Z",
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

// Synthetic ASX/AUD fixture proves that the *first* Australian PAPER trade
// cannot use AUD-per-EUR instead of its mathematical inverse. This is NOT a
// real CBA order, source contract, licensed quote or Phase 9 proof.
const asxSignalAt="2026-11-12T14:14:00.000Z";
const asxStart=recordOneGlobalEodSignal({
  previousLedger:newOneGlobalEodPaperLedger(),nowIso:asxSignalAt,
  signal:{
    signalId:"asx-test-only-momentum-001",key:"XASX:TEST",mic:"XASX",
    side:"BUY",currency:"AUD",decisionAt:asxSignalAt,
    referenceSessionDate:"2026-11-12",
    referenceCloseAt:"2026-11-12T05:10:00.000Z",
    referencePublishedAt:"2026-11-12T05:40:00.000Z",
    sourceSnapshotHash:i(41),maxNotionalEuro:50,
    strategyReason:"UPTREND_CONFIRMATION",
  },
});
const simulatedEcbCsv=[
  "KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE,OBS_STATUS",
  "EXR.D.AUD.EUR.SP00.A,D,AUD,EUR,SP00,A,2026-11-11,1.6100,A",
  "EXR.D.AUD.EUR.SP00.A,D,AUD,EUR,SP00,A,2026-11-12,1.6400,A",
].join("\n")+"\n";
const asxFx=selectEcbAudReference({
  csv:simulatedEcbCsv,sessionDate:"2026-11-13",
  observedAt:"2026-11-12T16:10:00.000Z",
});
const asxEvidence={
  sessionDate:"2026-11-13",
  sessionOpenedAt:"2026-11-12T23:00:00.000Z",
  sessionClosedAt:"2026-11-13T05:10:00.000Z",
  providerReceipts:["alpha-one","beta-two"].map((family,j)=>({
    providerId:family,sourceFamily:family,key:"XASX:TEST",mic:"XASX",
    currency:"AUD",sessionDate:"2026-11-13",
    close:j===0?171.76:171.78,
    publishedAt:j===0?"2026-11-13T05:20:00.000Z":"2026-11-13T05:22:00.000Z",
    payloadSha256:i(j+51),simulatedOrSynthetic:false,
  })),
};
const asxRights=["alpha-one","beta-two"].map((providerId,j)=>({
  providerId,mic:"XASX",currency:"AUD",evidenceSha256:i(j+61),
  usageScope:"PRIVATE_PERSONAL_PAPER_SIMULATION",
  reviewedByOwner:true,automatedUseAllowed:true,
  validUntil:"2027-01-01T00:00:00.000Z",
}));
const asxInput={
  previousLedger:asxStart.ledger,signalHash:asxStart.signalHash,
  marketEvidence:asxEvidence,nowIso:"2026-11-13T06:10:00.000Z",
  ownerReviewedRights:asxRights,authority,fxEvidence:asxFx,
};
const asxBuy=settleOneGlobalEodSignal(asxInput);
assert.equal(asxBuy.accounting.virtualBuys,1);
assert.equal(asxBuy.ledger.events.at(-1).currency,"AUD");
assert.equal(asxBuy.ledger.events.at(-1).fxUnitCurrency,"AUD");
assert.equal(asxBuy.ledger.events.at(-1).fxSeries,"EXR.D.AUD.EUR.SP00.A");
assert.equal(asxBuy.ledger.events.at(-1).fxUnitsPerEuro,1.64);
assert.equal(asxBuy.ledger.events.at(-1).fxRateToEuro,1/1.64);
assert.equal(asxBuy.ledger.events.at(-1).fxReferenceDate,"2026-11-12");
assert(asxBuy.accounting.cashEuro<950);
assert(asxBuy.accounting.cashEuro>940);
assert(asxBuy.ledger.positions["XASX:TEST"].quantity>0);
assert.equal(asxBuy.accounting.certifiedClosedTrades,0);
assert.equal(asxBuy.accounting.phase9Credit,0);
assert.equal(asxBuy.accounting.brokerConnectivityAllowed,false);
assert.throws(()=>settleOneGlobalEodSignal({
  ...asxInput,fxEvidence:{...asxFx,rateToEuro:1.64},
}),/EOD_PAPER_EOD_FX_REFERENCE_MISSING_OR_FUTURE/,
  "AUD/EUR inversion must fail even if the FX metadata claims ECB provenance");
assert.throws(()=>settleOneGlobalEodSignal({
  ...asxInput,fxEvidence:{...asxFx,currency:"USD"},
}),/EOD_PAPER_EOD_FX_REFERENCE_MISSING_OR_FUTURE/);
assert.throws(()=>settleOneGlobalEodSignal({
  ...asxInput,fxEvidence:{...asxFx,series:"EXR.D.USD.EUR.SP00.A"},
}),/EOD_PAPER_EOD_FX_REFERENCE_MISSING_OR_FUTURE/);
assert.throws(()=>settleOneGlobalEodSignal({
  ...asxInput,fxEvidence:{...asxFx,unitsPerEuro:0},
}),/EOD_PAPER_EOD_FX_REFERENCE_MISSING_OR_FUTURE/);


// Regression: the original 12 Nov Banco BPM pilot at 15:36 Milan time is
// invalid for next-session EOD, but an uncancellable pending record would
// permanently starve a new prospective signal for XMIL:BAMI.
const bamiLateAt="2026-11-12T14:36:22.791Z";
const bamiLate=recordOneGlobalEodSignal({
  previousLedger:newOneGlobalEodPaperLedger(),nowIso:bamiLateAt,
  signal:signal(bamiLateAt,{
    signalId:"bami-intraday-pilot-20261112",
    key:"XMIL:BAMI",referenceSessionDate:"2026-11-11",
    referenceCloseAt:"2026-11-11T16:30:00.000Z",
    referencePublishedAt:"2026-11-11T17:00:00.000Z",
  }),
});
assert.deepEqual(replayOneGlobalEodPaperLedger(bamiLate.ledger).pendingSignals,["XMIL:BAMI"]);
const bamiCancelAt="2026-11-13T10:55:00.000Z";
const canceledBami=cancelOneGlobalEodInvalidSignal({
  previousLedger:bamiLate.ledger,nowIso:bamiCancelAt,signalHash:bamiLate.signalHash,
});
assert.equal(canceledBami.ledger.events.length,2);
assert.equal(canceledBami.ledger.events.at(-1).kind,"CANCEL");
assert.equal(canceledBami.ledger.events.at(-1).reason,"INVALID_PROSPECTIVE_EOD_WINDOW");
assert.equal(canceledBami.ledger.cashEuro,1000);
assert.equal(canceledBami.ledger.lastHash!==bamiLate.ledger.lastHash,true);
assert.deepEqual(canceledBami.pendingSignals,[]);
assert.equal(canceledBami.phase9Credit,0);
assert.equal(canceledBami.liveTradingAllowed,false);
assert.equal(bamiLate.ledger.events.length,1);
assert.throws(()=>cancelOneGlobalEodInvalidSignal({
  previousLedger:canceledBami.ledger,nowIso:"2026-11-13T10:56:00.000Z",
  signalHash:bamiLate.signalHash,
}),/EOD_PAPER_INVALID_WINDOW_CANCELLATION_NOT_ALLOWED/);
assert.throws(()=>cancelOneGlobalEodInvalidSignal({
  previousLedger:decision.ledger,nowIso:atFill,signalHash:decision.signalHash,
}),/EOD_PAPER_INVALID_WINDOW_CANCELLATION_NOT_ALLOWED/,
"valid pending signals are never silently canceled");
assert.throws(()=>settleOneGlobalEodSignal({
  ...settleInput,previousLedger:canceledBami.ledger,
  signalHash:bamiLate.signalHash,
  marketEvidence:evidence(10,10.001,{
    providerReceipts:evidence().providerReceipts.map(q=>({...q,key:"XMIL:BAMI"})),
  }),
}),/EOD_PAPER_SIGNAL_NOT_OPEN/,
"canceled signal cannot later be used to create a fake fill");
const bamiFridayAt="2026-11-13T18:10:00.000Z";
const bamiFriday=recordOneGlobalEodSignal({
  previousLedger:canceledBami.ledger,nowIso:bamiFridayAt,
  signal:signal(bamiFridayAt,{
    signalId:"bami-postclose-friday-20261113",
    key:"XMIL:BAMI",referenceSessionDate:"2026-11-13",
    referenceCloseAt:"2026-11-13T16:30:00.000Z",
    referencePublishedAt:"2026-11-13T17:00:00.000Z",
  }),
});
assert.deepEqual(replayOneGlobalEodPaperLedger(bamiFriday.ledger).pendingSignals,["XMIL:BAMI"]);
assert.equal(bamiFriday.ledger.events.length,3);
assert.equal(bamiFriday.ledger.cashEuro,1000);
const corruptedCancellation=structuredClone(canceledBami.ledger);
corruptedCancellation.events[1].reason="OPERATOR_OVERRIDE";
assert.throws(()=>replayOneGlobalEodPaperLedger(corruptedCancellation),
/EOD_PAPER_LEDGER_HASH_OR_CLOCK_INVALID/);

console.log("PASS ONE GLOBAL forward EOD private: signals -> next CLOSE+impact BUY -> EXIT EUR; 2 independent receipts, owner rights, no lookahead, hashed ledger, risk, zero Phase9/Directa LIVE");
