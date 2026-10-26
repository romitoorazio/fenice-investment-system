import assert from "node:assert/strict";
import {newFixturePhaseBLedger,replayFixturePhaseBLedger}
  from "../lib/trading/paper-v7-phase-b-fixture-ledger.mjs";
import {previewV7PhaseBOfflineFixture as preview}
  from "../lib/trading/paper-v7-phase-b-offline-bridge.mjs";
import {readFile} from "node:fs/promises";

const manifest=JSON.parse(await readFile(
  new URL("../data/paper-v7-phase-b-preparation.json",import.meta.url),"utf8"));
const at="2026-10-27T15:30:00.000Z",until="2026-11-19T00:00:00.000Z";
const proof="a".repeat(64);
const ent={status:"VERIFIED",usageScope:"NON_DISPLAY_INTERNAL",
  automatedUseAllowed:true,dualControlVerified:true,
  evidenceRef:"contract://test-only-independent-rights",evidenceSha256:proof,
  validUntil:until};
const instrument={ticker:"ENEL",exchangeMic:"XMIL",currency:"EUR",
  region:"europe",country:"IT",status:"active",assetClass:"equity",
  paperExecutionAllowed:true};
const quote=(vendor,price=290)=>({
  symbol:"ENEL",exchangeMic:"XMIL",currency:"EUR",sourceFamily:vendor,
  provider:vendor,price,observedAt:"2026-10-27T15:29:52.000Z",
  realtime:true,provenanceVerified:true,exactVenueVerified:true,
  entitlement:ent,
});
const observations={
  quotes:[quote("vendor-test-a"),quote("vendor-test-b",290.02)],
  sessions:[{exchangeMic:"XMIL",source:"test-authoritative-venue",
    state:"OPEN",authoritative:true,observedAt:"2026-10-27T15:29:54.000Z"}],
  fx:[],
};
const source=(vendor)=>({
  sourceFamily:vendor,provider:vendor,exchangeMic:"XMIL",currency:"EUR",
  evidenceRef:ent.evidenceRef,evidenceSha256:proof,
  automatedUseAllowed:true,usageScope:"NON_DISPLAY_INTERNAL",
  validUntil:until,
});
const rights={
  sources:[source("vendor-test-a"),source("vendor-test-b")],
  sessions:[{exchangeMic:"XMIL",source:"test-authoritative-venue",
    marketStateEntitled:true,validUntil:until}],
  fx:[],
};
const intent={
  id:"phaseb-fixture-0001",instrumentKey:"XMIL:ENEL",
  side:"BUY",phase:"V7_PHASE_B_TEST_FIXTURE_ONLY",
  proposedNotionalEuro:300,createdAt:"2026-10-27T15:29:45.000Z",
};
const build={instrument,observations,operatorRightsRegistry:rights,
  limits:manifest.proposedRiskLimits,fixtureLedger:newFixturePhaseBLedger(),
  intent,nowIso:at};
const real=preview(build);
assert.equal(real.state,"OFFLINE_FIXTURE_PREVIEW_SIMULATED",JSON.stringify(real));
assert.equal(real.independentProviderFamiliesForFixture,2);
assert.equal(real.fixtureAttempts,1);
assert.equal(real.observedFixtureFills,1);
assert.equal(replayFixturePhaseBLedger(real.candidateFixtureLedger).valid,true);
for (const key of ["legalRightsIndependentlyAttested",
  "canCreateOperationalPaperFill","canQueueRealBrokerOrder",
  "liveTradingAllowed","changesProviderKeys","changesV6"])
  assert.equal(real[key],false,key);
assert.equal(real.genuineOperationalPhaseBFills,0);
assert.equal(real.candidateFixtureLedger.fixtureOnly,true);
assert.equal(real.candidateFixtureLedger.campaignId,"V7_PHASE_B_TEST_FIXTURE_ONLY");
assert.equal(manifest.authorization.approved,false);
assert.equal(manifest.safety.newPaperOrdersAllowed,false);

const checkBlocked=(label,alter,code)=>{
  const x=structuredClone(build);
  alter(x);
  const s=preview(x);
  assert.equal(s.state,"OFFLINE_FIXTURE_BLOCKED",label+" "+JSON.stringify(s));
  assert(s.reasons.includes(code),label+" "+JSON.stringify(s.reasons));
  assert.equal(s.fixtureGenerated,false,label);
  assert.equal(s.genuineOperationalPhaseBFills,0,label);
  assert.equal(s.canCreateOperationalPaperFill,false,label);
  assert.equal(s.canQueueRealBrokerOrder,false,label);
};
checkBlocked("no separately supplied rights",x=>x.operatorRightsRegistry=null,
  "SEPARATE_OPERATOR_RIGHTS_REGISTRY_REQUIRED");
checkBlocked("one quote provider",x=>x.observations.quotes.pop(),
  "WORLD_V7_ENTITLEMENT_VENUE_QUORUM_OR_FX_BLOCKED");
checkBlocked("same provider with fabricated second family",x=>{
  x.observations.quotes[1].provider="vendor-test-a";
  x.operatorRightsRegistry.sources[1].provider="vendor-test-a";
}, "WORLD_V7_ENTITLEMENT_VENUE_QUORUM_OR_FX_BLOCKED");
checkBlocked("unentitled source",x=>x.operatorRightsRegistry.sources=[],
  "WORLD_V7_ENTITLEMENT_VENUE_QUORUM_OR_FX_BLOCKED");
checkBlocked("closed market",x=>x.observations.sessions[0].state="CLOSED",
  "WORLD_V7_ENTITLEMENT_VENUE_QUORUM_OR_FX_BLOCKED");
checkBlocked("authority string instead of boolean",x=>
  x.observations.sessions[0].authoritative="true",
  "WORLD_V7_ENTITLEMENT_VENUE_QUORUM_OR_FX_BLOCKED");
checkBlocked("future quote timestamp",x=>
  x.observations.quotes[0].observedAt="2026-10-27T15:30:01.000Z",
  "WORLD_V7_ENTITLEMENT_VENUE_QUORUM_OR_FX_BLOCKED");
checkBlocked("stale quote",x=>
  x.observations.quotes[0].observedAt="2026-10-27T15:20:00.000Z",
  "WORLD_V7_ENTITLEMENT_VENUE_QUORUM_OR_FX_BLOCKED");
checkBlocked("stale venue",x=>
  x.observations.sessions[0].observedAt="2026-10-27T15:25:00.000Z",
  "WORLD_V7_ENTITLEMENT_VENUE_QUORUM_OR_FX_BLOCKED");
checkBlocked("divergent vendor quotes",x=>
  x.observations.quotes[1].price=350,
  "WORLD_V7_ENTITLEMENT_VENUE_QUORUM_OR_FX_BLOCKED");
checkBlocked("research-only instrument",x=>x.instrument.paperExecutionAllowed=false,
  "INSTRUMENT_NOT_ADMITTED_FOR_FIXTURE_PREVIEW");
checkBlocked("self declared rights in observations",x=>
  x.observations.entitlements=x.operatorRightsRegistry,
  "OBSERVATIONS_CONTAIN_MISSING_OR_FORBIDDEN_FIELDS");
checkBlocked("observer paper autorun injection",x=>
  x.observations.paperRunAuthorized=true,
  "OBSERVATIONS_CONTAIN_MISSING_OR_FORBIDDEN_FIELDS");
checkBlocked("invalid date",x=>x.nowIso="2026-02-30T15:30:00.000Z",
  "INVALID_OFFLINE_CLOCK");
checkBlocked("live phase forged",x=>x.intent.phase="LIVE",
  "INTENT_NOT_ISOLATED_FIXTURE_ONLY");
checkBlocked("budget cap widened",x=>x.limits.maxOrdersPerDay=3,
  "PHASE_B_NUMERIC_BUDGET_OR_ATTEMPT_BLOCKED");
checkBlocked("capital changed",x=>x.limits.virtualStartingCapitalEuro=15000,
  "PHASE_B_NUMERIC_BUDGET_OR_ATTEMPT_BLOCKED");
checkBlocked("duplicate UTC day",x=>{
  x.fixtureLedger=real.candidateFixtureLedger;
  x.intent={...x.intent,id:"phaseb-fixture-0002"};
}, "PHASE_B_NUMERIC_BUDGET_OR_ATTEMPT_BLOCKED");
checkBlocked("tampered prior cash",x=>{
  x.fixtureLedger=structuredClone(real.candidateFixtureLedger);
  x.fixtureLedger.cashEuro=12345;
}, "INVALID_ISOLATED_FIXTURE_LEDGER");

// Bad-price geometry counts as a rejected *fixture* attempt, never a fill.
const poor=preview({...build,
  observations:{...observations,quotes:[
    quote("vendor-test-a",200),quote("vendor-test-b",200.01)]},
  intent:{...intent,id:"phaseb-fixture-0003"},
});
assert.equal(poor.state,"OFFLINE_FIXTURE_PREVIEW_RISK_REJECTED");
assert.equal(poor.fixtureAttempts,1);
assert.equal(poor.observedFixtureFills,0);
assert.equal(poor.genuineOperationalPhaseBFills,0);

// Forwards only TEST-ONLY ledger; public interface never returns an order grant.
console.log("V7 Phase B offline bridge: strict independent quotes, venue, FX, budget, 20 negatives, zero operational fills PASS");
