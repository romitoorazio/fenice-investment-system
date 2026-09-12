import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = async (file) => readFile(path.join(root, file), 'utf8');
const readJson = async (file) => JSON.parse(await read(file));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const pkg = await readJson('package.json');
const safety = await read('scripts/enforce-committee-safety.mjs');
const committeeSource = await read('scripts/run-investment-committee.mjs');
const sourceHealth = await readJson('data/global-source-health.json');
const committee = await readJson('data/investment-committee.json');

for (const command of ['terminal', 'committee']) {
  const script = pkg.scripts?.[command] || '';
  assert(script.includes('enforce-committee-safety.mjs'), `${command}: safety veto is not wired`);
  assert(script.indexOf('enforce-committee-safety.mjs') < script.indexOf('run-decision-ledger.mjs'), `${command}: safety veto must run before ledger persistence`);
}

assert(/sourceGate\s*!==\s*['"]GREEN['"]/.test(safety), 'Safety layer must fail closed whenever source gate is not GREEN');
assert(/liveTrading\s*=\s*['"]DISABILITATO['"]/.test(safety), 'Live trading must be explicitly disabled');
assert(/brokerTransmission\s*=\s*false/.test(safety), 'Broker transmission must be explicitly disabled');
assert(/Nessun ordine viene trasmesso automaticamente al broker/.test(committeeSource), 'Committee must state the no-broker-transmission rule');

const gate = sourceHealth.gate || sourceHealth.institutionalGate || committee.sourceGate || 'UNKNOWN';
if (gate !== 'GREEN') {
  assert(committee.executionGate !== 'PRONTO_CON_CONFERMA' || Number(committee.proposedFirstTrancheEuro || 0) === 0,
    `Unsafe persisted state: ${gate} source gate cannot expose executable capital`);
}

for (const decision of committee.allDecisions || committee.topDecisions || []) {
  const weight = Number(decision.maxWeightPercent);
  assert(Number.isFinite(weight) && weight > 0 && weight <= 10, `${decision.symbol || 'unknown'} maxWeightPercent outside 0..10`);
  const tranche = Number(decision.entryPlan?.firstTrancheEuro || 0);
  assert(tranche >= 0 && tranche <= Number(committee.capitalEuro || 0) * 0.15, `${decision.symbol || 'unknown'} tranche exceeds 15% portfolio guardrail`);
  if (decision.decision !== 'COMPRA') {
    assert(tranche === 0, `${decision.symbol || 'unknown'} non-BUY decision allocates capital`);
  }
}

console.log(`Fenice certification safety invariants OK · source gate ${gate} · live trading locked.`);
