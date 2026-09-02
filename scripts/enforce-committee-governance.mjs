import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const committeePath = path.join(dataDir, 'investment-committee.json');
const governancePath = path.join(dataDir, 'decision-governance.json');
const committee = JSON.parse(await readFile(committeePath, 'utf8'));
const governance = JSON.parse(await readFile(governancePath, 'utf8'));
const cap = Math.min(8, Math.max(0, Number(governance.guardrails?.maxSingleAssetWeightPercent ?? 8)));

function harden(decision) {
  decision.maxWeightPercent = Math.min(Number(decision.maxWeightPercent || 0), cap);
  if (decision.entryPlan) {
    decision.entryPlan.firstTranchePercent = Math.min(Number(decision.entryPlan.firstTranchePercent || 0), decision.maxWeightPercent);
    decision.entryPlan.firstTrancheEuro = Math.min(
      Number(decision.entryPlan.firstTrancheEuro || 0),
      Math.round(Number(committee.capitalEuro || 10_000) * decision.entryPlan.firstTranchePercent / 100),
    );
    if (decision.decision !== 'COMPRA') {
      decision.entryPlan.orderMode = 'NESSUN ORDINE';
      decision.entryPlan.firstTranchePercent = 0;
      decision.entryPlan.firstTrancheEuro = 0;
      decision.entryPlan.maxEntryPrice = null;
    }
  }
  return decision;
}

committee.allDecisions = (committee.allDecisions || []).map(harden);
const bySymbol = new Map(committee.allDecisions.map((item) => [item.symbol, item]));
committee.topDecisions = (committee.topDecisions || []).map((item) => bySymbol.get(item.symbol) || harden(item));
const buys = committee.allDecisions.filter((item) => item.decision === 'COMPRA');
const trancheTotal = buys.reduce((sum, item) => sum + Number(item.entryPlan?.firstTrancheEuro || 0), 0);
committee.proposedFirstTrancheEuro = committee.executionGate === 'PRONTO_CON_CONFERMA'
  ? Math.min(Math.round(Number(committee.capitalEuro || 10_000) * 0.15), trancheTotal)
  : 0;
committee.governance = {
  maxSingleAssetWeightPercent: cap,
  requireHumanConfirmation: governance.guardrails?.requireHumanConfirmation === true,
  blockAutonomousTrading: governance.guardrails?.blockAutonomousTrading === true,
  liveTradingLocked: true,
};
committee.committeeRules = [...new Set([
  ...(committee.committeeRules || []),
  `Nessun candidato può superare il ${cap}% del capitale senza revisione esplicita della governance.`,
  'Il live trading resta bloccato: ogni piano è solo preparatorio finché il broker non viene configurato esplicitamente.',
])];

await writeFile(committeePath, `${JSON.stringify(committee, null, 2)}\n`, 'utf8');
console.log(`Committee governance enforced: max single asset ${cap}%, live trading locked.`);
