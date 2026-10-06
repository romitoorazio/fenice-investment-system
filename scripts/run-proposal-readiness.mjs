import { readFile, writeFile } from "node:fs/promises";
import { buildV7ProposalReadiness } from "../lib/intelligence/proposal-readiness.mjs";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

const paths = {
  approval: String(process.env.FENICE_V7_APPROVAL_PATH || "data/paper-validation-approval.json").trim(),
  committee: String(process.env.FENICE_V7_COMMITTEE_PATH || "data/investment-committee.json").trim(),
  terminal: String(process.env.FENICE_V7_TERMINAL_PATH || "data/terminal-intelligence.json").trim(),
  coverage: String(process.env.FENICE_V7_COVERAGE_PATH || "data/execution-market-coverage.json").trim(),
  marketSession: String(process.env.FENICE_V7_MARKET_SESSION_PATH || "data/paper-market-session.json").trim(),
};

const [approval, committee, terminal, coverage, marketSession] = await Promise.all([
  readJson(paths.approval),
  readJson(paths.committee),
  readJson(paths.terminal),
  readJson(paths.coverage),
  readJson(paths.marketSession),
]);

const report = buildV7ProposalReadiness({ approval, committee, terminal, coverage, marketSession }, Date.now());
const output = String(process.env.FENICE_V7_PROPOSAL_READINESS || "v7-proposal-readiness.json").trim();
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const top = report.rows.slice(0, 8)
  .map((row) => `${row.symbol}:v6=${row.validationCandidateReady ? "READY" : row.validationCandidateBlockers.join("+")};review=${row.reviewProposalCandidateReady ? "READY" : row.reviewProposalCandidateBlockers.join("+")}`)
  .join(" | ");
console.log(
  `Fenice V7 proposal readiness: candidates=${report.candidateCount}; validationStructural=${report.validationStructurallyReadyCount}; reviewStructural=${report.reviewProposalStructurallyReadyCount}; validationCandidates=${report.validationCandidateReadyCount}; reviewCandidates=${report.reviewProposalCandidateReadyCount}; shared=${report.sharedGlobalBlockers.join(",") || "none"}; validationGlobal=${report.validationGlobalBlockers.join(",") || "none"}; ${top}; diagnosticOnly=true; queueWritesAllowed=false; liveTradingAllowed=false.`,
);
