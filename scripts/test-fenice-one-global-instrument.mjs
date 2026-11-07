import assert from "node:assert/strict";
import {evaluateVenueEligibility} from "../lib/global/venue-registry.mjs";
import {evaluateInstrumentEvidence} from "../lib/global/instrument-evidence.mjs";
const nowIso="2026-11-06T10:00:00.000Z";
const session={mic:"XMIL",authoritative:true,state:"OPEN",observedAt:"2026-11-06T09:59:30.000Z",closesAt:"2026-11-06T16:30:00.000Z"};
const quotes=[{mic:"XMIL",instrumentId:"IT0003128367",currency:"EUR",family:"A",observedAt:"2026-11-06T09:59:40.000Z",bid:10,ask:10.01},{mic:"XMIL",instrumentId:"IT0003128367",currency:"EUR",family:"B",observedAt:"2026-11-06T09:59:42.000Z",bid:10.02,ask:10.03}];
const test=(override,expected)=>assert.equal(evaluateInstrumentEvidence({mic:"XMIL",instrumentId:"IT0003128367",session,quotes,nowIso,...override}).reason,expected);
test({},null);
test({instrumentId:""}, "INSTRUMENT_ID_REQUIRED");
test({quotes:[quotes[0],{...quotes[1],instrumentId:"OTHER"}]},"INSTRUMENT_MISMATCH");
test({quotes:[quotes[0],{...quotes[1],bid:12,ask:12.01}]},"PROVIDER_PRICE_DISAGREEMENT");
test({quotes:[quotes[0],{...quotes[1],currency:"USD"}]},"INDEPENDENT_FRESH_QUOTES_MISSING");
test({quotes:[quotes[0],{...quotes[1],family:"A"}]},"INDEPENDENT_FRESH_QUOTES_MISSING");
test({session:{...session,state:"CLOSED"}},"SESSION_NOT_VERIFIED_OPEN");
for(const threshold of [0,1,-1,1.5,NaN,Infinity,"2",null]){
  assert.equal(evaluateVenueEligibility({mic:"XMIL",session,quotes,nowIso,requiredIndependentFamilies:threshold}).reason,"INVALID_INDEPENDENCE_POLICY");
}
assert.equal(evaluateVenueEligibility({mic:"XMIL",session,quotes,nowIso,requiredIndependentFamilies:2}).allowed,true);
assert.equal(evaluateVenueEligibility({mic:"XMIL",session,quotes,nowIso,requiredIndependentFamilies:3}).reason,"INDEPENDENT_FRESH_QUOTES_MISSING");
console.log("Fenice ONE GLOBAL instrument consensus contracts: PASS");
