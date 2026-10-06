import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { diagnose } from './diagnose-paper-evidence-coherence-v7.mjs';

function fixture({ drift = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fenice-v7-coherence-'));
  const data = path.join(root, 'data');
  fs.mkdirSync(data);

  const evidenceObservedAt = '2026-10-06T15:15:48.000Z';
  const fingerprint = 'f'.repeat(64);
  const campaign = {
    liveTradingAllowed: false,
    baselineFingerprint: { digest: fingerprint, complete: true },
    dailyEvidence: [{
      date: '2026-10-06',
      observedAt: evidenceObservedAt,
      validationFingerprint: { digest: fingerprint },
      decisionDataGate: { sourceAgeMinutes: 2.7, intelligenceAgeMinutes: 0 },
      marketSession: { generatedAt: '2026-10-06T15:15:47.400Z' },
      liveOrders: 0,
      liveTradingAllowed: false,
      brokerConnectivityAllowed: false,
    }],
  };

  const files = {
    'paper-validation-campaign.json': campaign,
    'global-source-health.json': {
      generatedAt: drift ? '2026-10-06T12:18:09.000Z' : '2026-10-06T15:13:06.000Z',
    },
    'intelligence-quality.json': {
      generatedAt: drift ? '2026-10-06T15:09:29.000Z' : '2026-10-06T15:15:40.000Z',
    },
    'paper-market-session.json': {
      generatedAt: drift ? '2026-10-05T17:54:33.000Z' : '2026-10-06T15:15:47.400Z',
      liveTradingAllowed: false,
    },
  };

  for (const [name, value] of Object.entries(files)) {
    fs.writeFileSync(path.join(data, name), `${JSON.stringify(value, null, 2)}\n`);
  }
  return root;
}

const coherentRoot = fixture();
const driftRoot = fixture({ drift: true });

try {
  const coherent = diagnose(coherentRoot);
  assert.equal(coherent.status, 'COHERENT');
  assert.equal(coherent.diagnosticOnly, true);
  assert.equal(coherent.mutatesEvidence, false);
  assert.ok(coherent.comparisons.every((row) => row.coherent));
  assert.ok(Object.values(coherent.safety).every(Boolean));

  const drift = diagnose(driftRoot);
  assert.equal(drift.status, 'STANDALONE_DRIFT');
  assert.equal(drift.safety.fingerprintMatchesLatestEvidence, true);
  assert.equal(drift.safety.liveTradingLocked, true);
  assert.ok(drift.comparisons.some((row) => !row.coherent));

  console.log('PAPER V7 evidence coherence diagnostic: PASS');
} finally {
  fs.rmSync(coherentRoot, { recursive: true, force: true });
  fs.rmSync(driftRoot, { recursive: true, force: true });
}
