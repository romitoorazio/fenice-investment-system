import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const now = new Date();

async function readJson(name, fallback = {}) {
  try {
    return JSON.parse(await readFile(path.join(dataDir, name), 'utf8'));
  } catch {
    return fallback;
  }
}

function ageHours(value) {
  const timestamp = new Date(value || 0).getTime();
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - timestamp) / 3_600_000);
}

const sourceHealth = await readJson('global-source-health.json');
const quality = await readJson('intelligence-quality.json');
const terminal = await readJson('terminal-intelligence.json');
const committee = await readJson('investment-committee.json');
const governance = await readJson('decision-governance.json');
const paper = await readJson('paper-validation.json', { validated: false, status: 'MISSING' });
const universe = await readJson('global-universe.json', { instruments: [] });
const dcf = await readJson('dcf-analysis.json');
const security = await readJson('security-posture.json', { liveTradingAllowed: false, credentialRotationRequired: false });

const instruments = Array.isArray(universe.instruments) ? universe.instruments : [];
const regions = new Set(instruments.map((item) => item.region).filter(Boolean));
const sectors = new Set(instruments.map((item) => item.sector).filter(Boolean));
const assetClasses = new Set(instruments.map((item) => item.assetClass).filter(Boolean));
const criticalFailures = Array.isArray(sourceHealth?.critical?.failures) ? sourceHealth.critical.failures : [];
const crossSource = quality?.crossSourceValidation || {};

const checks = {
  sourceGateGreen: String(sourceHealth.gate || '').toUpperCase() === 'GREEN',
  noCriticalSourceMissing: criticalFailures.length === 0,
  sourceFresh: ageHours(sourceHealth.generatedAt) <= 8,
  terminalDataQuality: Number(terminal.dataQuality) >= 95,
  terminalFresh: ageHours(terminal.generatedAt) <= 8,
  crossSourceValidation: Number(crossSource.checked || 0) >= 10 && Number(crossSource.confirmed || 0) >= 8,
  scannerCoverage: instruments.length >= 50 && regions.size >= 6 && sectors.size >= 10
    && ['Azioni', 'ETF', 'Materie prime', 'Obbligazioni'].every((value) => assetClasses.has(value)),
  dcfCoverage: Number(dcf.coveragePercent || 0) >= 70,
  governanceFailClosed: governance?.guardrails?.blockAutonomousTrading === true
    && governance?.guardrails?.requireHumanConfirmation === true
    && governance?.guardrails?.blockSignalWhenDataDivergent === true
    && governance?.guardrails?.blockSignalWhenSourceStale === true,
  committeeLiveTradingBlocked: committee?.liveTradingBlocked === true || committee?.executionGate === 'BLOCCATO' || committee?.executionGate === 'ATTENDERE',
  paperValidated: paper?.validated === true,
  noCredentialRotationPending: security?.credentialRotationRequired !== true,
  liveTradingDisabled: security?.liveTradingAllowed !== true,
};

const blockers = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
const ready = blockers.length === 0;

const report = {
  version: 1,
  generatedAt: now.toISOString(),
  status: ready ? 'READY' : 'NOT_READY',
  ready,
  checks,
  blockers,
  diagnostics: {
    sourceGate: sourceHealth.gate || 'UNKNOWN',
    sourceReliability: Number(sourceHealth.reliabilityScore || 0),
    criticalFailures,
    sourceAgeHours: Number.isFinite(ageHours(sourceHealth.generatedAt)) ? Math.round(ageHours(sourceHealth.generatedAt) * 10) / 10 : null,
    terminalDataQuality: Number(terminal.dataQuality || 0),
    terminalAgeHours: Number.isFinite(ageHours(terminal.generatedAt)) ? Math.round(ageHours(terminal.generatedAt) * 10) / 10 : null,
    crossSourceChecked: Number(crossSource.checked || 0),
    crossSourceConfirmed: Number(crossSource.confirmed || 0),
    universeInstruments: instruments.length,
    regions: regions.size,
    sectors: sectors.size,
    assetClasses: [...assetClasses].sort(),
    dcfCoveragePercent: Number(dcf.coveragePercent || 0),
    paperStatus: paper.status || 'UNKNOWN',
    credentialRotationRequired: security?.credentialRotationRequired === true,
  },
  rule: 'Fenice può essere dichiarata pronta solo quando tutti i controlli sono veri. READY non abilita il live trading: il collegamento broker resta separato e disattivato.'
};

await writeFile(path.join(dataDir, 'certification-status.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`Fenice certification audit: ${report.status}; blockers=${blockers.join(', ') || 'none'}.`);
