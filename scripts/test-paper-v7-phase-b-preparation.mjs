import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assessV7PhaseBPreparation as assess } from "../lib/ui/paper-v7-phase-b-preparation.mjs";

const read = async name => JSON.parse(await readFile(
  new URL("../data/" + name, import.meta.url), "utf8"
));
const names = [
  "paper-v7-phase-b-preparation.json",
  "paper-validation-approval.json",
  "paper-validation-campaign.json",
  "paper-oms-state.json",
  "paper-order-queue.json",
  "paper-v6-continuation-plan.json",
];
const values = await Promise.all(names.map(read));
const [manifest, approvalV6, campaignV6, ledgerV6, queueV6, continuationV6] = values;
const input = {
  manifest, approvalV6, campaignV6, ledgerV6, queueV6, continuationV6,
  nowMs: Date.parse("2026-10-26T19:00:00.000Z"),
};
const cloned = value => structuredClone(value);
const original = JSON.stringify(values);
const safe = assess(input);
assert.equal(safe.state, "PREPARATION_SAFE_UNAPPROVED", safe.reasons.join(" | "));
assert.equal(safe.reasons.length, 0);
assert.equal(JSON.stringify(values), original, "The preflight may never mutate V6 files");
assert.equal(safe.historicalV6FillCount, 7, "V6 genuine historical fills must stay identifiable");
assert.equal(safe.historicalV6FillsCreditedToPhaseB, 0);
assert.equal(safe.newPhaseBFills, 0);
assert.equal(safe.newPhaseBStartedAt, null);
assert.equal(safe.newPhaseBApprovalExpiry, null);
assert.equal(safe.separatelyVerifiedOwnerApproval, false);
assert.equal(safe.technicalBaselineCertified, false);
assert.equal(safe.ownerPreparationInstructionAcknowledged, true);
for (const flag of [
  "allowsNewPaperFills", "brokerSubmissionAllowed", "liveTradingAllowed",
  "phaseBPaperCertified", "credentialChangesPerformed", "mutatesV6",
]) assert.equal(safe[flag], false, flag);

const mutate = (key, fn) => {
  const payload = cloned(input);
  fn(payload);
  const result = assess(payload);
  assert.equal(result.state, "PREPARATION_INTEGRITY_BLOCKED", key);
  assert(result.reasons.length > 0, key);
  assert.equal(result.allowsNewPaperFills, false, key);
  assert.equal(result.brokerSubmissionAllowed, false, key);
  assert.equal(result.liveTradingAllowed, false, key);
  assert.equal(result.historicalV6FillsCreditedToPhaseB, 0, key);
};
const cases = [
  ["new approval", i => i.manifest.authorization.approved = true],
  ["approval id forged", i => i.manifest.authorization.approvalId = "paper-v7-b"],
  ["arbitrary expiry", i => i.manifest.authorization.expiresAt = "2026-12-01T00:00:00.000Z"],
  ["consent spoof", i => i.manifest.authorization.explicitPaperOnlyConsentVerified = true],
  ["identity spoof", i => i.manifest.ownerInstruction.identityIndependentlyAuthenticated = true],
  ["approval scope elevated", i => i.manifest.ownerInstruction.authorizesExecution = true],
  ["new PAPER flag", i => i.manifest.safety.newPaperOrdersAllowed = true],
  ["LIVE flag", i => i.manifest.safety.liveTradingAllowed = true],
  ["credential rotation instruction", i => i.manifest.safety.changeConfiguredProviderKeysAllowed = true],
  ["auto approval", i => i.manifest.safety.autoApprovalAllowed = true],
  ["old fills credited", i => i.manifest.v6Custody.carryForwardHistoricalFillCredits = 7],
  ["V6 digest tamper", i => i.manifest.v6Custody.originalFingerprintSha256 = "f".repeat(64)],
  ["V6 expiry altered", i => i.approvalV6.expiresAt = "2026-11-26T21:59:59.000Z"],
  ["V6 approval altered", i => i.approvalV6.maxOrdersPerDay = 2],
  ["V6 live unlocked", i => i.approvalV6.liveTradingAllowed = true],
  ["V6 queue not empty", i => i.queueV6.orders.push({clientOrderId:"fake"})],
  ["V6 ledger fill invented", i => i.ledgerV6.executions.push({status:"PAPER_FILLED"})],
  ["V6 ledger audit changed", i => i.ledgerV6.auditChain = []],
  ["V6 campaign digest altered", i => i.campaignV6.baselineFingerprint.digest = "a".repeat(64)],
  ["V6 last fill increased", i => i.campaignV6.dailyEvidence.at(-1).newPaperFills = 1],
  ["V6 last cumulative altered", i => i.campaignV6.dailyEvidence.at(-1).cumulativePaperFilled = 8],
  ["V6 audit red", i => i.campaignV6.dailyEvidence.at(-1).auditChainValid = false],
  ["V6 history dropped", i => i.campaignV6.dailyEvidence.splice(0,1)],
  ["V6 continuation auto renewal", i => i.continuationV6.absoluteRestrictions.mayRenewV6Approval = true],
  ["looser max notional", i => i.manifest.proposedRiskLimits.maxNotionalEuroPerOrder = 301],
  ["looser daily cap", i => i.manifest.proposedRiskLimits.maxOrdersPerDay = 2],
  ["looser score", i => i.manifest.proposedRiskLimits.minCommitteeScore = 65],
  ["weaker FX freshness", i => i.manifest.proposedRiskLimits.fxPolicy.maxAgeSeconds = 600],
  ["fewer target fills", i => i.manifest.proposedRiskLimits.minGenuineNewPhaseFills = 7],
  ["shorter forward campaign", i => i.manifest.proposedRiskLimits.minCalendarDays = 5],
  ["candidate certified without evidence", i => i.manifest.candidate.candidateBaselineCommit = i.manifest.candidate.referenceMainSha],
  ["invented fingerprint", i => i.manifest.candidate.candidateFingerprintSha256 = "1".repeat(64)],
  ["review self-attestation", i => i.manifest.candidate.independentlyReviewed = true],
  ["approval status activated", i => i.manifest.phase = "ACTIVE"],
  ["wrong clock", i => i.nowMs = Number.NaN],
];
for (const [label, fn] of cases) mutate(label, fn);

// This proposal's files must not be inserted into the frozen V6 core digest.
for (const file of [
  "data/paper-v7-phase-b-preparation.json",
  "lib/ui/paper-v7-phase-b-preparation.mjs",
  "scripts/check-paper-v7-phase-b-preparation.mjs",
  "scripts/test-paper-v7-phase-b-preparation.mjs",
  ".github/workflows/paper-v7-phase-b-preparation.yml",
])
  assert.equal(campaignV6.baselineFingerprint.files.includes(file), false,
    "Frozen V6 footprint may not contain " + file);

// No keys are read and all old source/provider config stays intact.
assert.equal(manifest.safety.changeConfiguredProviderKeysAllowed, false);
assert.equal(manifest.authorization.expiresAt, null);
assert.equal(manifest.candidate.candidateBaselineCommit, null);
console.log("V7 Phase B preparation: PASS (proposal-only, 33 negative cases, zero PAPER/LIVE/broker authority)");
