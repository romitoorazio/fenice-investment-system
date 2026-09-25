import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = path.join(root, "data", "europe-market-registry.json");
const outputPath = path.join(root, "data", "europe-instrument-universe.json");
const apiKey = String(process.env.TWELVE_DATA_API_KEY || "").trim();
const selfTest = process.argv.includes("--self-test");
const validateOnly = process.argv.includes("--validate-only");
const endpoint = "https://api.twelvedata.com";

const readJson = async (file, fallback = null) => {
  try { return JSON.parse(await readFile(file, "utf8")); } catch { return fallback; }
};
const normalize = (value) => String(value || "").trim();
const upper = (value) => normalize(value).toUpperCase();
const canonicalName = (value) => normalize(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
};

const extraCountryAliases = {
  GB: ["UK", "Great Britain", "United Kingdom"],
  CZ: ["Czechia", "Czech Republic"],
  TR: ["Turkey", "Türkiye", "Turkiye"],
  BA: ["Bosnia and Herzegovina", "Bosnia & Herzegovina"],
  MK: ["North Macedonia", "Macedonia"],
  MD: ["Moldova", "Republic of Moldova"],
  RU: ["Russia", "Russian Federation"],
};

async function requestJson(url, timeoutMs = 45_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json", "user-agent": "FeniceInvestmentSystem/2.2 europe-reference-universe" },
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const payload = await response.json();
    if (String(payload?.status || "").toLowerCase() === "error" || payload?.code) {
      throw new Error(`TWELVE_DATA_${payload?.code || "API_ERROR"}`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function rows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.values)) return payload.values;
  if (Array.isArray(payload?.result)) return payload.result;
  return [];
}

function buildRegistryMaps(registry) {
  const micToMarket = new Map();
  const countryAliasToMarkets = new Map();
  const displayNames = new Intl.DisplayNames(["en"], { type: "region" });

  const addCountryAlias = (alias, market) => {
    const key = canonicalName(alias);
    if (!key) return;
    if (!countryAliasToMarkets.has(key)) countryAliasToMarkets.set(key, []);
    const items = countryAliasToMarkets.get(key);
    if (!items.some((item) => item.id === market.id)) items.push(market);
  };

  for (const market of registry.markets || []) {
    for (const mic of [market.mic, ...(market.segments || [])]) {
      const key = upper(mic);
      if (key) micToMarket.set(key, market);
    }
    addCountryAlias(market.country, market);
    addCountryAlias(market.name, market);
    addCountryAlias(displayNames.of(market.country), market);
    for (const alias of extraCountryAliases[market.country] || []) addCountryAlias(alias, market);
  }
  return { micToMarket, countryAliasToMarkets };
}

function providerExchangeMic(row) {
  return upper(row?.mic_code || row?.mic || row?.code || row?.exchange_code);
}

function normalizeProviderExchange(row) {
  return {
    mic: providerExchangeMic(row),
    name: normalize(row?.name || row?.exchange || row?.exchange_name),
    country: normalize(row?.country_code || row?.country),
    timezone: normalize(row?.timezone),
  };
}

function buildProviderExchangeMap(exchangeRows) {
  const byCode = new Map();
  const byName = new Map();
  for (const raw of exchangeRows) {
    const row = normalizeProviderExchange(raw);
    for (const candidate of [raw?.code, raw?.exchange, raw?.mic_code, raw?.mic]) {
      const code = upper(candidate);
      if (code) byCode.set(code, row);
    }
    const nameKey = canonicalName(row.name);
    if (nameKey) byName.set(nameKey, row);
  }
  return { byCode, byName };
}

function stockMic(row, providerMaps) {
  const direct = upper(row?.mic_code || row?.mic);
  if (direct) return direct;
  const exchange = upper(row?.exchange || row?.exchange_code);
  if (exchange && providerMaps.byCode.has(exchange)) return providerMaps.byCode.get(exchange).mic;
  const exchangeName = canonicalName(row?.exchange_name || row?.exchange);
  if (exchangeName && providerMaps.byName.has(exchangeName)) return providerMaps.byName.get(exchangeName).mic;
  return "";
}

function resolveMarket(row, providerMaps, registryMaps) {
  const mic = stockMic(row, providerMaps);
  if (mic && registryMaps.micToMarket.has(mic)) {
    return { market: registryMaps.micToMarket.get(mic), providerMic: mic, matchedBy: "mic" };
  }

  // If the provider supplied an exchange but it does not resolve to a registered
  // primary/segment MIC, fail closed. This prevents e.g. Stuttgart/Berlin rows
  // from being silently relabelled as Xetra just because the country is Germany.
  const providerExchange = normalize(row?.exchange || row?.exchange_code || row?.exchange_name);
  if (providerExchange) return null;

  // Country fallback is allowed only when the provider omitted exchange identity
  // entirely and Fenice has exactly one active venue for the country.
  const countryKey = canonicalName(row?.country_code || row?.country);
  const candidates = registryMaps.countryAliasToMarkets.get(countryKey) || [];
  if (candidates.length === 1) {
    return { market: candidates[0], providerMic: mic || null, matchedBy: "country-single-venue-no-exchange" };
  }
  return null;
}

function buildUniverse({ registry, exchangeRows, stockRows, generatedAt }) {
  const registryMaps = buildRegistryMaps(registry);
  const providerMaps = buildProviderExchangeMap(exchangeRows);
  const activeMarkets = registry.markets || [];
  const instruments = [];
  const seen = new Set();
  const marketCounts = new Map(activeMarkets.map((market) => [market.id, 0]));
  const marketProviderMics = new Map(activeMarkets.map((market) => [market.id, new Set()]));

  for (const row of stockRows) {
    const resolved = resolveMarket(row, providerMaps, registryMaps);
    if (!resolved?.market) continue;
    const symbol = upper(row?.symbol);
    if (!symbol) continue;
    const type = normalize(row?.type || "Common Stock");
    const providerMic = resolved.providerMic || upper(row?.mic_code || row?.mic) || null;
    const key = `${resolved.market.id}:${providerMic || resolved.market.mic}:${symbol}:${upper(row?.currency)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    instruments.push({
      symbol,
      name: normalize(row?.name) || symbol,
      type,
      currency: upper(row?.currency) || resolved.market.currency,
      country: resolved.market.country,
      marketId: resolved.market.id,
      marketMic: resolved.market.mic,
      providerMic,
      providerExchange: normalize(row?.exchange || row?.exchange_name),
      matchedBy: resolved.matchedBy,
      sourceFamily: "twelve-data",
      researchOnly: true,
      paperExecutionAllowed: false,
      liveTradingAllowed: false,
    });
    marketCounts.set(resolved.market.id, (marketCounts.get(resolved.market.id) || 0) + 1);
    if (providerMic) marketProviderMics.get(resolved.market.id)?.add(providerMic);
  }

  instruments.sort((a, b) => a.country.localeCompare(b.country) || a.marketId.localeCompare(b.marketId) || a.symbol.localeCompare(b.symbol));
  const marketCoverage = activeMarkets.map((market) => ({
    marketId: market.id,
    country: market.country,
    venue: market.venue,
    mic: market.mic,
    tier: market.tier,
    instrumentCount: marketCounts.get(market.id) || 0,
    providerMics: [...(marketProviderMics.get(market.id) || [])].sort(),
    providerCovered: (marketCounts.get(market.id) || 0) > 0,
    fallback: (marketCounts.get(market.id) || 0) > 0 ? null : "official-exchange/reference-source-required",
  }));
  const providerMatchedMarkets = marketCoverage.filter((row) => row.providerCovered).length;

  return {
    version: 2,
    generatedAt,
    status: instruments.length ? "PROVIDER_REFERENCE_UNIVERSE_READY" : "NO_PROVIDER_INSTRUMENTS_MATCHED",
    scope: "Fenice V7 European research instrument universe",
    provider: {
      id: "twelve-data",
      configured: true,
      exchangeRecords: exchangeRows.length,
      globalStockRecords: stockRows.length,
      matchedInstruments: instruments.length,
      note: "Reference universe only. Provider exchange availability and price entitlements vary by venue/plan.",
    },
    coverage: {
      activeMarkets: activeMarkets.length,
      providerMatchedMarkets,
      providerMatchedMarketPercent: activeMarkets.length ? round((providerMatchedMarkets / activeMarkets.length) * 100, 1) : 0,
      instrumentCount: instruments.length,
      uncoveredMarkets: marketCoverage.filter((row) => !row.providerCovered).map((row) => row.marketId),
    },
    marketCoverage,
    instruments,
    safety: {
      researchOnly: true,
      paperExecutionAllowed: false,
      liveTradingAllowed: false,
      brokerConnectivityAllowed: false,
      isolatedFromPaperV6InstrumentMaster: true,
      note: "Presence in this provider reference universe never grants realtime provenance or execution eligibility.",
    },
  };
}

function runSelfTest() {
  const registry = {
    markets: [
      { id: "it", name: "Italy", country: "IT", mic: "XMIL", segments: ["MTAA"], currency: "EUR", venue: "Milan", tier: 1 },
      { id: "de", name: "Germany", country: "DE", mic: "XETR", segments: ["XFRA"], currency: "EUR", venue: "Xetra", tier: 1 },
      { id: "ba-a", name: "Bosnia and Herzegovina", country: "BA", mic: "XSSE", segments: [], currency: "BAM", venue: "Sarajevo", tier: 3 },
      { id: "ba-b", name: "Bosnia and Herzegovina", country: "BA", mic: "XBLB", segments: [], currency: "BAM", venue: "Banja Luka", tier: 3 },
    ],
  };
  const result = buildUniverse({
    registry,
    exchangeRows: [
      { code: "MTAA", mic_code: "MTAA", name: "Borsa Italiana", country: "Italy" },
      { code: "XETR", mic_code: "XETR", name: "Xetra", country: "Germany" },
      { code: "XSTU", mic_code: "XSTU", name: "Boerse Stuttgart", country: "Germany" },
    ],
    stockRows: [
      { symbol: "ENEL", name: "Enel", currency: "EUR", exchange: "MTAA", country: "Italy", type: "Common Stock" },
      { symbol: "SIE", name: "Siemens", currency: "EUR", exchange: "XETR", country: "Germany", type: "Common Stock" },
      { symbol: "STU", name: "Stuttgart-only", currency: "EUR", exchange: "XSTU", country: "Germany", type: "Common Stock" },
      { symbol: "AMBIG", name: "Ambiguous Bosnia", currency: "BAM", country: "Bosnia and Herzegovina", type: "Common Stock" },
    ],
    generatedAt: "2026-09-25T00:00:00.000Z",
  });
  if (result.instruments.length !== 2) throw new Error(`SELF_TEST_EXPECTED_2_GOT_${result.instruments.length}`);
  if (result.instruments.some((row) => row.symbol === "STU")) throw new Error("SELF_TEST_UNREGISTERED_EXCHANGE_MUST_FAIL_CLOSED");
  if (result.instruments.some((row) => row.symbol === "AMBIG")) throw new Error("SELF_TEST_AMBIGUOUS_COUNTRY_MUST_FAIL_CLOSED");
  if (result.safety.paperExecutionAllowed !== false || result.safety.liveTradingAllowed !== false) throw new Error("SELF_TEST_SAFETY_LOCK_FAILURE");
  console.log("Fenice Europe instrument universe self-test: PASS (MIC/segment mapping, country names, unregistered-exchange + ambiguous-country fail-closed, LIVE/PAPER lock). ");
}

if (selfTest) {
  runSelfTest();
  process.exit(0);
}

const registry = await readJson(registryPath, { markets: [] });
if (!Array.isArray(registry.markets) || registry.markets.length < 40) throw new Error("EUROPE_REGISTRY_NOT_READY");
if (validateOnly) {
  runSelfTest();
  console.log(`Fenice Europe instrument collector validation: registryMarkets=${registry.markets.length}; no provider call.`);
  process.exit(0);
}
if (!apiKey) throw new Error("TWELVE_DATA_API_KEY_MISSING");

const auth = `apikey=${encodeURIComponent(apiKey)}`;
const [exchangePayload, stockPayload] = await Promise.all([
  requestJson(`${endpoint}/exchanges?${auth}`),
  requestJson(`${endpoint}/stocks?format=JSON&${auth}`),
]);
const exchangeRows = rows(exchangePayload);
const stockRows = rows(stockPayload);
if (!exchangeRows.length) throw new Error("TWELVE_DATA_EXCHANGES_EMPTY");
if (!stockRows.length) throw new Error("TWELVE_DATA_STOCKS_EMPTY");

const previous = await readJson(outputPath, { version: 0 });
const universe = buildUniverse({ registry, exchangeRows, stockRows, generatedAt: new Date().toISOString() });
universe.version = Math.max(2, Number(previous?.version || 0) + 1);
if (universe.coverage.instrumentCount < 100) throw new Error(`EUROPE_REFERENCE_UNIVERSE_TOO_SMALL_${universe.coverage.instrumentCount}`);
if (universe.coverage.providerMatchedMarkets < 10) throw new Error(`EUROPE_PROVIDER_MARKET_COVERAGE_TOO_SMALL_${universe.coverage.providerMatchedMarkets}`);
await writeFile(outputPath, `${JSON.stringify(universe, null, 2)}\n`);
console.log(`Fenice Europe instruments: ${universe.coverage.instrumentCount} instruments matched across ${universe.coverage.providerMatchedMarkets}/${universe.coverage.activeMarkets} markets (${universe.coverage.providerMatchedMarketPercent}%). Research-only; PAPER/LIVE disabled.`);
