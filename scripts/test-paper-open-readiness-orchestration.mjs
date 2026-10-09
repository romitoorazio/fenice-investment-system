import assert from "node:assert/strict";
import { assessPersistedPaperSession } from "../lib/intelligence/persisted-paper-session-gate.mjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checker = await readFile(path.join(root, "scripts/check-paper-open-readiness.mjs"), "utf8");
const workflow = await readFile(path.join(root, ".github/workflows/paper-open-readiness.yml"), "utf8");

assert.match(checker, /readJson\("data\/paper-fx-evidence\.json"\)/, "readiness must load the canonical PAPER FX evidence produced by the refresh workflow");
assert.doesNotMatch(checker, /paper-market-fx\.json/, "readiness must not reference the obsolete/non-produced paper-market-fx.json path");
assert.match(checker, /readJson\("data\/paper-validation-approval\.json"\)/, "readiness must load PAPER approval policy");
assert.match(checker, /evaluatePaperBaselineEligibility\(\{[\s\S]*?fxEvidence,[\s\S]*?approval,[\s\S]*?fingerprint,[\s\S]*?\}\)/, "readiness must pass FX evidence and approval into baseline evaluation");

assert.match(workflow, /id: session_gate[\s\S]*?market_open=\$\{open\}/, "workflow must derive an authoritative open-session gate before provider refreshes");

for (const stepName of [
  "Refresh critical source health",
  "Build fresh intelligence quality",
  "Build fresh base execution evidence",
  "Refresh coherent Twelve Data batch evidence",
  "Measure per-symbol PAPER coverage",
]) {
  const escaped = stepName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(
    workflow,
    new RegExp(`- name: ${escaped}\\n\\s+if: steps\\.session_gate\\.outputs\\.market_open == 'true'`),
    `${stepName} must be skipped when the authoritative market session is not open`,
  );
}

assert.match(workflow, /data\/paper-fx-evidence\.json/, "readiness artifact must retain the canonical FX evidence used by the gate");
assert.doesNotMatch(workflow, /paper-market-fx\.json/, "workflow must not retain or reference the obsolete/non-produced FX path");

assert.match(checker, /assessPersistedPaperSession\(session\)/, "readiness script must re-evaluate persisted evidence using current time");
assert.match(workflow, /assessPersistedPaperSession\(session\)\.marketOpen/, "provider refresh must reject an old persisted OPEN snapshot");
const observedNow = Date.parse("2026-10-09T13:40:10.000Z");
const currentSession = {
  version: 1, generatedAt: "2026-10-09T13:40:00.000Z", configured: true,
  evidence: { venue: "US_EQUITIES", state: "OPEN", authoritative: true, observedAt: "2026-10-09T13:39:55.000Z" },
  decision: { allowed: true, ageSeconds: 5, reasons: [] },
};
assert.equal(assessPersistedPaperSession(currentSession, observedNow).marketOpen, true);
assert.equal(assessPersistedPaperSession({ ...currentSession, decision: { allowed: true, ageSeconds: 0, reasons: [] } }, observedNow + 180000).marketOpen, false, "previously-fresh stored age must not hide a 3-minute-old clock");
assert.equal(assessPersistedPaperSession({ ...currentSession, generatedAt: "2026-10-08T13:40:00.000Z" }, observedNow).marketOpen, false, "stale generated files must fail closed");
assert.equal(assessPersistedPaperSession({ ...currentSession, evidence: { ...currentSession.evidence, observedAt: "2026-10-10T13:40:00Z" } }, observedNow).marketOpen, false, "future-dated provider evidence must fail closed");
assert.equal(assessPersistedPaperSession({ ...currentSession, evidence: { ...currentSession.evidence, state: "CLOSED" }, decision: { allowed: false, ageSeconds: 5, reasons: ["market is closed"] } }, observedNow).marketClosed, true);
assert.equal(assessPersistedPaperSession({ ...currentSession, decision: { allowed: false, ageSeconds: 5, reasons: [] } }, observedNow).marketOpen, false, "contradictory OPEN/allowed flags must fail closed");
assert.equal(assessPersistedPaperSession({ ...currentSession, decision: { allowed: true, ageSeconds: "0", reasons: [] } }, observedNow).marketOpen, false, "untyped age metadata must fail closed");
assert(workflow.includes('- cron: "45 13 * * 1-5"'), "must sample US DST opening within 15 minutes");
assert(workflow.includes('- cron: "45 14 * * 1-5"'), "must sample US standard-time opening within 15 minutes");
assert(!workflow.includes('- cron: "5 15 * * 1-5"'), "must not delay the sole market-open diagnosis by more than 90 minutes");

assert(workflow.includes('- cron: "15 16 * * 1-5"'), "must retain a DST-independent intraday recovery sampling window");
assert.match(workflow, /id: schedule_guard[\s\S]*?continue-on-error: true[\s\S]*?run: node scripts\/verify-market-open-schedule\.mjs/, "workflow must audit schedule timeliness without skipping evidence upload");
assert.match(workflow, /data\/paper-open-schedule-audit\.json/, "readiness artifact must retain scheduler audit evidence");
assert.match(workflow, /if: always\(\) && steps\.schedule_guard\.outcome == 'failure'[\s\S]*?exit 1/, "late market-open checks must never finish green");

console.log("Fenice PAPER open-readiness orchestration regression: PASS.");
