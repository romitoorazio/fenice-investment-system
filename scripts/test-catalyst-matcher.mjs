import assert from 'node:assert/strict';
import { catalystMatchesAsset, matchCatalysts } from './lib/catalyst-matcher.mjs';

const tsm = { symbol: 'TSM', name: 'Taiwan Semiconductor Manufacturing Company Limited' };
const unrelated = [
  {
    name: 'Measurement-Driven Sub-Network Selection for On-Premise Retrieval-Augmented Factory Agents',
    signal: 'New arXiv paper on factory agents',
  },
  {
    name: 'QArray+: A physics-informed GPU-accelerated simulator for quantum dot arrays',
    signal: 'Quantum research update',
  },
];

assert.equal(catalystMatchesAsset(tsm, unrelated[0]), false, 'TSM must not match the substring inside measurement');
assert.equal(catalystMatchesAsset(tsm, unrelated[1]), false, 'TSM must not match unrelated GPU/quantum research');
assert.equal(matchCatalysts(tsm, unrelated).length, 0, 'Unrelated research must not inflate TSM catalysts');

assert.equal(
  catalystMatchesAsset(tsm, { name: 'TSM raises advanced packaging capacity', signal: 'Company update' }),
  true,
  'Explicit ticker token should match',
);
assert.equal(
  catalystMatchesAsset(tsm, { name: 'Taiwan Semiconductor Manufacturing expands Arizona output', signal: 'Company update' }),
  true,
  'Two informative company-name tokens should match',
);

const asml = { symbol: 'ASML', name: 'ASML HOLDING NV' };
assert.equal(
  catalystMatchesAsset(asml, { name: 'European holding companies face new reporting rules', signal: 'General market news' }),
  false,
  'Generic legal-name token holding must never be enough',
);
assert.equal(
  catalystMatchesAsset(asml, { name: 'ASML announces new EUV platform shipment milestone', signal: 'Company update' }),
  true,
  'Explicit ASML ticker/name token should match',
);

console.log('Catalyst matcher regressions PASS.');
