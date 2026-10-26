import assert from "node:assert/strict";
import { newFixturePhaseBLedger as empty, replayFixturePhaseBLedger as replay,
  appendFixturePhaseBProbe as append } from "../lib/trading/paper-v7-phase-b-fixture-ledger.mjs";
const t="2026-10-27T15:30:00.000Z";
const x=empty();
assert.equal(x.seedCashEuro,10000);
assert.equal(x.cashEuro,10000);
assert.equal(x.campaignId,"V7_PHASE_B_TEST_FIXTURE_ONLY");
assert.equal(replay(x).valid,true);
const make=(id="phaseb-0001",at=t,key="ARCX:SPY",size=300)=>({
  id,instrumentKey:key,phase:"V7_PHASE_B_TEST_FIXTURE_ONLY",
  side:"BUY",proposedNotionalEuro:size,
  createdAt:new Date(Date.parse(at)-20000).toISOString(),
});
const run=(ledger,id,at,key="ARCX:SPY",quote=290,size=300)=>
  append(ledger,{nowIso:at,intent:make(id,at,key,size),verifiedQuoteEuro:quote});
const first=run(x,"phaseb-0001",t);
assert.equal(first.status,"TEST_FIXTURE_SIM_FILL",JSON.stringify(first));
assert.equal(replay(first.ledger).valid,true);
assert.equal(first.ledger.attempts.length,1);
assert.equal(first.ledger.positions["ARCX:SPY"].quantity,1);
assert(first.ledger.cashEuro < 10000);
assert.equal(first.genuineOperationalPhaseBFills,0);
assert.equal(first.brokerSubmissionAllowed,false);
assert.equal(first.liveTradingAllowed,false);
assert.equal(replay(first.ledger).summary.genuineOperationalPhaseBFills,0);
assert.equal(run(first.ledger,"phaseb-0002",t).status,"BLOCKED_ONE_PER_UTC_DAY");
assert.equal(run(first.ledger,"phaseb-0001","2026-10-28T15:30:00.000Z").status,"BLOCKED_DUPLICATE_INTENT");
assert.equal(run(x,"phaseb-0002","2026-10-27T15:29:00.000Z","ARCX:SPY",400).status,
  "BLOCKED_INVALID_FIXTURE_INPUT");
assert.equal(run(x,"phaseb-0002",t,"ARCX:SPY",290,249).status,"BLOCKED_INVALID_FIXTURE_INPUT");
assert.equal(run(x,"phaseb-0002",t,"ARCX:SPY",350).status,
  "TEST_FIXTURE_RISK_REJECTED","too-expensive whole share cannot fake a >300 fill");
const pending=run(x,"phaseb-0002",t,"ARCX:SPY",200);
assert.equal(pending.status,"TEST_FIXTURE_RISK_REJECTED");
assert.equal(pending.ledger.attempts.length,1,"risk-rejected eligible attempt still counts");
assert.equal(replay(pending.ledger).summary.fixtureFills,0);
assert.equal(run(pending.ledger,"phaseb-0003",t).status,"BLOCKED_ONE_PER_UTC_DAY");
assert.equal(append(x,{nowIso:t,intent:{...make(),createdAt:"2026-10-27T15:30:01.000Z"},verifiedQuoteEuro:290}).status,
  "BLOCKED_INVALID_INTENT_TIME");
assert.equal(append(x,{nowIso:t,intent:{...make(),createdAt:"2026-02-30T15:29:30.000Z"},verifiedQuoteEuro:290}).status,
  "BLOCKED_INVALID_INTENT_TIME");
assert.equal(append(x,{nowIso:t,intent:{...make(),createdAt:"2026-10-27T15:29:00"},verifiedQuoteEuro:290}).status,
  "BLOCKED_INVALID_INTENT_TIME");
assert.equal(run(x,"phaseb-0002","2026-10-27").status,"BLOCKED_INVALID_INTENT_TIME");
const history=structuredClone(first.ledger);
history.cashEuro=10000;
assert.equal(replay(history).valid,false,"cannot fabricate virtual cash");
history.cashEuro=first.ledger.cashEuro;
history.positions["ARCX:SPY"].quantity=20;
assert.equal(replay(history).valid,false,"cannot fabricate quantity");
history.positions["ARCX:SPY"].quantity=1;
history.attempts[0].feeEuro=0;
assert.equal(replay(history).valid,false,"tampered fee/hash rejected");
const fake=structuredClone(first.ledger);
fake.lastHash="a".repeat(64);
assert.equal(replay(fake).valid,false);
const fakeTime=structuredClone(first.ledger);
fakeTime.attempts[0].occurredAt="2026-11-28T15:30:00.000Z";
assert.equal(replay(fakeTime).valid,false,"rehash missing");
const fakeCampaign=structuredClone(first.ledger);
fakeCampaign.campaignId="REAL_PHASE_B";
assert.equal(replay(fakeCampaign).valid,false,"test fixture cannot masquerade as certifying ledger");
const fakeAuthorization=structuredClone(first.ledger);
fakeAuthorization.authorizedForOperationalPaper=true;
assert.equal(replay(fakeAuthorization).valid,false);
const filledDates=Array.from({length:20},(_,i)=>new Date(Date.UTC(2026,9,27+i,15,30)).toISOString());
let cap=empty();
for(let i=0;i<20;i++){
  const m=run(cap,"phaseb-cap-"+String(i).padStart(4,"0"),filledDates[i],"ARCX:SPY",290);
  assert(["TEST_FIXTURE_SIM_FILL","TEST_FIXTURE_RISK_REJECTED"].includes(m.status),JSON.stringify(m));
  cap=m.ledger;
}
assert.equal(cap.attempts.length,20);
assert.equal(replay(cap).valid,true);
assert.equal(run(cap,"phaseb-cap-0020","2026-11-17T15:30:00.000Z").status,
  "BLOCKED_MAX_20_ATTEMPTS");
assert(replay(cap).summary.fixtureFills <=5,"15%-of-10k concentration cap");
assert.equal(replay(cap).summary.genuineOperationalPhaseBFills,0);
assert.equal(replay(cap).summary.liveOrders,0);
assert.equal(replay(cap).summary.brokerOrders,0);
assert.equal(replay({...x,cashEuro:0}).valid,false);
assert.equal(replay({...x,seedCashEuro:1000}).valid,false);
assert.equal(replay({...x,attempts:[{status:"PAPER_FILLED"}]}).valid,false);
console.log("V7 Phase B fixture journal replay, 10k virtual capital, 3% size, 1/day/20, tamper fail closed: PASS");
