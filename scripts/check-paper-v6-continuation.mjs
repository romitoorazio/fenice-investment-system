import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computePaperValidationFingerprint } from "../lib/trading/validation-fingerprint.mjs";
import { assessPaperV6ContinuationPreparation } from "../lib/ui/paper-v6-continuation-preflight.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read = name => readFile(path.join(root,"data",name),"utf8").then(JSON.parse);
const [plan,campaign,approval,ledger,queue,fingerprint] = await Promise.all([
  read("paper-v6-continuation-plan.json"),
  read("paper-validation-campaign.json"),
  read("paper-validation-approval.json"),
  read("paper-oms-state.json"),
  read("paper-order-queue.json"),
  computePaperValidationFingerprint(root),
]);
const report=assessPaperV6ContinuationPreparation({plan,campaign,approval,ledger,queue,fingerprint});
console.log(JSON.stringify(report,null,2));
if(report.reasons.length) process.exitCode=2;
// Preparation is only diagnostic. Never write credentials, approvals, queue,
// campaign counters or orders. No CLI option to grant authority exists.
