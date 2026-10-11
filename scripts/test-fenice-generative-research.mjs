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
const gatewayToken = "oidc-test-only-token-123456";
const readyEnv = {
  FENICE_GENERATIVE_AI_ENABLED: "true",
  FENICE_AI_BUDGET_CONFIRMED: "true",
  FENICE_AI_OWNER_TOKEN: ownerToken,
  VERCEL_OIDC_TOKEN: gatewayToken,
};
assert.equal(generativeAvailability({}), "FEATURE_DISABLED");
assert.equal(generativeAvailability({ ...readyEnv, FENICE_GENERATIVE_AI_ENABLED: "false" }), "FEATURE_DISABLED");
assert.equal(generativeAvailability({ ...readyEnv, FENICE_AI_BUDGET_CONFIRMED: undefined }), "BUDGET_NOT_CONFIRMED");
assert.equal(generativeAvailability({ ...readyEnv, FENICE_AI_OWNER_TOKEN: "short" }), "ACCESS_NOT_CONFIGURED");
assert.equal(generativeAvailability({ ...readyEnv, VERCEL_OIDC_TOKEN: "" }), "GATEWAY_NOT_CONFIGURED");
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
  generativeModelConnected: false,
  brokerOrderAllowed: false,
};
assert.equal(canGenerateResearch(grounded, now), true);
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
assert.equal(FENICE_GENERATIVE_MODEL, "google/gemini-2.5-flash-lite");
assert.ok(FENICE_AI_MAX_RESPONSE_TOKENS <= 600);
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
const generated = await generateGroundedExplanation({ question: "Perché non comprare ASML?", grounded, gatewayToken, now, fetchImpl: fakeFetch });
assert.equal(calls, 1);
assert.equal(generated.state, "GENERATED");
assert.equal(generated.committeeVerdict, "ATTENDERE");
assert.equal(generated.brokerOrderAllowed, false);
assert.equal(generated.model, FENICE_GENERATIVE_MODEL);
assert.equal(outgoing.url, "https://ai-gateway.vercel.sh/v1/chat/completions");
assert.equal(outgoing.init.method, "POST");
const body = JSON.parse(outgoing.init.body);
assert.equal(body.model, FENICE_GENERATIVE_MODEL);
assert.equal(body.max_tokens, 500);
assert.equal(body.messages.length, 2);
assert.equal(body.tools, undefined);
assert.equal(body.stream, undefined);

const blocked = await generateGroundedExplanation({ question: "ASML", grounded: { ...grounded, sourceTimestamp: null }, gatewayToken, now, fetchImpl: fakeFetch });
assert.equal(blocked.state, "UNAVAILABLE");
assert.equal(calls, 1, "stale/invalid research must NEVER spend credits");
const bad = await generateGroundedExplanation({ question: "ASML", grounded, gatewayToken, now,
  fetchImpl: async () => ({ ok: false, status: 402 }) });
assert.equal(bad.state, "UNAVAILABLE");
assert.equal(bad.brokerOrderAllowed, false);
const modelFailure = await generateGroundedExplanation({ question: "ASML", grounded, gatewayToken, now,
  fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [] }) }) });
assert.equal(modelFailure.state, "BAD_RESPONSE");
console.log("Fenice generative explanation, owner access and budget safety: PASS");
