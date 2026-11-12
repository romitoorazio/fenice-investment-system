/**
 * Check the first prospective PAPER research signal against the actual ONE
 * GLOBAL engine. Never reads private prices, consent, brokerage or API keys.
 * This proves a public hash commitment, NOT a fill or an EOD certification.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 newOneGlobalEodPaperLedger,recordOneGlobalEodSignal,
 replayOneGlobalEodPaperLedger,
} from "../lib/trading/one-global-eod-paper.mjs";
const read=path=>JSON.parse(readFileSync(path,"utf8"));
const w=read("data/one-global-first-paper-cba-signal-witness.json");
const research=read("data/one-global-forward-research-ledger.json");
assert.equal(w.schemaVersion,1);
assert.equal(w.kind,"ONE_GLOBAL_FORWARD_EOD_PAPER_SIGNAL_COMMITMENT");
assert.equal(w.scope,"PRIVATE_PAPER_RESEARCH_SIGNAL_ONLY");
assert.equal(w.instrumentKey,"XASX:CBA");
assert.equal(w.exchangeMic,"XASX");
assert.equal(w.currency,"AUD");
assert.equal(w.side,"BUY");
assert.equal(w.strategyReason,"UPTREND_CONFIRMATION");
assert.equal(w.researchAttention,"MOMENTUM_WATCH");
assert.equal(w.committeeBuyQualified,false);
const observation=research.events.find(e=>e.sha256===w.researchObservationHash);
const setup=research.events.find(e=>e.sha256===w.researchRadarEventHash);
assert(observation&&setup,"original real research source events must persist");
assert.equal(observation.kind,"BAR_OBSERVATION");
assert.equal(observation.key,w.instrumentKey);
assert.equal(observation.sourceSnapshotHash,w.sourceSnapshotHash);
assert.equal(observation.currency,w.currency);
assert.equal(observation.recordedAt,w.researchPublishedAt);
assert.equal(observation.paperEligible,false);
assert.equal(setup.kind,"TACTICAL_RESEARCH_SETUP");
assert.equal(setup.key,w.instrumentKey);
assert.equal(setup.observationHash,observation.sha256);
assert.equal(setup.shortAttention,w.researchAttention);
assert.equal(setup.researchOnly,true);
assert.equal(setup.paperEligible,false);
assert(Date.parse(w.researchCloseAt)<Date.parse(w.researchPublishedAt));
assert(Date.parse(w.researchPublishedAt)<Date.parse(w.decisionRecordedAt));
assert(Date.parse(w.decisionRecordedAt)<Date.parse(w.nextExpectedAsxOpening),
 "prospective research intention must have been witnessed before next ASX opening");
assert.equal(w.entryLimitEuro,50);
const original=newOneGlobalEodPaperLedger();
const result=recordOneGlobalEodSignal({
  previousLedger:original,
  nowIso:w.decisionRecordedAt,
  signal:{
    signalId:w.signalId,key:w.instrumentKey,mic:w.exchangeMic,
    side:w.side,currency:w.currency,decisionAt:w.decisionRecordedAt,
    referenceSessionDate:w.researchBarSession,
    referenceCloseAt:w.researchCloseAt,
    referencePublishedAt:w.researchPublishedAt,
    sourceSnapshotHash:w.sourceSnapshotHash,
    maxNotionalEuro:w.entryLimitEuro,strategyReason:w.strategyReason,
  },
});
assert.equal(result.signalHash,w.paperLedgerSignalHash,
 "private first-signal hash MUST match real engine deterministic replay");
assert.equal(result.ledger.lastHash,w.paperLedgerSignalHash);
const verified=replayOneGlobalEodPaperLedger(result.ledger);
assert.equal(verified.valid,true);
assert.equal(verified.pendingSignals.length,1);
assert.deepEqual(verified.pendingSignals,[w.instrumentKey]);
assert.equal(verified.virtualBuys,0);
assert.equal(verified.virtualSells,0);
assert.equal(verified.certifiedClosedTrades,0);
assert.equal(verified.phase9Credit,0);
assert.equal(verified.cashEuro,1000);
assert.equal(original.events.length,0);
assert.equal(w.paperBuyFills,0);
assert.equal(w.paperSellFills,0);
assert.equal(w.certifiedRoundTrips,0);
assert.equal(w.phase9Credit,0);
assert.equal(w.containsOriginalProviderClose,false);
assert.equal(w.containsPrivateConsent,false);
assert.equal(w.brokerConnectivityAllowed,false);
assert.equal(w.liveTradingAllowed,false);
assert.equal(result.ledger.events[0].researchSignalOnly,true);
assert.equal(result.ledger.events[0].sourceRightsIndependentlyCertified,false);
console.log("PASS prospective first PAPER CBA signal hash witness, original prior-world-radar data, no retroactive fills/Directa/Phase9 credit.");
