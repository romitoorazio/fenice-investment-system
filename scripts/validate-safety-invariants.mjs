import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async relative => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const fail = message => { throw new Error(`SAFETY INVARIANT FAILED: ${message}`); };

const governance = await readJson("data/decision-governance.json");
const ledger = await readJson("data/decision-ledger.json");
const sourceHealth = await readJson("data/global-source-health.json");
const snapshot = await readJson("data/latest-snapshot.json");

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

const institutionalGate = String(sourceHealth?.gate || "RED").toUpperCase();
const expectedGate = institutionalGate.toLowerCase();
if (String(snapshot?.reliability?.institutionalSourceGate || "").toLowerCase() !== expectedGate) {
  fail(`snapshot institutional gate does not match authoritative source health (${snapshot?.reliability?.institutionalSourceGate || "missing"} vs ${expectedGate})`);
}
if (institutionalGate !== "GREEN" && snapshot.mode === "live") fail(`snapshot cannot be live while institutional gate is ${institutionalGate}`);
if (institutionalGate === "AMBER" && Number(snapshot.dataQuality) > 74) fail("AMBER institutional gate must cap data quality at 74");
if (institutionalGate === "RED" && Number(snapshot.dataQuality) > 49) fail("RED institutional gate must cap data quality at 49");

for (const sourceId of sourceHealth?.critical?.failures || []) {
  const provider = (snapshot.providers || []).find(item => String(item.id || "").toLowerCase() === String(sourceId).toLowerCase());
  if (provider && provider.state !== "errore") fail(`critical failed source ${sourceId} must not remain operational in snapshot`);
}

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

console.log(`Safety invariants OK: ${ledger.records.length} ledger records checked; institutional gate=${institutionalGate}; live/autonomous trading remains blocked.`);
