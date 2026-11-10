import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  selectOneGlobalStrategyIntents,assessOneGlobalStrategyAuthority,evaluateOneGlobalStrategyPaper,
} from "./run-one-global-strategy-paper.mjs";
const read=name=>JSON.parse(readFileSync("data/"+name,"utf8"));
const now="2026-11-10T14:00:00.000Z";
const goodUntil="2026-12-01T00:00:00.000Z";
const MIC="XMIL";
const listing={ticker:"ENEL",exchangeMic:MIC,currency:"EUR",country:"IT",
  region:"europe",status:"active",assetClass:"equity"};
const buyDecision={
  symbol:"ENEL",currency:"EUR",decision:"COMPRA",committeeScore:85,
  confidence:84,riskScore:35,terminalDecision:"ACCUMULA",
  entryPlan:{orderMode:"LIMITE",maxEntryPrice:11,firstTrancheEuro:40},
  buyGapEvidence:{gaps:[],paperExecutionEligible:false},
  priceEvidence:{executionEligible:false,paperCertificationEligible:false},
};
const makeCommittee=(decision=buyDecision)=>({
  generatedAt:now,sourceGate:"GREEN",dataQuality:98,executionGate:"PRONTO_CON_CONFERMA",
  buyCandidateCount:1,allDecisions:[decision],
});
const ownerApproval={
  mode:"ONE_GLOBAL_FORWARD_STRATEGY_PAPER",
  approved:true,humanConfirmation:true,approvedForWorldPaper:true,
  approvalEvidence:{kind:"EXPLICIT_OWNER_CONSENT",reviewedCommit:"a".repeat(40)},
  allowBackfill:false,brokerConnectivityAllowed:false,
  liveTradingAllowed:false,realBrokerOrdersAllowed:false,
  approvedAt:"2026-11-10T10:00:00.000Z",expiresAt:"2026-11-30T00:00:00.000Z",
};
const proof=sourceFamily=>({
  sourceFamily,provider:sourceFamily,exchangeMic:MIC,currency:"EUR",
  evidenceRef:"approval://synthetic-test",evidenceSha256:"b".repeat(64),
  usageScope:"NON_DISPLAY_INTERNAL",automatedUseAllowed:true,validUntil:goodUntil,
});
const entitlement=()=>({
  ...proof("provider-a"),sources:["provider-a","provider-b"].map(proof),
  sessions:[{exchangeMic:MIC,source:"test-exchange-clock",marketStateEntitled:true,validUntil:goodUntil}],
  fx:[],
});
const q=(sourceFamily,price,observedAt="2026-11-10T13:59:50.000Z")=>({
  symbol:"ENEL",exchangeMic:MIC,currency:"EUR",price,sourceFamily,provider:sourceFamily,
  observedAt,realtime:true,provenanceVerified:true,exactVenueVerified:true,
  entitlement:{status:"VERIFIED",usageScope:"NON_DISPLAY_INTERNAL",
    automatedUseAllowed:true,dualControlVerified:true,
    evidenceRef:"approval://synthetic-test",evidenceSha256:"b".repeat(64),
    validUntil:goodUntil},
});
const session=[{exchangeMic:MIC,source:"test-exchange-clock",
  state:"OPEN",authoritative:true,observedAt:"2026-11-10T13:59:55.000Z"}];
const fixture={
  committee:makeCommittee(),instruments:[listing],nowIso:now,authority:ownerApproval,
  sessions:session,quotes:[q("provider-a",10),q("provider-b",10.001)],
  entitlements:entitlement(),fx:[],
};
assert.equal(assessOneGlobalStrategyAuthority(null,now),false);
assert.equal(assessOneGlobalStrategyAuthority(ownerApproval,now),true);
assert.equal(assessOneGlobalStrategyAuthority({...ownerApproval,mode:"PAPER_TECHNICAL_V8"},now),false);
assert.equal(assessOneGlobalStrategyAuthority({...ownerApproval,brokerConnectivityAllowed:true},now),false);
assert.equal(assessOneGlobalStrategyAuthority({...ownerApproval,allowBackfill:true},now),false);
assert.equal(assessOneGlobalStrategyAuthority({...ownerApproval,approvalEvidence:{kind:"SELF_REPORTED"}},now),false);
const plan=selectOneGlobalStrategyIntents(fixture);
assert.equal(plan.buySignals,1);
assert.equal(plan.qualifiedResearchIntents,1);
assert.equal(plan.intents[0].approvedForWorldPaper,false,
  "Adapter MUST NOT approve a committee signal by itself");
assert.equal(plan.intents[0].maxNotionalEuro,40);
const dry=evaluateOneGlobalStrategyPaper({...fixture,authority:null});
assert.equal(dry.cycle.newlySimulatedOrders,0,"No explicit strategy authorization: zero fills");
assert.equal(dry.cycle.cashEuro,1000);
assert.equal(dry.outputPaperLedger.events.length,0);
assert.equal(dry.authorizedForForwardStrategyPaper,false);
const run=evaluateOneGlobalStrategyPaper(fixture);
assert.equal(run.authorizedForForwardStrategyPaper,true);
assert.equal(run.cycle.newlySimulatedOrders,1,"Two independent entitled quote proofs may simulate BUY");
assert.equal(run.cycle.simulatedFills[0].side,"BUY");
assert.equal(run.cycle.simulatedFills[0].key,"XMIL:ENEL");
assert.equal(run.cycle.simulatedFills[0].simulated,true);
assert.equal(run.cycle.simulatedFills[0].liveTradingAllowed,false);
assert.equal(run.outputPaperLedger.events.length,1);
assert(run.outputPaperLedger.cashEuro<1000);
assert(run.outputPaperLedger.cashEuro>=950);
assert.equal(run.realBrokerOrdersAllowed,false);
assert.equal(run.creditTechnicalV8AsStrategy,false);
const duplicate=evaluateOneGlobalStrategyPaper({...fixture,previousLedger:run.outputPaperLedger});
assert.equal(duplicate.cycle.newlySimulatedOrders,0);
assert(duplicate.cycle.rejectedIntents[0].reasons.includes("DUPLICATE_OR_INVALID_INTENT_ID"));
const oneFeed=evaluateOneGlobalStrategyPaper({...fixture,quotes:[q("provider-a",10)]});
assert.equal(oneFeed.cycle.newlySimulatedOrders,0);
const oneProvider=evaluateOneGlobalStrategyPaper({...fixture,quotes:[
  q("provider-a",10),{...q("provider-b",10.001),provider:"provider-a"},
],entitlements:{
  ...fixture.entitlements,sources:fixture.entitlements.sources.map(p=>
    p.sourceFamily==="provider-b"?{...p,provider:"provider-a"}:p),
}});
assert.equal(oneProvider.cycle.newlySimulatedOrders,0);
const noRights=evaluateOneGlobalStrategyPaper({...fixture,entitlements:{sources:[],sessions:[],fx:[]}});
assert.equal(noRights.cycle.newlySimulatedOrders,0);
const closed=evaluateOneGlobalStrategyPaper({...fixture,sessions:session.map(s=>({...s,state:"CLOSED"}))});
assert.equal(closed.cycle.newlySimulatedOrders,0);
const stale=evaluateOneGlobalStrategyPaper({...fixture,quotes:[
  q("provider-a",10,"2026-11-10T13:00:00.000Z"),q("provider-b",10.001)]});
assert.equal(stale.cycle.newlySimulatedOrders,0);
const expensive=evaluateOneGlobalStrategyPaper({...fixture,quotes:[
  q("provider-a",12),q("provider-b",12.001)]});
assert.equal(expensive.cycle.newlySimulatedOrders,0,"Never fill above committee entry limit");
assert(expensive.proposedPaperIntents[0].blockers.includes("LIVE_VERIFIED_PRICE_ABOVE_STRATEGY_ENTRY_LIMIT"));
const noBuy=evaluateOneGlobalStrategyPaper({...fixture,committee:{
  ...makeCommittee(),buyCandidateCount:0,executionGate:"ATTENDERE",
  allDecisions:[{...buyDecision,decision:"ATTENDI"}],
}});
assert.equal(noBuy.cycle.newlySimulatedOrders,0);
assert(noBuy.blockers.includes("NO_COMPRA_DECISIONS"));
assert.equal(selectOneGlobalStrategyIntents({...fixture,committee:{
  ...fixture.committee,generatedAt:"2026-11-08T14:00:00.000Z"}}).qualifiedResearchIntents,0);
assert.equal(selectOneGlobalStrategyIntents({...fixture,committee:{
  ...fixture.committee,sourceGate:"RED"}}).qualifiedResearchIntents,0);
assert.equal(selectOneGlobalStrategyIntents({...fixture,committee:{
  ...fixture.committee,buyCandidateCount:0}}).qualifiedResearchIntents,0);
assert.equal(selectOneGlobalStrategyIntents({...fixture,instruments:[listing,listing]}).qualifiedResearchIntents,0);
assert.equal(selectOneGlobalStrategyIntents({...fixture,committee:makeCommittee({
  ...buyDecision,currency:"USD"})}).qualifiedResearchIntents,0);
assert.equal(selectOneGlobalStrategyIntents({...fixture,committee:makeCommittee({
  ...buyDecision,buyGapEvidence:{gaps:["RISK_TOO_HIGH"]}})}).qualifiedResearchIntents,0);
const altered=structuredClone(run.outputPaperLedger);
altered.cashEuro+=100;
assert.throws(()=>evaluateOneGlobalStrategyPaper({...fixture,previousLedger:altered}),
  /INVALID_WORLD_PAPER_LEDGER/);
const current=evaluateOneGlobalStrategyPaper({
  committee:read("investment-committee.json"),
  instruments:[...read("instrument-master.json").instruments,
    ...read("world-paper-v7-research-seeds.json").instruments],
  nowIso:"2026-11-10T18:23:25.000Z",
});
assert.equal(current.buySignals,0);
assert.equal(current.cycle.newlySimulatedOrders,0);
assert.equal(current.qualifiedMarketListings,0);
assert.equal(current.liveTradingAllowed,false);
assert.equal(current.brokerConnectivityAllowed,false);
console.log("PASS ONE GLOBAL signal-to-PAPER bridge: real repository 0 COMPRA, synthetic buy with licensed dual sources and explicit PAPER-only approval, invalid evidence and duplicates fail closed");
