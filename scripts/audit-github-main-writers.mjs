// Read-only inventory for compatibility planning BEFORE activating GitHub rulesets.
// Intentionally no GitHub API calls, credentials, branch mutations or trading activity.
// A static scan is NOT a substitute for end-to-end workflow validation.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflowDir = join(root, ".github", "workflows");

export function classifyWorkflowText(text, path = "<fixture>") {
  const lines = String(text).split(/\r?\n/);
  const directMainPush = [];
  const otherGitPush = [];
  const privilegedOperations = [];
  const mainRef = /(?:HEAD:(?:refs\/heads\/)?main\b|(?:^|\s)refs\/heads\/main\b|(?:^|\s)main(?:\s|;|$))/;

  for (let i = 0; i < lines.length; i++) {
    const command = lines[i].trim();
    if (!command || command.startsWith("#")) continue;
    if (/\bgit\s+push\b/.test(command)) {
      const record = { line: i + 1, command };
      if (mainRef.test(command)) directMainPush.push(record);
      else otherGitPush.push(record);
    }
    if (/\bgh\s+api\b|\bgh\s+pr\s+(?:create|merge)\b|create-pull-request@/i.test(command)) {
      privilegedOperations.push({ line: i + 1, command });
    }
  }
  return {
    path,
    contentsWrite: /^\s*contents:\s*write\s*$/m.test(text),
    directMainPush,
    otherGitPush,
    privilegedOperations,
  };
}

export function inventoryWorkflows(directory = workflowDir) {
  return readdirSync(directory)
    .filter(name => /\.ya?ml$/.test(name))
    .sort()
    .map(name => classifyWorkflowText(readFileSync(join(directory, name), "utf8"),
      ".github/workflows/" + name));
}

export function assessCompatibility(rows) {
  const direct = rows.filter(row => row.directMainPush.length > 0);
  const unclassified = rows.filter(row =>
    row.otherGitPush.length > 0 || row.privilegedOperations.length > 0);
  return {
    mode: "READ_ONLY_DIAGNOSTIC",
    workflowCount: rows.length,
    directMainWriterCount: direct.length,
    directMainWriters: direct.map(row => ({
      path: row.path,
      contentsWrite: row.contentsWrite,
      pushLines: row.directMainPush.map(p => p.line),
    })),
    requiresManualReview: unclassified.map(row => ({
      path: row.path,
      otherPushLines: row.otherGitPush.map(p => p.line),
      privilegedOperationLines: row.privilegedOperations.map(p => p.line),
    })),
    staticYamlBlockersAbsent: direct.length === 0 && unclassified.length === 0,
    // Intentionally NEVER infer activation readiness from static YAML alone.
    rulesetReady: false,
    approvalToActivateRuleset: false,
    evidenceType: "STATIC_SOURCE_ONLY",
    restrictions: [
      "Does not determine active workflow status, write necessity or runtime dependencies",
      "Cannot prove that a PR created by GITHUB_TOKEN triggers required checks",
      "Does not inspect scripts invoked by workflows or dynamic GitHub API writes",
      "Never activate ruleset without independent tests and owner approval",
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = assessCompatibility(inventoryWorkflows());
  console.log(JSON.stringify(report, null, 2));
  // Diagnostic-only by default: must not block CURRENT PAPER collection.
  // --require-compatible is for a future, explicitly authorized pre-activation gate.
  if (process.argv.includes("--require-compatible"))
    process.exitCode = 1;
}
