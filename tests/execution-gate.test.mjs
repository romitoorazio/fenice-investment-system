import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateExecutionGate, liveTradingMustRemainBlocked } from '../scripts/lib/execution-gate.mjs';

const safeGovernance = {
  guardrails: {
    blockAutonomousTrading: true,
    requireHumanConfirmation: true,
  },
};

test('blocks when source gate is not GREEN', () => {
  assert.equal(evaluateExecutionGate({ dataQuality: 99, sourceGate: 'AMBER', buyCandidateCount: 2, governance: safeGovernance }), 'BLOCCATO');
  assert.equal(evaluateExecutionGate({ dataQuality: 99, sourceGate: 'RED', buyCandidateCount: 2, governance: safeGovernance }), 'BLOCCATO');
});

test('blocks when data quality is below 75', () => {
  assert.equal(evaluateExecutionGate({ dataQuality: 74, sourceGate: 'GREEN', buyCandidateCount: 2, governance: safeGovernance }), 'BLOCCATO');
});

test('blocks when governance safety is not active', () => {
  const unsafe = { guardrails: { blockAutonomousTrading: false, requireHumanConfirmation: true } };
  assert.equal(evaluateExecutionGate({ dataQuality: 100, sourceGate: 'GREEN', buyCandidateCount: 2, governance: unsafe }), 'BLOCCATO');
  assert.equal(liveTradingMustRemainBlocked(unsafe), false);
});

test('allows paper readiness only with green data and human confirmation', () => {
  assert.equal(evaluateExecutionGate({ dataQuality: 90, sourceGate: 'GREEN', buyCandidateCount: 2, governance: safeGovernance }), 'PRONTO_CON_CONFERMA');
  assert.equal(evaluateExecutionGate({ dataQuality: 90, sourceGate: 'GREEN', buyCandidateCount: 0, governance: safeGovernance }), 'ATTENDERE');
  assert.equal(liveTradingMustRemainBlocked(safeGovernance), true);
});
