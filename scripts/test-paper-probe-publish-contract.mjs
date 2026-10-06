import fs from 'node:fs';

const workflowPath = '.github/workflows/paper-probe-staging.yml';
const workflow = fs.readFileSync(workflowPath, 'utf8');

const match = workflow.match(/owned_files=\(\n([\s\S]*?)\n\s*\)/);
if (!match) {
  throw new Error('PAPER probe owned_files publication contract is missing');
}

const ownedFiles = match[1]
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const requiredSameRunArtifacts = [
  'data/paper-validation-campaign.json',
  'data/paper-oms-state.json',
  'data/paper-order-queue.json',
  'data/paper-fx-evidence.json',
  'data/execution-market-evidence.json',
  'data/execution-market-coverage.json',
  'data/global-source-health.json',
  'data/intelligence-quality.json',
  'data/paper-market-session.json',
];

for (const file of requiredSameRunArtifacts) {
  const count = ownedFiles.filter((entry) => entry === file).length;
  if (count !== 1) {
    throw new Error(`PAPER probe must publish ${file} exactly once; found ${count}`);
  }
}

const requiredRefreshSteps = [
  'Refresh critical source health',
  'Build fresh institutional intelligence quality',
  'Build broad execution market evidence with empty queue',
  'Refresh coherent Twelve Data batch evidence',
  'Rebuild broad PAPER execution coverage',
  'Refresh authoritative PAPER market session',
];

for (const step of requiredRefreshSteps) {
  if (!workflow.includes(`- name: ${step}`)) {
    throw new Error(`PAPER probe same-run refresh step is missing: ${step}`);
  }
}

if (!workflow.includes('Refusing to overwrite newer PAPER-owned evidence.')) {
  throw new Error('PAPER probe publication must remain fail-closed on concurrent evidence changes');
}

console.log('PAPER probe same-run publication contract: PASS');
