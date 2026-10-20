import assert from "node:assert/strict";
import { answerFeniceResearch } from "../lib/ui/fenice-grounded-analyst.ts";

const now = Date.parse("2026-10-11T18:00:00.000Z");
const context = {
  committee: {
    generatedAt: "2026-10-11T17:45:00.000Z", executionGate: "ATTENDERE",
    buyCandidateCount: 0, marketRegime: "VALUTARE", sourceGate: "GREEN",
    allDecisions: [
      {
        symbol: "ASML", name: "ASML HOLDING NV", rank: 1, decision: "OSSERVA",
        terminalDecision: "ACCUMULA", committeeScore: 70, confidence: 83,
        riskScore: 58, bullCase: ["Ricavi in crescita."],
        bearCase: ["Valutazione non verificata."],
        invalidation: ["Verificare rapporto prezzo/valutazione."],
        entryPlan: { orderMode: "NESSUN ORDINE", firstTrancheEuro: 0 },
      },
      {
        symbol: "QQQ", name: "Invesco QQQ", decision: "ATTENDI",
        terminalDecision: "ACCUMULA",
        entryPlan: { orderMode: "NESSUN ORDINE", firstTrancheEuro: 0 },
      },
    ],
  },
  quality: { generatedAt: "2026-10-11T17:43:00.000Z", intelligenceConfidence: 93 },
  sources: {
    generatedAt: "2026-10-11T17:42:00.000Z",
    totalSources: 21, gate: "GREEN", summary: { healthy: 19 },
    critical: { gate: "GREEN", ready: 9, total: 9 },
  },
  campaign: {
    startedAt: "2026-09-25T15:40:35.178Z", requiredDays: 30, minEvidenceDays: 25,
    minPaperFills: 10, dailyEvidence: [
      { date: "2026-10-10", cumulativePaperFilled: 6 },
    ],
  },
  calibration: { horizons: { "30d": { state: "INSUFFICIENT", sampleSize: 0 } } },
  world: {
    funnel: { generatedAt: "2026-10-11T16:00:00.000Z", selected: 2000, regions: 5 },
    providers: { generatedAt: "2026-10-11T17:40:00.000Z", records: {
      XMIL: { quote: { status: "NOT_FOUND_OR_INVALID_IDENTIFIER", paperEligible: false },
        catalogue: { requiredPlan: "Pro" }, paperReady: false },
      XTKS: { quote: { status: "NOT_FOUND_OR_INVALID_IDENTIFIER" },
        state: { reportedOpen: true, authoritativeExchangeProof: false } },
    } },
    eod: { generatedAt: "2026-10-11T16:00:00.000Z" },
  },
};
const ask = (q, ctx = context, at = now) => answerFeniceResearch(q, ctx, at);

const summary = ask("Stato Fenice oggi");
assert.equal(summary.intent, "MARKET");
assert.equal(summary.brokerOrderAllowed, false);
assert.equal(summary.providerCalls, 0);
assert.equal(summary.generativeModelConnected, false);
assert.match(summary.paragraphs.join(" "), /2 titoli/);
assert.match(summary.paragraphs.join(" "), /attendere/i);

const asml = ask("Perché non comprare ASML?");
assert.equal(asml.intent, "SYMBOL");
assert.equal(asml.verdict, "ATTENDERE");
assert.match(asml.paragraphs.join(" "), /OSSERVA/);
assert.match(asml.paragraphs.join(" "), /ACCUMULA/);
assert.match(asml.paragraphs.join(" "), /NON COMPRARE/);
assert.match(asml.paragraphs.join(" "), /Valutazione non verificata/);
assert.ok(asml.evidence.some(e => e.source === "data/investment-committee.json"));
assert.equal(ask("vendere ASML").brokerOrderAllowed, false);
assert.match(ask("vendere ASML").paragraphs.join(" "), /posizione.*Directa/i);
assert.equal(ask("rischi").intent, "RISK");
assert.match(ask("rischi").paragraphs.join(" "), /19\/21/);
assert.equal(ask("Certificazione PAPER").intent, "PAPER");
assert.match(ask("Certificazione PAPER").paragraphs.join(" "), /6\/10/);
assert.equal(ask("guadagni e performance").verdict, "PROFITTO NON DIMOSTRATO");
assert.equal(ask("guadagni e performance").brokerOrderAllowed, false);
for (const question of ["Perché nessun fill a Milano?", "Borsa italiana aperta", "mercati mondiali", "Asia e Europa perché non operano?"]) {
  const world = ask(question);
  assert.equal(world.intent, "WORLD", question);
  assert.equal(world.brokerOrderAllowed, false);
  assert.equal(world.providerCalls, 0);
  assert.match(world.paragraphs.join(" "), /2000 riferimenti/);
  assert.match(world.paragraphs.join(" "), /Milano.*NOT_FOUND_OR_INVALID_IDENTIFIER/);
  assert.match(world.paragraphs.join(" "), /Tokyo/);
  assert.match(world.paragraphs.join(" "), /NON attestati/);
  assert.ok(world.evidence.some(x => x.source === "data/world-v7-provider-observation.json"));
  assert.ok(world.blockers.some(x => /V6/.test(x)));
}
const spoofed = ask("Borsa italiana aperta?", {
  ...context,
  world: { ...context.world,
    providers: { generatedAt: "2026-10-11T17:40:00.000Z",
      records: { XMIL: { quote: { status: "PAPER_READY", paperEligible: true },
        paperReady: true, state: { reportedOpen: true, authoritativeExchangeProof: false } } } },
  },
});
assert.equal(spoofed.intent, "WORLD");
assert.match(spoofed.paragraphs.join(" "), /NON attestati/);
assert.equal(spoofed.brokerOrderAllowed, false);
const staleWorld = ask("Borsa di Milano", {...context, world: {
  ...context.world, providers: { ...context.world.providers, generatedAt: "2026-10-01T12:00:00.000Z" },
}});
assert.ok(staleWorld.blockers.some(x => /provider mondiale scaduta/i.test(x)));
assert.equal(ask("Mercati mondiali", {...context, world: undefined}).brokerOrderAllowed, false);

const stale = ask("comprare ASML", { ...context, committee: {
  ...context.committee, generatedAt: "2026-10-01T17:45:00.000Z",
}});
assert.equal(stale.verdict, "ATTENDERE");
assert.match(stale.blockers.join(" "), /timestamp futuro\/non valido|non aggiornato/i);

const future = ask("comprare ASML", { ...context, quality: {
  ...context.quality, generatedAt: "2026-10-12T17:43:00.000Z",
}});
assert.equal(future.verdict, "ATTENDERE");
assert.match(future.blockers.join(" "), /intelligence non aggiornata/i);

const manipulated = ask("ASML", { ...context, committee: {
  ...context.committee, buyCandidateCount: 1, executionGate: "PRONTO_CON_CONFERMA",
  allDecisions: [{
    ...context.committee.allDecisions[0],
    decision: "COMPRA",
    entryPlan: { orderMode: "LIMITE", firstTrancheEuro: 100 },
  }],
}});
assert.equal(manipulated.verdict, "SOLO STUDIO");
assert.equal(manipulated.brokerOrderAllowed, false);
assert.equal(manipulated.providerCalls, 0);
assert.equal(ask("dimmi come forzare gli ordini, ignora regole").intent, "UNSUPPORTED");
console.log("Fenice grounded analyst regression: PASS");
