import { readFile, writeFile } from "node:fs/promises";
import { buildV7ProposalReadiness } from "../lib/intelligence/proposal-readiness.mjs";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

const [approval, committee, terminal, coverage, marketSession] = await Promise.all([
  readJson("data/paper-validation-approval.json"),
  readJson("data/investment-committee.json"),
  readJson("data/terminal-intelligence.json"),
  readJson("data/execution-market-coverage.json"),
  readJson("data/paper-market-session.json"),
]);

const report = buildV7ProposalReadiness({ approval, committee, terminal, coverage, marketSession }, Date.now());
const output = String(process.env.FENICE_V7_PROPOSAL_READINESS || "v7-proposal-readiness.json").trim();
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const top = report.rows.slice(0, 8)
  .map((row) => `${row.symbol}:v6=${row.validationCandidateReady ? "READY" : row.validationCandidateBlockers.join("+")};review=${row.reviewProposalCandidateReady ? "READY" : row.reviewProposalCandidateBlockers.join("+")}`)
  .join(" | ");
console.log(
  `Fenice V7 proposal readiness: candidates=${report.candidateCount}; validationCandidates=${report.validationCandidateReadyCount}; reviewCandidates=${report.reviewProposalCandidateReadyCount}; shared=${report.sharedGlobalBlockers.join(",") || "none"}; validationGlobal=${report.validationGlobalBlockers.join(",") || "none"}; ${top}; diagnosticOnly=true; queueWritesAllowed=false; liveTradingAllowed=false.`,
);
