import assert from 'node:assert/strict';
import { evidenceMatchesAsset, sanitizeCatalyst } from '../lib/catalyst-evidence.mjs';

const asml = { symbol: 'ASML', name: 'ASML HOLDING NV' };
assert.equal(
  evidenceMatchesAsset(asml, 'Variable Selection for Feature-Based Newsvendor · arXiv AI and emerging technology'),
  false,
  'Unrelated research must not be treated as an ASML catalyst',
);
assert.equal(
  evidenceMatchesAsset(asml, 'ASML raises EUV shipment outlook · Reuters'),
  true,
  'Explicit ASML evidence must be accepted',
);

const micron = { symbol: 'MU', name: 'Micron Technology Inc' };
assert.equal(
  evidenceMatchesAsset(micron, 'Micron expands HBM capacity · company filing'),
  true,
  'Distinct company-name token must match',
);
assert.equal(
  evidenceMatchesAsset(micron, 'Multiple utilities expand capacity · industry source'),
  false,
  'Short ticker symbols must not match inside unrelated words',
);

const candidate = {
  ...asml,
  scorecard: { catalysts: 66 },
  catalyst: {
    score: 66,
    matchedEvents: 2,
    recentEvents: 2,
    evidence: [
      'Variable Selection for Feature-Based Newsvendor · arXiv AI and emerging technology',
      'ASML raises EUV shipment outlook · Reuters',
    ],
  },
  bullCase: [
    'Core thesis',
    'Catalizzatori recenti verificati: stale text',
  ],
};

const cleaned = sanitizeCatalyst(candidate);
assert.equal(cleaned.removed, 1);
assert.deepEqual(cleaned.candidate.catalyst.evidence, ['ASML raises EUV shipment outlook · Reuters']);
assert.equal(cleaned.candidate.catalyst.matchedEvents, 1);
assert.equal(cleaned.candidate.catalyst.recentEvents, 1);
assert.ok(cleaned.candidate.bullCase.some((item) => item.includes('ASML raises EUV shipment outlook')));
assert.ok(!cleaned.candidate.bullCase.some((item) => item.includes('stale text')));

console.log('Catalyst evidence regression tests passed.');
