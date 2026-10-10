import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPaperReviewDemo, buildPaperReviewProposal, decidePaperReview, parsePaperReviewHistory, reviewTermsKey } from "../lib/ui/paper-review.ts";
import { loadPaperReviewPayload } from "../lib/ui/paper-review-data.ts";
import { PAPER_VALIDATION_CORE_FILES, computePaperValidationFingerprint } from "../lib/trading/validation-fingerprint.mjs";

const now = Date.parse("2026-10-05T14:00:00.000Z");
const demo = createPaperReviewDemo(now);
assert.deepEqual(demo.blockers, []);
assert.equal(demo.maxTotalEuro, 51.5);
assert.equal(demo.order.humanConfirmed, false, "a proposal must never imply consent");
const no = decidePaperReview(demo, "NO", [], now + 1000);
assert.equal(no.execution, null);
assert.equal(no.transmitted, false);
assert.equal(decidePaperReview(demo, "YES", [no], now + 2000), no, "a rejection cannot silently become an approval");
const yes = decidePaperReview(demo, "YES", [], now + 1000);
assert.equal(yes.execution.status, "PAPER_FILLED");
assert(yes.execution.fillPrice <= demo.order.limitPrice);
assert(yes.execution.notionalEuro + yes.execution.estimatedFeeEuro <= demo.maxTotalEuro);
assert.equal(yes.transmitted, false);
assert.equal(decidePaperReview(demo, "YES", [yes], now + 2000), yes, "duplicate clicks must return the existing receipt");
assert.throws(() => decidePaperReview({ ...demo, order: { ...demo.order, quantity: 2 } }, "YES", [yes], now + 2000), /cambiata/);
assert.throws(() => decidePaperReview({ ...demo, id: "new-revision" }, "YES", [yes], now + 2000), /già stata valutata/);
assert.throws(() => decidePaperReview(demo, "YES", [], now + 120_000), /non è più valida/);
assert.equal(decidePaperReview(demo, "NO", [], now + 120_001).answer, "NO", "an expired proposal can still be rejected");
assert.throws(() => decidePaperReview(demo, "MAYBE", [], now), /non valida/);
assert.throws(() => decidePaperReview({ ...demo, order: { ...demo.order, mode: "LIVE" } }, "YES", [], now), /reali restano bloccati/);
assert.throws(() => decidePaperReview({ ...demo, context: { ...demo.context, brokerConnectivityAllowed: true } }, "YES", [], now), /reali restano bloccati/);
assert.throws(() => decidePaperReview({ ...demo, context: { ...demo.context, liveTradingReleased: true } }, "YES", [], now), /reali restano bloccati/);
for (const unsafe of [
  { ...demo, context: { ...demo.context, capitalEuro: 0 } },
  { ...demo, context: { ...demo.context, independentSources: 1 } },
  { ...demo, context: { ...demo.context, dataDivergent: true } },
  { ...demo, context: { ...demo.context, killSwitchEngaged: true } },
  { ...demo, context: { ...demo.context, quoteObservedAt: new Date(now + 1000).toISOString() } },
  { ...demo, order: { ...demo.order, requestedAt: "bad-date" } },
  { ...demo, order: { ...demo.order, orderType: "MARKET", limitPrice: undefined } },
  { ...demo, order: { ...demo.order, side: "SELL" } },
  { ...demo, order: { ...demo.order, quantity: 100 } },
  { ...demo, expiresAt: new Date(now + 300_000).toISOString() },
]) {
  const checked = buildPaperReviewProposal(unsafe, now);
  assert(checked.blockers.length > 0);
  assert.throws(() => decidePaperReview(checked, "YES", [], now), /non è più valida/);
}
assert.deepEqual(parsePaperReviewHistory(null), []);
const history = JSON.stringify({ version: 1, mode: "PAPER_REVIEW", records: [yes] });
assert.equal(parsePaperReviewHistory(history)[0].termsKey, reviewTermsKey(demo));
assert.throws(() => parsePaperReviewHistory("broken-json"));
assert.throws(() => parsePaperReviewHistory(JSON.stringify({ version: 1, mode: "LIVE", records: [yes] })));
assert.throws(() => parsePaperReviewHistory(JSON.stringify({ version: 1, mode: "PAPER_REVIEW", records: [yes, yes] })));
assert.throws(() => parsePaperReviewHistory(JSON.stringify({ version: 1, mode: "PAPER_REVIEW", records: [{ ...yes, transmitted: true }] })));

const root = await mkdtemp(path.join(os.tmpdir(), "fenice-paper-review-"));
try {
  await mkdir(path.join(root, "data"));
  const save = (name, data) => writeFile(path.join(root, "data", name), JSON.stringify(data));
  await Promise.all([
    save("paper-order-queue.json", { mode: "PAPER", orders: [{ ...demo.order, clientOrderId: "paper-review-fixture" }] }),
    save("paper-oms-state.json", { mode: "PAPER", liveTradingAllowed: false, brokerConnectivityAllowed: false, positions: [], executions: [], openOrders: [], auditChain: [], reconciliation: { balanced: true, breaks: [] }, killSwitch: { engaged: false } }),
    save("terminal-intelligence.json", { capitalEuro: 1000, generatedAt: new Date(now).toISOString(), assets: [{ symbol: "DEMO", name: "Test instrument", currency: "EUR", price: 49.9, confidence: 100, riskScore: 20, reason: "Fixture only" }] }),
    save("execution-market-evidence.json", { generatedAt: new Date(now).toISOString(), observations: ["alpaca", "twelve-data"].map((family) => ({ symbol: "DEMO", currency: "EUR", source: family, sourceFamily: family, eligibility: "PAPER", price: 49.9, observedAt: new Date(now).toISOString(), provenanceVerified: true })) }),
    save("paper-market-session.json", { configured: true, liveTradingAllowed: false, evidence: { venue: "US_EQUITIES", state: "OPEN", source: "Fixture clock", observedAt: new Date(now).toISOString(), authoritative: true } }),
    save("paper-fx-evidence.json", { ratesToEuro: { EUR: { rate: 1, observedAt: new Date(now).toISOString() } } }),
    save("intelligence-quality.json", { generatedAt: new Date(now).toISOString(), intelligenceConfidence: 100,
      coverage: { sourceConcentrationPercent: 40, marketSources: 3, assetClasses: ["equity", "etf", "crypto"] },
      crossSourceValidation: { checked: 10, divergent: 0 }, policy: { unknownTimestampEvidenceExcluded: true, validationEvidenceFreshnessHours: { crypto: 4, traditional: 96 } } }),
    save("global-source-health.json", { generatedAt: new Date(now).toISOString(), critical: { gate: "GREEN", ready: 9, total: 9 } }),
    save("instrument-master.json", { version: 1, instruments: [{ ticker: "DEMO", assetClass: "equity", exchangeMic: "XNAS", country: "US", currency: "EUR", status: "active" }] }),
    save("investment-committee.json", { generatedAt: new Date(now).toISOString(), sourceGate: "GREEN", executionGate: "ATTENDERE", allDecisions: [{ symbol: "DEMO", name: "Test instrument", currency: "EUR", decision: "OSSERVA", committeeScore: 70, confidence: 88, rawConfidenceBeforeCalibration: 98, riskScore: 20, entryPlan: { orderMode: "NESSUN ORDINE", maxEntryPrice: null, firstTrancheEuro: 0 } }] }),
    save("execution-market-coverage.json", { generatedAt: new Date(now).toISOString(), policy: { requiredEligibility: "PAPER", liveTradingAllowed: false, minIndependentSourceFamilies: 2 }, rows: [{ symbol: "DEMO", paperEligible: true, independentSourceFamilies: 2, state: "READY" }] }),
    save("paper-validation-approval.json", { approved: true, mode: "PAPER", expiresAt: new Date(now + 86_400_000).toISOString(), liveTradingAllowed: false, brokerConnectivityAllowed: false, minCommitteeScore: 70, minValidationDataConfidence: 90, maxRiskScore: 75, permittedDecisionStates: ["ACCUMULA", "MANTIENI", "OSSERVA"], permittedCurrencies: ["EUR", "USD"] }),
  ]);
  const snapshotBefore = await readFile(path.join(root, "data", "paper-oms-state.json"), "utf8");
  const payload = await loadPaperReviewPayload(root, now);
  assert.equal(payload.liveTradingAllowed, false);
  assert.equal(payload.brokerOrderSubmissionAllowed, false);
  assert.equal(payload.proposals.length, 1);
  assert.deepEqual(payload.proposals[0].blockers, []);
  assert.equal(payload.diagnosticCandidates.length, 1);
  assert.equal(payload.diagnosticCandidates[0].symbol, "DEMO");
  assert.equal(payload.diagnosticCandidates[0].reviewProposalCandidateReady, false);
  assert(payload.diagnosticCandidates[0].blockers.includes("COMMITTEE_NOT_BUY"));
  assert(payload.diagnosticCandidates[0].blockers.includes("CALIBRATED_CONFIDENCE_BELOW_REVIEW_MINIMUM"));
  assert.equal(payload.liveTradingAllowed, false);
  assert.equal(payload.brokerOrderSubmissionAllowed, false);
  const refreshed = await loadPaperReviewPayload(root, now + 1000);
  assert.equal(reviewTermsKey(payload.proposals[0]), reviewTermsKey(refreshed.proposals[0]), "a refresh must not change EUR identity FX or inherit consent");
  decidePaperReview(refreshed.proposals[0], "YES", [], now + 1000);
  assert.equal(await readFile(path.join(root, "data", "paper-oms-state.json"), "utf8"), snapshotBefore, "review simulations must not mutate campaign state");
  const evidenceBefore = JSON.parse(await readFile(path.join(root, "data", "execution-market-evidence.json"), "utf8"));
  await save("execution-market-evidence.json", { ...evidenceBefore, observations: evidenceBefore.observations.map((row, index) => ({ ...row, sourceFamily: `unregistered-${index}` })) });
  assert((await loadPaperReviewPayload(root, now)).proposals[0].blockers.length > 0, "two forged PAPER labels cannot replace registered source families");
  await save("execution-market-evidence.json", evidenceBefore);
  const stateBefore = JSON.parse(snapshotBefore);
  for (const change of [{ liveTradingAllowed: true }, { brokerConnectivityAllowed: true }, { liveTradingAllowed: undefined }, { positions: [null] }, { reconciliation: { balanced: true, breaks: ["unexplained"] } }]) {
    await save("paper-oms-state.json", { ...stateBefore, ...change });
    const blocked = await loadPaperReviewPayload(root, now);
    assert(blocked.proposals.length === 0 || blocked.proposals[0].blockers.length > 0, "persisted state must not be laundered into closed locks");
  }
  await save("paper-oms-state.json", stateBefore);
  const fixtureOrder = { ...demo.order, clientOrderId: "paper-review-fixture" };
  const aiThesis = { symbol: "DEMO", action: "BUY", confidence: 95, fsiScore: 80, horizon: "MONTHS",
    rationale: ["Fixture rationale"], catalysts: [], invalidation: ["Fixture invalidation"], generatedAt: new Date(now).toISOString() };
  await save("paper-order-queue.json", { mode: "PAPER", orders: [{ ...fixtureOrder, aiThesis }] });
  const aiPayload = await loadPaperReviewPayload(root, now);
  assert.deepEqual(aiPayload.proposals[0].blockers, []);
  assert.equal(aiPayload.proposals[0].aiDecision.executable, false);
  assert.equal(decidePaperReview(aiPayload.proposals[0], "YES", [], now).execution.status, "PAPER_FILLED");
  for (const ai of [{ ...aiThesis, symbol: "QQQ" }, { ...aiThesis, action: "WAIT" }, { ...aiThesis, confidence: NaN }, {}, null]) {
    await save("paper-order-queue.json", { mode: "PAPER", orders: [{ ...fixtureOrder, aiThesis: ai }] });
    assert((await loadPaperReviewPayload(root, now)).proposals[0].blockers.length > 0, "invalid AI metadata cannot bypass the deterministic proposal checks");
  }
  await save("paper-order-queue.json", { mode: "PAPER", orders: [fixtureOrder, fixtureOrder] });
  assert.equal((await loadPaperReviewPayload(root, now)).proposals.length, 1, "duplicate queued IDs do not create separate review cards");
  await save("paper-order-queue.json", { mode: "PAPER", orders: [{ ...fixtureOrder, orderType: "MARKET" }] });
  assert.equal((await loadPaperReviewPayload(root, now)).proposals.length, 0, "canonical MARKET probes must not become LIMIT proposals");
  await save("paper-order-queue.json", { mode: "PAPER", orders: [fixtureOrder] });
  const stalePayload = await loadPaperReviewPayload(root, now + 121_000);
  assert(stalePayload.proposals[0].blockers.length > 0);

  const refreshNow = now + 90_000;
  let liveLoaderCalls = 0;
  const liveContextLoader = async ({ instruments, now: requestedNow }) => {
    liveLoaderCalls += 1;
    assert.deepEqual(instruments.map((item) => item.symbol), ["DEMO"]);
    const observedAt = new Date(requestedNow).toISOString();
    return {
      version: 1,
      generatedAt: observedAt,
      purpose: "fixture",
      safety: { readOnly: true, writesAllowed: false, brokerSubmissionAllowed: false, liveTradingAllowed: false, certificationEvidenceMutationAllowed: false },
      requestedSymbols: ["DEMO"],
      observations: ["alpaca", "twelve-data"].map((family) => ({
        symbol: "DEMO", currency: "EUR", assetClass: "equity", source: family, sourceFamily: family,
        eligibility: "PAPER", price: 49.9, observedAt, provenanceVerified: true,
      })),
      marketSession: {
        configured: true, liveTradingAllowed: false,
        evidence: { venue: "US_EQUITIES", state: "OPEN", source: "Fixture live clock", observedAt, authoritative: true },
        decision: { allowed: true, reasons: [], ageSeconds: 0, state: "OPEN" },
      },
      fx: {
        provider: "twelve-data", baseCurrency: "EUR", generatedAt: observedAt, provenanceVerified: true,
        liveTradingAllowed: false, brokerConnectivityAllowed: false,
        ratesToEuro: { EUR: { rate: 1, observedAt, source: "identity" } },
      },
      errors: [],
    };
  };
  const livePayload = await loadPaperReviewPayload(root, refreshNow, {
    refreshLiveContext: true,
    credentials: {},
    liveContextLoader,
  });
  assert.equal(liveLoaderCalls, 1);
  assert.equal(livePayload.reviewDataSource, "LIVE_READONLY");
  assert.equal(livePayload.proposals.length, 1);
  assert.deepEqual(livePayload.proposals[0].blockers, []);
  assert(livePayload.notices.some((item) => item.includes("sola lettura")));
  assert.equal(await readFile(path.join(root, "data", "execution-market-evidence.json"), "utf8"), JSON.stringify(evidenceBefore), "live review refresh must not persist provider evidence");

  const reusedLivePayload = await loadPaperReviewPayload(root, refreshNow + 1000, {
    refreshLiveContext: true,
    credentials: {},
    liveContextLoader,
  });
  assert.equal(liveLoaderCalls, 1, "identical live review refreshes within 10 seconds must share one provider call");
  assert.equal(reusedLivePayload.reviewDataSource, "LIVE_READONLY");
  assert.deepEqual(reusedLivePayload.proposals[0].blockers, []);

  const partialPayload = await loadPaperReviewPayload(root, refreshNow, {
    refreshLiveContext: true,
    credentials: {},
    liveContextLoader: async (args) => ({ ...(await liveContextLoader(args)), errors: ["TWELVE_DATA_NOT_CONFIGURED"] }),
  });
  assert.equal(partialPayload.reviewDataSource, "PERSISTED", "partial provider refresh must never receive the live-ready marker");
  assert(partialPayload.notices.some((item) => item.includes("incompleto")));

  const callsBeforeExpiredRefresh = liveLoaderCalls;
  await save("paper-order-queue.json", {
    mode: "PAPER",
    orders: [{ ...fixtureOrder, requestedAt: new Date(refreshNow - 121_000).toISOString() }],
  });
  const expiredRefresh = await loadPaperReviewPayload(root, refreshNow, {
    refreshLiveContext: true,
    credentials: {},
    liveContextLoader,
  });
  assert.equal(liveLoaderCalls, callsBeforeExpiredRefresh, "expired review orders must not consume provider refresh calls");
  assert.equal(expiredRefresh.reviewDataSource, "PERSISTED");
  assert(expiredRefresh.notices.some((item) => item.includes("120 secondi")));
  await save("paper-order-queue.json", { mode: "PAPER", orders: [fixtureOrder] });

  const liveLoaderCallsBeforeEmptyQueue = liveLoaderCalls;
  await save("paper-order-queue.json", { mode: "PAPER", orders: [] });
  await loadPaperReviewPayload(root, refreshNow, { refreshLiveContext: true, credentials: {}, liveContextLoader });
  assert.equal(liveLoaderCalls, liveLoaderCallsBeforeEmptyQueue, "empty review queue must not consume provider refresh calls");
  await save("paper-order-queue.json", { mode: "PAPER", orders: [fixtureOrder] });

  await save("paper-market-session.json", { configured: true, liveTradingAllowed: false, evidence: { venue: "US_EQUITIES", state: "CLOSED", source: "Fixture clock", observedAt: new Date(now).toISOString(), authoritative: true } });
  assert((await loadPaperReviewPayload(root, now)).proposals[0].blockers.some((item) => item.includes("sessione")));
  await save("paper-order-queue.json", { mode: "PAPER", orders: [{ ...demo.order, mode: "LIVE" }] });
  assert.equal((await loadPaperReviewPayload(root, now)).proposals.length, 0);
  await save("paper-order-queue.json", { mode: "PAPER", orders: [] });
  assert.equal((await loadPaperReviewPayload(root, now)).proposals.length, 0);
} finally { await rm(root, { recursive: true, force: true }); }

const localRecords = [];
for (let index = 0; index < 3; index++) {
  const proposal = createPaperReviewDemo(now + index * 1000);
  localRecords.push(decidePaperReview(proposal, "YES", localRecords, now + index * 1000));
}
assert.throws(() => decidePaperReview(createPaperReviewDemo(now + 4000), "YES", localRecords, now + 4000), /limite di rischio/, "successive local Sì decisions must share exposure limits");
const fullHistory = Array.from({ length: 100 }, (_, index) => decidePaperReview(createPaperReviewDemo(now + index), "NO", [], now + index));
assert.equal(parsePaperReviewHistory(JSON.stringify({ version: 1, mode: "PAPER_REVIEW", records: fullHistory })).length, 100);
assert.throws(() => decidePaperReview(createPaperReviewDemo(now + 101), "YES", fullHistory, now + 101), /100 risposte/, "do not evict old receipts and reopen duplicate IDs");

const component = await readFile(new URL("../components/PaperProposalReview.tsx", import.meta.url), "utf8");
assert.match(component, /proposal\.scope === "DEMO" \|\| data\.reviewDataSource === "LIVE_READONLY"/,
  "PAPER Sì must stay disabled until a visible LIVE_READONLY refresh is present");
assert.match(component, /La verifica PAPER dal browser è sospesa: quote e costi API sono protetti\. Nessun Sì è stato registrato\./,
  "without authenticated budget controls, PAPER Sì must stop without saving consent");
assert.doesNotMatch(component, /\?fresh=1/,
  "the public browser must not try to bypass the provider budget firewall");
assert.doesNotMatch(component, /current = fresh;/,
  "a first-click refresh must never flow directly into the simulated YES decision");
assert.match(component, /Più vicini a una proposta/);
assert.match(component, /NON AZIONABILE/);
assert.match(component, /Solo diagnostica: questi titoli non sono proposte/);

const route = await readFile(new URL("../app/api/trading/proposals/route.ts", import.meta.url), "utf8");
assert.match(route, /export async function GET/);
assert.doesNotMatch(route, /export (?:async )?function (?:POST|PUT|PATCH|DELETE)/);
assert(PAPER_VALIDATION_CORE_FILES.every((file) => !file.includes("paper-review") && !file.includes("proposal-review")), "review lab must stay outside the active validation core");
const fingerprint = await computePaperValidationFingerprint(path.resolve(new URL("..", import.meta.url).pathname));
assert.equal(fingerprint.complete, true);
console.log("Fenice PAPER proposal review: PASS (consent binding, expiry, duplicate suppression, LIVE rejection, isolated simulation, read-only loading)");
