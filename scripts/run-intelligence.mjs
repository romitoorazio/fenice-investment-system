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
const comparisonUniverse = [
  ["spy.us", "SPY", "ETF"],
  ["qqq.us", "QQQ", "ETF"],
  ["iwm.us", "IWM", "ETF"],
  ["dia.us", "DIA", "ETF"],
  ["gld.us", "GLD", "Materie prime"],
  ["slv.us", "SLV", "Materie prime"],
  ["uso.us", "USO", "Materie prime"],
  ["tlt.us", "TLT", "Obbligazioni"],
  ["vgk.us", "VGK", "ETF"],
  ["ewj.us", "EWJ", "ETF"],
  ["eem.us", "EEM", "ETF"],
  ["acwi.us", "ACWI", "ETF"],
];

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

async function request(url, { format = "json", timeoutMs = 12000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: format === "json" ? "application/json" : "text/csv,text/plain,*/*",
        "user-agent": "FeniceInvestmentSystem/3.3 data-quality-validation",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return format === "json" ? await response.json() : await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseStooqQuote(text) {
  const lines = String(text || "").trim().split(/\r?\n/);
  if (lines.length < 2 || /N\/D/i.test(lines.at(-1))) return null;
  const headers = lines[0].split(",").map((item) => item.trim());
  const values = lines.at(-1).split(",").map((item) => item.trim());
  const row = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  const price = Number(row.Close);
  if (!Number.isFinite(price) || price <= 0) return null;
  return { price, observedAt: row.Date || undefined };
}

async function fetchStooqEvidence(code, symbol, assetClass) {
  const text = await request(`https://stooq.com/q/l/?s=${encodeURIComponent(code)}&f=sd2t2ohlcv&h&e=csv`, { format: "text" });
  const quote = parseStooqQuote(text);
  if (!quote) throw new Error("Stooq quote non valido");
  return {
    symbol,
    assetClass,
    price: quote.price,
    currency: "USD",
    source: "Stooq independent validation",
    observedAt: quote.observedAt,
    validationOnly: true,
  };
}

async function fetchYahooEvidence(symbol, assetClass) {
  const data = await request(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`);
  const result = data?.chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const finite = closes.filter(Number.isFinite);
  const price = Number(result?.meta?.regularMarketPrice ?? finite.at(-1));
  if (!Number.isFinite(price) || price <= 0) throw new Error("Yahoo quote non valido");
  const timestamp = result?.meta?.regularMarketTime || result?.timestamp?.at(-1);
  return {
    symbol,
    assetClass,
    price,
    currency: result?.meta?.currency || "USD",
    source: "Yahoo Finance independent validation",
    observedAt: timestamp ? new Date(Number(timestamp) * 1000).toISOString() : undefined,
    validationOnly: true,
  };
}

async function collectIndependentMarketEvidence(markets) {
  const evidence = markets
    .filter((item) => normalizeSymbol(item.symbol) && Number.isFinite(Number(item.price)))
    .map((item) => ({
      symbol: normalizeSymbol(item.symbol),
      assetClass: item.assetClass,
      price: Number(item.price),
      currency: String(item.currency || "USD").toUpperCase(),
      source: item.source || "Snapshot market source",
      observedAt: item.observedAt,
      validationOnly: false,
    }));

  const results = await Promise.allSettled(comparisonUniverse.flatMap(([code, symbol, assetClass]) => [
    fetchStooqEvidence(code, symbol, assetClass),
    fetchYahooEvidence(symbol, assetClass),
  ]));
  for (const result of results) {
    if (result.status === "fulfilled") evidence.push(result.value);
  }

  const unique = new Map();
  for (const item of evidence) {
    const key = `${normalizeSymbol(item.symbol)}:${String(item.currency || "USD").toUpperCase()}:${item.source}`;
    const existing = unique.get(key);
    if (!existing || Date.parse(item.observedAt || 0) > Date.parse(existing.observedAt || 0)) unique.set(key, item);
  }
  return [...unique.values()];
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
  const marketEvidence = await collectIndependentMarketEvidence(markets);

  const sourceQuality = providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    state: provider.state,
    qualityScore: sourceScore(provider),
    freshnessScore: freshnessScore(provider.lastSuccessAt, now),
    coverageCount: Array.isArray(provider.coverage) ? provider.coverage.length : 0,
  })).sort((a, b) => b.qualityScore - a.qualityScore);

  const validations = buildValidation(marketEvidence);
  const confirmed = validations.filter((item) => item.status === "confermato").length;
  const divergent = validations.filter((item) => item.status === "divergente").length;
  const operational = providers.filter((item) => item.state === "operativo").length;
  const partial = providers.filter((item) => item.state === "parziale").length;
  const sourceNames = new Set(marketEvidence.map((item) => item.source).filter(Boolean));
  const assetClasses = new Set(marketEvidence.map((item) => item.assetClass).filter(Boolean));
  const concentration = marketEvidence.length
    ? Math.max(...[...sourceNames].map((source) => marketEvidence.filter((item) => item.source === source).length)) / marketEvidence.length
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
      evidenceObservations: marketEvidence.length,
      validationSources: [...sourceNames].sort(),
    },
    coverage: {
      instruments: new Set(marketEvidence.map((item) => normalizeSymbol(item.symbol)).filter(Boolean)).size,
      marketSources: sourceNames.size,
      assetClasses: [...assetClasses].sort(),
      sourceConcentrationPercent: Math.round(concentration * 100),
    },
    policy: {
      institutionalSourcesFirst: true,
      crossSourceValidationRequired: true,
      singleSourceSignalsCapped: true,
      autonomousTrading: false,
      validationOnlyObservationsDoNotCreateTradeSignals: true,
    },
  };

  snapshot.marketValidationEvidence = {
    generatedAt: report.generatedAt,
    observations: marketEvidence.length,
    sources: [...sourceNames].sort(),
    checks: validations.length,
    divergent,
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
  console.log(`Fenice intelligence completed: confidence ${intelligenceConfidence}/100, ${validations.length} cross-source checks, ${marketEvidence.length} evidence observations.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
