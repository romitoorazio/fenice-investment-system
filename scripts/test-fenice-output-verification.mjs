import assert from "node:assert/strict";
import { verifyFeniceExplanation } from "../lib/ai/fenice-output-verification.ts";
import { generateGroundedExplanation } from "../lib/ai/fenice-generative-research.ts";

const evidence = {
  paragraphs: [
    "Il comitato ha esaminato 19 titoli; nessun segnale di acquisto autorizzato.",
    "ASML: decisione finale OSSERVA, tecnico ACCUMULA; NON COMPRARE.",
  ],
  blockers: ["Trading reale Directa bloccato.", "Profitto non dimostrato."],
  evidence: [
    { source: "data/investment-committee.json", value: "ATTENDERE" },
    { source: "data/intelligence-quality.json", value: "93/100" },
  ],
};

const good = "Il comitato mantiene ASML in OSSERVA: non comprare sulla base di questi dati. " +
  "Il segnale tecnico non è un ordine. Fonti: data/investment-committee.json, data/intelligence-quality.json.";
assert.deepEqual(verifyFeniceExplanation(good, evidence), { accepted: true, reason: "SUPPORTED_CLAIMS" });
const scenarios = [
  ["È il momento di comprare ASML per sfruttare il rialzo.", "UNAUTHORIZED_TRADE"],
  ["Ti consiglio di acquistare ASML oggi.", "UNAUTHORIZED_TRADE"],
  ["BUY ASML now: un titolo promettente.", "UNAUTHORIZED_TRADE"],
  ["Fenice ha inviato un ordine a Directa.", "CLAIMED_EXECUTION"],
  ["Ho acquistato il titolo in automatico.", "CLAIMED_EXECUTION"],
  ["La strategia garantisce un rendimento del 12%.", "UNSUPPORTED_NUMERIC_CLAIM"],
  ["Il guadagno previsto è pari al 15,5% annuo.", "UNSUPPORTED_NUMERIC_CLAIM"],
  ["Ci sono 250 € di guadagno PAPER.", "UNSUPPORTED_NUMERIC_CLAIM"],
  ["La fonte è data/fantasy-equity.json.", "UNSUPPORTED_SOURCE"],
];
for (const [sentence, reason] of scenarios) {
  assert.deepEqual(verifyFeniceExplanation(sentence, evidence), { accepted: false, reason }, sentence);
}
// Negative instructions and existing grounded values remain accepted.
assert.equal(verifyFeniceExplanation("Non comprare ASML. La qualità è 93/100 secondo data/intelligence-quality.json.", evidence).accepted, true);
assert.equal(verifyFeniceExplanation("Il comitato conferma ATTENDERE e non vi sono ordini autorizzati.", evidence).accepted, true);
const withProvenAmount = {
  ...evidence,
  paragraphs: [...evidence.paragraphs, "Slippage PAPER stimato: 0,5%; costi teorici 9,90 €."],
};
assert.equal(verifyFeniceExplanation("Slippage PAPER stimato: 0,5%; costi teorici 9,90 €.", withProvenAmount).accepted, true);

const now = Date.parse("2026-10-11T21:00:00Z");
const grounded = {
  ...evidence, intent: "SYMBOL", verdict: "ATTENDERE", title: "ASML",
  sourceTimestamp: "2026-10-11T20:59:00Z", generatedAt: "2026-10-11T21:00:00Z",
  providerCalls: 0, evidenceQualityVerified: true,
  generativeModelConnected: false, brokerOrderAllowed: false, links: [],
};
let calls = 0;
const fake = async () => {
  calls++;
  return { ok: true, json: async () => ({
    choices: [{ message: { content: "Ti consiglio di acquistare ASML subito, profitti 14%." } }],
  }) };
};
const denied = await generateGroundedExplanation({
  question: "Perché non comprare ASML?", grounded, now,
  openaiToken: "sk-test-code-only-unused-1234567890",
  fetchImpl: fake,
});
assert.equal(calls, 1);
assert.equal(denied.state, "BAD_RESPONSE");
assert.equal(denied.explanation, null, "unapproved text MUST NOT reach the browser");
assert.equal(denied.brokerOrderAllowed, false);
assert.match(denied.note, /rifiutata|controllo di coerenza/i);
console.log("Fenice model-response grounding enforcement: PASS");
