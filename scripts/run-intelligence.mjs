import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeIntelligenceConfidence,
  computeSourceConcentration,
  deriveCryptoVenueTargets,
  deriveStooqTargets,
  settleWithConcurrency,
} from "../lib/intelligence/quality-engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = path.join(root, "data", "latest-snapshot.json");
const qualityPath = path.join(root, "data", "intelligence-quality.json");
const globalSourceHealthPath = path.join(root, "data", "global-source-health.json");
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

function normalizeIdentity(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function yahooIdentityMatches(expectedName, quote) {
  const expected = normalizeIdentity(expectedName);
  if (!expected) return false;
  const expectedTokens = expected.split(/\s+/).filter((token) => token.length >= 2 && token !== "usd");
  if (!expectedTokens.length) return false;
  const candidates = [quote?.shortname, quote?.longname, quote?.displayName]
    .map(normalizeIdentity)
    .filter(Boolean);
  return candidates.some((candidate) => expectedTokens.every((token) => candidate.includes(token)));
}

async function request(url, { format = "json", timeoutMs = 12000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: format === "json" ? "application/json" : "text/csv,text/plain,*/*",
        "user-agent": "FeniceInvestmentSystem/3.5 data-quality-validation",
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

async function verifyYahooCryptoIdentity(yahooSymbol, expectedName) {
  if (!expectedName) throw new Error("Identità crypto non disponibile per la validazione Yahoo");
  const search = await request(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(expectedName)}&quotesCount=12&newsCount=0`);
  const quote = (Array.isArray(search?.quotes) ? search.quotes : []).find(
    (item) => normalizeSymbol(item?.symbol) === normalizeSymbol(yahooSymbol),
  );
  if (!quote || !yahooIdentityMatches(expectedName, quote)) {
    throw new Error("Identità Yahoo non coerente con l'asset di origine");
  }
}

async function fetchYahooEvidence(symbol, assetClass, expectedName) {
  const canonicalSymbol = normalizeSymbol(symbol);
  const yahooSymbol = assetClass === "Criptovaluta" && !canonicalSymbol.includes("-")
    ? `${canonicalSymbol}-USD`
    : canonicalSymbol;
  if (assetClass === "Criptovaluta") await verifyYahooCryptoIdentity(yahooSymbol, expectedName);
  const data = await request(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=5d`);
  const result = data?.chart?.result?.[0];
  const returnedSymbol = normalizeSymbol(result?.meta?.symbol);
  if (returnedSymbol && returnedSymbol !== normalizeSymbol(yahooSymbol)) {
    throw new Error("Simbolo Yahoo restituito diverso da quello richiesto");
  }
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const finite = closes.filter(Number.isFinite);
  const price = Number(result?.meta?.regularMarketPrice ?? finite.at(-1));
  if (!Number.isFinite(price) || price <= 0) throw new Error("Yahoo quote non valido");
  const timestamp = result?.meta?.regularMarketTime || result?.timestamp?.at(-1);
  return {
    symbol: canonicalSymbol,
    name: expectedName,
    assetClass,
    price,
    currency: result?.meta?.currency || "USD",
    source: "Yahoo Finance independent validation",
    observedAt: timestamp ? new Date(Number(timestamp) * 1000).toISOString() : undefined,
    validationOnly: true,
  };
}

async function fetchCoinbaseEvidence(symbol, expectedName) {
  const canonicalSymbol = normalizeSymbol(symbol);
  const data = await request(`https://api.exchange.coinbase.com/products/${encodeURIComponent(`${canonicalSymbol}-USD`)}/ticker`);
  const price = Number(data?.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error("Coinbase quote non valido");
  return {
    symbol: canonicalSymbol,
    name: expectedName,
    assetClass: "Criptovaluta",
    price,
    currency: "USD",
    source: "Coinbase Exchange independent validation",
    observedAt: data?.time && Number.isFinite(Date.parse(data.time)) ? new Date(data.time).toISOString() : new Date().toISOString(),
    validationOnly: true,
  };
}

async function fetchKrakenEvidence(symbol, expectedName) {
  const canonicalSymbol = normalizeSymbol(symbol);
  const pair = canonicalSymbol === "BTC" ? "XBTUSD" : `${canonicalSymbol}USD`;
  const data = await request(`https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(pair)}`);
  if (!Array.isArray(data?.error) || data.error.length) throw new Error("Kraken API error");
  const result = data?.result && typeof data.result === "object" ? Object.values(data.result)[0] : null;
  const price = Number(result?.c?.[0]);
  if (!Number.isFinite(price) || price <= 0) throw new Error("Kraken quote non valido");
  return {
    symbol: canonicalSymbol,
    name: expectedName,
    assetClass: "Criptovaluta",
    price,
    currency: "USD",
    source: "Kraken independent validation",
    observedAt: new Date().toISOString(),
    validationOnly: true,
  };
}

async function collectIndependentMarketEvidence(baseObservations) {
  const evidence = baseObservations
    .filter((item) => normalizeSymbol(item.symbol) && Number.isFinite(Number(item.price)))
    .map((item) => ({
      symbol: normalizeSymbol(item.symbol),
      name: item.name,
      assetClass: item.assetClass,
      price: Number(item.price),
      currency: String(item.currency || "USD").toUpperCase(),
      source: item.source || "Snapshot market source",
      observedAt: item.observedAt,
      validationOnly: false,
    }));

  const yahooTargets = new Map();
  for (const [, symbol, assetClass] of comparisonUniverse) {
    yahooTargets.set(normalizeSymbol(symbol), { symbol: normalizeSymbol(symbol), assetClass });
  }
  for (const item of evidence) {
    const symbol = normalizeSymbol(item.symbol);
    if (!symbol) continue;
    const existing = yahooTargets.get(symbol);
    if (!existing) {
      yahooTargets.set(symbol, { symbol, assetClass: item.assetClass, expectedName: item.name });
    } else if (!existing.expectedName && item.name) {
      yahooTargets.set(symbol, { ...existing, expectedName: item.name });
    }
  }

  const stooqTargets = deriveStooqTargets(evidence, comparisonUniverse, 32);
  const cryptoVenueTargets = deriveCryptoVenueTargets(evidence, 12);
  const taskFactories = [
    ...stooqTargets.map(([code, symbol, assetClass]) => () => fetchStooqEvidence(code, symbol, assetClass)),
    ...[...yahooTargets.values()].map(({ symbol, assetClass, expectedName }) => () => fetchYahooEvidence(symbol, assetClass, expectedName)),
    ...cryptoVenueTargets.map(([symbol, expectedName]) => () => fetchCoinbaseEvidence(symbol, expectedName)),
    ...cryptoVenueTargets.map(([symbol, expectedName]) => () => fetchKrakenEvidence(symbol, expectedName)),
  ];
  const results = await settleWithConcurrency(taskFactories, 8);
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

function buildValidation(observations) {
  const groups = new Map();
  for (const item of observations) {
    const symbol = normalizeSymbol(item.symbol);
    if (!symbol || !Number.isFinite(Number(item.price))) continue;
    const key = `${symbol}:${String(item.currency || "").toUpperCase()}`;
    const list = groups.get(key) || [];
    list.push(item);
    groups.set(key, list);
  }

  const checks = [];
  for (const [key, items] of groups) {
    const bySource = new Map();
    for (const item of items) {
      if (!item.source || !Number.isFinite(Number(item.price))) continue;
      bySource.set(item.source, item);
    }
    const independent = [...bySource.values()];
    if (independent.length < 2) continue;
    const prices = independent.map((item) => Number(item.price));
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const midpoint = (min + max) / 2 || 1;
    const spreadPercent = ((max - min) / midpoint) * 100;
    checks.push({
      instrument: key,
      sources: independent.map((item) => item.source),
      observations: independent.length,
      spreadPercent: Number(spreadPercent.toFixed(3)),
      status: spreadPercent <= 0.5 ? "confermato" : spreadPercent <= 2 ? "attenzione" : "divergente",
    });
  }
  return checks.sort((a, b) => b.spreadPercent - a.spreadPercent);
}

async function main() {
  await runFoundation();
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  let globalSourceHealth = {};
  try {
    globalSourceHealth = JSON.parse(await readFile(globalSourceHealthPath, "utf8"));
  } catch {
    globalSourceHealth = {};
  }

  const now = Date.now();
  const providers = Array.isArray(snapshot.providers) ? snapshot.providers : [];
  const markets = Array.isArray(snapshot.markets) ? snapshot.markets : [];
  const preservedObservations = Array.isArray(snapshot.marketObservations) && snapshot.marketObservations.length
    ? snapshot.marketObservations
    : markets;
  const observations = await collectIndependentMarketEvidence(preservedObservations);

  const sourceQuality = providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    state: provider.state,
    qualityScore: sourceScore(provider),
    freshnessScore: freshnessScore(provider.lastSuccessAt, now),
    coverageCount: Array.isArray(provider.coverage) ? provider.coverage.length : 0,
  })).sort((a, b) => b.qualityScore - a.qualityScore);

  const validations = buildValidation(observations);
  const confirmed = validations.filter((item) => item.status === "confermato").length;
  const divergent = validations.filter((item) => item.status === "divergente").length;
  const sourceNames = new Set(observations.map((item) => item.source).filter(Boolean));
  const assetClasses = new Set([...markets, ...observations].map((item) => item.assetClass).filter(Boolean));
  const concentration = computeSourceConcentration(observations);
  const confidenceModel = computeIntelligenceConfidence({
    sourceQuality,
    criticalHealth: globalSourceHealth?.critical || {},
    healthReportGeneratedAt: globalSourceHealth?.generatedAt || null,
    validations,
    sourceCount: sourceNames.size,
    assetClassCount: assetClasses.size,
    concentration,
    now,
  });
  const intelligenceConfidence = confidenceModel.confidence;

  const report = {
    generatedAt: new Date().toISOString(),
    intelligenceConfidence,
    confidenceModel,
    sourceQuality,
    crossSourceValidation: {
      checked: validations.length,
      confirmed,
      divergent,
      checks: validations.slice(0, 100),
      evidenceObservations: observations.length,
      validationSources: [...sourceNames].sort(),
    },
    coverage: {
      instruments: new Set(observations.map((item) => normalizeSymbol(item.symbol)).filter(Boolean)).size,
      marketObservations: observations.length,
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
      confidenceFailsClosedWithoutCriticalSourceGreen: true,
      criticalHealthFreshnessRequiredHours: 24,
      boundedExternalValidationConcurrency: 8,
    },
  };

  snapshot.marketValidationEvidence = {
    generatedAt: report.generatedAt,
    observations: observations.length,
    sources: [...sourceNames].sort(),
    checks: validations.length,
    divergent,
  };
  snapshot.intelligence = report;
  snapshot.pulse = snapshot.pulse || {};
  snapshot.pulse.rawConfidence = snapshot.pulse.confidence;
  snapshot.pulse.confidence = intelligenceConfidence;
  if (concentration > 0.5) {
    snapshot.warnings = [...new Set([...(snapshot.warnings || []), "Copertura di mercato concentrata su poche fonti: fiducia ridotta automaticamente."])];
  }
  if (divergent > 0) {
    snapshot.warnings = [...new Set([...(snapshot.warnings || []), `${divergent} strumenti presentano prezzi divergenti tra fonti indipendenti.`])];
  }

  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await writeFile(qualityPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Fenice intelligence completed: confidence ${intelligenceConfidence}/100, ${validations.length} cross-source checks, ${observations.length} evidence observations, ${sourceNames.size} market sources.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
