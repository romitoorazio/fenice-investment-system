import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { evaluatePaperProbeCooldown, PAPER_PROVIDER_COOLDOWN_MINUTES } from "./paper-probe-cooldown.mjs";

const now = Date.parse("2026-10-05T16:00:00Z");
const at = (seconds) => new Date(now - seconds * 1000).toISOString();
const run = (overrides = {}) => ({ databaseId: 1, status: "completed", event: "workflow_dispatch", headBranch: "main",
  createdAt: at(3600), updatedAt: at(1800), ...overrides });
const base = { now: new Date(now), probeRuns: [], validationRuns: [], executionEvidence: { generatedAt: at(1800) } };
const evaluate = (overrides = {}) => evaluatePaperProbeCooldown({ ...base, ...overrides });

assert.equal(PAPER_PROVIDER_COOLDOWN_MINUTES, 15);
assert.equal(evaluate().ready, true, "a first probe must not require research data to become older");
for (const [ageSeconds, ready] of [[899.999, false], [900, true], [900.001, true], [3600, true]]) {
  assert.equal(evaluate({ executionEvidence: { generatedAt: at(ageSeconds) } }).ready, ready, `provider boundary: ${ageSeconds}`);
  for (const key of ["probeRuns", "validationRuns"]) {
    assert.equal(evaluate({ [key]: [run({ updatedAt: at(ageSeconds) })] }).ready, ready, `${key} boundary: ${ageSeconds}`);
  }
}
const recentProvider = evaluate({ probeRuns: [run()], executionEvidence: { generatedAt: at(60) } });
assert.equal(recentProvider.reason, "provider-cooldown-pending");
assert.equal(recentProvider.latestProviderActivityAt, at(60));
const recentCompletion = evaluate({ probeRuns: [run({ createdAt: at(7200), updatedAt: at(60) })] });
assert.equal(recentCompletion.ready, false, "a long-running cycle must cool down after completion, not creation");
for (const conclusion of ["success", "failure", "cancelled", "skipped", "timed_out"]) {
  assert.equal(evaluate({ probeRuns: [run({ updatedAt: at(60), conclusion })] }).ready, false,
    "failed cycles may still have spent provider credits");
}
for (const key of ["probeRuns", "validationRuns"]) {
  for (const status of ["queued", "in_progress", "waiting", "pending", "requested"]) {
    const blocked = evaluate({ [key]: [run({ status })] });
    assert.equal(blocked.ready, false);
    assert.equal(blocked.reason, "canonical-paper-cycle-active", `${key}: ${status}`);
  }
  for (const invalid of [undefined, null, {}, "[]"]) {
    assert.equal(evaluate({ [key]: invalid }).reason, "invalid-paper-run-history");
  }
  for (const overrides of [{ databaseId: undefined }, { databaseId: "1" }, { databaseId: 0 },
    { headBranch: "feature/test" }, { headBranch: undefined }, { event: "pull_request" }, { event: undefined },
    { status: "unknown" }, { status: undefined }]) {
    assert.equal(evaluate({ [key]: [run(overrides)] }).reason, "invalid-paper-run-metadata");
  }
  assert.equal(evaluate({ [key]: [run(), run()] }).reason, "invalid-paper-run-metadata");
  for (const overrides of [{ updatedAt: undefined }, { createdAt: undefined }, { updatedAt: at(-1) },
    { createdAt: at(-1) }, { updatedAt: at(3601) }, { updatedAt: "2026-02-30T16:00:00Z" },
    { updatedAt: "2026-10-05T16:00:00" }, { updatedAt: "2026-10-05" }]) {
    assert.equal(evaluate({ [key]: [run(overrides)] }).reason, "invalid-or-future-paper-run-time");
  }
}
for (const generatedAt of [undefined, null, "bad", "2026-02-30T16:00:00Z", "2026-10-05T16:00:00", at(-1)]) {
  assert.equal(evaluate({ executionEvidence: { generatedAt } }).reason, "invalid-or-future-execution-evidence-time");
}
for (const invalid of ["bad", "2026-02-30T16:00:00Z", "2026-10-05", new Date(NaN)]) {
  assert.equal(evaluate({ now: invalid }).reason, "invalid-request-time");
}
const ordered = [run({ databaseId: 2, updatedAt: at(901) }), run({ databaseId: 3, updatedAt: at(3600) })];
assert.equal(evaluate({ probeRuns: ordered }).latestProviderActivityAt, at(901), "history order must not select an older anchor");
assert.equal(evaluate({ probeRuns: [...ordered].reverse() }).latestProviderActivityAt, at(901));
// The real main audit includes pre-V6 push-triggered canonical probes. These
// remain provider activity; history provenance never authorizes a new trigger.
const legacyPush = { databaseId: 36052665388, status: "completed", event: "push", headBranch: "main",
  createdAt: "2026-09-24T20:06:48Z", updatedAt: "2026-09-24T20:11:42Z" };
assert.equal(evaluate({ probeRuns: [legacyPush, run()] }).ready, true);
assert.equal(evaluate({ validationRuns: [legacyPush] }).ready, true);
assert.equal(evaluate({ probeRuns: [run({ event: "push", updatedAt: at(60) })] }).ready, false,
  "a recent push-triggered canonical cycle still spends the full provider cooldown");
assert.equal(evaluate({ probeRuns: [run({ event: "push", status: "in_progress" })] }).reason,
  "canonical-paper-cycle-active");
const before = JSON.stringify(base);
evaluatePaperProbeCooldown(base);
assert.equal(JSON.stringify(base), before, "policy must not mutate provider evidence or histories");

// Replay the observed false skips: first in-session probe, institutional quality
// freshly rebuilt by the upstream, and no recent execution-provider cycle.
for (const [instant, researchAgeMinutes, executionAt] of [
  ["2026-10-01T16:28:40.740Z", 1.2, "2026-09-30T19:39:30.559Z"],
  ["2026-10-02T15:50:20.330Z", 2.2, "2026-10-01T19:04:56.166Z"],
]) {
  assert.equal(researchAgeMinutes >= 15, false, "the old intelligence-age condition blocked these recoveries");
  const replay = evaluatePaperProbeCooldown({ now: instant, probeRuns: [], validationRuns: [],
    executionEvidence: { generatedAt: executionAt } });
  assert.equal(replay.ready, true, "fresh research quality is independent of the provider-credit cooldown");
}

const directory = await mkdtemp(path.join(tmpdir(), "fenice-paper-cooldown-"));
try {
  const files = ["probe.json", "validation.json", "execution.json"].map((name) => path.join(directory, name));
  const inputs = [[], [], { generatedAt: new Date(Date.now() - 3600 * 1000).toISOString() }];
  for (let index = 0; index < files.length; index += 1) await writeFile(files[index], JSON.stringify(inputs[index]));
  const cli = spawnSync(process.execPath, ["scripts/paper-probe-cooldown.mjs", "--probe-runs", files[0],
    "--validation-runs", files[1], "--execution-evidence", files[2]], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).ready, true);
  for (let index = 0; index < files.length; index += 1) {
    assert.deepEqual(JSON.parse(await readFile(files[index], "utf8")), inputs[index], "CLI only reads supplied inputs");
  }
  const missing = spawnSync(process.execPath, ["scripts/paper-probe-cooldown.mjs"], { encoding: "utf8" });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /PAPER_COOLDOWN_ARGUMENT_MISSING/);
  const unexpected = spawnSync(process.execPath, ["scripts/paper-probe-cooldown.mjs", "--output", "data/paper-oms-state.json"], { encoding: "utf8" });
  assert.notEqual(unexpected.status, 0);
  assert.match(unexpected.stderr, /PAPER_COOLDOWN_ARGUMENT_INVALID/);
} finally { await rm(directory, { recursive: true, force: true }); }

console.log("PAPER provider cooldown PASS: actual provider/run activity, completion-time pacing, active-cycle suppression, strict metadata/timestamps, observed fresh-quality skips and read-only CLI.");
