import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const snapshotPath = path.join(root, "data", "latest-snapshot.json");
const historyDir = path.join(root, "data", "history");
const now = new Date();

const warnings = [];
const providers = [];
const markets = [];
const macro = [];
const discoveries = [];

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const number = (value) => {
  const parsed = Number.parseFloat(String(value ?? "").replace("%", ""));
  return Number.isFinite(parsed) ? parsed : undefined;
};
const average = (values) => {
  const usable = values.filter((value) => Number.isFinite(value));
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : undefined;
};

async function readPrevious() {
  try {
    return JSON.parse(await readFile(snapshotPath, "utf8"));
  } catch {
    return null;
  }
}

async function request(url, { headers = {}, format = "json", timeoutMs = 18000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        accept: format === "json" ? "application/json" : "text/plain,*/*",
        ...headers,
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return format === "json" ? await response.json() : await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function provider(id, name, state, coverage, detail, ok = false) {
  providers.push({
    id,
    name,
    state,
    coverage,
    detail,
    ...(ok ? { lastSuccessAt: now.toISOString() } : {}),
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      cell = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell.trim());
    if (row.some(Boolean)) rows.push(row);
  }
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function quarter(date) {
  return Math.floor(date.getUTCMonth() / 3) + 1;
}

function yyyymmdd(date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

async function collectSec() {
  const forms = new Set(["S-1", "S-1/A", "F-1", "F-1/A", "8-A12B", "8-A12G", "10-12B", "10-12G"]);
  const headers = {
    "user-agent": process.env.SEC_USER_AGENT || "FeniceInvestmentSystem/1.0 github.com/romitoorazio",
    "accept-encoding": "gzip, deflate",
  };
  let found = 0;
  let lastError = "Nessun indice giornaliero disponibile";

  for (let offset = 0; offset < 10 && found < 30; offset += 1) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - offset);
    const url = `https://www.sec.gov/Archives/edgar/daily-index/${date.getUTCFullYear()}/QTR${quarter(date)}/master.${yyyymmdd(date)}.idx`;
    try {
      const text = await request(url, { headers, format: "text" });
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        const parts = line.split("|");
        if (parts.length !== 5) continue;
        const [cik, companyName, form, filedAt, filename] = parts;
        if (!forms.has(form)) continue;
        const category = form.startsWith("S-1") || form.startsWith("F-1") ? "IPO" : "SEC";
        discoveries.push({
          id: `sec-${cik}-${form}-${filedAt}-${found}`,
          name: companyName,
          category,
          signal: `Deposito ${form}: possibile nuova quotazione, registrazione o evento societario da approfondire.`,
          score: category === "IPO" ? 74 : 64,
          risk: category === "IPO" ? 76 : 68,
          date: filedAt,
          source: "SEC EDGAR",
          url: `https://www.sec.gov/Archives/${filename}`,
        });
        found += 1;
        if (found >= 30) break;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  if (found) {
    provider("sec", "SEC EDGAR", "operativo", ["S-1", "F-1", "8-A", "10-12B", "nuovi emittenti USA"], `${found} depositi recenti rilevati.`, true);
  } else {
    provider("sec", "SEC EDGAR", "errore", ["S-1", "F-1", "8-A", "10-12B"], lastError);
    warnings.push(`SEC EDGAR non disponibile: ${lastError}`);
  }
}

async function collectAlphaVantage() {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  const coverage = ["azioni", "ETF", "indici", "forex", "materie prime", "opzioni", "IPO"];
  if (!key) {
    provider("alphavantage", "Alpha Vantage", "non configurato", coverage, "Manca ALPHA_VANTAGE_API_KEY nei Secrets GitHub.");
    warnings.push("Alpha Vantage non configurato: quotazioni azionarie, IPO e mercati tradizionali sono parziali.");
    return;
  }

  const symbols = [
    ["SPY", "S&P 500 ETF", "ETF"],
    ["QQQ", "Nasdaq 100 ETF", "ETF"],
    ["IWM", "Russell 2000 ETF", "ETF"],
    ["GLD", "Oro ETF", "Materie prime"],
    ["TLT", "Treasury USA lungo termine", "Obbligazioni"],
    ["CRSP", "CRISPR Therapeutics", "Biotech"],
    ["RXRX", "Recursion Pharmaceuticals", "AI Biotech"],
    ["NTLA", "Intellia Therapeutics", "Biotech"],
    ["BIOX", "Bioceres Crop Solutions", "Agritech"],
  ];

  let successes = 0;
  for (const [symbol, name, assetClass] of symbols) {
    try {
      const data = await request(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`);
      const quote = data?.["Global Quote"];
      const price = number(quote?.["05. price"]);
      const changePercent = number(quote?.["10. change percent"]);
      if (price === undefined) continue;
      markets.push({
        symbol,
        name,
        assetClass,
        market: "USA",
        price,
        currency: "USD",
        changePercent,
        score: clamp(55 + (changePercent ?? 0) * 4),
        risk: clamp(50 + Math.abs(changePercent ?? 0) * 3),
        source: "Alpha Vantage",
        observedAt: quote?.["07. latest trading day"],
      });
      successes += 1;
    } catch (error) {
      warnings.push(`Quotazione ${symbol} non acquisita: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  try {
    const csv = await request(`https://www.alphavantage.co/query?function=IPO_CALENDAR&apikey=${encodeURIComponent(key)}`, { format: "text" });
    const rows = parseCsv(csv).slice(0, 30);
    for (const [index, row] of rows.entries()) {
      const name = row.name || row.company_name || row.symbol || `IPO ${index + 1}`;
      discoveries.push({
        id: `av-ipo-${row.symbol || index}-${row.ipoDate || row.ipo_date || index}`,
        name,
        category: "IPO",
        signal: `IPO prevista ${row.ipoDate || row.ipo_date || "data da verificare"}; fascia prezzo ${row.priceRangeLow || row.price_range_low || "?"}-${row.priceRangeHigh || row.price_range_high || "?"}.`,
        score: 70,
        risk: 78,
        date: row.ipoDate || row.ipo_date,
        source: "Alpha Vantage IPO Calendar",
      });
    }
    if (rows.length) successes += 1;
  } catch (error) {
    warnings.push(`Calendario IPO non acquisito: ${error instanceof Error ? error.message : String(error)}`);
  }

  provider(
    "alphavantage",
    "Alpha Vantage",
    successes ? (successes >= symbols.length / 2 ? "operativo" : "parziale") : "errore",
    coverage,
    successes ? `${successes} gruppi di dati acquisiti.` : "Nessun dato valido ricevuto.",
    successes > 0,
  );
}

async function collectCoinGecko() {
  const demoKey = process.env.COINGECKO_API_KEY;
  const proKey = process.env.COINGECKO_PRO_API_KEY;
  const headers = demoKey ? { "x-cg-demo-api-key": demoKey } : {};
  let successes = 0;

  try {
    const coins = await request("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=30&page=1&sparkline=false&price_change_percentage=24h,7d", { headers });
    for (const coin of Array.isArray(coins) ? coins : []) {
      const change = number(coin.price_change_percentage_24h);
      markets.push({
        symbol: String(coin.symbol || "").toUpperCase(),
        name: coin.name,
        assetClass: "Criptovaluta",
        market: "Crypto globale",
        price: number(coin.current_price),
        currency: "USD",
        changePercent: change,
        score: clamp(52 + (change ?? 0) * 2),
        risk: clamp(68 + Math.abs(change ?? 0) * 1.5),
        source: "CoinGecko",
        observedAt: coin.last_updated,
      });
    }
    successes += 1;
  } catch (error) {
    warnings.push(`Mercato crypto non acquisito: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const trending = await request("https://api.coingecko.com/api/v3/search/trending", { headers });
    for (const entry of trending?.coins?.slice(0, 12) ?? []) {
      const item = entry.item;
      discoveries.push({
        id: `cg-trending-${item.id}`,
        name: item.name,
        category: "CRYPTO",
        signal: `Token in tendenza su CoinGecko; posizione market cap ${item.market_cap_rank ?? "non disponibile"}.`,
        score: clamp(62 + Math.max(0, 10 - (item.score ?? 10))),
        risk: item.market_cap_rank && item.market_cap_rank < 100 ? 72 : 88,
        source: "CoinGecko Trending",
        url: `https://www.coingecko.com/en/coins/${item.id}`,
      });
    }
    successes += 1;
  } catch (error) {
    warnings.push(`Crypto in tendenza non acquisite: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (proKey) {
    try {
      const fresh = await request("https://pro-api.coingecko.com/api/v3/coins/list/new", { headers: { "x-cg-pro-api-key": proKey } });
      for (const coin of Array.isArray(fresh) ? fresh.slice(0, 30) : []) {
        discoveries.push({
          id: `cg-new-${coin.id}`,
          name: coin.name,
          category: "CRYPTO",
          signal: `Nuovo token aggiunto a CoinGecko: ${String(coin.symbol || "").toUpperCase()}.`,
          score: 45,
          risk: 94,
          date: coin.activated_at ? new Date(coin.activated_at * 1000).toISOString() : undefined,
          source: "CoinGecko New Coins",
          url: `https://www.coingecko.com/en/coins/${coin.id}`,
        });
      }
      successes += 1;
    } catch (error) {
      warnings.push(`Nuovi token CoinGecko Pro non acquisiti: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  provider(
    "coingecko",
    "CoinGecko",
    successes >= 2 ? "operativo" : successes ? "parziale" : "errore",
    ["crypto principali", "token in tendenza", "nuovi token con piano Pro"],
    proKey ? "Copertura crypto estesa configurata." : "Copertura pubblica attiva; COINGECKO_PRO_API_KEY abilita i 200 token più recenti.",
    successes > 0,
  );
}

async function collectFred() {
  const key = process.env.FRED_API_KEY;
  const coverage = ["inflazione", "tassi", "occupazione", "curva rendimenti", "volatilità", "liquidità"];
  if (!key) {
    provider("fred", "FRED", "non configurato", coverage, "Manca FRED_API_KEY nei Secrets GitHub.");
    warnings.push("FRED non configurato: il quadro macroeconomico usa una fiducia ridotta.");
    return;
  }

  const series = [
    ["VIXCLS", "Indice di volatilità VIX", "punti"],
    ["DGS10", "Treasury USA 10 anni", "%"],
    ["DFF", "Federal Funds Rate", "%"],
    ["T10Y2Y", "Curva 10 anni - 2 anni", "%"],
    ["UNRATE", "Disoccupazione USA", "%"],
    ["CPIAUCSL", "Indice prezzi al consumo USA", "indice"],
    ["WALCL", "Attivo totale Federal Reserve", "milioni USD"],
  ];

  const results = await Promise.allSettled(
    series.map(async ([id, label, unit]) => {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${encodeURIComponent(key)}&file_type=json&sort_order=desc&limit=8`;
      const data = await request(url);
      const observation = data?.observations?.find((item) => item.value !== ".");
      if (!observation) throw new Error("Nessuna osservazione valida");
      return { id, label, unit, value: number(observation.value), date: observation.date, source: "FRED" };
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled") macro.push(result.value);
  }
  const successCount = results.filter((result) => result.status === "fulfilled").length;
  provider(
    "fred",
    "FRED",
    successCount === series.length ? "operativo" : successCount ? "parziale" : "errore",
    coverage,
    `${successCount}/${series.length} indicatori macroeconomici acquisiti.`,
    successCount > 0,
  );
  if (successCount < series.length) warnings.push(`FRED: acquisiti ${successCount} indicatori su ${series.length}.`);
}

function newsScore(title) {
  const text = title.toLowerCase();
  let score = 50;
  if (/ipo|initial public offering|new listing|spin.?off/.test(text)) score += 20;
  if (/series [a-f]|funding|raises|investment round/.test(text)) score += 15;
  if (/fda approval|phase 3|breakthrough|clinical trial/.test(text)) score += 18;
  if (/artificial intelligence|ai |robot|fusion|quantum|gene|crispr|space/.test(text)) score += 10;
  return clamp(score);
}

async function collectGdelt() {
  const base = "https://api.gdeltproject.org/api/v2/doc/doc";
  const emergingQuery = '(IPO OR "initial public offering" OR "Series A" OR "Series B" OR "funding round" OR "FDA approval" OR breakthrough OR "new listing" OR spin-off OR quantum OR fusion OR CRISPR)';
  const riskQuery = '(war OR sanctions OR tariffs OR "central bank" OR inflation OR recession OR election OR cyberattack)';
  let successes = 0;

  try {
    const url = `${base}?query=${encodeURIComponent(emergingQuery)}&mode=ArtList&maxrecords=50&format=json&sort=HybridRel`;
    const data = await request(url);
    for (const [index, article] of (data?.articles ?? []).slice(0, 25).entries()) {
      discoveries.push({
        id: `gdelt-emerging-${index}-${article.seendate || "now"}`,
        name: article.title,
        category: /series [a-f]|funding round|raises/i.test(article.title) ? "PRIVATE" : /fda|clinical|drug|biotech|crispr/i.test(article.title) ? "BIOTECH" : "NEWS",
        signal: `Segnale emergente rilevato nella stampa globale (${article.domain || "fonte non indicata"}).`,
        score: newsScore(article.title),
        risk: /private|series [a-f]|funding/i.test(article.title) ? 82 : 68,
        date: article.seendate,
        source: `GDELT · ${article.domain || "notizie globali"}`,
        url: article.url,
      });
    }
    successes += 1;
  } catch (error) {
    warnings.push(`GDELT emergenti non acquisito: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const url = `${base}?query=${encodeURIComponent(riskQuery)}&mode=TimelineVolRaw&maxrecords=250&format=json&timelinesmooth=3`;
    await request(url);
    successes += 1;
  } catch (error) {
    warnings.push(`GDELT geopolitica non acquisito: ${error instanceof Error ? error.message : String(error)}`);
  }

  provider(
    "gdelt",
    "GDELT",
    successes === 2 ? "operativo" : successes ? "parziale" : "errore",
    ["notizie globali", "geopolitica", "società emergenti", "round di finanziamento", "tecnologie future"],
    successes ? `${successes}/2 flussi globali acquisiti.` : "Nessun flusso acquisito.",
    successes > 0,
  );
}

function calculatePulse() {
  const equityChanges = markets.filter((item) => item.source === "Alpha Vantage" && item.changePercent !== undefined).map((item) => item.changePercent);
  const cryptoChanges = markets.filter((item) => item.assetClass === "Criptovaluta" && item.changePercent !== undefined).map((item) => item.changePercent);
  const combinedChange = average([average(equityChanges), average(cryptoChanges)].filter((item) => item !== undefined));
  const marketMomentum = clamp(50 + (combinedChange ?? 0) * 4);

  const vix = macro.find((item) => item.id === "VIXCLS")?.value;
  const curve = macro.find((item) => item.id === "T10Y2Y")?.value;
  const unemployment = macro.find((item) => item.id === "UNRATE")?.value;
  let macroHealth = 55;
  if (vix !== undefined) macroHealth += vix < 18 ? 12 : vix > 30 ? -22 : vix > 24 ? -10 : 0;
  if (curve !== undefined) macroHealth += curve >= 0 ? 8 : -12;
  if (unemployment !== undefined) macroHealth += unemployment < 5 ? 5 : unemployment > 7 ? -10 : 0;
  macroHealth = clamp(macroHealth);

  const strongDiscoveries = discoveries.filter((item) => item.score >= 70).length;
  const discoveryHeat = clamp(discoveries.length * 1.5 + strongDiscoveries * 2.5);
  const opportunity = clamp(marketMomentum * 0.42 + macroHealth * 0.28 + discoveryHeat * 0.3);

  let risk = 48;
  if (vix !== undefined) risk += vix > 30 ? 24 : vix > 24 ? 13 : vix < 16 ? -8 : 0;
  if (curve !== undefined && curve < 0) risk += 10;
  if ((combinedChange ?? 0) < -2) risk += 10;
  risk += discoveries.filter((item) => item.risk >= 85).length > 10 ? 8 : 0;
  risk = clamp(risk);

  const operational = providers.filter((item) => item.state === "operativo").length;
  const partial = providers.filter((item) => item.state === "parziale").length;
  const confidence = clamp(20 + operational * 14 + partial * 7);

  let verdict = "ATTENDERE";
  if (risk >= 72) verdict = "PROTEGGERE CAPITALE";
  else if (opportunity >= 70 && risk <= 56 && confidence >= 60) verdict = "VALUTARE";

  return {
    verdict,
    opportunity: Math.round(opportunity),
    risk: Math.round(risk),
    confidence: Math.round(confidence),
    marketMomentum: Math.round(marketMomentum),
    macroHealth: Math.round(macroHealth),
    discoveryHeat: Math.round(discoveryHeat),
  };
}

function dedupeDiscoveries(items) {
  const seen = new Set();
  return items
    .filter((item) => {
      const key = `${item.category}:${item.name.toLowerCase().replace(/\W+/g, " ").trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 100);
}

async function main() {
  await mkdir(historyDir, { recursive: true });
  const previous = await readPrevious();

  await Promise.allSettled([
    collectSec(),
    collectAlphaVantage(),
    collectCoinGecko(),
    collectFred(),
    collectGdelt(),
  ]);

  const cleanDiscoveries = dedupeDiscoveries(discoveries);
  discoveries.length = 0;
  discoveries.push(...cleanDiscoveries);

  const pulse = calculatePulse();
  const successfulProviders = providers.filter((item) => item.state === "operativo" || item.state === "parziale").length;
  const mode = successfulProviders >= 4 ? "live" : successfulProviders >= 2 ? "partial" : "bootstrap";

  if (!process.env.ALPHA_VANTAGE_API_KEY || !process.env.FRED_API_KEY) {
    warnings.push("Per una copertura tradizionale completa servono le chiavi Alpha Vantage e FRED nei Secrets GitHub.");
  }
  warnings.push("Le società private e i mercati non regolamentati non possono essere coperti integralmente da sole fonti gratuite.");
  warnings.push("Ogni segnale emergente richiede verifica umana: il motore non esegue compravendite.");

  const snapshot = {
    version: (previous?.version ?? 0) + 1,
    generatedAt: now.toISOString(),
    mode,
    headline: `${markets.length} strumenti osservati, ${discoveries.length} segnali emergenti e ${macro.length} indicatori macroeconomici.`,
    pulse,
    providers: providers.sort((a, b) => a.name.localeCompare(b.name)),
    markets: markets.sort((a, b) => b.score - a.score).slice(0, 80),
    macro,
    discoveries,
    warnings: [...new Set(warnings)].slice(0, 30),
    executionPolicy: {
      autonomousAnalysis: true,
      autonomousTrading: false,
      humanConfirmationRequired: true,
    },
  };

  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
  await writeFile(snapshotPath, serialized, "utf8");
  await writeFile(path.join(historyDir, `${now.toISOString().slice(0, 10)}.json`), serialized, "utf8");
  console.log(`Fenice autonomy completed: ${snapshot.headline}`);
  console.log(`Verdict: ${pulse.verdict} | opportunity ${pulse.opportunity} | risk ${pulse.risk} | confidence ${pulse.confidence}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
