import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {selectEcbAudReference} from "../lib/market/one-global-ecb-aud.mjs";
import {
  newOneGlobalEodPaperLedger,recordOneGlobalEodSignal,
  settleOneGlobalEodSignal,cancelOneGlobalEodInvalidSignal,
  expireOneGlobalEodSignal,replayOneGlobalEodPaperLedger,
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
// Two genuine closes 0.747% apart used to PASS the old per-source-midpoint
// calculation (each provider looked only 0.373% away from the mean).
assert.throws(()=>settleOneGlobalEodSignal({
  ...settleInput,marketEvidence:evidence(10,10.075),
}),/EOD_PAPER_INDEPENDENT_CLOSE_DIVERGENCE/,
  "pairwise divergence greater than 0.5% must be refused");
const withinHalfPercent=settleOneGlobalEodSignal({
  ...settleInput,marketEvidence:evidence(10,10.049),
});
assert.equal(withinHalfPercent.accounting.virtualBuys,1,
  "genuine provider closes within 0.5% must retain a viable PAPER simulation path");
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
const declineSell=settleOneGlobalEodSignal({
  previousLedger:repeatedSignal.ledger,nowIso:"2026-11-16T17:30:00.000Z",
  signalHash:repeatedSignal.signalHash,
  marketEvidence:{...sellEvidence,providerReceipts:sellEvidence.providerReceipts.map((q,j)=>({
    ...q,close:j===0?8:8.002,
  }))},
  ownerReviewedRights:rights(),authority,
});
assert.equal(declineSell.accounting.virtualSells,1,
  "Confirmed downtrend SELL must close an existing PAPER position even at a loss");
assert.equal(declineSell.accounting.closedVirtualRoundTrips,1);
assert(declineSell.accounting.realizedNetEuro<0,"PAPER must account for losses, not only winners");
assert(declineSell.ledger.cashEuro<1000);
assert.equal(declineSell.ledger.positions["XMIL:ENEL"],undefined);
assert.deepEqual(declineSell.ledger.events.slice(0,repeatedSignal.ledger.events.length),
  repeatedSignal.ledger.events,"Original BUY and SELL signal hashes must remain untouched");
assert.equal(declineSell.accounting.phase9Credit,0);
assert.equal(declineSell.accounting.liveTradingAllowed,false);

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
// A late Monday close must never masquerade as Friday's immediately-next
// ASX completed session. Even correctly dated receipts and a re-hashed journal
// would violate the original prospective EOD strategy.
const asxLaterSession={
  ...asxEvidence,
  sessionDate:"2026-11-16",
  sessionOpenedAt:"2026-11-15T23:00:00.000Z",
  sessionClosedAt:"2026-11-16T05:10:00.000Z",
  providerReceipts:asxEvidence.providerReceipts.map(q=>({
    ...q,sessionDate:"2026-11-16",publishedAt:"2026-11-16T05:25:00.000Z",
  })),
};
assert.throws(()=>settleOneGlobalEodSignal({
  ...asxInput,nowIso:"2026-11-16T06:00:00.000Z",
  marketEvidence:asxLaterSession,
}),/EOD_PAPER_NEXT_REGULAR_SESSION_NOT_PROVEN/,
  "CBA pilot must never take Monday as the retroactive Friday close");
// Explicit append-only expiration becomes legal ONLY after the ordinary
// next-session close + 48 hours. It never creates a price or a trade. The
// CBA pilot reference is Thu 12 Nov -> Fri 13 Nov, 16:11 Sydney (05:11Z).
assert.throws(()=>expireOneGlobalEodSignal({
  previousLedger:asxStart.ledger,signalHash:asxStart.signalHash,
  nowIso:"2026-11-15T05:11:00.000Z",
}),/EOD_PAPER_EXPIRY_WINDOW_STILL_OPEN/,
  "do not retire the genuine pending ASX signal before its evidence deadline");
const expiredAsx=expireOneGlobalEodSignal({
  previousLedger:asxStart.ledger,signalHash:asxStart.signalHash,
  nowIso:"2026-11-15T05:11:00.001Z",
});
assert.equal(expiredAsx.ledger.events.length,2);
assert.equal(expiredAsx.ledger.events.at(-1).kind,"EXPIRE");
assert.equal(expiredAsx.ledger.events.at(-1).targetSessionDate,"2026-11-13");
assert.equal(expiredAsx.ledger.events.at(-1).evidenceDeadlineAt,"2026-11-15T05:11:00.000Z");
assert.deepEqual(expiredAsx.pendingSignals,[]);
assert.equal(expiredAsx.ledger.cashEuro,1000);
assert.deepEqual(expiredAsx.ledger.positions,{});
assert.equal(expiredAsx.virtualFillsCreated,0);
assert.equal(asxStart.ledger.events.length,1);
assert.equal(replayOneGlobalEodPaperLedger(expiredAsx.ledger).virtualBuys,0);
assert.throws(()=>expireOneGlobalEodSignal({
  previousLedger:expiredAsx.ledger,signalHash:asxStart.signalHash,
  nowIso:"2026-11-15T06:00:00.000Z",
}),/EOD_PAPER_EXPIRY_SIGNAL_NOT_OPEN/);
assert.throws(()=>settleOneGlobalEodSignal({
  ...asxInput,previousLedger:expiredAsx.ledger,
  nowIso:"2026-11-15T06:10:00.000Z",
}),/EOD_PAPER_SIGNAL_NOT_OPEN/,
  "once expired, even a backdated receipt cannot retroactively fill the signal");
const alteredExpiry=structuredClone(expiredAsx.ledger);
alteredExpiry.events[1].reason="OPERATOR_OVERRIDE";
assert.throws(()=>replayOneGlobalEodPaperLedger(alteredExpiry),
 /EOD_PAPER_LEDGER_HASH_OR_CLOCK_INVALID/);
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

// All twelve wired venues must enforce the SAME immediate-next-weekday
// boundary. These prices, rights and FX records are synthetic fixtures only.
const venues=[
  ['XMIL','EUR','08:00','16:40',0],['XETR','EUR','08:00','16:40',0],
  ['XPAR','EUR','08:00','16:40',0],['XLON','GBP','08:00','16:35',0],
  ['XSWX','CHF','08:00','16:30',0],['XTKS','JPY','00:00','06:30',0],
  ['XHKG','HKD','01:30','08:10',0],['XASX','AUD','22:59','05:11',-1],
  ['XNYS','USD','14:30','21:00',0],['XNAS','USD','14:30','21:00',0],
  ['XJSE','ZAR','07:00','15:00',0],['XSES','SGD','01:00','09:10',0],
];
const shifted=(instant,minutes)=>new Date(Date.parse(instant)+minutes*60000).toISOString();
for(const [mic,currency,open,close,openDayOffset] of venues){
  for(const [refDate,targetDate,lateDate] of [
    ['2026-11-12','2026-11-13','2026-11-16'],
    ['2026-11-13','2026-11-16','2026-11-17'],
    ...(mic==='XMIL'?[['2026-04-02','2026-04-07','2026-04-08']]:[]),
  ]){
    const easter=refDate==='2026-04-02';
    const venueClose=easter?'15:35':close,venueOpen=easter?'07:00':open;
    const refClose=refDate+'T'+venueClose+':00.000Z';
    const decisionAt=shifted(refClose,30),key=mic+':FIXTURE';
    const originalSignal=recordOneGlobalEodSignal({previousLedger:newOneGlobalEodPaperLedger(),
      nowIso:decisionAt,signal:{...signal(decisionAt),signalId:'synthetic-next-'+mic.toLowerCase()+'-'+refDate,
        key,mic,currency,referenceSessionDate:refDate,referenceCloseAt:refClose,
        referencePublishedAt:shifted(refClose,20)}});
    const makeEvidence=day=>{
      const sessionClosedAt=day+'T'+venueClose+':00.000Z';
      return {sessionDate:day,
        sessionOpenedAt:shifted(day+'T'+venueOpen+':00.000Z',openDayOffset*1440),sessionClosedAt,
        providerReceipts:evidence().providerReceipts.map(q=>({...q,key,mic,currency,
          sessionDate:day,publishedAt:shifted(sessionClosedAt,10)}))};
    };
    const fxEvidence=currency==='EUR'?null:{rateToEuro:.5,unitsPerEuro:2,
      source:'ECB_REFERENCE_ONLY',referenceDate:'2026-11-11',
      publishedAt:'2026-11-11T15:00:00.000Z',currency,series:'EXR.D.'+currency+'.EUR.SP00.A'};
    const inputFor=day=>({previousLedger:originalSignal.ledger,
      signalHash:originalSignal.signalHash,nowIso:shifted(day+'T'+venueClose+':00.000Z',30),
      marketEvidence:makeEvidence(day),authority:easter?{...authority,
        approvedAt:'2026-04-01T10:00:00.000Z',expiresAt:'2026-05-01T00:00:00.000Z'}:authority,fxEvidence,
      ownerReviewedRights:rights().map(r=>({...r,mic,currency}))});
    const first=settleOneGlobalEodSignal(inputFor(targetDate));
    assert.equal(first.accounting.virtualBuys,1,mic+' immediate next session remains viable');
    assert.deepEqual(first.ledger.events.slice(0,1),originalSignal.ledger.events);
    assert.equal(first.ledger.liveTradingAllowed,false);
    assert.throws(()=>settleOneGlobalEodSignal(inputFor(lateDate)),
      /EOD_PAPER_NEXT_REGULAR_SESSION_NOT_PROVEN/,mic+' cannot replace the target with a later close');
    // Even a recomputed valid hash and internally matching balances cannot
    // make a later-session FILL pass replay (not just the writer).
    const rewritten=structuredClone(first.ledger),fill=rewritten.events.at(-1);
    const late=makeEvidence(lateDate);
    Object.assign(fill,{sessionDate:late.sessionDate,sessionOpenedAt:late.sessionOpenedAt,
      sessionClosedAt:late.sessionClosedAt,providerReceipts:late.providerReceipts,
      recordedAt:shifted(late.sessionClosedAt,30)});
    const {hash:oldHash,...body}=fill;
    assert.match(oldHash,/^[a-f0-9]{64}$/);
    fill.hash=createHash('sha256').update(JSON.stringify(body)).digest('hex');
    rewritten.lastHash=fill.hash;
    assert.throws(()=>replayOneGlobalEodPaperLedger(rewritten),
      /EOD_PAPER_NEXT_REGULAR_SESSION_NOT_PROVEN/,mic+' rejects rehashed late FILL at replay');
  }
}
console.log("PASS ONE GLOBAL forward EOD: all 12 venues enforce immediate next session in writer and replay; weekend boundaries, original hashes, rights/FX/risk and zero Phase9/Directa LIVE");

// Economic projection: synthetic fixtures only, never campaign evidence.
const {projectR2PaperEconomics}=await import("../lib/ui/r2-paper-economics.mjs");
const emptyEconomics=projectR2PaperEconomics(start);
assert.equal(emptyEconomics.cashEuro,1000);
assert.equal(emptyEconomics.portfolioValueEuro,1000);
assert.equal(emptyEconomics.winRatePercent,null);
assert.equal(emptyEconomics.profitFactor,null);
const openEconomics=projectR2PaperEconomics(buy.ledger);
assert.equal(openEconomics.investedCostEuro,buy.ledger.positions["XMIL:ENEL"].costEuro);
assert.equal(openEconomics.portfolioValueEuro,null);
assert.equal(openEconomics.positions[0].currentUnitEuro,null);
assert.equal(openEconomics.unrealizedNetEuro,null);
assert.equal(openEconomics.feesEuro,1);
assert(openEconomics.estimatedSlippageEuro>0);
for(const fixture of [sell,declineSell]){
  const e=projectR2PaperEconomics(fixture.ledger);
  assert.equal(e.portfolioValueEuro,fixture.ledger.cashEuro);
  assert.equal(e.realizedNetEuro,fixture.accounting.realizedNetEuro);
  assert.equal(e.feesEuro,2);
  assert.equal(e.closedRoundTrips,1);
  assert.equal(e.winRatePercent,fixture.accounting.realizedNetEuro>0?100:0);
  assert.equal(e.profitFactor,fixture.accounting.realizedNetEuro>0?null:0);
  assert.equal(e.maxDrawdownPercent,null);
  assert.equal(e.liveTradingAllowed,false);
}
assert.throws(()=>projectR2PaperEconomics(tampered));
assert.throws(()=>projectR2PaperEconomics(changedCash));
console.log("PASS R2 economic projection: genesis, open, win, loss, tamper, unavailable marks");
