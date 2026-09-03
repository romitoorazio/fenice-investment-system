import { readFile } from 'node:fs/promises';

const read = async (name) => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const ok = (condition, message) => { if (!condition) throw new Error(message); };
const num = (value) => Number.isFinite(Number(value));

const [sources, committee, governance, terminal, ledger] = await Promise.all([
  read('global-source-health.json'),
  read('investment-committee.json'),
  read('decision-governance.json'),
  read('terminal-intelligence.json'),
  read('decision-ledger.json'),
]);

// Fail closed: certification is impossible with degraded critical data.
ok(sources.gate === 'GREEN', `source gate=${sources.gate}`);
ok((sources.critical?.failures || []).length === 0, `critical source failures=${(sources.critical?.failures || []).join(',')}`);
ok(Number(sources.qualityScore) >= 95, `source quality=${sources.qualityScore}`);
ok(Number(committee.dataQuality) >= 95, `committee data quality=${committee.dataQuality}`);

// Global, multi-asset scanner and deterministic score structure.
ok(Array.isArray(terminal.assets) && terminal.assets.length >= 15, 'terminal coverage <15');
const classes = new Set(terminal.assets.map(a => a.assetClass).filter(Boolean));
ok(classes.size >= 5, `asset classes=${classes.size}`);
for (const a of terminal.assets) {
  ok(a.symbol && num(a.unifiedScore) && num(a.riskScore), `invalid score structure ${a.symbol || '?'}`);
  ok(a.technical && typeof a.technical === 'object', `technical missing ${a.symbol}`);
}

// Hard risk vetoes: no autonomous/live execution before explicit future broker setup.
ok(governance.guardrails?.requireHumanConfirmation === true, 'human confirmation not mandatory');
ok(governance.guardrails?.blockAutonomousTrading === true, 'autonomous trading not blocked');
ok(governance.guardrails?.blockSignalWhenDataDivergent === true, 'data divergence not blocking');
ok(governance.guardrails?.blockSignalWhenSourceStale === true, 'stale data not blocking');
ok(num(governance.guardrails?.maxSingleAssetWeightPercent) && Number(governance.guardrails.maxSingleAssetWeightPercent) <= 10, 'single-asset limit invalid');
ok(Number(governance.guardrails?.minIndependentSources || 0) >= 2, 'independent-source minimum too low');
const prohibited = (governance.prohibitedActions || []).join(' ').toLowerCase();
ok(prohibited.includes('ordini') && prohibited.includes('broker'), 'order/broker veto not explicit');
ok(committee.executionGate !== 'LIVE', 'LIVE execution forbidden during certification');

// Committee decisions must carry bounded risk and invalidation evidence.
ok(Array.isArray(committee.allDecisions) && committee.allDecisions.length >= 15, 'committee coverage <15');
for (const d of committee.allDecisions) {
  ok(d.symbol && num(d.committeeScore) && num(d.confidence) && num(d.riskScore), `invalid committee decision ${d.symbol || '?'}`);
  ok(num(d.maxWeightPercent) && Number(d.maxWeightPercent) <= 10, `invalid max weight ${d.symbol}`);
  ok(Array.isArray(d.invalidation) && d.invalidation.length >= 2, `missing invalidation ${d.symbol}`);
  if (d.decision !== 'COMPRA') {
    ok(d.entryPlan?.orderMode === 'NESSUN ORDINE', `order proposed without COMPRA ${d.symbol}`);
    ok(Number(d.entryPlan?.firstTrancheEuro || 0) === 0, `tranche proposed without COMPRA ${d.symbol}`);
  }
}

// Paper validation/audit trail must be statistically meaningful, not a single snapshot.
ok(Number(ledger.recordCount) >= 100, `ledger records=${ledger.recordCount}`);
ok(Array.isArray(ledger.records) && ledger.records.length >= 100, 'ledger record array <100');
const checkpointed = ledger.records.filter(r => r.checkpoints && Object.keys(r.checkpoints).length > 0).length;
ok(checkpointed >= 20, `checkpointed paper records=${checkpointed}`);
for (const r of ledger.records.slice(0, 100)) ok(r.id && r.cycleId && r.symbol && r.decision, 'incomplete audit record');

console.log(JSON.stringify({ certification:'PASS', sourceGate:sources.gate, sourceQuality:sources.qualityScore, committeeDataQuality:committee.dataQuality, terminalAssets:terminal.assets.length, assetClasses:classes.size, ledgerRecords:ledger.recordCount, checkpointedRecords:checkpointed, liveTradingLocked:true }, null, 2));
