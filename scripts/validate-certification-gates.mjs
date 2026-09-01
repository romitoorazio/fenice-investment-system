import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');

async function readJson(name) {
  const raw = await readFile(path.join(dataDir, name), 'utf8');
  return JSON.parse(raw);
}

const failures = [];
const checks = [];
const check = (name, condition, detail) => {
  checks.push({ name, pass: Boolean(condition), detail });
  if (!condition) failures.push(`${name}: ${detail}`);
};

const committee = await readJson('investment-committee.json');
const terminal = await readJson('terminal-intelligence.json');
const sources = await readJson('global-source-health.json');
const ledger = await readJson('decision-ledger.json');
const snapshot = await readJson('latest-snapshot.json');

const sourceGate = String(committee.sourceGate || sources.gate || sources.institutionalGate || 'UNKNOWN').toUpperCase();
const dataQuality = Number(committee.dataQuality ?? terminal.dataQuality ?? 0);
const assets = Array.isArray(terminal.assets) ? terminal.assets : [];
const decisions = Array.isArray(committee.allDecisions) ? committee.allDecisions : [];
const records = Array.isArray(ledger.records) ? ledger.records : [];
const warnings = Array.isArray(committee.warnings) ? committee.warnings : [];
const snapshotWarnings = Array.isArray(snapshot.warnings) ? snapshot.warnings : [];

check('source-gate-green', sourceGate === 'GREEN', `source gate=${sourceGate}`);
check('data-quality', dataQuality >= 98, `data quality=${dataQuality}; target >=98 with no critical source gaps`);
check('scanner-coverage', assets.length >= 15, `terminal assets=${assets.length}; target >=15`);
check('decision-coverage', decisions.length === assets.length && decisions.length >= 15, `decisions=${decisions.length}, assets=${assets.length}`);
check('scoring-complete', decisions.every((item) => Number.isFinite(Number(item.committeeScore)) && Number.isFinite(Number(item.riskScore)) && Number.isFinite(Number(item.confidence))), 'every candidate must have committeeScore, riskScore and confidence');
check('risk-bounds', decisions.every((item) => Number(item.maxWeightPercent) > 0 && Number(item.maxWeightPercent) <= 10), 'all positions must have a positive max weight capped at 10%');
check('speculative-cap', decisions.filter((item) => item.positionType === 'SPECULATIVA').every((item) => Number(item.maxWeightPercent) <= 2.5), 'speculative positions must remain <=2.5%');
check('buy-invalidation', decisions.filter((item) => item.decision === 'COMPRA').every((item) => Array.isArray(item.invalidation) && item.invalidation.length >= 2), 'every BUY candidate needs explicit invalidation conditions');
check('buy-entry-plan', decisions.filter((item) => item.decision === 'COMPRA').every((item) => item.entryPlan && item.entryPlan.orderMode === 'LIMITE' && Number(item.entryPlan.firstTrancheEuro) >= 0), 'every BUY candidate needs a bounded limit-entry plan');
check('ledger-present', records.length >= decisions.length, `ledger records=${records.length}, current decisions=${decisions.length}`);
check('ledger-marking', records.slice(-Math.max(1, decisions.length)).every((item) => item.createdAt && item.symbol && item.decision && Number.isFinite(Number(item.riskScore))), 'recent ledger records must be attributable and risk-marked');
check('no-critical-warning', ![...warnings, ...snapshotWarnings].some((item) => /critical|critico|corrupt|invalid|missing critical|fonte critica/i.test(String(item))), 'critical data warnings must be absent');

// Hard safety invariant: Fenice is research/paper-only until a future explicit broker project exists.
// executionGate may describe analytical readiness, but it must never imply that an order was transmitted.
check('live-trading-locked', !('brokerOrderId' in committee) && !('liveTradingEnabled' in committee) && !('brokerConnected' in committee), 'committee output must contain no live-broker execution state');
check('paper-only-rule', Array.isArray(committee.committeeRules) && committee.committeeRules.some((rule) => /Nessun ordine viene trasmesso automaticamente al broker/i.test(String(rule))), 'committee must explicitly state that no broker order is transmitted');

const result = {
  generatedAt: new Date().toISOString(),
  certification: failures.length ? 'NOT_READY' : 'READY_FOR_PAPER_CERTIFICATION',
  checks,
  failures,
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
