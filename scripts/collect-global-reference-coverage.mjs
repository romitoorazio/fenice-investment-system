import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const universePath = path.join(root, "data", "global-market-universe.json");
const outputPath = path.join(root, "data", "global-reference-coverage.json");
const apiKey = String(process.env.TWELVE_DATA_API_KEY || "").trim();
const selfTest = process.argv.includes("--self-test");
const validateOnly = process.argv.includes("--validate-only");
const endpoint = "https://api.twelvedata.com";

const readJson = async (file, fallback = null) => {
  try { return JSON.parse(await readFile(file, "utf8")); } catch { return fallback; }
};
const normalize = (value) => String(value || "").trim();
const upper = (value) => normalize(value).toUpperCase();
const canonicalName = (value) => normalize(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
};

const extraCountryAliases = {
  US: ["USA", "United States of America", "United States"],
  GB: ["UK", "U.K.", "Great Britain", "United Kingdom"],
  KR: ["South Korea", "Korea, Republic of", "Republic of Korea", "Korea"],
  KP: ["North Korea", "Korea, Democratic People's Republic of", "DPRK"],
  CN: ["China", "People's Republic of China", "PRC"],
  TW: ["Taiwan", "Taiwan, Province of China"],
  HK: ["Hong Kong", "Hong Kong SAR"],
  MO: ["Macao", "Macau", "Macao SAR"],
  CZ: ["Czechia", "Czech Republic"],
  TR: ["Turkey", "Türkiye", "Turkiye"],
  RU: ["Russia", "Russian Federation"],
  VN: ["Vietnam", "Viet Nam"],
  LA: ["Laos", "Lao People's Democratic Republic"],
  MD: ["Moldova", "Republic of Moldova"],
  BO: ["Bolivia", "Bolivia, Plurinational State of"],
  VE: ["Venezuela", "Venezuela, Bolivarian Republic of"],
  TZ: ["Tanzania", "United Republic of Tanzania"],
  CI: ["Ivory Coast", "Cote d'Ivoire", "Côte d’Ivoire"],
  CV: ["Cape Verde", "Cabo Verde"],
  SZ: ["Eswatini", "Swaziland"],
  MK: ["North Macedonia", "Macedonia"],
};

async function requestJson(url, timeoutMs = 60_000, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetchImpl(url, {
        signal: controller.signal,
        headers: { accept: "application/json", "user-agent": "FeniceInvestmentSystem/2.2 global-reference-coverage" },
      });
    } catch {
      // The URL contains the provider credential. Never propagate fetch errors
      // whose message or cause may echo the request URL into Actions logs.
      throw new Error("TWELVE_DATA_REQUEST_FAILED");
    }
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

function buildTargetCountries(universe) {
  const countries = new Map();
  const aliases = new Map();
  const displayNames = new Intl.DisplayNames(["en"], { type: "region" });

  const registerAlias = (alias, code) => {
    const key = canonicalName(alias);
    if (!key) return;
    if (!aliases.has(key)) aliases.set(key, new Set());
    aliases.get(key).add(code);
  };

  for (const region of universe?.regions || []) {
    for (const codeRaw of region?.countries || []) {
      const code = upper(codeRaw);
      if (!code || countries.has(code)) continue;
      const name = displayNames.of(code) || code;
      countries.set(code, {
        code,
        name,
        regionId: normalize(region.id),
        regionName: normalize(region.name),
        priority: Number(region.priority || 3),
        accessStatus: "research-only-until-separately-certified",
      });
    }
  }

  for (const special of universe?.restrictedOrSpecialHandlingMarkets || []) {
    const code = upper(special?.country);
    if (!code) continue;
    const existing = countries.get(code);
    countries.set(code, {
      code,
      name: normalize(special?.name) || existing?.name || displayNames.of(code) || code,
      regionId: existing?.regionId || "special-handling",
      regionName: existing?.regionName || "Restricted / special handling",
      priority: existing?.priority || 4,
      accessStatus: normalize(special?.status) || "special-handling-research-only",
      reason: normalize(special?.reason) || null,
    });
  }

  for (const country of countries.values()) {
    registerAlias(country.code, country.code);
    registerAlias(country.name, country.code);
    registerAlias(displayNames.of(country.code), country.code);
    for (const alias of extraCountryAliases[country.code] || []) registerAlias(alias, country.code);
  }

  return { countries, aliases };
}

function resolveAlias(value, target) {
  const raw = normalize(value);
  if (!raw) return null;
  const direct = upper(raw);
  if (/^[A-Z]{2}$/.test(direct) && target.countries.has(direct)) return direct;
  const matches = target.aliases.get(canonicalName(raw));
  if (matches?.size === 1) return [...matches][0];
  return null;
}

function buildExchangeCountryMap(exchangeRows, target) {
  const byCode = new Map();
  const byName = new Map();
  for (const row of exchangeRows) {
    const country = resolveAlias(row?.country_code || row?.country, target);
    if (!country) continue;
    for (const candidate of [row?.code, row?.exchange, row?.mic_code, row?.mic]) {
      const key = upper(candidate);
      if (key) byCode.set(key, country);
    }
    for (const candidate of [row?.name, row?.exchange_name]) {
      const key = canonicalName(candidate);
      if (key) byName.set(key, country);
    }
  }
  return { byCode, byName };
}

function resolveStockCountry(row, target, exchangeMaps) {
  for (const candidate of [row?.country_code, row?.country]) {
    const resolved = resolveAlias(candidate, target);
    if (resolved) return { code: resolved, matchedBy: "stock-country" };
  }
  for (const candidate of [row?.exchange, row?.exchange_code, row?.mic_code, row?.mic]) {
    const key = upper(candidate);
    if (key && exchangeMaps.byCode.has(key)) return { code: exchangeMaps.byCode.get(key), matchedBy: "exchange-code" };
  }
  for (const candidate of [row?.exchange_name, row?.exchange]) {
    const key = canonicalName(candidate);
    if (key && exchangeMaps.byName.has(key)) return { code: exchangeMaps.byName.get(key), matchedBy: "exchange-name" };
  }
  return null;
}

function buildCoverage({ universe, exchangeRows, stockRows, generatedAt }) {
  const target = buildTargetCountries(universe);
  const exchangeMaps = buildExchangeCountryMap(exchangeRows, target);
  const counters = new Map();
  const seen = new Set();
  const unmatchedProviderCountries = new Map();

  for (const code of target.countries.keys()) {
    counters.set(code, {
      instrumentCount: 0,
      exchanges: new Set(),
      currencies: new Set(),
      types: new Map(),
      matchedBy: new Map(),
    });
  }

  for (const row of stockRows) {
    const resolved = resolveStockCountry(row, target, exchangeMaps);
    if (!resolved) {
      const rawCountry = normalize(row?.country_code || row?.country);
      if (rawCountry) unmatchedProviderCountries.set(rawCountry, (unmatchedProviderCountries.get(rawCountry) || 0) + 1);
      continue;
    }
    const symbol = upper(row?.symbol);
    if (!symbol) continue;
    const exchange = upper(row?.exchange || row?.exchange_code || row?.mic_code || row?.mic) || canonicalName(row?.exchange_name);
    const currency = upper(row?.currency);
    const key = `${resolved.code}:${symbol}:${exchange}:${currency}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const counter = counters.get(resolved.code);
    counter.instrumentCount += 1;
    if (exchange) counter.exchanges.add(exchange);
    if (currency) counter.currencies.add(currency);
    const type = normalize(row?.type || "Unknown");
    counter.types.set(type, (counter.types.get(type) || 0) + 1);
    counter.matchedBy.set(resolved.matchedBy, (counter.matchedBy.get(resolved.matchedBy) || 0) + 1);
  }

  const countryCoverage = [...target.countries.values()].map((country) => {
    const counter = counters.get(country.code);
    return {
      ...country,
      providerCovered: counter.instrumentCount > 0,
      instrumentCount: counter.instrumentCount,
      providerExchangeCount: counter.exchanges.size,
      providerExchanges: [...counter.exchanges].sort().slice(0, 40),
      currencies: [...counter.currencies].sort(),
      instrumentTypes: Object.fromEntries([...counter.types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)),
      matchMethods: Object.fromEntries([...counter.matchedBy.entries()].sort()),
      executionEligible: false,
    };
  }).sort((a, b) => a.regionId.localeCompare(b.regionId) || b.instrumentCount - a.instrumentCount || a.code.localeCompare(b.code));

  const regions = new Map();
  for (const row of countryCoverage) {
    if (!regions.has(row.regionId)) regions.set(row.regionId, { regionId: row.regionId, regionName: row.regionName, targetCountries: 0, providerMatchedCountries: 0, instrumentCount: 0 });
    const region = regions.get(row.regionId);
    region.targetCountries += 1;
    region.providerMatchedCountries += row.providerCovered ? 1 : 0;
    region.instrumentCount += row.instrumentCount;
  }
  const regionCoverage = [...regions.values()].map((row) => ({
    ...row,
    providerMatchedCountryPercent: row.targetCountries ? round((row.providerMatchedCountries / row.targetCountries) * 100, 1) : 0,
  })).sort((a, b) => b.instrumentCount - a.instrumentCount || a.regionId.localeCompare(b.regionId));

  const providerMatchedCountries = countryCoverage.filter((row) => row.providerCovered).length;
  const instrumentCount = countryCoverage.reduce((sum, row) => sum + row.instrumentCount, 0);

  return {
    version: 1,
    generatedAt,
    status: instrumentCount ? "PROVIDER_REFERENCE_COVERAGE_READY" : "NO_PROVIDER_REFERENCE_COVERAGE",
    scope: "Fenice V7 global provider reference coverage",
    sourceUniverseVersion: Number(universe?.version || 0),
    provider: {
      id: "twelve-data",
      configured: true,
      exchangeRecords: exchangeRows.length,
      globalStockRecords: stockRows.length,
      matchedInstrumentReferences: instrumentCount,
      note: "Reference availability only. It does not prove realtime entitlement, execution eligibility, liquidity, settlement access or broker support.",
    },
    coverage: {
      targetCountries: countryCoverage.length,
      providerMatchedCountries,
      providerMatchedCountryPercent: countryCoverage.length ? round((providerMatchedCountries / countryCoverage.length) * 100, 1) : 0,
      matchedInstrumentReferences: instrumentCount,
      uncoveredCountries: countryCoverage.filter((row) => !row.providerCovered).map((row) => row.code),
      specialHandlingCountries: countryCoverage.filter((row) => row.regionId === "special-handling" || !row.accessStatus.startsWith("research-only-until")).map((row) => row.code),
    },
    regionCoverage,
    countryCoverage,
    unmatchedProviderCountries: [...unmatchedProviderCountries.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 50)
      .map(([country, instrumentCount]) => ({ country, instrumentCount })),
    safety: {
      researchOnly: true,
      paperExecutionAllowed: false,
      liveTradingAllowed: false,
      brokerConnectivityAllowed: false,
      isolatedFromPaperV6InstrumentMaster: true,
      changesPaperV6Fingerprint: false,
      note: "A country or symbol appearing here never grants PAPER/LIVE eligibility. Execution remains governed by the separately certified PAPER V6 universe and provenance gates.",
    },
  };
}

function validateCoverageReport(report, target, { enforceProductionMinimums = true } = {}) {
  if (!report || typeof report !== "object" || Array.isArray(report)) throw new Error("GLOBAL_REFERENCE_REPORT_INVALID");
  if (!Array.isArray(report.countryCoverage) || !Array.isArray(report.regionCoverage)) throw new Error("GLOBAL_REFERENCE_REPORT_COVERAGE_INVALID");
  if (report?.provider?.id !== "twelve-data") throw new Error("GLOBAL_REFERENCE_PROVIDER_INVALID");
  if (report?.safety?.researchOnly !== true) throw new Error("GLOBAL_REFERENCE_RESEARCH_ONLY_REQUIRED");
  if (report?.safety?.paperExecutionAllowed !== false || report?.safety?.liveTradingAllowed !== false || report?.safety?.brokerConnectivityAllowed !== false) {
    throw new Error("GLOBAL_REFERENCE_EXECUTION_LOCK_FAILURE");
  }
  if (report?.safety?.isolatedFromPaperV6InstrumentMaster !== true || report?.safety?.changesPaperV6Fingerprint !== false) {
    throw new Error("GLOBAL_REFERENCE_PAPER_ISOLATION_FAILURE");
  }

  const codes = report.countryCoverage.map((row) => upper(row?.code));
  const expectedCodes = [...target.countries.keys()].sort();
  if (new Set(codes).size !== codes.length || JSON.stringify([...codes].sort()) !== JSON.stringify(expectedCodes)) {
    throw new Error("GLOBAL_REFERENCE_COUNTRY_SET_INVALID");
  }
  if (report.countryCoverage.some((row) => row?.executionEligible !== false)) throw new Error("GLOBAL_REFERENCE_COUNTRY_EXECUTION_LOCK_FAILURE");
  if (report.countryCoverage.some((row) => !Number.isInteger(Number(row?.instrumentCount)) || Number(row.instrumentCount) < 0 || row?.providerCovered !== (Number(row.instrumentCount) > 0))) {
    throw new Error("GLOBAL_REFERENCE_COUNTRY_COVERAGE_INVALID");
  }

  const targetCountries = report.countryCoverage.length;
  const providerMatchedCountries = report.countryCoverage.filter((row) => row?.providerCovered === true && Number(row?.instrumentCount || 0) > 0).length;
  const matchedInstrumentReferences = report.countryCoverage.reduce((sum, row) => sum + Number(row?.instrumentCount || 0), 0);
  const uncoveredCountries = report.countryCoverage.filter((row) => Number(row?.instrumentCount || 0) === 0).map((row) => upper(row.code)).sort();
  const reportedUncovered = [...(report?.coverage?.uncoveredCountries || [])].map(upper).sort();

  if (Number(report?.coverage?.targetCountries) !== targetCountries) throw new Error("GLOBAL_REFERENCE_TARGET_COUNT_MISMATCH");
  if (Number(report?.coverage?.providerMatchedCountries) !== providerMatchedCountries) throw new Error("GLOBAL_REFERENCE_MATCHED_COUNTRY_COUNT_MISMATCH");
  if (Number(report?.coverage?.matchedInstrumentReferences) !== matchedInstrumentReferences || Number(report?.provider?.matchedInstrumentReferences) !== matchedInstrumentReferences) {
    throw new Error("GLOBAL_REFERENCE_INSTRUMENT_COUNT_MISMATCH");
  }
  if (JSON.stringify(reportedUncovered) !== JSON.stringify(uncoveredCountries)) throw new Error("GLOBAL_REFERENCE_UNCOVERED_COUNTRY_MISMATCH");
  if (enforceProductionMinimums && targetCountries < 150) throw new Error("GLOBAL_REFERENCE_TARGET_SET_TOO_SMALL");
  if (enforceProductionMinimums && providerMatchedCountries < 10) throw new Error("GLOBAL_REFERENCE_COUNTRY_COVERAGE_TOO_SMALL");
  if (enforceProductionMinimums && matchedInstrumentReferences < 100) throw new Error("GLOBAL_REFERENCE_INSTRUMENT_SET_TOO_SMALL");
  return true;
}

async function validateCommittedReport(target) {
  let raw;
  try {
    raw = await readFile(outputPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw new Error("GLOBAL_REFERENCE_REPORT_READ_FAILED");
  }
  let report;
  try {
    report = JSON.parse(raw);
  } catch {
    throw new Error("GLOBAL_REFERENCE_REPORT_JSON_INVALID");
  }
  validateCoverageReport(report, target);
  return true;
}

async function runSelfTest() {
  const universe = {
    version: 99,
    regions: [
      { id: "north-america", name: "North America", countries: ["US", "CA"], priority: 1 },
      { id: "europe", name: "Europe", countries: ["GB", "MK"], priority: 1 },
      { id: "asia-pacific", name: "Asia Pacific", countries: ["JP"], priority: 1 },
    ],
    restrictedOrSpecialHandlingMarkets: [
      { country: "RU", name: "Russia", status: "restricted-research-only", reason: "test" },
    ],
  };
  const result = buildCoverage({
    universe,
    exchangeRows: [
      { code: "NASDAQ", name: "Nasdaq", country: "United States" },
      { code: "LSE", name: "London Stock Exchange", country: "United Kingdom" },
    ],
    stockRows: [
      { symbol: "AAPL", country: "United States", exchange: "NASDAQ", currency: "USD", type: "Common Stock" },
      { symbol: "RY", country_code: "CA", exchange: "TSX", currency: "CAD", type: "Common Stock" },
      { symbol: "VOD", exchange: "LSE", currency: "GBP", type: "Common Stock" },
      { symbol: "MSE", country: "Macedonia", exchange: "MSE", currency: "MKD", type: "Common Stock" },
      { symbol: "VOID", country: "Atlantis", exchange: "ATL", currency: "AAA", type: "Common Stock" },
    ],
    generatedAt: "2026-09-26T00:00:00.000Z",
  });
  if (result.coverage.targetCountries !== 6) throw new Error(`SELF_TEST_TARGET_COUNTRIES_${result.coverage.targetCountries}`);
  if (result.coverage.providerMatchedCountries !== 4) throw new Error(`SELF_TEST_MATCHED_COUNTRIES_${result.coverage.providerMatchedCountries}`);
  if (result.coverage.matchedInstrumentReferences !== 4) throw new Error(`SELF_TEST_MATCHED_INSTRUMENTS_${result.coverage.matchedInstrumentReferences}`);
  if (!result.coverage.uncoveredCountries.includes("RU")) throw new Error("SELF_TEST_SPECIAL_COUNTRY_EXPECTED_UNCOVERED");
  validateCoverageReport(result, buildTargetCountries(universe), { enforceProductionMinimums: false });
  if (result.safety.paperExecutionAllowed !== false || result.safety.liveTradingAllowed !== false || result.safety.brokerConnectivityAllowed !== false) throw new Error("SELF_TEST_EXECUTION_LOCK_FAILURE");
  if (result.safety.isolatedFromPaperV6InstrumentMaster !== true || result.safety.changesPaperV6Fingerprint !== false) throw new Error("SELF_TEST_PAPER_ISOLATION_FAILURE");
  const syntheticSecret = "self-test-provider-secret";
  try {
    await requestJson(`https://example.invalid/stocks?apikey=${syntheticSecret}`, 100, async () => {
      throw new Error(`network failure for apikey=${syntheticSecret}`);
    });
    throw new Error("SELF_TEST_REDACTED_REQUEST_FAILURE_EXPECTED");
  } catch (error) {
    if (error?.message !== "TWELVE_DATA_REQUEST_FAILED" || error.message.includes(syntheticSecret)) {
      throw new Error("SELF_TEST_REQUEST_SECRET_REDACTION_FAILURE");
    }
  }
  console.log("Fenice global reference coverage self-test: PASS (country aliases, exchange fallback, unmatched rejection, PAPER/LIVE isolation). ");
}

if (selfTest) {
  await runSelfTest();
  process.exit(0);
}

const universe = await readJson(universePath, null);
if (!universe?.regions?.length) throw new Error("GLOBAL_MARKET_UNIVERSE_NOT_READY");
const target = buildTargetCountries(universe);
if (target.countries.size < 150) throw new Error(`GLOBAL_TARGET_COUNTRY_SET_TOO_SMALL_${target.countries.size}`);

if (validateOnly) {
  await runSelfTest();
  const committedReportValid = await validateCommittedReport(target);
  if (committedReportValid) console.log("Fenice committed global reference coverage validation: PASS.");
  console.log(`Fenice global reference collector validation: targetCountries=${target.countries.size}; no provider call.`);
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
const report = buildCoverage({ universe, exchangeRows, stockRows, generatedAt: new Date().toISOString() });
report.version = Math.max(1, Number(previous?.version || 0) + 1);
if (report.coverage.targetCountries < 150) throw new Error(`GLOBAL_TARGET_COUNTRY_SET_TOO_SMALL_${report.coverage.targetCountries}`);
if (report.coverage.providerMatchedCountries < 10) throw new Error(`GLOBAL_PROVIDER_COUNTRY_COVERAGE_TOO_SMALL_${report.coverage.providerMatchedCountries}`);
if (report.coverage.matchedInstrumentReferences < 100) throw new Error(`GLOBAL_PROVIDER_REFERENCE_SET_TOO_SMALL_${report.coverage.matchedInstrumentReferences}`);

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Fenice global reference coverage: ${report.coverage.matchedInstrumentReferences} instrument references across ${report.coverage.providerMatchedCountries}/${report.coverage.targetCountries} target countries (${report.coverage.providerMatchedCountryPercent}%). Research-only; PAPER/LIVE=false.`);
