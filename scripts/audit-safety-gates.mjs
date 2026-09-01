import fs from 'node:fs';

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const fail = (message) => {
  console.error(`SAFETY GATE FAILED: ${message}`);
  process.exitCode = 1;
};

const governance = readJson('data/decision-governance.json');
const quality = readJson('data/intelligence-quality.json');
const sourceHealth = readJson('data/global-source-health.json');

if (governance?.guardrails?.blockAutonomousTrading !== true) {
  fail('blockAutonomousTrading must remain true');
}
if (governance?.guardrails?.requireHumanConfirmation !== true) {
  fail('requireHumanConfirmation must remain true');
}
if (governance?.guardrails?.blockSignalWhenDataDivergent !== true) {
  fail('divergent-data signal veto must remain enabled');
}
if (governance?.guardrails?.blockSignalWhenSourceStale !== true) {
  fail('stale-source signal veto must remain enabled');
}
if (!Array.isArray(governance?.prohibitedActions) || !governance.prohibitedActions.includes('inviare ordini')) {
  fail('sending orders must remain explicitly prohibited');
}
if (!Array.isArray(governance?.prohibitedActions) || !governance.prohibitedActions.includes('collegarsi a broker')) {
  fail('broker connectivity must remain explicitly prohibited');
}
if (quality?.policy?.autonomousTrading !== false) {
  fail('intelligence policy must keep autonomousTrading=false');
}
if (quality?.policy?.crossSourceValidationRequired !== true) {
  fail('cross-source validation must remain required');
}
if (quality?.policy?.singleSourceSignalsCapped !== true) {
  fail('single-source signals must remain capped');
}

const maxWeight = governance?.guardrails?.maxSingleAssetWeightPercent;
if (!Number.isFinite(maxWeight) || maxWeight <= 0 || maxWeight > 10) {
  fail('maxSingleAssetWeightPercent must be finite and <= 10');
}
const minSources = governance?.guardrails?.minIndependentSources;
if (!Number.isInteger(minSources) || minSources < 2) {
  fail('minIndependentSources must be at least 2');
}

const credentialParam = /[?&](?:api[_-]?key|apikey|key|token|access[_-]?token)=([^&#]+)/i;
for (const source of sourceHealth?.sources || []) {
  if (typeof source?.endpointUsed !== 'string') continue;
  const match = source.endpointUsed.match(credentialParam);
  if (match && !/^\[REDACTED\]$/i.test(decodeURIComponent(match[1]))) {
    fail(`published source health contains an unredacted credential for ${source.id || 'unknown source'}`);
  }
}

if (!process.exitCode) {
  console.log('Fenice safety gates: PASS');
  console.log(`Human confirmation: required | Autonomous trading: blocked | Max single asset: ${maxWeight}% | Independent sources: ${minSources}`);
}
