const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const instruments = [
  ["spy.us", "SPY", "S&P 500 ETF", "ETF", "USA"],
  ["qqq.us", "QQQ", "Nasdaq 100 ETF", "ETF", "USA"],
  ["iwm.us", "IWM", "Russell 2000 ETF", "ETF", "USA"],
  ["dia.us", "DIA", "Dow Jones ETF", "ETF", "USA"],
  ["gld.us", "GLD", "Oro ETF", "Materie prime", "USA"],
  ["slv.us", "SLV", "Argento ETF", "Materie prime", "USA"],
  ["uso.us", "USO", "Petrolio USA ETF", "Materie prime", "USA"],
  ["tlt.us", "TLT", "Treasury USA lungo termine", "Obbligazioni", "USA"],
  ["vgk.us", "VGK", "Azioni Europa ETF", "ETF", "Europa"],
  ["ewj.us", "EWJ", "Azioni Giappone ETF", "ETF", "Giappone"],
  ["eem.us", "EEM", "Mercati emergenti ETF", "ETF", "Globale"],
  ["acwi.us", "ACWI", "Azioni globali ETF", "ETF", "Globale"],
];

async function requestText(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { accept: "text/csv,text/plain,*/*", "user-agent": "FeniceInvestmentSystem/2.1" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseDailyCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const headers = lines[0].split(",");
  const values = lines.at(-1).split(",");
  const row = Object.fromEntries(headers.map((header, index) => [header.trim(), values[index]?.trim()]));
  const close = Number.parseFloat(row.Close);
  const open = Number.parseFloat(row.Open);
  if (!Number.isFinite(close)) return null;
  const changePercent = Number.isFinite(open) && open !== 0 ? ((close - open) / open) * 100 : undefined;
  return { close, changePercent, date: row.Date };
}

function upsertMarket(snapshot, item) {
  const index = snapshot.markets.findIndex((market) => market.symbol === item.symbol);
  if (index === -1) snapshot.markets.push(item);
  else if (snapshot.markets[index].source !== "Alpha Vantage") snapshot.markets[index] = item;
}

function upsertProvider(snapshot, status) {
  snapshot.providers = snapshot.providers.filter((item) => item.id !== status.id);
  snapshot.providers.push(status);
}

export async function collectPublicMarkets(snapshot, health) {
  const started = Date.now();
  const results = await Promise.allSettled(
    instruments.map(async ([stooqSymbol, symbol, name, assetClass, market]) => {
      const text = await requestText(`https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&d1=20260101&d2=20991231&i=d`);
      const quote = parseDailyCsv(text);
      if (!quote) throw new Error("CSV non interpretabile");
      const change = quote.changePercent;
      return {
        symbol,
        name,
        assetClass,
        market,
        price: quote.close,
        currency: "USD",
        changePercent: change,
        score: Math.round(clamp(54 + (change ?? 0) * 3)),
        risk: Math.round(clamp(46 + Math.abs(change ?? 0) * 4)),
        source: "Stooq",
        observedAt: quote.date,
      };
    }),
  );

  const fulfilled = results.filter((result) => result.status === "fulfilled");
  for (const result of fulfilled) upsertMarket(snapshot, result.value);

  const records = fulfilled.length;
  const state = records >= 9 ? "operativo" : records > 0 ? "parziale" : "errore";
  upsertProvider(snapshot, {
    id: "stooq",
    name: "Stooq Market Data",
    state,
    coverage: ["azioni globali tramite ETF", "indici", "obbligazioni", "oro", "argento", "petrolio"],
    detail: `${records}/${instruments.length} strumenti tradizionali acquisiti come fallback indipendente.`,
    ...(records ? { lastSuccessAt: new Date().toISOString() } : {}),
  });
  health.push({
    id: "stooq",
    status: state === "operativo" ? "healthy" : state === "parziale" ? "degraded" : "failed",
    records,
    latencyMs: Date.now() - started,
    checkedAt: new Date().toISOString(),
  });
}
