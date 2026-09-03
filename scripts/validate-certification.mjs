import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');

async function readJson(name) {
  return JSON.parse(await readFile(path.join(dataDir, name), 'utf8'));
}

const failures = [];
const notes = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const [committee, sourceHealth, governance, terminal, ledger, universe] = await Promise.all([
  readJson('investment-committee.json'),
  readJson('global-source-health.json'),
  readJson('decision-governance.json'),
  readJson('terminal-intelligence.json'),
  readJson('decision-ledger.json'),
  readJson('global-universe.json'),
]);

// Safety is non-negotiable: certification must never imply live execution.
check(governance?.guardrails?.blockAutonomousTrading === true, 'Autonomous trading is not explicitly blocked.');
check(governance?.guardrails?.requireHumanConfirmation === true, 'Human confirmation guardrail is missing.');
check(Array.isArray(governance?.prohibitedActions) && governance.prohibitedActions.includes('inviare ordini'), 'Order transmission is not explicitly prohibited.');
check(Array.isArray(governance?.prohibitedActions) && governance.prohibitedActions.includes('collegarsi a broker'), 'Broker connection is not explicitly prohibited.');
check(Array.isArray(committee?.committeeRules) && committee.committeeRules.some((rule) => /Nessun ordine.*broker/i.test(rule)), 'Investment Committee does not explicitly prohibit broker order transmission.');
check(committee?.executionGate !== 'AUTO' && committee?.executionGate !== 'LIVE', `Unsafe execution gate: ${committee?.executionGate}.`);
for (const decision of Array.isArray(committee?.topDecisions) ? committee.topDecisions : []) {
  check(decision?.entryPlan?.orderMode === 'NESSUN ORDINE', `${decision?.symbol || 'unknown'}: entry plan is not explicitly non-executable.`);
}

// Source and data quality gate.
const criticalFailures = sourceHealth?.critical?.failures || [];
check(sourceHealth?.gate === 'GREEN', `Source gate is ${sourceHealth?.gate || 'UNKNOWN'}, expected GREEN.`);
check(criticalFailures.length === 0, `Critical data sources unavailable: ${criticalFailures.join(', ') || 'unknown'}.`);
check(Number(committee?.dataQuality) >= 95, `Committee data quality is ${committee?.dataQuality ?? 'missing'}/100, minimum 95.`);
check(committee?.sourceGate === sourceHealth?.gate, `Committee source gate ${committee?.sourceGate || 'UNKNOWN'} does not match source-health gate ${sourceHealth?.gate || 'UNKNOWN'}.`);

// Scanner coverage must not collapse into a single theme.
const assets = Array.isArray(terminal?.assets) ? terminal.assets : [];
check(assets.length >= 15, `Global scanner has only ${assets.length} assets; minimum 15.`);
const assetClasses = new Set(assets.map((asset) => String(asset.assetClass || '').trim()).filter(Boolean));
check(assetClasses.size >= 5, `Global scanner covers only ${assetClasses.size} asset classes; minimum 5.`);
const sectors = new Set(assets.map((asset) => String(asset.sector || asset.assetClass || '').trim()).filter(Boolean));
check(sectors.size >= 8, `Global scanner covers only ${sectors.size} sectors/themes; minimum 8.`);
const universeAssets = universe?.assets || universe?.instruments || universe;
check(Array.isArray(universeAssets) && universeAssets.length >= 15, 'Global universe is missing or too small.');

// Scoring/risk fields must be reproducible and bounded for every published asset.
for (const asset of assets) {
  const symbol = asset?.symbol || 'unknown';
  check(Number.isFinite(Number(asset?.unifiedScore)), `${symbol}: unifiedScore missing or non-numeric.`);
  check(Number.isFinite(Number(asset?.riskScore)), `${symbol}: riskScore missing or non-numeric.`);
  check(Number(asset?.unifiedScore) >= 0 && Number(asset?.unifiedScore) <= 100, `${symbol}: unifiedScore outside 0..100.`);
  check(Number(asset?.riskScore) >= 0 && Number(asset?.riskScore) <= 100, `${symbol}: riskScore outside 0..100.`);
}

// Paper trail must exist, use the canonical records schema and remain internally consistent.
const ledgerRecords = Array.isArray(ledger?.records) ? ledger.records : [];
check(ledgerRecords.length > 0, 'Decision ledger has no historical records.');
check(Number.isInteger(ledger?.recordCount), 'Decision ledger recordCount is missing or invalid.');
check(ledger?.recordCount === ledgerRecords.length, `Decision ledger recordCount ${ledger?.recordCount ?? 'missing'} does not match records length ${ledgerRecords.length}.`);
for (const record of ledgerRecords) {
  check(Boolean(record?.id && record?.createdAt && record?.symbol && record?.decision), 'Decision ledger contains a record missing identity/audit fields.');
  check(Number.isFinite(Number(record?.riskScore)), `${record?.symbol || 'unknown'} ledger record has invalid riskScore.`);
}
let committeeHistoryCount = 0;
try {
  committeeHistoryCount = (await readdir(path.join(dataDir, 'committee-history'))).filter((name) => name.endsWith('.json')).length;
} catch {
  committeeHistoryCount = 0;
}
check(committeeHistoryCount > 0, 'Investment Committee history is empty.');

// Published datasets must be recent enough for certification. This is deliberately
// generous enough for weekends/holidays while preventing stale snapshots being marked ready.
const now = Date.now();
for (const [label, value] of [
  ['committee', committee?.generatedAt],
  ['source health', sourceHealth?.generatedAt],
  ['terminal', terminal?.generatedAt],
  ['ledger', ledger?.generatedAt],
]) {
  const timestamp = Date.parse(value || '');
  check(Number.isFinite(timestamp), `${label}: generatedAt is missing or invalid.`);
  if (Number.isFinite(timestamp)) check(now - timestamp <= 72 * 60 * 60 * 1000, `${label}: dataset is older than 72 hours.`);
}

if (Number(committee?.dataQuality) < 100) notes.push(`Data quality is ${committee?.dataQuality}/100; accepted only because the certification floor is 95 and all critical sources must be GREEN.`);

if (failures.length) {
  console.error('FENICE CERTIFICATION: NOT READY');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('FENICE CERTIFICATION: READY FOR PAPER/MANUAL MODE');
console.log(`Sources: ${sourceHealth.gate}; data quality: ${committee.dataQuality}/100; scanner assets: ${assets.length}; asset classes: ${assetClasses.size}; sectors: ${sectors.size}; ledger records: ${ledgerRecords.length}; committee history: ${committeeHistoryCount}.`);
for (const note of notes) console.log(`NOTE: ${note}`);
console.log('Live trading remains blocked and broker connection remains prohibited.');
