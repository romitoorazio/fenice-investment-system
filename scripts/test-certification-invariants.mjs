import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');

async function readJson(name) {
  return JSON.parse(await readFile(path.join(dataDir, name), 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertScore(value, label) {
  assert(Number.isFinite(Number(value)), `${label} must be numeric`);
  assert(Number(value) >= 0 && Number(value) <= 100, `${label} must be within 0..100`);
}

const committee = await readJson('investment-committee.json');
const ledger = await readJson('decision-ledger.json');
const sourceHealth = await readJson('global-source-health.json');
const sourceRegistry = await readJson('global-source-registry.json');
const committeeSource = await readFile(path.join(root, 'scripts', 'run-investment-committee-v2.mjs'), 'utf8');

// Certification invariant: a non-GREEN institutional source gate can never arm execution.
assert(
  /sourceGate\s*!==\s*['"]GREEN['"]/.test(committeeSource),
  'Risk veto regression: committee v2 must explicitly block execution whenever sourceGate is not GREEN',
);

assert(Array.isArray(sourceRegistry.sources) && sourceRegistry.sources.length >= 10, 'Global source registry coverage is insufficient');
const criticalSources = sourceRegistry.sources.filter((source) => source.critical === true);
assert(criticalSources.length >= 5, 'Critical-source coverage is insufficient');
assert(criticalSources.some((source) => source.id === 'sec'), 'SEC must remain a critical source');

assertScore(sourceHealth.qualityScore, 'sourceHealth.qualityScore');
assert(['GREEN', 'AMBER', 'RED'].includes(sourceHealth.gate), `Invalid source gate: ${sourceHealth.gate}`);
if (sourceHealth.gate !== 'GREEN') {
  assert(
    committee.executionGate !== 'PRONTO_CON_CONFERMA',
    `Unsafe persisted state: source gate ${sourceHealth.gate} cannot coexist with execution gate PRONTO_CON_CONFERMA`,
  );
  assert(Number(committee.proposedFirstTrancheEuro || 0) === 0, 'Non-GREEN source gate must force proposed first tranche to zero');
}

assert(Array.isArray(committee.allDecisions || committee.topDecisions), 'Committee decisions are missing');
for (const decision of committee.allDecisions || committee.topDecisions || []) {
  assert(decision.symbol, 'Committee decision without symbol');
  assertScore(decision.committeeScore, `${decision.symbol}.committeeScore`);
  assertScore(decision.confidence, `${decision.symbol}.confidence`);
  assertScore(decision.riskScore, `${decision.symbol}.riskScore`);
  assert(Number.isFinite(Number(decision.maxWeightPercent)), `${decision.symbol}.maxWeightPercent must be numeric`);
  assert(Number(decision.maxWeightPercent) > 0 && Number(decision.maxWeightPercent) <= 10, `${decision.symbol}.maxWeightPercent outside risk limits`);
  const tranche = Number(decision.entryPlan?.firstTrancheEuro || 0);
  assert(tranche >= 0 && tranche <= Number(committee.capitalEuro || 0) * 0.15, `${decision.symbol} first tranche exceeds portfolio guardrail`);
  if (decision.decision !== 'COMPRA') {
    assert(tranche === 0, `${decision.symbol} non-BUY decision cannot allocate a first tranche`);
    assert(decision.entryPlan?.orderMode === 'NESSUN ORDINE', `${decision.symbol} non-BUY decision must have NESSUN ORDINE mode`);
  }
  assert(Array.isArray(decision.invalidation) && decision.invalidation.length >= 2, `${decision.symbol} lacks thesis invalidation rules`);
}

assert(Array.isArray(ledger.records), 'Decision ledger records are missing');
assert(Number(ledger.recordCount) >= ledger.records.length, 'Decision ledger record count is inconsistent');
assert(ledger.records.length >= 100, 'Decision ledger history is too short for certification evidence');
const ids = new Set();
for (const record of ledger.records) {
  assert(record.id && !ids.has(record.id), `Duplicate decision-ledger id: ${record.id}`);
  ids.add(record.id);
  assert(record.symbol && record.decision && record.createdAt, `Incomplete decision-ledger record: ${record.id || 'unknown'}`);
  assertScore(record.committeeScore, `${record.id}.committeeScore`);
  assertScore(record.confidence, `${record.id}.confidence`);
  assertScore(record.riskScore, `${record.id}.riskScore`);
  assert(Number(record.proposedFirstTrancheEuro || 0) >= 0, `${record.id} has negative proposed tranche`);
  if (record.executionGate !== 'PRONTO_CON_CONFERMA') {
    assert(Number(record.proposedFirstTrancheEuro || 0) === 0, `${record.id} allocates capital while execution is not armed`);
  }
}

// There is no broker/live execution contract in certification mode. The committee may only propose a plan.
assert(
  /Nessun ordine viene trasmesso automaticamente al broker/.test(committeeSource),
  'Broker-transmission safety rule is missing from committee v2',
);

console.log(`Certification invariants OK: ${criticalSources.length} critical sources, ${ledger.records.length} ledger records, gate ${sourceHealth.gate}.`);
