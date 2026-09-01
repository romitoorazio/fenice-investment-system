import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { containsCredentialLikeQueryValue } from './lib/sanitize-endpoint.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (name) => JSON.parse(await readFile(path.join(root, 'data', name), 'utf8'));

const failures = [];
const governance = await readJson('decision-governance.json');
const sourceHealth = await readJson('global-source-health.json');

if (governance?.guardrails?.blockAutonomousTrading !== true) failures.push('blockAutonomousTrading must be true');
if (governance?.guardrails?.requireHumanConfirmation !== true) failures.push('requireHumanConfirmation must be true');
if (!Array.isArray(governance?.prohibitedActions) || !governance.prohibitedActions.some((item) => /broker/i.test(String(item)))) {
  failures.push('broker connection must remain explicitly prohibited');
}

for (const source of sourceHealth.sources || []) {
  if (containsCredentialLikeQueryValue(source.endpointUsed)) {
    failures.push(`credential-like value persisted in endpointUsed for ${source.id || 'unknown'}`);
  }
}

if (String(sourceHealth.gate || '').toUpperCase() === 'GREEN') {
  const criticalFailures = sourceHealth?.critical?.failures || [];
  if (criticalFailures.length) failures.push('source gate cannot be GREEN with critical failures');
}

if (failures.length) {
  console.error('Fenice safety baseline FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Fenice safety baseline OK: live trading blocked, human confirmation required, persisted endpoints sanitized.');
