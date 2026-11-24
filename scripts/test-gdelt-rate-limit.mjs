import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const code = readFileSync(new URL("./check-global-sources.mjs", import.meta.url), "utf8");
const start = code.indexOf("async function probe(source)");
const end = code.indexOf("async function probeSources", start);
assert.ok(start >= 0 && end > start);
const source = { id: "gdelt", critical: false, regions: ["global"] };
const now = new Date("2026-11-24T12:00:00Z");
const lastSuccessfulAt = "2026-11-24T11:00:00Z";
async function run(responses, previous, id = "gdelt") {
  const calls = [];
  const sleeps = [];
  const context = {
    now, endpointsFor: () => ["primary", "fallback"],
    request: async (_source, endpoint) => {
      calls.push(endpoint);
      return responses.shift() ?? {ok:false,httpStatus:429,bytes:100,detail:"HTTP 429"};
    },
    redactString: x => x,
    isTransientFailure: (_source, result) => result.httpStatus == null || result.httpStatus === 429 || result.httpStatus >= 500,
    previousSuccessfulSource: () => previous,
    sleep: async ms => { sleeps.push(ms); },
  };
  const probe = vm.runInNewContext(code.slice(start,end) + "\nprobe", context);
  const result = await probe({...source,id});
  return {result,calls,sleeps};
}
const limited = {ok:false,httpStatus:429,bytes:100,detail:"HTTP 429",retryAfterMs:30000};
const success = {ok:true,httpStatus:200,bytes:200,detail:"OK"};
const prior = {lastSuccessfulAt,endpointUsed:"primary"};
const a = await run([limited,success],prior);
assert.equal(a.calls.length,1);
assert.equal(a.sleeps.length,0);
assert.equal(a.result.status,"degraded");
assert.equal(a.result.stale,true);
assert.equal(a.result.lastSuccessfulAt,lastSuccessfulAt);
assert.equal(a.result.httpStatus,429);
const b = await run([limited],null);
assert.equal(b.calls.length,1);
assert.equal(b.result.status,"failed");
const c = await run([success],prior);
assert.equal(c.result.status,"healthy");
assert.equal(c.result.stale,false);
const d = await run([limited,success],prior,"other");
assert.equal(d.calls.length,2);
assert.equal(d.sleeps[0],30000);
assert.equal(d.result.status,"degraded");
const e = await run([{ok:false,httpStatus:503,bytes:999,detail:"HTTP 503"},limited],prior);
assert.equal(e.calls.length,1);
assert.equal(e.result.httpStatus,503);
for (const failure of [
  {ok:false,httpStatus:null,bytes:0,detail:"fetch failed"},
  {ok:false,httpStatus:null,bytes:0,detail:"timeout"},
  {ok:false,httpStatus:403,bytes:100,detail:"HTTP 403"},
]) {
  const observed = await run([failure,success],prior);
  assert.equal(observed.calls.length,1);
  assert.equal(observed.sleeps.length,0);
  assert.equal(observed.result.lastSuccessfulAt,lastSuccessfulAt);
  assert.equal(observed.result.stale,true);
}
const otherTransport = await run([{ok:false,httpStatus:null,bytes:0,detail:"fetch failed"},success],prior,"other");
assert.equal(otherTransport.calls.length,2);
console.log("GDELT shared-quota regression: PASS");
