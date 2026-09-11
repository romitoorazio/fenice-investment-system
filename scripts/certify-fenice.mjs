import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const quality = readJson("data/intelligence-quality.json");
const committee = readJson("data/investment-committee.json");
const ledger = readJson("data/decision-ledger.json");
const terminal = readJson("data/terminal-state.json");
const sourceHealth = readJson("data/global-source-health.json");
const governance = readJson("data/decision-governance.json");

const failures = [];
const warnings = [];
const pass = (condition, message) => { if (!condition) failures.push(message); };

pass(quality?.policy?.autonomousTrading === false, "SAFETY: autonomousTrading must remain false.");
pass(governance?.guardrails?.blockAutonomousTrading === true, "SAFETY: governance must hard-block autonomous trading.");
pass(governance?.guardrails?.requireHumanConfirmation === true, "SAFETY: actionable decisions must require human confirmation.");
pass(committee?.executionGate !== "LIVE" && committee?.executionGate !== "EXECUTE", "SAFETY: executionGate must not enable live execution.");
pass(Number(committee?.proposedFirstTrancheEuro ?? 0) === 0 || committee?.sourceGate === "GREEN", "SAFETY: a non-zero tranche is forbidden unless sourceGate is GREEN.");

for (const decision of committee?.topDecisions ?? []) {
  pass(Number.isFinite(decision?.riskScore) && decision.riskScore >= 0 && decision.riskScore <= 100, `RISK: invalid riskScore for ${decision?.symbol ?? "unknown"}.`);
  pass(Number.isFinite(decision?.maxWeightPercent) && decision.maxWeightPercent > 0 && decision.maxWeightPercent <= 15, `RISK: missing/unsafe maxWeightPercent for ${decision?.symbol ?? "unknown"}.`);
  pass(Array.isArray(decision?.invalidation) && decision.invalidation.length > 0, `RISK: missing invalidation conditions for ${decision?.symbol ?? "unknown"}.`);
  if (quality?.policy?.autonomousTrading === false) {
    pass(decision?.entryPlan?.orderMode === "NESSUN ORDINE" && Number(decision?.entryPlan?.firstTrancheEuro ?? 0) === 0, `SAFETY: ${decision?.symbol ?? "unknown"} exposes an executable entry while live trading is locked.`);
  }
}

const sensitiveParam = /[?&](?:api[-_]?key|apikey|key|token|access[-_]?token|secret|client[-_]?secret)=([^&#\s]+)/i;
for (const source of sourceHealth?.sources ?? []) {
  const endpoint = String(source?.endpointUsed ?? "");
  const match = endpoint.match(sensitiveParam);
  if (match) pass(match[1] === "REDACTED", `SECURITY: source health artifact exposes a credential-like query value for ${source?.name ?? source?.id ?? "unknown"}.`);
}

pass(sourceHealth?.gate === "GREEN", `DATA: global source gate is ${sourceHealth?.gate ?? "missing"}, expected GREEN.`);
pass((sourceHealth?.critical?.failures ?? []).length === 0, `DATA: critical source failures remain: ${(sourceHealth?.critical?.failures ?? []).join(", ") || "unknown"}.`);
pass(Number(sourceHealth?.critical?.ready ?? 0) === Number(sourceHealth?.critical?.total ?? -1), `DATA: critical source readiness is ${sourceHealth?.critical?.ready ?? "?"}/${sourceHealth?.critical?.total ?? "?"}.`);
pass(committee?.sourceGate === "GREEN", `DATA: committee sourceGate is ${committee?.sourceGate ?? "missing"}, expected GREEN.`);
pass(Number(quality?.intelligenceConfidence) >= 90, `DATA: intelligenceConfidence is ${quality?.intelligenceConfidence ?? "missing"}, expected >= 90.`);

const criticalSourceIds = new Set(["sec", "fred", "ecb"]);
for (const source of quality?.sourceQuality ?? []) {
  if (criticalSourceIds.has(source.id)) pass(source.state === "operativo" && Number(source.qualityScore) >= 90, `DATA: critical source ${source.name ?? source.id} is not healthy (${source.state}, quality ${source.qualityScore}).`);
}

pass(Number(quality?.crossSourceValidation?.checked) > 0, "DATA: cross-source validation has not run.");
if (Number(quality?.crossSourceValidation?.checked) > 0) {
  const checked = Number(quality.crossSourceValidation.checked);
  const confirmed = Number(quality.crossSourceValidation.confirmed);
  pass(confirmed / checked >= 0.8, `DATA: cross-source confirmation ratio ${(100 * confirmed / checked).toFixed(1)}% is below 80%.`);
}
pass(Number(quality?.coverage?.sourceConcentrationPercent) <= 70, `DATA: source concentration is ${quality?.coverage?.sourceConcentrationPercent ?? "missing"}%, expected <= 70%.`);
const erroredSources = (quality?.sourceQuality ?? []).filter(source => source.state === "errore");
pass(erroredSources.length === 0, `DATA: errored intelligence sources remain: ${erroredSources.map(source => source.name ?? source.id).join(", ") || "none"}.`);

const terminalAssets = Object.values(terminal?.assets ?? {});
pass(terminalAssets.length >= 15, `SCANNER: only ${terminalAssets.length} terminal assets, expected >= 15.`);
pass(Number(committee?.candidateCount) >= 15, `SCANNER: only ${committee?.candidateCount ?? 0} committee candidates, expected >= 15.`);
const assetClasses = new Set(quality?.coverage?.assetClasses ?? []);
pass(assetClasses.size >= 3, `SCANNER: intelligence quality covers only ${assetClasses.size} asset classes, expected >= 3.`);

pass(Number(ledger?.recordCount) >= 100, `PAPER: decision ledger has only ${ledger?.recordCount ?? 0} records, expected >= 100.`);
const ledgerRecords = ledger?.records ?? [];
pass(ledgerRecords.some(record => Number.isFinite(record?.markToMarketPercent)), "PAPER: no marked-to-market decision records found.");
pass(ledgerRecords.some(record => record?.checkpoints && Object.keys(record.checkpoints).length > 0), "PAPER: no historical checkpoints found.");

if (Number.isFinite(committee?.dataQuality) && Number.isFinite(quality?.intelligenceConfidence)) {
  const gap = Math.abs(Number(committee.dataQuality) - Number(quality.intelligenceConfidence));
  pass(gap <= 20, `CONSISTENCY: committee dataQuality (${committee.dataQuality}) and intelligenceConfidence (${quality.intelligenceConfidence}) differ by ${gap} points.`);
}

const report = { generatedAt: new Date().toISOString(), certified: failures.length === 0, liveTradingLocked: quality?.policy?.autonomousTrading === false && governance?.guardrails?.blockAutonomousTrading === true, failures, warnings };
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
