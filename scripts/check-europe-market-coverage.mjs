import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validateOnly = process.argv.includes("--validate-only");
const readJson = async (relativePath) => JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
const registry = await readJson("data/europe-market-registry.json");
const globalUniverse = await readJson("data/global-market-universe.json");
const fail = (message) => { throw new Error(`EUROPE_MARKET_COVERAGE: ${message}`); };

if (!Array.isArray(registry.markets) || registry.markets.length < 40) fail(`expected >=40 market records, got ${registry.markets?.length ?? 0}`);
const active = registry.markets;
const ids = new Set();
const mics = new Set();

for (const market of active) {
  if (!market.id || ids.has(market.id)) fail(`duplicate/missing market id ${market.id}`);
  ids.add(market.id);
  if (!/^[A-Z0-9]{4}$/.test(String(market.mic || ""))) fail(`invalid MIC ${market.mic} for ${market.id}`);
  if (mics.has(market.mic)) fail(`duplicate primary MIC ${market.mic}`);
  mics.add(market.mic);
  if (!/^[A-Z]{2}$/.test(String(market.country || ""))) fail(`invalid country ${market.country}`);
  if (!market.currency || !market.tz || !market.source) fail(`missing currency/timezone/source for ${market.id}`);
  if (!registry.sourceCatalog?.[market.source]) fail(`source ${market.source} missing from sourceCatalog`);
  if (market.tier <= 2 && (!Array.isArray(market.benchmarks) || market.benchmarks.length === 0)) fail(`tier ${market.tier} market ${market.id} requires benchmark`);
}

if (registry.policy?.liveTradingAllowed !== false || registry.policy?.paperExecutionAllowed !== false) fail("European registry must remain research-only");
if (registry.defaultCoveragePolicy?.paperExecution !== "disabled-until-separately-certified") fail("default PAPER policy must remain disabled");

const expectedEuronext = ["XAMS","XATH","XBRU","XDUB","XLIS","XMIL","XOSL","XPAR"];
const expectedNasdaq = ["XSTO","XCSE","XHEL","XICE","XTAL","XRIS","XLIT"];
for (const mic of [...expectedEuronext, ...expectedNasdaq]) if (!mics.has(mic)) fail(`required European venue missing: ${mic}`);

const strategicCountries = ["GB","DE","FR","IT","ES","CH","NL","BE","SE","DK","FI","NO","PL","AT","GR","IE","PT","RO","CZ","HU"];
const countries = [...new Set(active.map((market) => market.country))].sort();
for (const country of strategicCountries) if (!countries.includes(country)) fail(`strategic country missing: ${country}`);

const europeRegion = globalUniverse.regions?.find((region) => region.id === "europe");
if (!europeRegion) fail("global-market-universe missing Europe region");
const missingFromGlobal = countries.filter((country) => !europeRegion.countries?.includes(country));
if (missingFromGlobal.length) fail(`global-market-universe missing: ${missingFromGlobal.join(",")}`);

const currencies = [...new Set(active.map((market) => market.currency))].sort();
const sourceKeys = [...new Set(active.map((market) => market.source))].sort();
const tierCounts = active.reduce((acc, market) => {
  const key = `tier${market.tier}`;
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

const report = {
  version: 1,
  generatedAt: registry.asOf,
  status: "IDENTITY_AND_RESEARCH_ROUTING_READY",
  scope: "Fenice V7 Europe",
  activePrimaryMarkets: active.length,
  coveredCountries: countries.length,
  coveredCurrencies: currencies.length,
  restrictedMarkets: registry.restrictedMarkets?.length || 0,
  jurisdictionsWithoutDomesticPrimaryEquityExchange: registry.jurisdictionsWithoutDomesticPrimaryEquityExchange?.length || 0,
  tierCounts,
  groupCoverage: {
    euronext: { ready: expectedEuronext.every((mic) => mics.has(mic)), covered: expectedEuronext.filter((mic) => mics.has(mic)).length, required: expectedEuronext.length },
    nasdaqEurope: { ready: expectedNasdaq.every((mic) => mics.has(mic)), covered: expectedNasdaq.filter((mic) => mics.has(mic)).length, required: expectedNasdaq.length },
  },
  countries,
  currencies,
  officialSourceFamilies: sourceKeys.length,
  coverageDimensions: registry.coverageDimensions,
  safety: {
    autonomousTrading: false,
    liveTradingAllowed: false,
    paperExecutionAllowed: false,
    realtimeCoverageReady: false,
    note: "Market identity/research routing is ready; realtime quotes and execution remain provider/licence dependent and separately certified.",
  },
  invariants: {
    uniqueMarketIds: ids.size === active.length,
    uniquePrimaryMics: mics.size === active.length,
    allActiveMarketsHaveOfficialSource: active.every((market) => Boolean(registry.sourceCatalog?.[market.source])),
    allTier1And2HaveBenchmark: active.filter((market) => market.tier <= 2).every((market) => market.benchmarks?.length),
    paperExecutionHardDisabled: registry.defaultCoveragePolicy?.paperExecution === "disabled-until-separately-certified",
    globalUniverseEuropeAligned: missingFromGlobal.length === 0,
  },
};

if (!validateOnly) await writeFile(path.join(root, "data", "europe-market-coverage.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Fenice Europe: ${report.activePrimaryMarkets} markets / ${report.coveredCountries} countries / ${report.coveredCurrencies} currencies; Euronext ${report.groupCoverage.euronext.covered}/${report.groupCoverage.euronext.required}; Nasdaq Europe ${report.groupCoverage.nasdaqEurope.covered}/${report.groupCoverage.nasdaqEurope.required}; PAPER/LIVE disabled.`);
