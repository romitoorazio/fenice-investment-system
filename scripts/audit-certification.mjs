import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async relative => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const blockers = [];
const warnings = [];
const now = Date.now();
const ageHours = iso => iso ? (now - new Date(iso).getTime()) / 3_600_000 : Infinity;

const sourceHealth = await readJson("data/global-source-health.json");
const governance = await readJson("data/decision-governance.json");
const ledger = await readJson("data/decision-ledger.json");
const universe = await readJson("data/global-universe.json");
const terminal = await readJson("data/terminal-intelligence.json");

if (sourceHealth.gate !== "GREEN") blockers.push(`source gate is ${sourceHealth.gate || "UNKNOWN"}, expected GREEN`);
if ((sourceHealth.critical?.failures || []).length) blockers.push(`critical source failures: ${sourceHealth.critical.failures.join(", ")}`);
if (!Number.isFinite(sourceHealth.qualityScore) || sourceHealth.qualityScore < 80) blockers.push(`source quality is ${sourceHealth.qualityScore ?? "n/a"}/100`);
if (ageHours(sourceHealth.generatedAt) > 12) blockers.push("global source health is stale (>12h)");

const g = governance.guardrails || {};
if (g.blockAutonomousTrading !== true) blockers.push("autonomous trading is not hard-blocked");
if (g.requireHumanConfirmation !== true) blockers.push("human confirmation is not mandatory");
if (g.blockSignalWhenDataDivergent !== true || g.blockSignalWhenSourceStale !== true) blockers.push("data-quality vetoes are incomplete");
if (!Number.isFinite(g.maxSingleAssetWeightPercent) || g.maxSingleAssetWeightPercent > 10) blockers.push("single-asset risk cap is missing or >10%");

if (!Array.isArray(ledger.records) || ledger.records.length < 100) blockers.push("decision ledger history is insufficient (<100 records)");
const marked = (ledger.records || []).filter(r => Number.isFinite(r.markToMarketPercent));
if (marked.length < 50) blockers.push("paper-trading/mark-to-market evidence is insufficient (<50 marked records)");
const checkpointed = (ledger.records || []).filter(r => r.checkpoints && Object.keys(r.checkpoints).length > 0);
if (checkpointed.length < 30) blockers.push("decision outcome checkpoints are insufficient (<30 records)");

const universeAssets = Array.isArray(universe.assets) ? universe.assets : Array.isArray(universe.instruments) ? universe.instruments : [];
if (universeAssets.length < 25) blockers.push(`global universe coverage too small (${universeAssets.length}, expected >=25)`);
const assetClasses = new Set(universeAssets.map(x => x.assetClass || x.type).filter(Boolean));
if (assetClasses.size < 5) blockers.push(`multi-asset coverage too narrow (${assetClasses.size} asset classes, expected >=5)`);

if (!Array.isArray(terminal.assets) || terminal.assets.length < 10) blockers.push("terminal scanner has insufficient current coverage (<10 assets)");
for (const asset of terminal.assets || []) {
  if (!asset.symbol || !Number.isFinite(asset.unifiedScore) || !Number.isFinite(asset.riskScore)) {
    blockers.push(`terminal scoring incomplete for ${asset.symbol || "unknown asset"}`);
    break;
  }
}

if (Number.isFinite(governance?.diagnostics?.intelligenceConfidence) && governance.diagnostics.intelligenceConfidence < 70) {
  blockers.push(`intelligence confidence is ${governance.diagnostics.intelligenceConfidence}/100, expected >=70`);
}
if (Number.isFinite(governance?.diagnostics?.operationalSourceSharePercent) && governance.diagnostics.operationalSourceSharePercent < 80) {
  blockers.push(`operational source share is ${governance.diagnostics.operationalSourceSharePercent}%, expected >=80%`);
}

if (sourceHealth.qualityScore < 100) warnings.push(`source quality not perfect: ${sourceHealth.qualityScore}/100`);

const report = {
  generatedAt: new Date().toISOString(),
  status: blockers.length ? "NOT_READY" : "READY",
  blockers,
  warnings,
  metrics: {
    sourceGate: sourceHealth.gate,
    sourceQuality: sourceHealth.qualityScore,
    criticalSourceFailures: sourceHealth.critical?.failures || [],
    ledgerRecords: ledger.records?.length || 0,
    markedLedgerRecords: marked.length,
    checkpointedLedgerRecords: checkpointed.length,
    universeAssets: universeAssets.length,
    assetClasses: assetClasses.size,
    terminalAssets: terminal.assets?.length || 0,
    intelligenceConfidence: governance?.diagnostics?.intelligenceConfidence ?? null,
    operationalSourceSharePercent: governance?.diagnostics?.operationalSourceSharePercent ?? null,
    liveTradingBlocked: g.blockAutonomousTrading === true,
  },
};

console.log(JSON.stringify(report, null, 2));
if (blockers.length) process.exit(2);
