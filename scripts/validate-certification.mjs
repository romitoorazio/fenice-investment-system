import { readFile } from 'node:fs/promises';

const read = async (name) => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const ok = (condition, message) => { if (!condition) throw new Error(message); };
const finite = (value) => Number.isFinite(Number(value));
const mode = (process.env.FENICE_CERT_MODE || 'live').toLowerCase();
ok(mode === 'static' || mode === 'live', `invalid certification mode=${mode}`);

const [sources, committee, governance, terminal, ledger] = await Promise.all([
  read('global-source-health.json'),
  read('investment-committee.json'),
  read('decision-governance.json'),
  read('terminal-intelligence.json'),
  read('decision-ledger.json'),
]);

if (mode === 'live') {
  ok(sources.gate === 'GREEN', `source gate=${sources.gate}`);
  ok(sources.critical?.gate === 'GREEN', `critical gate=${sources.critical?.gate}`);
  ok((sources.critical?.failures || []).length === 0, `critical source failures=${(sources.critical?.failures || []).join(',')}`);
  ok(Number(sources.critical?.ready) === Number(sources.critical?.total), `critical ready=${sources.critical?.ready}/${sources.critical?.total}`);
  ok(Number(sources.qualityScore) >= 90, `source quality=${sources.qualityScore}`);
  const sourceAgeMs = Date.now() - new Date(sources.generatedAt).getTime();
  ok(Number.isFinite(sourceAgeMs) && sourceAgeMs >= 0 && sourceAgeMs <= 60 * 60 * 1000, `source health stale ageMs=${sourceAgeMs}`);
  for (const source of sources.sources || []) {
    const endpoint = String(source.endpointUsed || '');
    ok(!/[?&](?:api_key|apikey|key|token|access_token)=(?!REDACTED(?:&|$))[^&]+/i.test(endpoint), `credential leak in source health ${source.id || '?'}`);
  }
  ok(committee.sourceGate === 'GREEN', `committee source gate=${committee.sourceGate}`);
  ok(Number(committee.dataQuality) >= 90, `committee data quality=${committee.dataQuality}`);
}

ok(governance.guardrails?.requireHumanConfirmation === true, 'human confirmation not mandatory');
ok(governance.guardrails?.blockAutonomousTrading === true, 'autonomous trading not blocked');
ok(governance.guardrails?.blockSignalWhenDataDivergent === true, 'data divergence not blocking');
ok(governance.guardrails?.blockSignalWhenSourceStale === true, 'stale data not blocking');
ok(finite(governance.guardrails?.maxSingleAssetWeightPercent) && Number(governance.guardrails.maxSingleAssetWeightPercent) <= 10, 'single-asset limit invalid');
ok(Number(governance.guardrails?.minIndependentSources || 0) >= 2, 'independent-source minimum too low');
const maxSingleAssetWeight = Number(governance.guardrails.maxSingleAssetWeightPercent);
const prohibited = (governance.prohibitedActions || []).join(' ').toLowerCase();
ok(prohibited.includes('ordini') && prohibited.includes('broker'), 'order/broker veto not explicit');

ok(Array.isArray(terminal.assets) && terminal.assets.length >= 15, `terminal coverage=${terminal.assets?.length || 0}`);
const classes = new Set(terminal.assets.map((asset) => asset.assetClass).filter(Boolean));
ok(classes.size >= 5, `asset classes=${classes.size}`);
for (const asset of terminal.assets) {
  ok(asset.symbol && finite(asset.unifiedScore) && finite(asset.riskScore), `invalid score structure ${asset.symbol || '?'}`);
  ok(asset.technical && typeof asset.technical === 'object', `technical missing ${asset.symbol}`);
  ok(Number(asset.targetWeightPercent || 0) <= maxSingleAssetWeight + 0.001, `terminal allocation exceeds governance cap ${asset.symbol}`);
  if (['ATTENDI', 'EVITA'].includes(String(asset.decision || ''))) {
    ok(Number(asset.targetWeightPercent || 0) === 0, `ineligible terminal allocation ${asset.symbol}:${asset.decision}`);
    ok(Number(asset.targetAmountEuro || 0) === 0, `ineligible terminal amount ${asset.symbol}:${asset.decision}`);
  }
}
ok((terminal.guardrails?.violations || []).length === 0, `terminal guardrail violations=${(terminal.guardrails?.violations || []).join(';')}`);

ok(committee.executionGate !== 'LIVE', 'LIVE execution forbidden during certification');
ok(Number(committee.proposedFirstTrancheEuro || 0) === 0 || committee.executionGate !== 'LIVE', 'real tranche cannot be executable');
ok(Array.isArray(committee.allDecisions) && committee.allDecisions.length >= 15, `committee coverage=${committee.allDecisions?.length || 0}`);
for (const decision of committee.allDecisions) {
  ok(decision.symbol && finite(decision.committeeScore) && finite(decision.confidence) && finite(decision.riskScore), `invalid committee decision ${decision.symbol || '?'}`);
  ok(finite(decision.maxWeightPercent) && Number(decision.maxWeightPercent) <= maxSingleAssetWeight + 0.001, `committee max weight exceeds governance ${decision.symbol}`);
  ok(Array.isArray(decision.invalidation) && decision.invalidation.length >= 2, `missing invalidation ${decision.symbol}`);
  if (decision.decision !== 'COMPRA') {
    ok(decision.entryPlan?.orderMode === 'NESSUN ORDINE', `order proposed without COMPRA ${decision.symbol}`);
    ok(Number(decision.entryPlan?.firstTrancheEuro || 0) === 0, `tranche proposed without COMPRA ${decision.symbol}`);
  }
}

ok(Number(ledger.recordCount) >= 100, `ledger records=${ledger.recordCount}`);
ok(Array.isArray(ledger.records) && ledger.records.length >= 100, `ledger record array=${ledger.records?.length || 0}`);
const checkpointed = ledger.records.filter((record) => record.checkpoints && Object.keys(record.checkpoints).length > 0).length;
ok(checkpointed >= 20, `checkpointed paper records=${checkpointed}`);
for (const record of ledger.records.slice(0, 100)) {
  ok(record.id && record.cycleId && record.symbol && record.decision, 'incomplete audit record');
}

console.log(JSON.stringify({
  certification: 'PASS',
  mode,
  sourceGate: mode === 'live' ? sources.gate : 'LIVE_GATE_REQUIRED_SEPARATELY',
  sourceQuality: mode === 'live' ? sources.qualityScore : null,
  criticalSources: mode === 'live' ? `${sources.critical.ready}/${sources.critical.total}` : null,
  committeeDataQuality: mode === 'live' ? committee.dataQuality : null,
  terminalAssets: terminal.assets.length,
  assetClasses: classes.size,
  maxSingleAssetWeightPercent: maxSingleAssetWeight,
  ledgerRecords: ledger.recordCount,
  checkpointedRecords: checkpointed,
  liveTradingLocked: true,
}, null, 2));
