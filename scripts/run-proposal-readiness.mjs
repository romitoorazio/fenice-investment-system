import { readFile, writeFile } from "node:fs/promises";
import { buildV7ProposalReadiness } from "../lib/intelligence/proposal-readiness.mjs";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

const [approval, committee, coverage, marketSession] = await Promise.all([
  readJson("data/paper-validation-approval.json"),
  readJson("data/investment-committee.json"),
  readJson("data/execution-market-coverage.json"),
  readJson("data/paper-market-session.json"),
]);

const report = buildV7ProposalReadiness({ approval, committee, coverage, marketSession }, Date.now());
const output = String(process.env.FENICE_V7_PROPOSAL_READINESS || "v7-proposal-readiness.json").trim();
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const top = report.rows.slice(0, 8)
  .map((row) => `${row.symbol}:probe=${row.paperProbeEligible ? "READY" : row.paperProbeBlockers.join("+")};proposal=${row.reviewProposalEligible ? "READY" : row.reviewProposalBlockers.join("+")}`)
  .join(" | ");
console.log(
  `Fenice V7 proposal readiness: candidates=${report.candidateCount}; probeReady=${report.paperProbeReadyCount}; reviewReady=${report.reviewProposalReadyCount}; global=${report.globalBlockers.join(",") || "none"}; ${top}; diagnosticOnly=true; queueWritesAllowed=false; liveTradingAllowed=false.`,
);
