import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async relative => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const fail = message => { throw new Error(`SAFETY INVARIANT FAILED: ${message}`); };

const governance = await readJson("data/decision-governance.json");
const ledger = await readJson("data/decision-ledger.json");

if (governance?.guardrails?.blockAutonomousTrading !== true) fail("autonomous trading must remain blocked");
if (governance?.guardrails?.requireHumanConfirmation !== true) fail("human confirmation must remain mandatory");
if (governance?.guardrails?.blockSignalWhenDataDivergent !== true) fail("divergent data must block signals");
if (governance?.guardrails?.blockSignalWhenSourceStale !== true) fail("stale sources must block signals");

const prohibited = new Set(governance?.prohibitedActions || []);
for (const required of ["inviare ordini", "collegarsi a broker", "usare leva automaticamente"]) {
  if (!prohibited.has(required)) fail(`missing prohibited action: ${required}`);
}

const maxWeight = governance?.guardrails?.maxSingleAssetWeightPercent;
if (!Number.isFinite(maxWeight) || maxWeight <= 0 || maxWeight > 10) fail("single-asset cap must be >0 and <=10%");

if (!Array.isArray(ledger?.records) || ledger.records.length === 0) fail("decision ledger must contain auditable records");
for (const record of ledger.records) {
  if (!record.id || !record.symbol || !record.decision) fail("ledger record missing identity fields");
  if (!Number.isFinite(record.committeeScore) || !Number.isFinite(record.confidence) || !Number.isFinite(record.riskScore)) {
    fail(`ledger record ${record.id} has incomplete scoring`);
  }
  if ((record.proposedFirstTrancheEuro || 0) > 0 && record.executionGate !== "VAI") {
    fail(`record ${record.id} proposes capital while execution gate is not VAI`);
  }
}

console.log(`Safety invariants OK: ${ledger.records.length} ledger records checked; live/autonomous trading remains blocked.`);
