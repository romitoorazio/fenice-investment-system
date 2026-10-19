import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const d=JSON.parse(await readFile(new URL("../data/world-equity-funnel-status.json",import.meta.url),"utf8"));
const n=v=>Number.isSafeInteger(v)&&v>=0;
assert(["AWAITING_FIRST_PROVIDER_SCAN","REFERENCE_SCREEN_ONLY"].includes(d.status));
assert.equal(d.source,"twelve-data-stock-reference");
for(const k of ["read","common","accepted","selected","countries","regions"])assert(n(d[k]));
assert(n(d.limit)&&d.limit>0&&d.limit<=2000);
assert(d.selected<=d.accepted&&d.accepted<=d.common&&d.common<=d.read&&d.selected<=d.limit);
assert(d.regions<=5);
assert.equal(Object.values(d.byRegion).reduce((n,r)=>n+r.selected,0),d.selected);
assert.equal(Object.values(d.byRegion).reduce((n,r)=>n+r.total,0),d.accepted);
assert.equal(d.safety.researchOnly,true);
assert.equal(d.safety.paperAllowed,false);
assert.equal(d.safety.liveAllowed,false);
assert.equal(d.safety.brokerOrderAllowed,false);
assert.equal(d.safety.changesPaperV6,false);
assert.equal("references" in d,false);
assert.equal("price" in d,false);
if(d.status==="REFERENCE_SCREEN_ONLY"){
 assert(d.read>=1000&&d.selected>=100);
 assert(typeof d.generatedAt==="string"&&new Date(d.generatedAt).toISOString()===d.generatedAt);
}
console.log("FENICE public world equity summary locked/research-only: PASS");
