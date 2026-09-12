import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const committeePath = path.join(dataDir, 'investment-committee.json');
const sourceHealthPath = path.join(dataDir, 'global-source-health.json');

const committee = JSON.parse(await readFile(committeePath, 'utf8'));
const sourceHealth = JSON.parse(await readFile(sourceHealthPath, 'utf8'));
const sourceGate = sourceHealth.gate || sourceHealth.institutionalGate || committee.sourceGate || 'UNKNOWN';
const dataQuality = Number(committee.dataQuality || 0);

const reasons = [];
if (sourceGate !== 'GREEN') reasons.push(`Institutional Source Gate ${sourceGate}: execution veto until GREEN.`);
if (!Number.isFinite(dataQuality) || dataQuality < 75) reasons.push(`Investment Committee data quality ${dataQuality || 0}/100: execution veto below 75.`);

if (reasons.length) {
  committee.sourceGate = sourceGate;
  committee.executionGate = 'BLOCCATO';
  committee.proposedFirstTrancheEuro = 0;
  committee.safetyVeto = {
    active: true,
    reasons,
    liveTrading: 'DISABILITATO',
    brokerTransmission: false,
  };

  for (const decision of committee.allDecisions || []) {
    if (!decision.entryPlan) continue;
    decision.entryPlan.orderMode = 'NESSUN ORDINE';
    decision.entryPlan.maxEntryPrice = null;
    decision.entryPlan.firstTranchePercent = 0;
    decision.entryPlan.firstTrancheEuro = 0;
  }
  for (const decision of committee.topDecisions || []) {
    if (!decision.entryPlan) continue;
    decision.entryPlan.orderMode = 'NESSUN ORDINE';
    decision.entryPlan.maxEntryPrice = null;
    decision.entryPlan.firstTranchePercent = 0;
    decision.entryPlan.firstTrancheEuro = 0;
  }

  committee.warnings = [...new Set([...(committee.warnings || []), ...reasons])];
} else {
  committee.safetyVeto = {
    active: false,
    reasons: [],
    liveTrading: 'DISABILITATO',
    brokerTransmission: false,
  };
}

committee.liveTrading = 'DISABILITATO';
committee.brokerTransmission = false;

await writeFile(committeePath, `${JSON.stringify(committee, null, 2)}\n`, 'utf8');
console.log(`Fenice safety veto: ${committee.safetyVeto.active ? 'ACTIVE' : 'CLEAR'} · source ${sourceGate} · live trading DISABILITATO.`);
