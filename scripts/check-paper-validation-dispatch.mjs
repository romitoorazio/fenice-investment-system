import { appendFile, readFile } from "node:fs/promises";
import { evaluatePaperValidationDispatch } from "../lib/trading/paper-dispatch-policy.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function readJson(name) {
  const file = argument(name);
  if (!file) throw new Error(`PAPER_DISPATCH_ARGUMENT_MISSING: ${name}`);
  return JSON.parse(await readFile(file, "utf8"));
}

const [campaign, marketSession, workflowRuns] = await Promise.all([
  readJson("--campaign"),
  readJson("--market-session"),
  readJson("--workflow-runs"),
]);
const result = evaluatePaperValidationDispatch({ campaign, marketSession, workflowRuns });
const githubOutput = argument("--github-output");

if (githubOutput) {
  const lines = [
    `should_dispatch=${result.shouldDispatch}`,
    `already_recorded=${result.finalEvidenceToday}`,
    `active_run=${result.activeCanonicalRun}`,
    `session_phase=${result.sessionPhase}`,
  ];
  await appendFile(githubOutput, `${lines.join("\n")}\n`, "utf8");
}

console.log(`Fenice PAPER dispatch policy: dispatch=${result.shouldDispatch}; finalEvidenceToday=${result.finalEvidenceToday}; activeCanonicalRun=${result.activeCanonicalRun}; session=${result.sessionPhase}; reason=${result.reason}.`);
