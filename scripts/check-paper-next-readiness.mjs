// Read-only PAPER-next readiness checkpoint. Does not submit, stage or fill orders.
import { readFileSync } from "node:fs";
import { computePaperNextFingerprint } from "./paper-next-fingerprint.mjs";
import { assessPaperNextActivation } from "./paper-next-activation-preflight.mjs";

const read = file => JSON.parse(readFileSync("data/" + file, "utf8"));
const approval = read("paper-next-approval.json");
const ledger = read("paper-next-forward-ledger.json");
const days = read("paper-next-forward-days.json");
const fingerprint = await computePaperNextFingerprint(".");
const campaign = {
  mode: ledger.mode,
  approvalId: ledger.campaignId,
  baselineCommit: approval.baselineCommit,
  fingerprintDigest: approval.fingerprintDigest,
  liveTradingAllowed: ledger.liveTradingAllowed,
  brokerConnectivityAllowed: ledger.brokerConnectivityAllowed,
};
const result = assessPaperNextActivation({
  approval, fingerprint, campaign, ledger, now: new Date().toISOString(),
});
if (!Array.isArray(days.days) || days.campaignId !== ledger.campaignId
  || days.liveTradingAllowed !== false || days.brokerConnectivityAllowed !== false)
  throw Error("PAPER_NEXT_DAYS_INTEGRITY_FAILURE");
console.log(JSON.stringify({
  mode: "PAPER_NEXT_READ_ONLY", state: result.allowed ? "PREFLIGHT_ALLOWED" : "BLOCKED",
  reason: result.reason, fingerprintComplete: fingerprint.complete,
  fingerprintDigest: fingerprint.digest, attempts: ledger.attempts.length,
  recordedDays: days.days.length, liveTradingAllowed: false, brokerConnectivityAllowed: false,
}));
