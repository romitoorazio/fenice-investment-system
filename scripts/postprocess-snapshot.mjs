import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const snapshotPath = path.join(root, "data", "latest-snapshot.json");
const historyDir = path.join(root, "data", "history");

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const round = (value) => Math.round(Number(value) || 0);

async function request(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "FeniceInvestmentSystem/1.0",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function parseSecDate(value) {
  if (!/^\d{8}$/.test(value || "")) return undefined;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6)) - 1;
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month, day));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function isStablecoin(item) {
  const symbol = String(item.symbol || "").toUpperCase();
  const name = String(item.name || "").toLowerCase();
  const stableSymbols = new Set([
    "USDT", "USDC", "DAI", "USDE", "USDS", "USD1", "USDG", "USYC",
    "PYUSD", "FDUSD", "TUSD", "USDP", "RLUSD", "EURC", "EURT",
  ]);
  return stableSymbols.has(symbol) || /stablecoin|global dollar|paypal usd/.test(name);
}

function normalizeMarkets(markets) {
  return markets
    .map((item) => {
      const change = Number(item.changePercent || 0);
      if (item.assetClass === "Criptovaluta" && isStablecoin(item)) {
        return {
          ...item,
          score: round(clamp(28 - Math.abs(change) * 2, 15, 35)),
          risk: round(clamp(42 + Math.abs(change) * 8, 35, 75)),
          classification: "stablecoin",
        };
      }
      return {
        ...item,
        score: round(clamp(item.score)),
        risk: round(clamp(item.risk)),
      };
    })
    .sort((a, b) => b.score - a.score);
}

function filterRecentDiscoveries(discoveries, generatedAt) {
  const anchor = new Date(generatedAt || Date.now());
  const cutoff = new Date(anchor);
  cutoff.setUTCDate(cutoff.getUTCDate() - 120);

  return discoveries.filter((item) => {
    if (item.source !== "SEC EDGAR") return true;
    const date = parseSecDate(item.date);
    return !date || date >= cutoff;
  });
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.category}:${String(item.name).toLowerCase().replace(/\W+/g, " ").trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function addClinicalTrials(snapshot) {
  const query = encodeURIComponent('CRISPR OR "gene therapy" OR "AI drug discovery" OR "cell therapy"');
  try {
    const data = await request(`https://clinicaltrials.gov/api/v2/studies?query.term=${query}&pageSize=20&format=json`);
    const studies = Array.isArray(data?.studies) ? data.studies : [];
    for (const study of studies.slice(0, 20)) {
      const protocol = study.protocolSection || {};
      const identification = protocol.identificationModule || {};
      const status = protocol.statusModule || {};
      const sponsor = protocol.sponsorCollaboratorsModule?.leadSponsor?.name;
      const nctId = identification.nctId;
      const title = identification.briefTitle || identification.officialTitle || nctId;
      if (!title || !nctId) continue;
      snapshot.discoveries.push({
        id: `ct-${nctId}`,
        name: title,
        category: "BIOTECH",
        signal: `Studio clinico ${status.overallStatus || "stato da verificare"}${sponsor ? ` · sponsor ${sponsor}` : ""}.`,
        score: 68,
        risk: 78,
        date: status.studyFirstPostDateStruct?.date || status.lastUpdatePostDateStruct?.date,
        source: "ClinicalTrials.gov",
        url: `https://clinicaltrials.gov/study/${nctId}`,
      });
    }
    snapshot.providers.push({
      id: "clinicaltrials",
      name: "ClinicalTrials.gov",
      state: studies.length ? "operativo" : "parziale",
      coverage: ["studi clinici", "CRISPR", "terapie cellulari", "AI drug discovery"],
      detail: `${studies.length} studi innovativi letti.`,
      lastSuccessAt: snapshot.generatedAt,
    });
  } catch (error) {
    snapshot.providers.push({
      id: "clinicaltrials",
      name: "ClinicalTrials.gov",
      state: "errore",
      coverage: ["studi clinici", "biotech"],
      detail: error instanceof Error ? error.message : String(error),
    });
    snapshot.warnings.push(`ClinicalTrials.gov non disponibile: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function addPublicMacro(snapshot) {
  let successes = 0;
  const details = [];

  try {
    const worldBank = await request("https://api.worldbank.org/v2/country/WLD/indicator/NY.GDP.MKTP.KD.ZG?format=json&per_page=10");
    const observation = Array.isArray(worldBank?.[1]) ? worldBank[1].find((item) => item.value !== null) : undefined;
    if (observation) {
      snapshot.macro.push({
        id: "WB-WORLD-GDP",
        label: "Crescita PIL mondiale",
        value: Number(observation.value),
        date: observation.date,
        unit: "% annuo",
        source: "World Bank",
      });
      successes += 1;
      details.push("PIL mondiale");
    }
  } catch (error) {
    snapshot.warnings.push(`World Bank non disponibile: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const treasury = await request("https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?sort=-record_date&page[size]=5&format=json");
    const observation = treasury?.data?.[0];
    if (observation) {
      snapshot.macro.push({
        id: "UST-AVG-RATE",
        label: "Tasso medio debito Treasury USA",
        value: Number(observation.avg_interest_rate_amt),
        date: observation.record_date,
        unit: "%",
        source: "U.S. Treasury Fiscal Data",
      });
      successes += 1;
      details.push("tasso medio Treasury");
    }
  } catch (error) {
    snapshot.warnings.push(`U.S. Treasury non disponibile: ${error instanceof Error ? error.message : String(error)}`);
  }

  snapshot.providers.push({
    id: "public-macro",
    name: "World Bank + U.S. Treasury",
    state: successes === 2 ? "operativo" : successes ? "parziale" : "errore",
    coverage: ["PIL mondiale", "debito pubblico USA", "tassi medi"],
    detail: successes ? `Acquisiti: ${details.join(", ")}.` : "Nessun dato pubblico acquisito.",
    ...(successes ? { lastSuccessAt: snapshot.generatedAt } : {}),
  });
}

function recalculate(snapshot) {
  const marketScores = snapshot.markets.filter((item) => item.classification !== "stablecoin").map((item) => item.score);
  const marketMomentum = marketScores.length
    ? round(marketScores.reduce((sum, value) => sum + value, 0) / marketScores.length)
    : snapshot.pulse.marketMomentum;

  const strongDiscoveries = snapshot.discoveries.filter((item) => item.score >= 70).length;
  const discoveryHeat = round(clamp(snapshot.discoveries.length * 1.2 + strongDiscoveries * 1.8, 0, 90));
  const macroHealth = snapshot.macro.length ? round(clamp(50 + snapshot.macro.length * 3, 0, 70)) : snapshot.pulse.macroHealth;
  const confidence = round(clamp(
    20 +
      snapshot.providers.filter((item) => item.state === "operativo").length * 11 +
      snapshot.providers.filter((item) => item.state === "parziale").length * 5,
  ));
  const opportunity = round(clamp(marketMomentum * 0.42 + macroHealth * 0.28 + discoveryHeat * 0.3));
  const risk = round(clamp(snapshot.pulse.risk + snapshot.discoveries.filter((item) => item.risk >= 88).length * 0.35, 0, 82));

  let verdict = "ATTENDERE";
  if (risk >= 72) verdict = "PROTEGGERE CAPITALE";
  else if (opportunity >= 70 && risk <= 56 && confidence >= 60) verdict = "VALUTARE";

  snapshot.pulse = {
    ...snapshot.pulse,
    verdict,
    opportunity,
    risk,
    confidence,
    marketMomentum,
    macroHealth,
    discoveryHeat,
  };
  snapshot.mode = confidence >= 65 ? "live" : confidence >= 40 ? "partial" : "bootstrap";
}

async function main() {
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  snapshot.markets = normalizeMarkets(snapshot.markets || []);
  snapshot.discoveries = filterRecentDiscoveries(snapshot.discoveries || [], snapshot.generatedAt);
  snapshot.warnings = snapshot.warnings || [];
  snapshot.providers = (snapshot.providers || []).filter((item) => !["clinicaltrials", "public-macro"].includes(item.id));

  await Promise.all([addClinicalTrials(snapshot), addPublicMacro(snapshot)]);

  snapshot.discoveries = dedupe(snapshot.discoveries)
    .sort((a, b) => b.score - a.score)
    .slice(0, 120);
  snapshot.macro = dedupe(snapshot.macro.map((item) => ({ ...item, category: "macro", name: item.id })))
    .map(({ category, name, ...item }) => item);
  snapshot.providers.sort((a, b) => a.name.localeCompare(b.name));
  snapshot.warnings = [...new Set(snapshot.warnings)];

  if (snapshot.markets.length && snapshot.markets.every((item) => item.assetClass === "Criptovaluta")) {
    snapshot.warnings.push("Al momento il flusso prezzi contiene solo crypto: configurare Alpha Vantage per azioni, ETF e altri mercati tradizionali.");
  }

  recalculate(snapshot);
  snapshot.headline = `${snapshot.markets.length} strumenti, ${snapshot.discoveries.length} segnali emergenti, ${snapshot.macro.length} indicatori macro e ${snapshot.providers.filter((item) => item.state === "operativo").length} fonti operative.`;

  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
  await writeFile(snapshotPath, serialized, "utf8");
  await writeFile(path.join(historyDir, `${String(snapshot.generatedAt).slice(0, 10)}.json`), serialized, "utf8");
  console.log(`Fenice post-processing completed: ${snapshot.headline}`);
}

await main();
