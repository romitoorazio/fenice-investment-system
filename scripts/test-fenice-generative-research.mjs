import assert from "node:assert/strict";
import {
  FENICE_GENERATIVE_MODEL,
  FENICE_AI_MAX_RESPONSE_TOKENS,
  generativeAvailability,
  isOwnerAuthorized,
  canGenerateResearch,
  buildGenerativeMessages,
  cleanGenerativeExplanation,
  generateGroundedExplanation,
} from "../lib/ai/fenice-generative-research.ts";

const ownerToken = "Fenice-owner-token-test-only-NOT-PRODUCTION";
const openaiToken = "sk-proj-test-not-real-key-0123456789";
const readyEnv = {
  FENICE_GENERATIVE_AI_ENABLED: "true",
  FENICE_AI_MANUAL_ONLY: "true",
  FENICE_AI_OWNER_TOKEN: ownerToken,
  OPENAI_API_KEY: openaiToken,
};
assert.equal(generativeAvailability({}), "FEATURE_DISABLED");
assert.equal(generativeAvailability({ ...readyEnv, FENICE_GENERATIVE_AI_ENABLED: "false" }), "FEATURE_DISABLED");
assert.equal(generativeAvailability({ ...readyEnv, FENICE_AI_MANUAL_ONLY: undefined }), "MANUAL_ONLY_NOT_CONFIRMED");
assert.equal(generativeAvailability({ ...readyEnv, FENICE_AI_OWNER_TOKEN: "short" }), "ACCESS_NOT_CONFIGURED");
assert.equal(generativeAvailability({ ...readyEnv, OPENAI_API_KEY: "" }), "OPENAI_NOT_CONFIGURED");
assert.equal(generativeAvailability(readyEnv), "READY");
assert.equal(isOwnerAuthorized(ownerToken, readyEnv.FENICE_AI_OWNER_TOKEN), true);
assert.equal(isOwnerAuthorized("wrong-but-long-token-not-the-same-xxxxxxx", ownerToken), false);
assert.equal(isOwnerAuthorized("", ownerToken), false);

const now = Date.parse("2026-10-11T18:00:00.000Z");
const grounded = {
  intent: "SYMBOL",
  verdict: "ATTENDERE",
  title: "Fenice analizza ASML",
  paragraphs: ["ASML: decisione finale OSSERVA; tecnico ACCUMULA.", "NON COMPRARE.", "Bear case: valutazione non verificata."],
  blockers: ["Nessun ingresso verificato.", "Trading reale bloccato."],
  evidence: [
    { label: "Decisione finale", value: "OSSERVA", source: "data/investment-committee.json" },
    { label: "Calibrazione", value: "INSUFFICIENT", source: "data/calibration-analysis.json" },
  ],
  sourceTimestamp: "2026-10-11T17:45:00.000Z",
  generatedAt: "2026-10-11T18:00:00.000Z",
  providerCalls: 0,
  evidenceQualityVerified: true,
  generativeModelConnected: false,
  brokerOrderAllowed: false,
};
assert.equal(canGenerateResearch(grounded, now), true);
assert.equal(canGenerateResearch({ ...grounded, evidenceQualityVerified: false }, now), false, "untrusted sources must cost zero");
assert.equal(canGenerateResearch({ ...grounded, sourceTimestamp: null }, now), false);
assert.equal(canGenerateResearch({ ...grounded, sourceTimestamp: "2026-10-12T17:45:00.000Z" }, now), false);
assert.equal(canGenerateResearch({ ...grounded, sourceTimestamp: "2026-10-01T17:45:00.000Z" }, now), false);
assert.equal(canGenerateResearch({ ...grounded, intent: "UNSUPPORTED" }, now), false);
assert.equal(canGenerateResearch({ ...grounded, brokerOrderAllowed: true }, now), false);

const messages = buildGenerativeMessages("Perché non comprare ASML?", grounded);
assert.equal(messages.length, 2);
assert.match(messages[0].content, /non.*cambiare|Non cambiare/i);
assert.match(messages[1].content, /investment-committee/);
assert.match(messages[1].content, /ATTENDERE/);
assert.doesNotMatch(messages[1].content, /FENICE_AI_OWNER_TOKEN/);
assert.equal(FENICE_GENERATIVE_MODEL, "gpt-4o-mini");
assert.equal(FENICE_AI_MAX_RESPONSE_TOKENS, 1024);
assert.equal(cleanGenerativeExplanation({ choices: [{ message: { content: "short" } }] }), null);
assert.equal(cleanGenerativeExplanation({ choices: [{ message: { content: "Il comitato vede ASML come OSSERVA. Le due fonti confermano che i dati non bastano a comprare." } }] }).startsWith("Il comitato"), true);

let calls = 0;
let outgoing;
const fakeFetch = async (url, init) => {
  calls++;
  outgoing = { url, init };
  return { ok: true, json: async () => ({
    choices: [{ message: { content: "Fenice mantiene ASML in OSSERVA e non lo compra. Le prove data/investment-committee.json e data/calibration-analysis.json sono insufficienti per il trading." } }],
  }) };
};
const generated = await generateGroundedExplanation({ question: "Perché non comprare ASML?", grounded, openaiToken, now, clock: () => now, reserveBudget: async () => ({ allowed: true, reservedCents: 2, warning: false }), fetchImpl: fakeFetch });
assert.equal(calls, 1);
assert.equal(generated.state, "GENERATED");
assert.equal(generated.committeeVerdict, "ATTENDERE");
assert.equal(generated.brokerOrderAllowed, false);
assert.equal(generated.model, FENICE_GENERATIVE_MODEL);
assert.equal(outgoing.url, "https://api.openai.com/v1/chat/completions");
assert.equal(outgoing.init.method, "POST");
const body = JSON.parse(outgoing.init.body);
assert.equal(body.model, FENICE_GENERATIVE_MODEL);
assert.equal(body.max_tokens, 1024);
assert.equal(body.store, false);
assert.equal(body.messages.length, 2);
assert.equal(body.tools, undefined);
assert.equal(body.stream, undefined);

const qualityBlocked = await generateGroundedExplanation({
  question: "ASML", grounded: { ...grounded, evidenceQualityVerified: false },
  openaiToken, now, clock: () => now, reserveBudget: async () => ({ allowed: true, reservedCents: 2, warning: false }), fetchImpl: fakeFetch,
});
assert.equal(qualityBlocked.state, "UNAVAILABLE");
assert.equal(calls, 1, "untrusted source data must not call paid provider");

const blocked = await generateGroundedExplanation({ question: "ASML", grounded: { ...grounded, sourceTimestamp: null }, openaiToken, now, clock: () => now, reserveBudget: async () => ({ allowed: true, reservedCents: 2, warning: false }), fetchImpl: fakeFetch });
assert.equal(blocked.state, "UNAVAILABLE");
assert.equal(calls, 1, "stale/invalid research must NEVER spend credits");
const bad = await generateGroundedExplanation({ question: "ASML", grounded, openaiToken, now,
  clock: () => now, reserveBudget: async () => ({ allowed: true, reservedCents: 2, warning: false }), fetchImpl: async () => ({ ok: false, status: 402 }) });
assert.equal(bad.state, "UNAVAILABLE");
assert.equal(bad.brokerOrderAllowed, false);
const modelFailure = await generateGroundedExplanation({ question: "ASML", grounded, openaiToken, now,
  clock: () => now, reserveBudget: async () => ({ allowed: true, reservedCents: 2, warning: false }), fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [] }) }) });
assert.equal(modelFailure.state, "BAD_RESPONSE");
console.log("Fenice generative explanation, owner access and budget safety: PASS");

const before = calls;
for (const reserveBudget of [undefined, async () => ({allowed:false,reservedCents:500,warning:true}), async () => {throw Error("storage unavailable");}]) {
  const result = await generateGroundedExplanation({question:"ASML", grounded, openaiToken, now, fetchImpl:fakeFetch, reserveBudget});
  assert.equal(result.state,"UNAVAILABLE");
}
assert.equal(calls,before);
const { reserveAiBudget } = await import("../lib/ai/fenice-monthly-budget.ts");
let stored = null; let version = 0;
const store = {async read(){return stored ? {...stored}:null;}, async write(body,etag){if(etag !== (stored?.etag??null))return false;stored={body,etag:String(++version)};return true;}};
assert.equal((await reserveAiBudget(store,now,null)).allowed,false);
assert.equal((await reserveAiBudget(store,now,{month:"2026-10",reservedCents:398})).warning,true);
const results=await Promise.all(Array.from({length:10},()=>reserveAiBudget(store,now,null)));
assert.equal(results.filter(x=>x.allowed).length,1);
for(let i=0;i<60;i++) await reserveAiBudget(store,now,null);
assert.equal(JSON.parse(stored.body).reservedCents,500);
assert.equal((await reserveAiBudget(store,now,null)).allowed,false);
assert.equal((await reserveAiBudget(store,Date.parse("2026-10-31T23:59:30Z"),null)).allowed,false);
assert.equal((await reserveAiBudget(store,Date.parse("2026-11-01T01:00:00Z"),null)).reservedCents,2);
stored.body="broken";assert.equal((await reserveAiBudget(store,now,null)).allowed,false);
console.log("Monthly budget reservation, concurrent conflict and fail-closed regression: PASS");

const { createAiBudgetStore } = await import("../lib/ai/fenice-budget-blob.ts");
const budgetBody = JSON.stringify({month:"2026-10",reservedCents:498});
const budgetAtLimit = JSON.stringify({month:"2026-10",reservedCents:500});
function getBudget(body, etag) {
  return {statusCode:200,blob:{etag},stream:new Response(body).body};
}
for (const changed of [getBudget(budgetBody, "http-b"), getBudget(budgetAtLimit, "http-a")]) {
  let reads = 0;
  let writes = 0;
  const store = createAiBudgetStore({
    async get(){return reads++ === 0 ? getBudget(budgetBody,"http-a") : changed;},
    async head(){return {etag:"storage-a",size:Buffer.byteLength(budgetBody)};},
    async put(){writes++;return {etag:"storage-b"};},
  }, {});
  assert.equal((await reserveAiBudget(store,now,null)).allowed,false);
  assert.equal(writes,0);
}

let budgetVersion = 1;
let currentBody = budgetBody;
const distinctTags = createAiBudgetStore({
  async get(path,options){
    assert.equal(options.access,"private");
    assert.equal(options.useCache,false);
    return getBudget(currentBody,"http-"+budgetVersion);
  },
  async head(){return {etag:"storage-"+budgetVersion,size:Buffer.byteLength(currentBody)};},
  async put(path,body,options){
    assert.equal(options.allowOverwrite,true);
    if(options.ifMatch!=="storage-"+budgetVersion)throw Error("PRECONDITION_FAILED");
    currentBody=body;
    budgetVersion++;
    return {etag:"storage-"+budgetVersion};
  },
},{});
const reservations=await Promise.all([reserveAiBudget(distinctTags,now,null),reserveAiBudget(distinctTags,now,null)]);
assert.equal(reservations.filter(result=>result.allowed).length,1);
assert.equal(budgetVersion,2);
assert.equal(currentBody,budgetAtLimit);
assert.equal((await reserveAiBudget(distinctTags,now,null)).allowed,false);
for (const fresh of ["2026-10-31T23:59:30Z","2026-11-01T00:01:00Z"]) {
 const start=Date.parse("2026-10-31T23:58:00Z");
 const result=await generateGroundedExplanation({question:"ASML",grounded:{...grounded,sourceTimestamp:new Date(start).toISOString()},openaiToken,now:start,clock:()=>Date.parse(fresh),reserveBudget:async()=>({allowed:true,reservedCents:2,warning:false}),fetchImpl:fakeFetch});
 assert.equal(result.state,"UNAVAILABLE");assert.equal(result.budget.reservedCents,2);
}
assert.equal(calls,before);
console.log("Stale ETag and delayed month rollover regression: PASS");
