import assert from 'node:assert/strict';
import { evidenceMatchesAsset, sanitizeCatalystDecision } from '../lib/catalyst-relevance.mjs';

assert.equal(
  evidenceMatchesAsset(
    { symbol: 'ASML', name: 'ASML HOLDING NV' },
    "Replicating TRACE: A Practitioner's Guide to Its Threshold and Particle Budget · arXiv AI and emerging technology",
  ),
  false,
  'ASML must not match an unrelated technology article through generic HOLDING/technology tokens',
);

assert.equal(
  evidenceMatchesAsset(
    { symbol: 'NVDA', name: 'NVIDIA Corporation' },
    'NVIDIA expands its data-center platform · company filing',
  ),
  true,
  'Distinctive issuer names must remain valid catalyst evidence',
);

assert.equal(
  evidenceMatchesAsset(
    { symbol: 'TSM', name: 'Taiwan Semiconductor Manufacturing Company Limited' },
    'Taiwan Semiconductor Manufacturing raises advanced-node capacity · Reuters',
  ),
  true,
  'Multi-token issuer names should match when multiple distinctive tokens are present',
);

const decision = {
  symbol: 'ASML',
  name: 'ASML HOLDING NV',
  catalyst: {
    score: 57,
    matchedEvents: 1,
    recentEvents: 1,
    evidence: ["Replicating TRACE: A Practitioner's Guide to Its Threshold and Particle Budget · arXiv AI and emerging technology"],
  },
  scorecard: { catalysts: 57 },
  bullCase: [
    'Ricavi in crescita.',
    "Catalizzatori recenti verificati: Replicating TRACE: A Practitioner's Guide to Its Threshold and Particle Budget · arXiv AI and emerging technology",
  ],
};

sanitizeCatalystDecision(decision);
assert.deepEqual(decision.catalyst.evidence, []);
assert.equal(decision.catalyst.matchedEvents, 0);
assert.equal(decision.catalyst.recentEvents, 0);
assert.equal(decision.catalyst.score, 48);
assert.equal(decision.scorecard.catalysts, 48);
assert.deepEqual(decision.bullCase, ['Ricavi in crescita.']);

console.log('Catalyst relevance regression tests passed.');
