import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const readJson = async (name) => JSON.parse(await readFile(path.join(dataDir, name), 'utf8'));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const committee = await readJson('investment-committee.json');
const ledger = await readJson('decision-ledger.json');

assert(Array.isArray(ledger.records), 'Paper ledger records missing');
assert(Number(ledger.recordCount) === ledger.records.length || ledger.records.length === 5000,
  `Paper ledger count mismatch: header=${ledger.recordCount} stored=${ledger.records.length}`);

const ids = new Set();
for (const record of ledger.records) {
  assert(record.id && !ids.has(record.id), `Duplicate paper-ledger id: ${record.id || 'missing'}`);
  ids.add(record.id);
  assert(record.symbol && record.decision && record.createdAt && record.cycleId, `Incomplete ledger record ${record.id}`);
  assert(record.sourceGate, `Missing sourceGate on ${record.id}`);
  assert(record.executionGate, `Missing executionGate on ${record.id}`);
  const tranche = Number(record.proposedFirstTrancheEuro || 0);
  assert(Number.isFinite(tranche) && tranche >= 0, `Invalid paper tranche on ${record.id}`);
  if (record.decision !== 'COMPRA') assert(tranche === 0, `Non-BUY ledger record allocates capital: ${record.id}`);
  if (record.sourceGate !== 'GREEN') assert(tranche === 0, `Non-GREEN source gate allocates capital: ${record.id}`);

  if (record.checkpoints && typeof record.checkpoints === 'object') {
    for (const [label, checkpoint] of Object.entries(record.checkpoints)) {
      assert(checkpoint.measuredAt, `Checkpoint ${label} missing timestamp on ${record.id}`);
      assert(Number.isFinite(Number(checkpoint.price)), `Checkpoint ${label} invalid price on ${record.id}`);
      assert(Number.isFinite(Number(checkpoint.returnPercent)), `Checkpoint ${label} invalid return on ${record.id}`);
    }
  }
}

assert(committee.liveTrading !== 'ABILITATO', 'Live trading must not be enabled during paper validation');
assert(committee.brokerTransmission !== true, 'Broker transmission must stay false during paper validation');

const checkpointCounts = ledger.records.reduce((acc, record) => {
  for (const label of Object.keys(record.checkpoints || {})) acc[label] = (acc[label] || 0) + 1;
  return acc;
}, {});

console.log(`Fenice paper ledger integrity OK · ${ledger.records.length} stored records · checkpoints ${JSON.stringify(checkpointCounts)} · live trading locked.`);
