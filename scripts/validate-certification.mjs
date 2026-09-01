import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');

async function readJson(name) {
  return JSON.parse(await readFile(path.join(dataDir, name), 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function finite(value) {
  return Number.isFinite(Number(value));
}

const [sources, committee, governance, terminal, ledger, universe] = await Promise.all([
  readJson('global-source-health.json'),
  readJson('investment-committee.json'),
  readJson('decision-governance.json'),
  readJson('terminal-intelligence.json'),
  readJson('decision-ledger.json'),
  readJson('global-universe.json'),
]);

// 1) Data/source gate. Certification is impossible while any critical source is unavailable.
assert(sources.gate === 'GREEN', `Source gate non GREEN: ${sources.gate}`);
assert((sources.critical?.failures || []).length === 0, `Fonti critiche mancanti: ${(sources.critical?.failures || []).join(', ')}`);
assert(Number(sources.qualityScore) >= 80, `Source quality insufficiente: ${sources.qualityScore}`);
assert(Number(committee.dataQuality) >= 95, `Committee data quality insufficiente: ${committee.dataQuality}`);

// 2) Global scanner and reproducible score structures.
assert(Array.isArray(terminal.assets) && terminal.assets.length >= 15, 'Copertura terminale insufficiente');
const assetClasses = new Set(terminal.assets.map((asset) => String(asset.assetClass || '').trim()).filter(Boolean));
assert(assetClasses.size >= 5, `Copertura multi-asset insufficiente: ${assetClasses.size} classi`);
for (const asset of terminal.assets) {
  assert(asset.symbol, 'Asset senza simbolo');
  assert(finite(asset.unifiedScore), `Unified score non valido: ${asset.symbol}`);
  assert(finite(asset.riskScore), `Risk score non valido: ${asset.symbol}`);
  assert(asset.technical && typeof asset.technical === 'object', `Tecnica mancante: ${asset.symbol}`);
}
assert(Array.isArray(universe.instruments || universe.assets || universe) || typeof universe === 'object', 'Global universe non valido');

// 3) Risk engine / kill switch. These are hard certification requirements.
assert(governance.guardrails?.requireHumanConfirmation === true, 'Conferma umana non obbligatoria');
assert(governance.guardrails?.blockAutonomousTrading === true, 'Autonomous trading non bloccato');
assert(governance.guardrails?.blockSignalWhenDataDivergent === true, 'Divergenza dati non bloccante');
assert(governance.guardrails?.blockSignalWhenSourceStale === true, 'Dati stale non bloccanti');
assert(finite(governance.guardrails?.maxSingleAssetWeightPercent), 'Limite posizione singola assente');
assert(Number(governance.guardrails.maxSingleAssetWeightPercent) <= 10, 'Limite posizione singola >10%');
assert(Number(governance.guardrails?.minIndependentSources || 0) >= 2, 'Fonti indipendenti minime insufficienti');
const prohibited = (governance.prohibitedActions || []).join(' ').toLowerCase();
assert(prohibited.includes('ordini'), 'Invio ordini non esplicitamente proibito');
assert(prohibited.includes('broker'), 'Collegamento broker non esplicitamente proibito');

// 4) Committee safety invariants.
assert(Array.isArray(committee.allDecisions) && committee.allDecisions.length >= 15, 'Decisioni committee insufficienti');
for (const item of committee.allDecisions) {
  assert(item.symbol, 'Decisione senza simbolo');
  assert(finite(item.committeeScore), `Committee score non valido: ${item.symbol}`);
  assert(finite(item.confidence), `Confidence non valida: ${item.symbol}`);
  assert(finite(item.riskScore), `Risk score committee non valido: ${item.symbol}`);
  assert(finite(item.maxWeightPercent), `Peso massimo assente: ${item.symbol}`);
  assert(Number(item.maxWeightPercent) <= 10, `Peso massimo >10%: ${item.symbol}`);
  assert(Array.isArray(item.invalidation) && item.invalidation.length >= 2, `Invalidation insufficiente: ${item.symbol}`);
  if (item.decision !== 'COMPRA') {
    assert(item.entryPlan?.orderMode === 'NESSUN ORDINE', `Ordine proposto senza COMPRA: ${item.symbol}`);
    assert(Number(item.entryPlan?.firstTrancheEuro || 0) === 0, `Tranche proposta senza COMPRA: ${item.symbol}`);
  }
}

// 5) Audit trail / paper validation. Require enough history to evaluate calibration, not just one snapshot.
assert(Number(ledger.recordCount) >= 100, `Decision ledger troppo corto: ${ledger.recordCount}`);
assert(Array.isArray(ledger.records) && ledger.records.length >= 100, 'Decision ledger records insufficienti');
const checkpointed = ledger.records.filter((record) => record.checkpoints && Object.keys(record.checkpoints).length > 0).length;
assert(checkpointed >= 20, `Paper validation insufficiente: solo ${checkpointed} record con checkpoint`);
for (const record of ledger.records.slice(0, 100)) {
  assert(record.id && record.cycleId && record.symbol && record.decision, 'Audit record incompleto');
}

// 6) Live execution must stay locked before explicit future broker configuration.
assert(committee.executionGate !== 'LIVE', 'LIVE execution gate non consentito');
assert(Number(committee.proposedFirstTrancheEuro || 0) >= 0, 'Tranche proposta non valida');

console.log(JSON.stringify({
  certification: 'PASS',
  sourceGate: sources.gate,
  sourceQuality: sources.qualityScore,
  committeeDataQuality: committee.dataQuality,
  terminalAssets: terminal.assets.length,
  assetClasses: assetClasses.size,
  ledgerRecords: ledger.recordCount,
  checkpointedRecords: checkpointed,
  liveTradingLocked: true,
}, null, 2));
