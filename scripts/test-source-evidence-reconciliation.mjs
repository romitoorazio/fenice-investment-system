import assert from 'node:assert/strict';
import { hasFreshSecPipelineEvidence, reconcileSourceHealth } from './reconcile-source-health-evidence.mjs';

const now = Date.parse('2026-09-04T00:30:00.000Z');
const registry = {
  sources: [
    { id: 'sec', critical: true, authority: 'regulator' },
    { id: 'fred', critical: true, authority: 'central-bank' },
  ],
};

function baseHealth() {
  return {
    sources: [
      { id: 'sec', critical: true, authority: 'regulator', status: 'failed', httpStatus: 403, detail: 'HTTP 403' },
      { id: 'fred', critical: true, authority: 'central-bank', status: 'healthy', httpStatus: 200 },
    ],
  };
}

const fresh = {
  generatedAt: '2026-09-04T00:06:37.446Z',
  source: { name: 'SEC EDGAR Company Facts', state: 'operativo', lastSuccessAt: '2026-09-04T00:06:37.446Z' },
  coveragePercent: 100,
  companyCount: 12,
  universeSize: 12,
};

assert.equal(hasFreshSecPipelineEvidence(fresh, now), true);
const reconciled = reconcileSourceHealth(baseHealth(), registry, fresh, now);
assert.equal(reconciled.sources[0].status, 'degraded');
assert.equal(reconciled.critical.ready, 2);
assert.deepEqual(reconciled.critical.failures, []);
assert.equal(reconciled.gate, 'GREEN');

const stale = structuredClone(fresh);
stale.source.lastSuccessAt = '2026-09-02T00:00:00.000Z';
assert.equal(hasFreshSecPipelineEvidence(stale, now), false);
const staleResult = reconcileSourceHealth(baseHealth(), registry, stale, now);
assert.equal(staleResult.sources[0].status, 'failed');
assert.deepEqual(staleResult.critical.failures, ['sec']);
assert.equal(staleResult.gate, 'AMBER');

const incomplete = structuredClone(fresh);
incomplete.coveragePercent = 92;
assert.equal(hasFreshSecPipelineEvidence(incomplete, now), false);

const mismatched = structuredClone(fresh);
mismatched.companyCount = 11;
assert.equal(hasFreshSecPipelineEvidence(mismatched, now), false);

const wrongSource = structuredClone(fresh);
wrongSource.source.name = 'Third party mirror';
assert.equal(hasFreshSecPipelineEvidence(wrongSource, now), false);

console.log('Source evidence reconciliation regressions PASS.');
