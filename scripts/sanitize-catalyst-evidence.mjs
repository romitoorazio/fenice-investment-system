import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeCatalyst } from '../lib/catalyst-evidence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const committeePath = path.join(root, 'data', 'investment-committee.json');

const committee = JSON.parse(await readFile(committeePath, 'utf8'));
let removed = 0;

function clean(candidate) {
  const result = sanitizeCatalyst(candidate);
  removed += result.removed;
  return result.candidate;
}

const allDecisions = Array.isArray(committee.allDecisions)
  ? committee.allDecisions.map(clean)
  : [];
const bySymbol = new Map(allDecisions.map((item) => [String(item.symbol || '').toUpperCase(), item]));
const topDecisions = Array.isArray(committee.topDecisions)
  ? committee.topDecisions.map((item) => bySymbol.get(String(item.symbol || '').toUpperCase()) || clean(item))
  : [];

const next = {
  ...committee,
  topDecisions,
  allDecisions,
  catalystEvidenceGuard: {
    policy: 'strict-asset-identity',
    removedUnverifiedEvidence: removed,
    checkedAt: new Date().toISOString(),
  },
};

await writeFile(committeePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
console.log(`Catalyst evidence guard: removed ${removed} unverified evidence item(s).`);
