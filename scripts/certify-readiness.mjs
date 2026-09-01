import fs from 'node:fs';

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const failures = [];
const warnings = [];
const fail = (message) => failures.push(message);
const warn = (message) => warnings.push(message);

const governance = readJson('data/decision-governance.json');
const quality = readJson('data/intelligence-quality.json');
const sourceHealth = readJson('data/global-source-health.json');
const terminal = readJson('data/terminal-intelligence.json');
const ledger = readJson('data/decision-ledger.json');
const universe = readJson('data/global-universe.json');

// 1) Safety / execution lock: certification is impossible if live execution can occur.
if (governance?.guardrails?.blockAutonomousTrading !== true) fail('autonomous trading is not blocked');
if (governance?.guardrails?.requireHumanConfirmation !== true) fail('human confirmation is not mandatory');
if (!governance?.prohibitedActions?.includes('inviare ordini')) fail('order transmission is not explicitly prohibited');
if (!governance?.prohibitedActions?.includes('collegarsi a broker')) fail('broker connectivity is not explicitly prohibited');
if (quality?.policy?.autonomousTrading !== false) fail('intelligence policy does not explicitly disable autonomous trading');

// 2) Data/source quality. We do not fake 100/100: all critical sources must be operational,
// cross-source validation must actually have run, and concentration must be controlled.
const sources = Array.isArray(sourceHealth?.sources) ? sourceHealth.sources : [];
const criticalSources = sources.filter((s) => s?.critical === true || ['sec', 'fred', 'ecb'].includes(s?.id));
const brokenCritical = criticalSources.filter((s) => !['operativo', 'ok', 'healthy', 'green'].includes(String(s?.state || s?.status || '').toLowerCase()));
if (criticalSources.length === 0) fail('no critical sources are declared');
if (brokenCritical.length > 0) fail(`critical sources not healthy: ${brokenCritical.map((s) => s.id || s.name).join(', ')}`);

const checked = Number(quality?.crossSourceValidation?.checked || 0);
const divergent = Number(quality?.crossSourceValidation?.divergent || 0);
if (quality?.policy?.crossSourceValidationRequired !== true) fail('cross-source validation is not required by policy');
if (checked < 1) fail('cross-source validation has not produced any completed checks');
if (divergent > 0 && governance?.guardrails?.blockSignalWhenDataDivergent !== true) fail('divergent data exists without an enabled veto');

const operationalShare = Number(governance?.diagnostics?.operationalSourceSharePercent ?? 0);
if (operationalShare < 90) fail(`operational source share is only ${operationalShare}% (<90%)`);
const concentration = Number(quality?.coverage?.sourceConcentrationPercent ?? 100);
if (concentration > 70) fail(`source concentration is ${concentration}% (>70%)`);

// 3) Global multi-asset scanner coverage.
const assets = Array.isArray(terminal?.assets) ? terminal.assets : [];
if (assets.length < 20) fail(`terminal coverage is only ${assets.length} assets (<20)`);
const classes = new Set(assets.map((a) => a?.assetClass).filter(Boolean));
if (classes.size < 4) fail(`terminal covers only ${classes.size} asset classes (<4)`);
const regions = new Set(assets.map((a) => a?.region || a?.country).filter(Boolean));
if (regions.size < 3) warn('regional metadata is too sparse to prove global diversification');
if (!Array.isArray(universe?.assets || universe?.instruments) && typeof universe !== 'object') fail('global universe dataset is invalid');

// 4) Reproducible scoring/risk fields must be present and bounded for every ranked asset.
for (const asset of assets) {
  const label = asset?.symbol || asset?.name || 'unknown';
  if (!Number.isFinite(asset?.unifiedScore)) fail(`${label}: unifiedScore missing/non-finite`);
  if (!Number.isFinite(asset?.riskScore)) fail(`${label}: riskScore missing/non-finite`);
  if (Number.isFinite(asset?.unifiedScore) && (asset.unifiedScore < 0 || asset.unifiedScore > 100)) fail(`${label}: unifiedScore out of range`);
  if (Number.isFinite(asset?.riskScore) && (asset.riskScore < 0 || asset.riskScore > 100)) fail(`${label}: riskScore out of range`);
}

// 5) Paper/audit history. A single snapshot is not validation; require a non-trivial ledger.
const ledgerRows = Array.isArray(ledger) ? ledger : Array.isArray(ledger?.entries) ? ledger.entries : Array.isArray(ledger?.decisions) ? ledger.decisions : [];
if (ledgerRows.length < 10) fail(`decision ledger contains only ${ledgerRows.length} entries (<10)`);
const timestamps = ledgerRows.map((x) => x?.generatedAt || x?.timestamp || x?.date || x?.createdAt).filter(Boolean);
const uniqueDays = new Set(timestamps.map((x) => String(x).slice(0, 10)));
if (uniqueDays.size < 2) fail('decision history does not yet span at least 2 distinct days');

// 6) Explicit gate semantics. GREEN may only be declared when all evidence is satisfied.
const reportedConfidence = Number(quality?.intelligenceConfidence ?? 0);
if (reportedConfidence < 90) fail(`intelligence confidence is ${reportedConfidence} (<90)`);

if (warnings.length) {
  console.warn('\nFenice readiness warnings:');
  for (const item of warnings) console.warn(`- ${item}`);
}

if (failures.length) {
  console.error('\nFENICE CERTIFICATION: NOT READY');
  for (const item of failures) console.error(`- ${item}`);
  console.error(`\n${failures.length} blocking condition(s) remain. Live trading stays locked.`);
  process.exit(1);
}

console.log('FENICE CERTIFICATION: READY');
console.log('All automated readiness gates passed. Live trading remains locked pending explicit future broker configuration.');
