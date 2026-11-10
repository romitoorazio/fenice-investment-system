import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {appendPhase4Signals} from "../lib/global/phase4-signal-journal.mjs";
import {parseEcb90DayReferenceXml} from "../lib/global/ecb-daily-fx-reference.mjs";
import {advancePhase5ForwardResearch,validatePhase5ForwardLedger} from "../lib/global/phase5-forward-research.mjs";

const sha=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
const at=d=>d+"T08:00:00.000Z";
const days=["2026-10-30","2026-11-02","2026-11-03","2026-11-04","2026-11-05","2026-11-06",
"2026-11-09","2026-11-10","2026-11-11","2026-11-12","2026-11-13","2026-11-16"];
const closes=days.map((d,i)=>({observedAt:at(d),close:100+i*2}));
const h=(currency="EUR",mic="XMIL",instrumentId=mic+":A")=>({currency,mic,instrumentId,sourceUrl:"https://query1.finance.yahoo.com/v8/finance/chart/AAA",synthetic:false,provenanceVerified:false,closes});
const candidates=[{mic:"XMIL",instrumentId:"XMIL:A",observedAt:at("2026-11-02"),
 score:5,dataVerified:false,executable:false}];
const capturedAt="2026-11-02T15:00:00.000Z";
const signals=appendPhase4Signals({candidates,capturedAt}).journal;
const advance=(existing,histories,nowIso,signalJournal=signals,fxReference=null)=>advancePhase5ForwardResearch({existing,signalJournal,histories:histories.map(h=>({...h,closes:h.closes.filter(p=>Date.parse(p.observedAt)<=Date.parse(nowIso))})),nowIso,fxReference});
// No entry on signal day or same-day/unfinished bars.
const zero=advance(null,[h()],"2026-11-03T13:00:00Z");
assert.equal(zero.summary.openedThisRun,0);
assert.equal(zero.summary.closedTrades,0);
assert.equal(zero.summary.ordersGenerated,0);
assert.equal(zero.summary.realPaperCertified,false);
assert.equal(zero.summary.portfolioEquityEuro,1000);
const first=advance(zero.ledger,[h()],"2026-11-04T13:00:00Z");
assert.equal(first.summary.openedThisRun,1);
assert.equal(first.summary.openPositions.length,1);
assert.equal(first.summary.openPositions[0].entryBarAt,at("2026-11-03"));
assert.equal(first.summary.cashEuro<1000,true);
const again=advance(first.ledger,[h()],"2026-11-04T13:01:00Z");
assert.equal(again.summary.openedThisRun,0);
assert.equal(again.ledger.headHash,first.ledger.headHash);
assert.equal(again.ledger.entries.length,1);
// A subsequent five-session close must not be anticipated.
const wait=advance(first.ledger,[h()],"2026-11-09T13:00:00Z");
assert.equal(wait.summary.closedThisRun,0);
const finish=advance(first.ledger,[h()],"2026-11-11T13:00:00Z");
assert.equal(finish.summary.closedThisRun,1);
assert.equal(finish.summary.closedTrades,1);
assert.equal(finish.summary.wins,1);
assert.equal(finish.summary.losses,0);
assert.equal(finish.summary.openPositions.length,0);
assert.equal(finish.summary.portfolioEquityEuro,finish.summary.cashEuro);
const finishAgain=advance(finish.ledger,[h()],"2026-11-11T13:02:00Z");
assert.equal(finishAgain.summary.closedThisRun,0);
assert.equal(finishAgain.ledger.headHash,finish.ledger.headHash);
// A source revision cannot reprice a locked opening.
const revised={...h(),closes:closes.map(p=>p.observedAt===at("2026-11-03")?{...p,close:999}:p)};
const revisedRun=advance(finish.ledger,[revised],"2026-11-11T13:02:00Z");
assert.equal(revisedRun.ledger.headHash,finish.ledger.headHash);
const corrupted=structuredClone(finish.ledger);corrupted.entries[0].event.priceLocal=1;
assert.throws(()=>validatePhase5ForwardLedger(corrupted),/HASH_FAILURE/);
const corruptHead=structuredClone(finish.ledger);corruptHead.headHash="bogus";
assert.throws(()=>validatePhase5ForwardLedger(corruptHead,"2026-11-11T13:03:00Z"),/HEAD_MISMATCH/);
// Historical FX only, never executable and fail closed on unavailable currencies.
const xml=`<?xml version="1.0"?><gesmes:Envelope><gesmes:Sender><gesmes:name>European Central Bank</gesmes:name></gesmes:Sender><Cube><Cube time='2026-11-02'><Cube currency='JPY' rate='160'/></Cube><Cube time='2026-11-03'><Cube currency='JPY' rate='170'/></Cube><Cube time='2026-11-09'><Cube currency='JPY' rate='175'/></Cube></Cube></gesmes:Envelope>`;
const fx=parseEcb90DayReferenceXml(xml);assert.equal(fx.ok,true);
const jpyCandidate={...candidates[0],mic:"XTKS",instrumentId:"XTKS:7203"};
const jpSignals=appendPhase4Signals({candidates:[jpyCandidate],capturedAt}).journal;
const jp=advance(null,[h("JPY","XTKS","XTKS:7203")],"2026-11-04T13:00:00Z",jpSignals,fx);
assert.equal(jp.summary.openedThisRun,1);
assert.equal(jp.summary.openPositions[0].currency,"JPY");
assert.equal(jp.ledger.entries[0].event.fx.eligibleForExecution,false);
assert.equal(jp.ledger.entries[0].event.fx.referenceDate,"2026-11-02");
assert.equal(advance(null,[h("JPY","XTKS","XTKS:7203")],"2026-11-04T13:00:00Z",jpSignals).summary.openedThisRun,0);
// Test protective limits: max three active and 10% of initial virtual cash per entry.
const multi=Array.from({length:6},(_,i)=>({...candidates[0],instrumentId:"XMIL:A"+i,score:6-i}));
const six=appendPhase4Signals({candidates:multi,capturedAt}).journal;
const many=advance(null,multi.map(c=>h("EUR",c.mic,c.instrumentId)),"2026-11-04T13:00:00Z",six);
assert.equal(many.summary.openPositions.length,3);
assert.equal(many.summary.openedThisRun,3);
assert.ok(many.summary.cashEuro>=700);
assert.equal(many.summary.ordersGenerated,0);
// Adversarial accounting: a re-hashed but economically impossible event is rejected.
const forged=structuredClone(first.ledger);forged.entries[0].event.entryCostEuro=1;
forged.entries[0].hash=sha({previousHash:"GENESIS",event:forged.entries[0].event});forged.headHash=forged.entries[0].hash;
assert.throws(()=>validatePhase5ForwardLedger(forged),/ACCOUNTING_FAILURE/);
console.log("FENICE Phase5 persistent forward unverified research: open, close, risk, FX, replay, tamper and no broker: PASS");
