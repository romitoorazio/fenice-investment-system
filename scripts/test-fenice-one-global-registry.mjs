import assert from "node:assert/strict";
import {VENUES,getVenue,validateVenueRegistry,evaluateVenueEligibility} from "../lib/global/venue-registry.mjs";
assert.equal(validateVenueRegistry(),true);
assert.equal(VENUES.length,9);
assert.equal(getVenue("XMIL").currency,"EUR");
assert.equal(getVenue("NOPE"),null);
const nowIso="2026-11-06T10:00:00.000Z";
const session={mic:"XMIL",authoritative:true,state:"OPEN",observedAt:"2026-11-06T09:59:30.000Z",closesAt:"2026-11-06T16:30:00.000Z"};
const quotes=[{mic:"XMIL",currency:"EUR",family:"provider-a",observedAt:"2026-11-06T09:59:40.000Z",bid:10,ask:10.01},{mic:"XMIL",currency:"EUR",family:"provider-b",observedAt:"2026-11-06T09:59:45.000Z",bid:10,ask:10.02}];
const check=(input,reason)=>assert.equal(evaluateVenueEligibility({mic:"XMIL",session,quotes,nowIso,...input}).reason,reason);
check({},null);
for(const requiredIndependentFamilies of [0,1,-1,1.5,NaN,Infinity,"2",null]){
  check({requiredIndependentFamilies},"INVALID_INDEPENDENT_QUORUM_POLICY");
}
check({session:{...session,state:"CLOSED"}},"SESSION_NOT_VERIFIED_OPEN");
check({session:{...session,authoritative:false}},"SESSION_NOT_VERIFIED_OPEN");
check({session:{...session,observedAt:"2026-11-06T09:55:00.000Z"}},"SESSION_STALE_OR_CLOSING");
check({quotes:[quotes[0]]},"INDEPENDENT_FRESH_QUOTES_MISSING");
check({quotes:[quotes[0],{...quotes[1],family:"provider-a"}]},"INDEPENDENT_FRESH_QUOTES_MISSING");
check({quotes:[quotes[0],{...quotes[1],observedAt:"2026-11-06T10:00:30.000Z"}]},"INDEPENDENT_FRESH_QUOTES_MISSING");
check({quotes:[quotes[0],{...quotes[1],currency:"USD"}]},"INDEPENDENT_FRESH_QUOTES_MISSING");
check({quotes:[quotes[0],{...quotes[1],bid:11,ask:10}]},"INDEPENDENT_FRESH_QUOTES_MISSING");
assert.equal(evaluateVenueEligibility({mic:"UNKNOWN",session,quotes,nowIso}).reason,"UNKNOWN_VENUE");
console.log("Fenice ONE GLOBAL venue registry contract tests: PASS");
