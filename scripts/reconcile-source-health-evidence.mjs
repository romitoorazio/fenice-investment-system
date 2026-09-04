import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const healthPath = path.join(dataDir, 'global-source-health.json');
const registryPath = path.join(dataDir, 'global-source-registry.json');
const fundamentalsPath = path.join(dataDir, 'fundamental-research.json');

function ageHours(value, now = Date.now()) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? (now - parsed) / 3_600_000 : Infinity;
}

export function hasFreshSecPipelineEvidence(fundamentals, now = Date.now()) {
  if (!fundamentals || typeof fundamentals !== 'object') return false;
  const source = fundamentals.source || {};
  const sourceName = String(source.name || '');
  const state = String(source.state || '').toLowerCase();
  const coverage = Number(fundamentals.coveragePercent);
  const companyCount = Number(fundamentals.companyCount);
  const universeSize = Number(fundamentals.universeSize);
  const lastSuccessAt = source.lastSuccessAt || fundamentals.generatedAt;

  return /SEC EDGAR/i.test(sourceName)
    && state === 'operativo'
    && coverage === 100
    && companyCount > 0
    && companyCount === universeSize
    && ageHours(lastSuccessAt, now) <= 12;
}

function authorityWeight(source) {
  if (source.critical) return 3;
  if (source.authority === 'central-bank' || source.authority === 'regulator') return 2.5;
  if (source.authority === 'institutional') return 2;
  if (source.authority === 'market-data') return 1.5;
  return 1;
}

function recompute(report, registry) {
  const counts = (report.sources || []).reduce((acc, source) => {
    acc[source.status] = (acc[source.status] || 0) + 1;
    return acc;
  }, { healthy: 0, degraded: 0, failed: 0, unconfigured: 0 });

  const stateScore = { healthy: 1, degraded: 0.65, failed: 0, unconfigured: 0 };
  let earned = 0;
  let possible = 0;
  for (const source of report.sources || []) {
    const config = (registry.sources || []).find((item) => item.id === source.id) || source;
    const weight = authorityWeight(config);
    possible += weight;
    earned += weight * (stateScore[source.status] ?? 0);
  }

  const reliabilityScore = possible ? Math.round((earned / possible) * 100) : 0;
  const criticalSources = (report.sources || []).filter((source) => source.critical);
  const criticalReady = criticalSources.filter((source) => ['healthy', 'degraded'].includes(source.status)).length;
  const failures = criticalSources.filter((source) => ['failed', 'unconfigured'].includes(source.status)).map((source) => source.id);
  const gate = failures.length === 0 && reliabilityScore >= 80 ? 'GREEN' : reliabilityScore >= 65 ? 'AMBER' : 'RED';

  report.summary = counts;
  report.reliabilityScore = reliabilityScore;
  report.qualityScore = reliabilityScore;
  report.gate = gate;
  report.institutionalGate = gate;
  report.critical = { ready: criticalReady, total: criticalSources.length, failures, gate };
  return report;
}

export function reconcileSourceHealth(report, registry, fundamentals, now = Date.now()) {
  const sec = (report.sources || []).find((source) => source.id === 'sec');
  if (sec?.status === 'failed' && sec.httpStatus === 403 && hasFreshSecPipelineEvidence(fundamentals, now)) {
    sec.status = 'degraded';
    sec.detail = 'Probe diretto SEC bloccato dal runner (HTTP 403), ma pipeline primaria SEC EDGAR Company Facts verificata operativa, fresca e con copertura 100%.';
    sec.evidence = {
      type: 'fresh-primary-pipeline',
      source: fundamentals.source?.name || 'SEC EDGAR Company Facts',
      lastSuccessAt: fundamentals.source?.lastSuccessAt || fundamentals.generatedAt,
      coveragePercent: fundamentals.coveragePercent,
      companyCount: fundamentals.companyCount,
    };
  }
  return recompute(report, registry);
}

const report = JSON.parse(await readFile(healthPath, 'utf8'));
const registry = JSON.parse(await readFile(registryPath, 'utf8'));
let fundamentals = null;
try {
  fundamentals = JSON.parse(await readFile(fundamentalsPath, 'utf8'));
} catch {
  fundamentals = null;
}

const reconciled = reconcileSourceHealth(report, registry, fundamentals);
await writeFile(healthPath, `${JSON.stringify(reconciled, null, 2)}\n`, 'utf8');
console.log(`Source evidence reconciled: gate ${reconciled.gate}, quality ${reconciled.qualityScore}, critical ${reconciled.critical.ready}/${reconciled.critical.total}.`);
