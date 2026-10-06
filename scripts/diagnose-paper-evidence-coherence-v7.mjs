import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_TOLERANCE_MINUTES = 2;

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function timestamp(value) {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function driftMinutes(actual, expected) {
  const actualMs = timestamp(actual);
  const expectedMs = timestamp(expected);
  if (actualMs === null || expectedMs === null) return null;
  return Math.abs(actualMs - expectedMs) / 60_000;
}

function sourceObservedAt(sourceHealth) {
  if (sourceHealth.generatedAt) return sourceHealth.generatedAt;
  const checks = Array.isArray(sourceHealth.sources) ? sourceHealth.sources : [];
  const times = checks.map((row) => timestamp(row.checkedAt)).filter((value) => value !== null);
  return times.length > 0 ? new Date(Math.max(...times)).toISOString() : null;
}

function inferredObservedAt(evidenceObservedAt, ageMinutes) {
  const observedAtMs = timestamp(evidenceObservedAt);
  if (ageMinutes === null || ageMinutes === undefined || ageMinutes === '') return null;
  const age = Number(ageMinutes);
  if (observedAtMs === null || !Number.isFinite(age) || age < 0) return null;
  return new Date(observedAtMs - age * 60_000).toISOString();
}

function compare(name, actual, expected, toleranceMinutes = DEFAULT_TOLERANCE_MINUTES) {
  const minutes = driftMinutes(actual, expected);
  return {
    name,
    actual: actual ?? null,
    expected: expected ?? null,
    toleranceMinutes,
    driftMinutes: minutes === null ? null : Number(minutes.toFixed(3)),
    coherent: minutes !== null && minutes <= toleranceMinutes,
  };
}

export function diagnose(root = process.cwd()) {
  const campaign = readJson(root, 'data/paper-validation-campaign.json');
  const sourceHealth = readJson(root, 'data/global-source-health.json');
  const intelligence = readJson(root, 'data/intelligence-quality.json');
  const session = readJson(root, 'data/paper-market-session.json');
  const evidence = Array.isArray(campaign.dailyEvidence) ? campaign.dailyEvidence.at(-1) : null;

  if (!evidence) throw new Error('PAPER_EVIDENCE_COHERENCE: dailyEvidence is empty');

  const expectedSourceAt = inferredObservedAt(evidence.observedAt, evidence.decisionDataGate?.sourceAgeMinutes);
  const expectedIntelligenceAt = inferredObservedAt(
    evidence.observedAt,
    evidence.decisionDataGate?.intelligenceAgeMinutes,
  );

  const comparisons = [
    compare('source-health', sourceObservedAt(sourceHealth), expectedSourceAt),
    compare('intelligence-quality', intelligence.generatedAt, expectedIntelligenceAt),
    compare('market-session', session.generatedAt, evidence.marketSession?.generatedAt, 0.1),
  ];

  const fingerprint = campaign.baselineFingerprint?.digest ?? null;
  const evidenceFingerprint = evidence.validationFingerprint?.digest ?? null;
  const fingerprintMetadataMatches = evidence.validationFingerprint?.complete === true
    && evidence.validationFingerprint?.version === campaign.baselineFingerprint?.version
    && evidence.validationFingerprint?.algorithm === campaign.baselineFingerprint?.algorithm;
  const safety = {
    fingerprintComplete: campaign.baselineFingerprint?.complete === true,
    fingerprintMatchesLatestEvidence: Boolean(fingerprint)
      && fingerprint === evidenceFingerprint
      && fingerprintMetadataMatches,
    liveTradingLocked: campaign.liveTradingAllowed === false && evidence.liveTradingAllowed === false,
    brokerConnectivityLocked: evidence.brokerConnectivityAllowed === false,
    noLiveOrders: evidence.liveOrders === 0,
  };

  const coherent = comparisons.every((row) => row.coherent);
  const safe = Object.values(safety).every(Boolean);

  return {
    version: 7,
    diagnosticOnly: true,
    mutatesEvidence: false,
    latestEvidenceDate: evidence.date ?? null,
    latestEvidenceObservedAt: evidence.observedAt ?? null,
    status: coherent && safe ? 'COHERENT' : safe ? 'STANDALONE_DRIFT' : 'SAFETY_FAILURE',
    comparisons,
    safety,
  };
}

function parseArgs(argv) {
  const strict = argv.includes('--strict');
  const rootIndex = argv.indexOf('--root');
  const root = rootIndex >= 0 ? argv[rootIndex + 1] : process.cwd();
  if (rootIndex >= 0 && !root) throw new Error('--root requires a directory');
  return { root, strict };
}

const invokedDirectly = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  const { root, strict } = parseArgs(process.argv.slice(2));
  const report = diagnose(root);
  console.log(JSON.stringify(report, null, 2));
  if (strict && report.status !== 'COHERENT') process.exitCode = 2;
}
