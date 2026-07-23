import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = path.join(root, "data", "latest-snapshot.json");
const qualityPath = path.join(root, "data", "intelligence-quality.json");

function runFoundation() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts", "run-foundation-plus.mjs")], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`Foundation exited with ${code}`))));
  });
}

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));

function sourceScore(provider) {
  const stateBase = { operativo: 88, parziale: 62, "non configurato": 20, errore: 8 }[provider.state] ?? 35;
  const successBonus = provider.lastSuccessAt ? 6 : 0;
  const coverageBonus = Math.min(6, Array.isArray(provider.coverage) ? provider.coverage.length : 0);
  return clamp(stateBase + successBonus + coverageBonus);
}

function freshnessScore(value, now) {
  if (!value) return 35;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return 45;
  const hours = Math.max(0, (now - time) / 3_600_000);
  if (hours <= 24) return 100;
  if (hours <= 72) return 82;
  if (hours <= 168) return 62;
  if (hours <= 720) return 40;
  return 15;
}

function normalizeSymbol(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9._-]/g, "");
}

function buildValidation(markets) {
  const groups = new Map();
  for (const item of markets) {
    const symbol = normalizeSymbol(item.symbol);
    if (!symbol || !Number.isFinite(Number(item.price))) continue;
    const key = `${symbol}:${String(item.currency || "").toUpperCase()}`;
    const list = groups.get(key) || [];
    list.push(item);
    groups.set(key, list);
  }

  const checks = [];
  for (const [key, items] of groups) {
    const distinctSources = [...new Set(items.map((item) => item.source).filter(Boolean))];
    if (distinctSources.length < 2) continue;
    const prices = items.map((item) => Number(item.price)).filter(Number.isFinite);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const midpoint = (min + max) / 2 || 1;
    const spreadPercent = ((max - min) / midpoint) * 100;
    checks.push({
      instrument: key,
      sources: distinctSources,
      observations: prices.length,
      spreadPercent: Number(spreadPercent.toFixed(3)),
      status: spreadPercent <= 0.5 ? "confermato" : spreadPercent <= 2 ? "attenzione" : "divergente",
    });
  }
  return checks.sort((a, b) => b.spreadPercent - a.spreadPercent);
}

async function main() {
  await runFoundation();
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  const now = Date.now();
  const providers = Array.isArray(snapshot.providers) ? snapshot.providers : [];
  const markets = Array.isArray(snapshot.markets) ? snapshot.markets : [];

  const sourceQuality = providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    state: provider.state,
    qualityScore: sourceScore(provider),
    freshnessScore: freshnessScore(provider.lastSuccessAt, now),
    coverageCount: Array.isArray(provider.coverage) ? provider.coverage.length : 0,
  })).sort((a, b) => b.qualityScore - a.qualityScore);

  const validations = buildValidation(markets);
  const confirmed = validations.filter((item) => item.status === "confermato").length;
  const divergent = validations.filter((item) => item.status === "divergente").length;
  const operational = providers.filter((item) => item.state === "operativo").length;
  const partial = providers.filter((item) => item.state === "parziale").length;
  const sourceNames = new Set(markets.map((item) => item.source).filter(Boolean));
  const assetClasses = new Set(markets.map((item) => item.assetClass).filter(Boolean));
  const concentration = markets.length
    ? Math.max(...[...sourceNames].map((source) => markets.filter((item) => item.source === source).length)) / markets.length
    : 1;

  const averageQuality = sourceQuality.length
    ? sourceQuality.reduce((sum, item) => sum + item.qualityScore, 0) / sourceQuality.length
    : 0;
  const validationBonus = Math.min(12, confirmed * 2);
  const divergencePenalty = Math.min(24, divergent * 6);
  const concentrationPenalty = concentration > 0.75 ? 18 : concentration > 0.55 ? 10 : concentration > 0.4 ? 5 : 0;
  const coverageBonus = Math.min(12, assetClasses.size * 2);
  const intelligenceConfidence = Math.round(clamp(
    averageQuality * 0.55 + operational * 4 + partial * 2 + validationBonus + coverageBonus - divergencePenalty - concentrationPenalty,
  ));

  const report = {
    generatedAt: new Date().toISOString(),
    intelligenceConfidence,
    sourceQuality,
    crossSourceValidation: {
      checked: validations.length,
      confirmed,
      divergent,
      checks: validations.slice(0, 100),
    },
    coverage: {
      instruments: markets.length,
      marketSources: sourceNames.size,
      assetClasses: [...assetClasses].sort(),
      sourceConcentrationPercent: Math.round(concentration * 100),
    },
    policy: {
      institutionalSourcesFirst: true,
      crossSourceValidationRequired: true,
      singleSourceSignalsCapped: true,
      autonomousTrading: false,
    },
  };

  snapshot.intelligence = report;
  snapshot.pulse = snapshot.pulse || {};
  snapshot.pulse.rawConfidence = snapshot.pulse.confidence;
  snapshot.pulse.confidence = intelligenceConfidence;
  if (concentrationPenalty >= 10) {
    snapshot.warnings = [...new Set([...(snapshot.warnings || []), "Copertura di mercato concentrata su poche fonti: fiducia ridotta automaticamente."])];
  }
  if (divergent > 0) {
    snapshot.warnings = [...new Set([...(snapshot.warnings || []), `${divergent} strumenti presentano prezzi divergenti tra fonti indipendenti.`])];
  }

  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await writeFile(qualityPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Fenice intelligence completed: confidence ${intelligenceConfidence}/100, ${validations.length} cross-source checks.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
