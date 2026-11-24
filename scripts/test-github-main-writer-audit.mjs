import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyWorkflowText, inventoryWorkflows, assessCompatibility,
} from "./audit-github-main-writers.mjs";

test("identifies direct main pushes, including refs/heads/main", () => {
  const text = [
    "permissions:",
    "  contents: write",
    "run: |",
    "  if git push origin HEAD:main; then exit 0; fi",
    "  git push origin HEAD:refs/heads/main",
  ].join("\n");
  const row = classifyWorkflowText(text, "fixture.yml");
  assert.equal(row.contentsWrite, true);
  assert.deepEqual(row.directMainPush.map(p => p.line), [4, 5]);
  assert.equal(row.otherGitPush.length, 0);
});

test("a separate evidence branch is not falsely classified as main", () => {
  const row = classifyWorkflowText(
    "run: git push origin HEAD:refs/heads/fenice-phase4-evidence",
    "fixture.yml");
  assert.equal(row.directMainPush.length, 0);
  assert.equal(row.otherGitPush.length, 1);
  assert.equal(assessCompatibility([row]).rulesetReady, false);
});

test("reports unclassified GitHub writes without authorizing activation", () => {
  const row = classifyWorkflowText([
    "permissions:",
    "  contents: read",
    "steps:",
    "  - run: gh api repos/owner/repo/git/refs",
  ].join("\n"));
  const report = assessCompatibility([row]);
  assert.equal(report.directMainWriterCount, 0);
  assert.equal(report.requiresManualReview.length, 1);
  assert.equal(report.rulesetReady, false);
  assert.equal(report.approvalToActivateRuleset, false);
  assert.equal(report.evidenceType, "STATIC_SOURCE_ONLY");
});

test("does not treat a read-only workflow as a writer", () => {
  const row = classifyWorkflowText([
    "permissions:",
    "  contents: read",
    "steps:",
    "  - run: node scripts/read-only.mjs",
  ].join("\n"));
  assert.equal(row.directMainPush.length, 0);
  assert.equal(row.otherGitPush.length, 0);
  assert.equal(assessCompatibility([row]).staticYamlBlockersAbsent, true);
  assert.equal(assessCompatibility([row]).rulesetReady, false);
});

test("inventory scans current workflow source without changing it", () => {
  const rows = inventoryWorkflows();
  assert.ok(rows.length > 0);
  assert.ok(rows.every(r => r.path.startsWith(".github/workflows/")));
  assert.equal(assessCompatibility(rows).workflowCount, rows.length);
});

test("flags indirect writes and write-all without explicit git commands", () => {
  const indirect = classifyWorkflowText("permissions:\n  contents: write\nsteps:\n  - run: node scripts/publish.mjs", "indirect.yml");
  const broad = classifyWorkflowText("permissions: write-all\nsteps:\n  - run: node scripts/publish.mjs", "broad.yml");
  assert.equal(indirect.contentsWrite, true);
  assert.equal(broad.contentsWrite, true);
  const report = assessCompatibility([indirect, broad]);
  assert.equal(report.directMainWriterCount, 0);
  assert.equal(report.requiresManualReview.length, 2);
  assert.equal(report.staticYamlBlockersAbsent, false);
  assert.equal(report.rulesetReady, false);
});
