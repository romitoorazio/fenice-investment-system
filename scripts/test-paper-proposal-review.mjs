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
    save("paper-oms-state.json", { mode: "PAPER", positions: [], executions: [], openOrders: [], auditChain: [], reconciliation: { balanced: true }, killSwitch: { engaged: false } }),
    save("terminal-intelligence.json", { capitalEuro: 1000, generatedAt: new Date(now).toISOString(), assets: [{ symbol: "DEMO", name: "Test instrument", currency: "EUR", price: 49.9, confidence: 100, riskScore: 20, reason: "Fixture only" }] }),
    save("execution-market-evidence.json", { observations: ["fixture-a", "fixture-b"].map((family) => ({ symbol: "DEMO", currency: "EUR", source: family, sourceFamily: family, eligibility: "PAPER", price: 49.9, observedAt: new Date(now).toISOString(), provenanceVerified: true })) }),
    save("paper-market-session.json", { evidence: { venue: "US_EQUITIES", state: "OPEN", source: "Fixture clock", observedAt: new Date(now).toISOString(), authoritative: true } }),
    save("paper-fx-evidence.json", { ratesToEuro: { EUR: { rate: 1, observedAt: new Date(now).toISOString() } } }),
    save("intelligence-quality.json", { generatedAt: new Date(now).toISOString(), intelligenceConfidence: 100 }),
    save("global-source-health.json", { generatedAt: new Date(now).toISOString(), critical: { gate: "GREEN" } }),
  ]);
  const snapshotBefore = await readFile(path.join(root, "data", "paper-oms-state.json"), "utf8");
  const payload = await loadPaperReviewPayload(root, now);
  assert.equal(payload.liveTradingAllowed, false);
  assert.equal(payload.brokerOrderSubmissionAllowed, false);
  assert.equal(payload.proposals.length, 1);
  assert.deepEqual(payload.proposals[0].blockers, []);
  const refreshed = await loadPaperReviewPayload(root, now + 1000);
  assert.equal(reviewTermsKey(payload.proposals[0]), reviewTermsKey(refreshed.proposals[0]), "a refresh must not change EUR identity FX or inherit consent");
  decidePaperReview(refreshed.proposals[0], "YES", [], now + 1000);
  assert.equal(await readFile(path.join(root, "data", "paper-oms-state.json"), "utf8"), snapshotBefore, "review simulations must not mutate campaign state");
  const stalePayload = await loadPaperReviewPayload(root, now + 121_000);
  assert(stalePayload.proposals[0].blockers.length > 0);
  await save("paper-market-session.json", { evidence: { venue: "US_EQUITIES", state: "CLOSED", source: "Fixture clock", observedAt: new Date(now).toISOString(), authoritative: true } });
  assert((await loadPaperReviewPayload(root, now)).proposals[0].blockers.some((item) => item.includes("sessione")));
  await save("paper-order-queue.json", { mode: "PAPER", orders: [{ ...demo.order, mode: "LIVE" }] });
  assert.equal((await loadPaperReviewPayload(root, now)).proposals.length, 0);
  await save("paper-order-queue.json", { mode: "PAPER", orders: [] });
  assert.equal((await loadPaperReviewPayload(root, now)).proposals.length, 0);
} finally { await rm(root, { recursive: true, force: true }); }

const route = await readFile(new URL("../app/api/trading/proposals/route.ts", import.meta.url), "utf8");
assert.match(route, /export async function GET/);
assert.doesNotMatch(route, /export (?:async )?function (?:POST|PUT|PATCH|DELETE)/);
assert(PAPER_VALIDATION_CORE_FILES.every((file) => !file.includes("paper-review") && !file.includes("proposal-review")), "review lab must stay outside the active validation core");
const fingerprint = await computePaperValidationFingerprint(path.resolve(new URL("..", import.meta.url).pathname));
assert.equal(fingerprint.complete, true);
console.log("Fenice PAPER proposal review: PASS (consent binding, expiry, duplicate suppression, LIVE rejection, isolated simulation, read-only loading)");
