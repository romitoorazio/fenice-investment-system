import assert from "node:assert/strict";
import { assessPaperNextActivation } from "./paper-next-activation-preflight.mjs";

const digest = "a".repeat(64);
const commit = "b".repeat(40);
const approval = {
  mode: "PAPER", approved: true, humanConfirmation: true,
  approvalId: "paper-next-example", baselineCommit: commit, fingerprintDigest: digest,
  approvedAt: "2026-11-06T00:00:00Z", expiresAt: "2026-12-06T00:00:00Z",
  liveTradingAllowed: false, brokerConnectivityAllowed: false,
  allowBackfill: false, historicalFillsCredited: 0,
  maxOrdersPerDay: 1, minCommitteeScore: 70, minValidationDataConfidence: 90,
  maxRiskScore: 75, maxNotionalEuroPerOrder: 300,
  maxCapitalPercentPerProbe: 3, maxSingleAssetWeightPercentForProbe: 15,
};
const input = {
  approval,
  fingerprint: { complete: true, digest },
  campaign: { mode: "PAPER", approvalId: approval.approvalId, baselineCommit: commit,
    fingerprintDigest: digest, liveTradingAllowed: false, brokerConnectivityAllowed: false },
  ledger: { mode: "PAPER", attempts: [], positions: {}, tip: "GENESIS", virtualSeedEuro: 10000, cashEuro: 10000,
    liveTradingAllowed: false, brokerConnectivityAllowed: false },
  now: "2026-11-07T00:00:00Z",
};
const assess = (mutate) => {
  const test = structuredClone(input);
  mutate(test);
  return assessPaperNextActivation(test);
};
assert.equal(assessPaperNextActivation(input).allowed, true, "valid isolated fixture");
const negative = [
  ["no human consent", x => { x.approval.humanConfirmation = false; }],
  ["no approval", x => { x.approval.approved = false; }],
  ["live leak", x => { x.ledger.liveTradingAllowed = true; }],
  ["broker leak", x => { x.campaign.brokerConnectivityAllowed = true; }],
  ["wrong digest", x => { x.approval.fingerprintDigest = "c".repeat(64); }],
  ["missing fingerprint", x => { x.fingerprint.complete = false; }],
  ["wrong baseline", x => { x.campaign.baselineCommit = "c".repeat(40); }],
  ["wrong campaign", x => { x.campaign.approvalId = "other"; }],
  ["expired", x => { x.now = "2026-12-06T00:00:00Z"; }],
  ["backfill", x => { x.approval.allowBackfill = true; }],
  ["old fills", x => { x.approval.historicalFillsCredited = 7; }],
  ["non-genesis", x => { x.ledger.attempts = [{}]; }],
  ["positions imported", x => { x.ledger.positions = { SPY: 1 }; }],
  ["missing positions", x => { delete x.ledger.positions; }],
  ["wrong genesis tip", x => { x.ledger.tip = "tampered"; }],
  ["missing capital", x => { delete x.ledger.virtualSeedEuro; }],
  ["cash mismatch", x => { x.ledger.cashEuro = 9999; }],
  ["daily limit", x => { x.approval.maxOrdersPerDay = 2; }],
  ["score relaxation", x => { x.approval.minCommitteeScore = 69; }],
  ["confidence relaxation", x => { x.approval.minValidationDataConfidence = 89; }],
  ["risk relaxation", x => { x.approval.maxRiskScore = 76; }],
  ["notional relaxation", x => { x.approval.maxNotionalEuroPerOrder = 301; }],
  ["capital relaxation", x => { x.approval.maxCapitalPercentPerProbe = 4; }],
  ["concentration relaxation", x => { x.approval.maxSingleAssetWeightPercentForProbe = 16; }],
];
for (const [name, mutate] of negative) {
  assert.equal(assess(mutate).allowed, false, name);
}
console.log("PAPER-next activation preflight: PASS (24 negative gates)");
