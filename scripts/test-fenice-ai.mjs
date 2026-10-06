import assert from "node:assert/strict";
import { evaluateFeniceAIThesis, assertAIHasNoExecutionAuthority, validateFeniceAIThesis } from "../lib/ai-intelligence-core.ts";
import { guardFeniceAIProposal } from "../lib/ai-proposal-guard.ts";
import { rankFeniceOpportunities, scoreFeniceOpportunity } from "../lib/ai-opportunity-ranking.ts";
import { compareFeniceTheses, validateThesisSnapshot } from "../lib/ai-thesis-memory.ts";

const now = Date.parse("2026-10-05T14:00:00.000Z");
const thesis = { symbol: "SPY", action: "BUY", confidence: 95, fsiScore: 86, horizon: "MONTHS",
  rationale: ["Fixture with independent evidence"], catalysts: ["Fixture event"],
  invalidation: ["Fixture downside condition"], generatedAt: new Date(now).toISOString() };
const safety = { dataQuality: "PASS", riskEngine: "PASS", session: "PASS", executionMarketData: "PASS",
  duplicateOrderGuard: "PASS", killSwitch: "PASS", brokerWritesEnabled: false, liveTradingReleased: false };
const decision = evaluateFeniceAIThesis(thesis, safety, now);
assert.equal(decision.proposalEligible, true, "closed broker/LIVE locks must not prevent advisory PAPER proposals");
assert.equal(decision.executable, false);
assertAIHasNoExecutionAuthority(decision);
assert.throws(() => assertAIHasNoExecutionAuthority({ ...decision, executable: true }), /AUTHORITY/);
assert.throws(() => assertAIHasNoExecutionAuthority({ ...decision, advisoryOnly: false }), /AUTHORITY/);
for (const gate of ["dataQuality", "riskEngine", "session", "executionMarketData", "duplicateOrderGuard", "killSwitch"]) {
  assert.equal(evaluateFeniceAIThesis(thesis, { ...safety, [gate]: "BLOCK" }, now).proposalEligible, false, gate);
}
for (const flags of [{ brokerWritesEnabled: true }, { liveTradingReleased: true }, { brokerWritesEnabled: undefined }]) {
  const result = evaluateFeniceAIThesis(thesis, { ...safety, ...flags }, now);
  assert.equal(result.proposalEligible, false);
  assert.equal(result.executable, false, "AI cannot acquire authority by opening project flags");
}
for (const change of [
  { confidence: NaN }, { confidence: "95" }, { fsiScore: Infinity }, { confidence: 89 }, { symbol: null },
  { action: "WAIT" }, { action: "UNKNOWN" }, { horizon: "" }, { rationale: [] }, { invalidation: [] }, { catalysts: [null] },
  { generatedAt: new Date(now + 1).toISOString() }, { generatedAt: new Date(now - 86_400_001).toISOString() },
]) assert.equal(evaluateFeniceAIThesis({ ...thesis, ...change }, safety, now).proposalEligible, false, JSON.stringify(change));
assert(validateFeniceAIThesis(null, now).length > 0);

const guardInput = { decision, evidenceCount: 2, evidenceFamilies: ["alpaca", "twelve-data"],
  evidenceFresh: true, proposalTermsComplete: true, userApprovalRequired: true };
assert.equal(guardFeniceAIProposal(guardInput, now).mayCreateProposal, true);
assert.equal(guardFeniceAIProposal(guardInput, now).mayExecute, false);
for (const change of [
  { evidenceCount: NaN }, { evidenceCount: Infinity }, { evidenceCount: "2" }, { evidenceCount: 2.5 },
  { evidenceFamilies: ["alpaca", " ALPACA "] }, { evidenceFamilies: ["alpaca", ""] }, { evidenceFamilies: null },
  { evidenceFresh: "true" }, { proposalTermsComplete: 1 }, { userApprovalRequired: false },
  { decision: { ...decision, executable: true } }, { decision: { ...decision, blockedBy: null } },
  { decision: { ...decision, thesis: { ...thesis, action: "WAIT" } } },
]) assert.equal(guardFeniceAIProposal({ ...guardInput, ...change }, now).mayCreateProposal, false, JSON.stringify(change));
assert.equal(guardFeniceAIProposal(guardInput, now + 86_400_001).mayCreateProposal, false, "a cached eligibility flag cannot extend thesis freshness");
assert.equal(guardFeniceAIProposal(null, now).mayExecute, false);

const opportunity = { ...thesis, horizonBucket: "MONTHS", valuationScore: 75, qualityScore: 85, momentumScore: 60,
  catalystScore: 70, asymmetryScore: 80, systemicRiskPenalty: 20, evidenceQuality: 95 };
const lowerRisk = { ...opportunity, symbol: "QQQ", systemicRiskPenalty: 0 };
assert(scoreFeniceOpportunity(lowerRisk, now) > scoreFeniceOpportunity(opportunity, now));
const ranked = rankFeniceOpportunities([opportunity, lowerRisk, { ...lowerRisk, generatedAt: new Date(now - 1000).toISOString() }], 10, now);
assert.deepEqual(ranked.map(item => item.symbol), ["QQQ", "SPY"]);
assert.deepEqual(rankFeniceOpportunities([lowerRisk, opportunity], 10, now), ranked);
for (const change of [{ systemicRiskPenalty: NaN }, { qualityScore: Infinity }, { evidenceQuality: -1 }, { horizonBucket: "UNKNOWN" }, { confidence: null }]) {
  assert.equal(rankFeniceOpportunities([{ ...opportunity, ...change }], 10, now).length, 0, "missing risk must never become a zero penalty");
}
for (const limit of [NaN, Infinity, 1.5, -1, 101]) assert.deepEqual(rankFeniceOpportunities([opportunity], limit, now), []);

const prior = { ...thesis, id: "thesis-1", evidenceIds: ["quote-a", "quote-b"], modelVersion: "fixture-v1", promptVersion: "fixture-v1" };
const current = { ...prior, id: "thesis-2", action: "WAIT", confidence: 90, generatedAt: new Date(now + 1000).toISOString(),
  catalysts: ["New fixture event"], invalidation: ["Fixture downside condition", "Additional condition"] };
assert.deepEqual(validateThesisSnapshot(prior), []);
const changes = compareFeniceTheses(prior, current);
assert.equal(changes.actionChanged, true);
assert.equal(changes.confidenceDelta, -5);
assert.deepEqual(changes.addedInvalidations, ["Additional condition"]);
assert.deepEqual(changes.removedCatalysts, ["Fixture event"]);
assert.throws(() => compareFeniceTheses(prior, { ...current, symbol: "QQQ" }), /SYMBOL/);
assert.throws(() => compareFeniceTheses(prior, { ...current, generatedAt: new Date(now - 1).toISOString() }), /REVISION/);
assert.throws(() => compareFeniceTheses(prior, { ...current, id: prior.id }), /REVISION/);
for (const change of [{ evidenceIds: ["a", " a "] }, { evidenceIds: [] }, { modelVersion: null }, { confidence: NaN }, { catalysts: null }]) {
  assert(validateThesisSnapshot({ ...prior, ...change }).length > 0);
  assert.throws(() => compareFeniceTheses({ ...prior, ...change }, current), /SNAPSHOT/);
}
assert(validateThesisSnapshot(null).length > 0);
console.log("Fenice AI: PASS (advisory authority, strict evidence, invalid-risk exclusion, deterministic ranking, audited thesis revisions)");
