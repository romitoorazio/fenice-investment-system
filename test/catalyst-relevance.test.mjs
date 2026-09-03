import test from 'node:test';
import assert from 'node:assert/strict';
import { distinctiveAssetTokens, isCatalystRelevant } from '../lib/catalyst-relevance.mjs';

test('rejects generic semiconductor research as a TSM catalyst', () => {
  const asset = { symbol: 'TSM', name: 'Taiwan Semiconductor Manufacturing Company Limited' };
  const item = {
    name: 'Understanding the superconducting proximity effect in semiconductors through quantum oscillations',
    signal: 'Academic semiconductor research',
    source: 'arXiv',
  };
  assert.equal(isCatalystRelevant(asset, item), false);
});

test('rejects generic holding/company language as an ASML catalyst', () => {
  const asset = { symbol: 'ASML', name: 'ASML HOLDING NV' };
  const item = {
    name: 'When Guardrails Look Effective: Construct Validity Failures in LLM Agent Commerce Evaluation',
    signal: 'Research paper discussing holding behavior in agent systems',
    source: 'arXiv AI',
  };
  assert.equal(isCatalystRelevant(asset, item), false);
});

test('accepts an exact ticker mention', () => {
  const asset = { symbol: 'NVDA', name: 'NVIDIA Corporation' };
  const item = { name: 'NVDA raises data-center guidance', signal: '', source: 'primary filing' };
  assert.equal(isCatalystRelevant(asset, item), true);
});

test('accepts a distinctive company-name mention', () => {
  const asset = { symbol: 'CRWD', name: 'CrowdStrike Holdings Inc' };
  const item = { name: 'CrowdStrike expands Falcon platform', signal: '', source: 'company release' };
  assert.equal(isCatalystRelevant(asset, item), true);
});

test('removes generic legal and sector words from company tokens', () => {
  const tokens = distinctiveAssetTokens({ symbol: 'TSM', name: 'Taiwan Semiconductor Manufacturing Company Limited' });
  assert.deepEqual(tokens, ['taiwan']);
});
