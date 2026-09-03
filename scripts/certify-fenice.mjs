import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const quality = readJson('data/intelligence-quality.json');
const committee = readJson('data/investment-committee.json');
const ledger = readJson('data/decision-ledger.json');
const terminal = readJson('data/terminal-state.json');
const sourceHealth = readJson('data/global-source-health.json');

const failures = [];
const warnings = [];
const pass = (condition, message) => { if (!condition) failures.push(message); };

// Hard safety invariants: Fenice must remain advisory/paper-only until the user
// explicitly configures a broker in a future change.
pass(quality?.policy?.autonomousTrading === false,
  'SAFETY: autonomousTrading must remain false.');
pass(committee?.executionGate !== 'LIVE' && committee?.executionGate !== 'EXECUTE',
  'SAFETY: executionGate must not enable live execution.');
pass(Number(committee?.proposedFirstTrancheEuro ?? 0) === 0 || committee?.sourceGate === 'GREEN',
  'SAFETY: a non-zero tranche is forbidden unless sourceGate is GREEN.');

for (const d of committee?.topDecisions ?? []) {
  pass(Number.isFinite(d?.riskScore) && d.riskScore >= 0 && d.riskScore <= 100,
    `RISK: invalid riskScore for ${d?.symbol ?? 'unknown'}.`);
  pass(Number.isFinite(d?.maxWeightPercent) && d.maxWeightPercent > 0 && d.maxWeightPercent <= 15,
    `RISK: missing/unsafe maxWeightPercent for ${d?.symbol ?? 'unknown'}.`);
  pass(Array.isArray(d?.invalidation) && d.invalidation.length > 0,
    `RISK: missing invalidation conditions for ${d?.symbol ?? 'unknown'}.`);
  if (quality?.policy?.autonomousTrading === false) {
    pass(d?.entryPlan?.orderMode === 'NESSUN ORDINE' && Number(d?.entryPlan?.firstTrancheEuro ?? 0) === 0,
      `SAFETY: ${d?.symbol ?? 'unknown'} exposes an executable entry while live trading is locked.`);
  }
}

// Prevent generated health artifacts from publishing credentials. The source
// checker must persist only sanitized URLs; actual secrets may exist in memory
// during requests but never in repository artifacts or logs.
const sensitiveParam = /[?&](?:api[-_]?key|apikey|key|token|access[-_]?token|secret|client[-_]?secret)=([^&#\s]+)/i;
for (const source of sourceHealth?.sources ?? []) {
  const endpoint = String(source?.endpointUsed ?? '');
  const match = endpoint.match(sensitiveParam);
  if (match) {
    pass(match[1] === 'REDACTED',
      `SECURITY: source health artifact exposes a credential-like query value for ${source?.name ?? source?.id ?? 'unknown'}.`);
  }
}

// Certification gates. These are intentionally strict and must fail closed.
pass(committee?.sourceGate === 'GREEN',
  `DATA: sourceGate is ${committee?.sourceGate ?? 'missing'}, expected GREEN.`);

const criticalSourceIds = new Set(['sec', 'fred', 'ecb']);
for (const source of quality?.sourceQuality ?? []) {
  if (criticalSourceIds.has(source.id)) {
    pass(source.state === 'operativo' && Number(source.qualityScore) >= 90,
      `DATA: critical source ${source.name ?? source.id} is not healthy (${source.state}, quality ${source.qualityScore}).`);
  }
}

pass(Number(quality?.intelligenceConfidence) >= 90,
  `DATA: intelligenceConfidence is ${quality?.intelligenceConfidence ?? 'missing'}, expected >= 90.`);
pass(Number(quality?.crossSourceValidation?.checked) > 0,
  'DATA: cross-source validation has not run.');
if (Number(quality?.crossSourceValidation?.checked) > 0) {
  const checked = Number(quality.crossSourceValidation.checked);
  const confirmed = Number(quality.crossSourceValidation.confirmed);
  pass(confirmed / checked >= 0.8,
    `DATA: cross-source confirmation ratio ${(100 * confirmed / checked).toFixed(1)}% is below 80%.`);
}
pass(Number(quality?.coverage?.sourceConcentrationPercent) <= 70,
  `DATA: source concentration is ${quality?.coverage?.sourceConcentrationPercent ?? 'missing'}%, expected <= 70%.`);

const sourceStates = quality?.sourceQuality ?? [];
const erroredSources = sourceStates.filter((s) => s.state === 'errore');
if (erroredSources.length) {
  failures.push(`DATA: errored sources remain: ${erroredSources.map((s) => s.name ?? s.id).join(', ')}.`);
}

// Scanner/portfolio structure checks. These do not claim economic validity; they
// only guarantee enough structured breadth for the higher-level certification.
const terminalAssets = Object.values(terminal?.assets ?? {});
pass(terminalAssets.length >= 15,
  `SCANNER: only ${terminalAssets.length} terminal assets, expected >= 15.`);
pass(Number(committee?.candidateCount) >= 15,
  `SCANNER: only ${committee?.candidateCount ?? 0} committee candidates, expected >= 15.`);

// Decision history must exist and contain mark-to-market observations before the
// paper process can be called measurable.
pass(Number(ledger?.recordCount) >= 100,
  `PAPER: decision ledger has only ${ledger?.recordCount ?? 0} records, expected >= 100.`);
const ledgerRecords = ledger?.records ?? [];
pass(ledgerRecords.some((r) => Number.isFinite(r?.markToMarketPercent)),
  'PAPER: no marked-to-market decision records found.');
pass(ledgerRecords.some((r) => r?.checkpoints && Object.keys(r.checkpoints).length > 0),
  'PAPER: no historical checkpoints found.');

// Detect a dangerous semantic discrepancy without pretending the two metrics are
// identical. A large gap must be reviewed before certification.
if (Number.isFinite(committee?.dataQuality) && Number.isFinite(quality?.intelligenceConfidence)) {
  const gap = Math.abs(Number(committee.dataQuality) - Number(quality.intelligenceConfidence));
  if (gap > 20) {
    failures.push(`CONSISTENCY: committee dataQuality (${committee.dataQuality}) and intelligenceConfidence (${quality.intelligenceConfidence}) differ by ${gap} points; review metric provenance before certification.`);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  certified: failures.length === 0,
  liveTradingLocked: quality?.policy?.autonomousTrading === false,
  failures,
  warnings,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
