import test from 'node:test';
import assert from 'node:assert/strict';
import { catalystMatchesAsset, matchCatalysts, sanitizeCommittee } from '../scripts/sanitize-committee-catalysts.mjs';

const TSM = {
  symbol: 'TSM',
  name: 'Taiwan Semiconductor Manufacturing Company Limited',
};

const NOW = new Date('2026-09-01T20:00:00Z').getTime();

test('does not attach generic semiconductor research to TSM', () => {
  const irrelevant = {
    name: 'Quantum dots improve semiconductor photon conversion',
    signal: 'New semiconductor research may improve optical devices',
    source: 'arXiv',
    date: '2026-09-01T18:00:00Z',
  };
  assert.equal(catalystMatchesAsset(TSM, irrelevant), false);
  assert.equal(matchCatalysts(TSM, [irrelevant], NOW).count, 0);
});

test('matches exact ticker as standalone token', () => {
  const relevant = {
    name: 'TSM raises advanced packaging capacity outlook',
    signal: 'TSM expects stronger AI demand',
    source: 'company filing',
    date: '2026-09-01T18:00:00Z',
  };
  assert.equal(catalystMatchesAsset(TSM, relevant), true);
});

test('matches a company only when multiple distinctive name tokens agree', () => {
  const relevant = {
    name: 'Taiwan Semiconductor expands advanced packaging investment',
    signal: 'Taiwan manufacturing capacity rises for AI accelerators',
    source: 'regulatory filing',
    date: '2026-09-01T18:00:00Z',
  };
  assert.equal(catalystMatchesAsset(TSM, relevant), true);
});

test('sanitizer removes false evidence and cannot preserve a BUY after score falls below guardrail', () => {
  const report = {
    dataQuality: 94,
    sourceGate: 'GREEN',
    allDecisions: [{
      rank: 1,
      symbol: 'TSM',
      name: TSM.name,
      committeeScore: 78,
      confidence: 90,
      riskScore: 50,
      terminalDecision: 'ACCUMULA',
      decision: 'COMPRA',
      scorecard: { valuation: 55, catalysts: 88 },
      valuation: { status: 'dati insufficienti', upsideBasePercent: null },
      catalyst: { score: 88, matchedEvents: 5, recentEvents: 5, evidence: ['bad evidence'] },
      bullCase: ['Catalizzatori recenti verificati: bad evidence'],
      entryPlan: { orderMode: 'LIMITE', maxEntryPrice: 400, firstTranchePercent: 2, firstTrancheEuro: 200 },
    }],
  };
  const terminal = { assets: [TSM] };
  const discoveries = [{
    name: 'Quantum dots improve semiconductor photon conversion',
    signal: 'generic semiconductor research',
    source: 'arXiv',
    date: '2026-09-01T18:00:00Z',
  }];
  const sanitized = sanitizeCommittee(report, terminal, discoveries, NOW);
  const item = sanitized.allDecisions[0];
  assert.deepEqual(item.catalyst.evidence, []);
  assert.equal(item.catalyst.matcher, 'strict-entity-v2');
  assert.notEqual(item.decision, 'COMPRA');
  assert.equal(item.entryPlan.orderMode, 'NESSUN ORDINE');
  assert.equal(item.entryPlan.firstTrancheEuro, 0);
});
