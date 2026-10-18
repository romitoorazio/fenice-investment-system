import assert from "node:assert/strict";
import {inspectBrowserStatus as check} from "../lib/ui/directa-browser-status.ts";
const now=Date.parse("2026-10-18T18:40:00.000Z");
const base={version:1,plane:"LOCAL_READ_ONLY",updatedAt:new Date(now-1000).toISOString(),snapshotGeneratedAt:new Date(now-2000).toISOString(),state:"CURRENT_COMPLETE",snapshotState:"CURRENT_COMPLETE",comparison:"MATCHED_UNCERTIFIED",connectionHealthy:true,positionsObserved:0,ordersObserved:0,comparisonBreakCount:0,failures:[],diagnosticOnly:true,brokerReconciliationVerified:false,brokerWritesAuthorized:false,liveTradingAllowed:false,sentToCloud:false};
assert.equal(check(base,now).reason,"OK");
assert.equal(check(base,now+36000).reason,"STALE");
assert.equal(check(base,now-2000).reason,"STALE");
for(const x of [{...base,account:{liquidity:1000}},{...base,brokerWritesAuthorized:true},{...base,sentToCloud:true},{...base,liveTradingAllowed:true},{...base,comparison:"CERTIFIED"},{...base,failures:["ACCOUNT_ID"]},{...base,updatedAt:"2026-10-18"},{...base,ordersObserved:-1},null]){
  assert.equal(check(x,now).reason,"INVALID");
}
assert.equal(check({...base,state:"READ_FAILED",snapshotState:"NOT_CURRENT_COMPLETE",connectionHealthy:false,comparison:"NOT_PERFORMED",snapshotGeneratedAt:null,ordersObserved:null,positionsObserved:null,comparisonBreakCount:null},now).reason,"OK");
console.log("Directa browser local status tests: PASS");
