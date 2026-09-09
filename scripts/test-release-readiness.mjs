import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const now = Date.now();

async function readJson(name) {
  return JSON.parse(await readFile(path.join(dataDir, name), 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(`RELEASE BLOCKED: ${message}`);
}

function ageHours(value, label) {
  const parsed = Date.parse(value);
  assert(Number.isFinite(parsed), `${label} has an invalid timestamp`);
  return (now - parsed) / 3_600_000;
}

const sourceHealth = await readJson('global-source-health.json');
const committee = await readJson('investment-committee.json');
const governance = await readJson('decision-governance.json');
const universe = await readJson('global-universe.json');
const ledger = await readJson('decision-ledger.json');

// Final readiness is intentionally stricter than ordinary regression CI.
// A transient or stale GREEN must never be enough to certify Fenice.
assert(sourceHealth.gate === 'GREEN', `source gate is ${sourceHealth.gate}, expected GREEN`);
assert(sourceHealth.critical?.gate === 'GREEN', `critical source gate is ${sourceHealth.critical?.gate || 'missing'}`);
assert(Number(sourceHealth.critical?.ready) === Number(sourceHealth.critical?.total), 'not all critical sources are ready');
assert((sourceHealth.critical?.failures || []).length === 0, `critical source failures: ${(sourceHealth.critical?.failures || []).join(', ')}`);
assert(Number(sourceHealth.qualityScore) >= 80, `data quality is ${sourceHealth.qualityScore}, below production floor`);
assert(ageHours(sourceHealth.generatedAt, 'global-source-health.generatedAt') <= 36, 'source-health evidence is older than 36 hours');

for (const source of sourceHealth.sources || []) {
  if (!source.critical) continue;
  assert(['healthy', 'degraded'].includes(source.status), `${source.id} is ${source.status}`);
  assert(ageHours(source.checkedAt, `${source.id}.checkedAt`) <= 36, `${source.id} health check is older than 36 hours`);
}

assert(committee.sourceGate === 'GREEN', `committee still carries sourceGate=${committee.sourceGate}`);
assert(ageHours(committee.generatedAt, 'investment-committee.generatedAt') <= 36, 'committee output is older than 36 hours');
assert(Number.isFinite(Number(committee.dataQuality)), 'committee dataQuality is missing');
assert(Number(committee.proposedFirstTrancheEuro || 0) >= 0, 'committee proposed tranche is negative');

// Governance must remain fail-closed even after all analysis gates are green.
assert(governance.guardrails?.requireHumanConfirmation === true, 'human confirmation guardrail is disabled');
assert(governance.guardrails?.blockAutonomousTrading === true, 'autonomous trading guardrail is disabled');
assert(governance.guardrails?.blockSignalWhenDataDivergent === true, 'divergent-data guardrail is disabled');
assert(governance.guardrails?.blockSignalWhenSourceStale === true, 'stale-source guardrail is disabled');
assert((governance.prohibitedActions || []).includes('inviare ordini'), 'order transmission is not explicitly prohibited');
assert((governance.prohibitedActions || []).includes('collegarsi a broker'), 'broker connection is not explicitly prohibited');

// The scanner must remain genuinely global and multi-asset, not silently regress to a narrow watchlist.
const instruments = Array.isArray(universe.instruments) ? universe.instruments : [];
assert(instruments.length >= 50, `global universe contains only ${instruments.length} instruments`);
const assetClasses = new Set(instruments.map((item) => item.assetClass).filter(Boolean));
const regions = new Set(instruments.map((item) => item.region).filter(Boolean));
const sectors = new Set(instruments.map((item) => item.sector).filter(Boolean));
assert(assetClasses.size >= 5, `global universe covers only ${assetClasses.size} asset classes`);
assert(regions.size >= 6, `global universe covers only ${regions.size} regions`);
assert(sectors.size >= 12, `global universe covers only ${sectors.size} sectors`);
for (const requiredTheme of ['cybersecurity', 'defense', 'space', 'robotics', 'nuclear', 'uranium', 'gold', 'agriculture']) {
  assert(instruments.some((item) => (item.themes || []).includes(requiredTheme)), `global universe is missing required theme ${requiredTheme}`);
}

// Audit/paper evidence: require a meaningful, time-spanning immutable decision history before readiness.
const records = Array.isArray(ledger.records) ? ledger.records : [];
assert(records.length >= 100, `decision ledger contains only ${records.length} records`);
const recordTimes = records.map((record) => Date.parse(record.createdAt)).filter(Number.isFinite).sort((a, b) => a - b);
assert(recordTimes.length === records.length, 'decision ledger contains invalid timestamps');
assert(recordTimes.at(-1) - recordTimes[0] >= 72 * 3_600_000, 'decision ledger spans less than 72 hours');
const ids = new Set(records.map((record) => record.id));
assert(ids.size === records.length, 'decision ledger contains duplicate ids');

const historyDir = path.join(dataDir, 'committee-history');
const historyFiles = (await readdir(historyDir)).filter((name) => name.endsWith('.json')).sort();
assert(historyFiles.length >= 10, `committee history contains only ${historyFiles.length} snapshots`);
const historyTimes = historyFiles
  .map((name) => Date.parse(name.replace(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2}\.\d{3}Z)\.json$/, '$1:$2:$3')))
  .filter(Number.isFinite)
  .sort((a, b) => a - b);
assert(historyTimes.length >= 10, 'committee history timestamps are not parseable');
assert(historyTimes.at(-1) - historyTimes[0] >= 72 * 3_600_000, 'committee history spans less than 72 hours');

console.log(
  `Fenice release readiness GREEN: sources ${sourceHealth.critical.ready}/${sourceHealth.critical.total}, ` +
  `quality ${sourceHealth.qualityScore}, universe ${instruments.length} instruments/${assetClasses.size} classes/${regions.size} regions, ` +
  `ledger ${records.length} records, history ${historyFiles.length} snapshots. Live trading remains blocked.`,
);
