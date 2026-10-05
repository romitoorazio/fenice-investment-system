import assert from "node:assert/strict";
import { evaluatePaperProbeRecoveryTrigger, PAPER_PROBE_RECOVERY_UPSTREAMS } from "./paper-probe-recovery-trigger.mjs";

const base = {
  now: "2026-10-05T16:00:00Z",
  eventName: "workflow_run",
  ref: "refs/heads/main",
  repository: "owner/fenice",
  upstream: {
    name: "Fenice World Terminal",
    event: "schedule",
    conclusion: "success",
    headBranch: "main",
    headRepository: "owner/fenice",
  },
};

for (const name of PAPER_PROBE_RECOVERY_UPSTREAMS) {
  assert.equal(evaluatePaperProbeRecoveryTrigger({ ...base, upstream: { ...base.upstream, name } }).allowed, true, name);
}

for (const [now, allowed, label] of [
  ["2026-10-05T14:34:59Z", false, "before recovery window"],
  ["2026-10-05T14:35:00Z", true, "recovery window open"],
  ["2026-10-05T19:30:00Z", true, "last recovery minute"],
  ["2026-10-05T19:31:00Z", false, "after recovery window"],
  ["2026-09-29T21:25:32Z", false, "observed late September 29 probe"],
  ["2026-09-30T21:26:10Z", false, "observed late September 30 probe"],
  ["2026-10-01T21:50:50Z", false, "observed late October 1 probe"],
  ["2026-10-02T21:20:09Z", false, "observed late October 2 probe"],
  ["2026-10-03T16:00:00Z", false, "Saturday"],
  ["2026-10-04T16:00:00Z", false, "Sunday"],
  ["2026-12-01T14:35:00Z", true, "standard-time recovery window"],
  ["not-a-time", false, "invalid timestamp"],
]) {
  for (const eventName of ["workflow_run", "schedule", "workflow_dispatch", "push"]) {
    assert.equal(evaluatePaperProbeRecoveryTrigger({ ...base, now, eventName }).allowed, allowed, `${label}: ${eventName}`);
  }
}

for (const [override, reason] of [
  [{ name: "Fenice Intelligence Quality" }, "unapproved-upstream"],
  [{ event: "push" }, "upstream-not-successful-schedule"],
  [{ event: "pull_request" }, "upstream-not-successful-schedule"],
  [{ event: "workflow_dispatch" }, "upstream-not-successful-schedule"],
  [{ conclusion: "failure" }, "upstream-not-successful-schedule"],
  [{ conclusion: "cancelled" }, "upstream-not-successful-schedule"],
  [{ conclusion: "skipped" }, "upstream-not-successful-schedule"],
  [{ headBranch: "feature/test" }, "upstream-not-repository-main"],
  [{ headRepository: "someone-else/fenice" }, "upstream-not-repository-main"],
  [{ headRepository: undefined }, "upstream-not-repository-main"],
]) {
  const result = evaluatePaperProbeRecoveryTrigger({ ...base, upstream: { ...base.upstream, ...override } });
  assert.equal(result.allowed, false, JSON.stringify(override));
  assert.equal(result.reason, reason);
}
assert.equal(evaluatePaperProbeRecoveryTrigger({ ...base, upstream: {} }).allowed, false);
assert.equal(evaluatePaperProbeRecoveryTrigger({ ...base, repository: undefined }).allowed, false);
assert.equal(evaluatePaperProbeRecoveryTrigger({ ...base, eventName: "pull_request" }).allowed, false);
for (const eventName of ["schedule", "workflow_dispatch", "push"]) {
  assert.equal(evaluatePaperProbeRecoveryTrigger({ ...base, eventName, ref: "refs/heads/feature/test" }).allowed, false);
}

// A trigger can become unsafe while queued; the dispatch step must evaluate
// the actual time again rather than reuse the first preflight's result.
assert.equal(evaluatePaperProbeRecoveryTrigger({ ...base, now: "2026-10-05T19:29:00Z" }).allowed, true);
assert.equal(evaluatePaperProbeRecoveryTrigger({ ...base, now: "2026-10-05T19:31:00Z" }).allowed, false);
console.log("PAPER recovery trigger timing and event provenance: PASS");
