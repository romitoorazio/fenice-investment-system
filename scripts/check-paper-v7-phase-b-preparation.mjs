import { readFile } from "node:fs/promises";
import { assessV7PhaseBPreparation } from "../lib/ui/paper-v7-phase-b-preparation.mjs";

const read = async filename => JSON.parse(await readFile(
  new URL("../data/" + filename, import.meta.url), "utf8"
));
const [manifest, approvalV6, campaignV6, ledgerV6, queueV6, continuationV6] =
  await Promise.all([
    read("paper-v7-phase-b-preparation.json"),
    read("paper-validation-approval.json"),
    read("paper-validation-campaign.json"),
    read("paper-oms-state.json"),
    read("paper-order-queue.json"),
    read("paper-v6-continuation-plan.json"),
  ]);
const report = assessV7PhaseBPreparation({
  manifest, approvalV6, campaignV6, ledgerV6, queueV6, continuationV6
});
console.log(JSON.stringify(report, null, 2));
// A green readiness CHECK does not activate orders, renew approval, count
// historical fills in Phase B, rotate keys or alter any ledger.
if (report.state !== "PREPARATION_SAFE_UNAPPROVED"
  || report.allowsNewPaperFills !== false
  || report.liveTradingAllowed !== false
  || report.brokerSubmissionAllowed !== false
  || report.historicalV6FillsCreditedToPhaseB !== 0
  || report.credentialChangesPerformed !== false
  || report.mutatesV6 !== false) process.exitCode = 2;
