const GDELT_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";
const FINRA_TOKEN_URL = "https://ews.fip.finra.org/fip/rest/ews/oauth2/access_token?grant_type=client_credentials";
const FINRA_TREASURY_URL = "https://api.finra.org/data/group/fixedIncomeMarket/name/treasuryDailyAggregates?limit=5";

function upsertProvider(snapshot, provider) {
  snapshot.providers = Array.isArray(snapshot.providers) ? snapshot.providers : [];
  snapshot.providers = snapshot.providers.filter((item) => item?.id !== provider.id);
  snapshot.providers.push(provider);
}

function pushHealth(health, item) {
  if (!Array.isArray(health)) return;
  const index = health.findIndex((entry) => entry?.id === item.id);
  if (index >= 0) health.splice(index, 1);
  health.push(item);
}

function addDiscovery(snapshot, discovery) {
  snapshot.discoveries = Array.isArray(snapshot.discoveries) ? snapshot.discoveries : [];
  if (snapshot.discoveries.some((item) => item?.id === discovery.id)) return;
  snapshot.discoveries.push(discovery);
}

function responseError(response) {
  return new Error(`HTTP ${Number(response?.status || 0) || "UNKNOWN"}`);
}

async function fetchJson(url, {
  fetchImpl = fetch,
  timeoutMs = 30_000,
  method = "GET",
  headers = {},
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method,
      signal: controller.signal,
      redirect: "follow",
      headers: {
        accept: "application/json",
        "user-agent": "FeniceInvestmentSystem/3.7 optional-source-recovery",
        ...headers,
      },
    });
    if (!response?.ok) throw responseError(response);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function gdeltUrl(query, { maxrecords = 25, timespan = "7d" } = {}) {
  return `${GDELT_BASE}?query=${encodeURIComponent(query)}&mode=ArtList&maxrecords=${maxrecords}&format=json&sort=HybridRel&timespan=${encodeURIComponent(timespan)}`;
}

async function requestGdeltWithFallback(queries, options = {}) {
  let lastError = null;
  for (const query of queries) {
    try {
      const payload = await fetchJson(gdeltUrl(query, options), options);
      if (!payload || !Array.isArray(payload.articles)) throw new Error("GDELT payload without articles array");
      return payload;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("GDELT recovery failed");
}

function gdeltDiscovery(article, index) {
  const title = String(article?.title || "GDELT signal").trim() || "GDELT signal";
  const seen = String(article?.seendate || "now");
  return {
    id: `gdelt-recovery-${index}-${seen}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48)}`,
    name: title,
    category: /series [a-f]|funding|raises/i.test(title)
      ? "PRIVATE"
      : /fda|clinical|drug|biotech|crispr/i.test(title)
        ? "BIOTECH"
        : "NEWS",
    signal: `Segnale globale recuperato da GDELT (${article?.domain || "fonte non indicata"}).`,
    score: /ipo|initial public offering|fda|phase 3|quantum|crispr/i.test(title) ? 70 : 58,
    risk: /series [a-f]|funding|private/i.test(title) ? 82 : 68,
    date: article?.seendate,
    source: `GDELT · ${article?.domain || "notizie globali"}`,
    url: article?.url,
  };
}

export async function recoverGdelt(snapshot, health = [], {
  fetchImpl = fetch,
  timeoutMs = 30_000,
} = {}) {
  const existing = (Array.isArray(snapshot?.providers) ? snapshot.providers : []).find((item) => item?.id === "gdelt");
  if (existing?.state === "operativo") return { attempted: false, state: "operativo", successes: 2 };

  const started = Date.now();
  let successes = 0;
  let articles = [];
  const errors = [];

  try {
    const payload = await requestGdeltWithFallback([
      '(IPO OR "initial public offering" OR "funding round" OR "FDA approval" OR quantum OR CRISPR)',
      '(IPO OR funding OR quantum OR CRISPR)',
      'markets',
    ], { fetchImpl, timeoutMs, maxrecords: 30, timespan: "7d" });
    articles = payload.articles.slice(0, 20);
    for (const [index, article] of articles.entries()) addDiscovery(snapshot, gdeltDiscovery(article, index));
    successes += 1;
  } catch (error) {
    errors.push(`emerging:${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    await requestGdeltWithFallback([
      '(war OR sanctions OR tariffs OR inflation OR recession OR cyberattack)',
      '(war OR sanctions OR tariffs OR recession)',
      'geopolitics',
    ], { fetchImpl, timeoutMs, maxrecords: 10, timespan: "24h" });
    successes += 1;
  } catch (error) {
    errors.push(`risk:${error instanceof Error ? error.message : String(error)}`);
  }

  const state = successes === 2 ? "operativo" : successes === 1 ? "parziale" : "errore";
  upsertProvider(snapshot, {
    id: "gdelt",
    name: "GDELT",
    state,
    coverage: ["notizie globali", "geopolitica", "società emergenti", "round di finanziamento", "tecnologie future"],
    detail: successes
      ? `Recovery resiliente: ${successes}/2 flussi GDELT acquisiti, ${articles.length} articoli utili.`
      : `Recovery GDELT fallito: ${errors.join(" | ").slice(0, 240)}`,
    ...(successes ? { lastSuccessAt: new Date().toISOString() } : {}),
  });
  pushHealth(health, {
    id: "gdelt",
    status: state === "operativo" ? "healthy" : state === "parziale" ? "degraded" : "failed",
    records: articles.length,
    latencyMs: Date.now() - started,
    checkedAt: new Date().toISOString(),
    ...(errors.length ? { detail: errors.join(" | ").slice(0, 240) } : {}),
  });
  return { attempted: true, state, successes, records: articles.length, errors };
}

export function finraPublicCredentialsConfigured(env = process.env) {
  return Boolean(String(env?.FINRA_CLIENT_ID || "").trim() && String(env?.FINRA_CLIENT_SECRET || "").trim());
}

async function finraAccessToken(env, { fetchImpl = fetch, timeoutMs = 15_000 } = {}) {
  const clientId = String(env?.FINRA_CLIENT_ID || "").trim();
  const clientSecret = String(env?.FINRA_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) throw new Error("FINRA_PUBLIC_OAUTH_NOT_CONFIGURED");
  const basic = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
  const data = await fetchJson(FINRA_TOKEN_URL, {
    fetchImpl,
    timeoutMs,
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
  });
  const token = String(data?.access_token || "").trim();
  if (!token) throw new Error("FINRA_OAUTH_TOKEN_MISSING");
  return token;
}

export async function recoverFinra(snapshot, health = [], {
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 20_000,
} = {}) {
  const coverage = ["Treasury TRACE", "fixed income", "market breadth e volume"];
  if (!finraPublicCredentialsConfigured(env)) {
    upsertProvider(snapshot, {
      id: "finra-fixed-income",
      name: "FINRA Fixed Income API",
      state: "non configurato",
      coverage,
      detail: "FINRA Query API richiede credenziali OAuth Public; FINRA_CLIENT_ID/FINRA_CLIENT_SECRET non configurati. Nessun guasto provider dichiarato.",
    });
    pushHealth(health, {
      id: "finra-fixed-income",
      status: "unconfigured",
      records: 0,
      latencyMs: null,
      checkedAt: new Date().toISOString(),
      detail: "FINRA Public OAuth credentials missing.",
    });
    return { attempted: false, state: "non configurato", records: 0 };
  }

  const started = Date.now();
  try {
    const token = await finraAccessToken(env, { fetchImpl, timeoutMs });
    const rows = await fetchJson(FINRA_TREASURY_URL, {
      fetchImpl,
      timeoutMs,
      headers: { authorization: `Bearer ${token}` },
    });
    if (!Array.isArray(rows) || rows.length === 0) throw new Error("FINRA_FIXED_INCOME_EMPTY");
    const latest = rows[0]?.tradeDate || rows[0]?.reportDate || rows[0]?.date;
    upsertProvider(snapshot, {
      id: "finra-fixed-income",
      name: "FINRA Fixed Income API",
      state: "operativo",
      coverage,
      detail: `${rows.length} record FINRA Public OAuth acquisiti${latest ? `; ultimo ${latest}` : ""}.`,
      lastSuccessAt: new Date().toISOString(),
    });
    pushHealth(health, {
      id: "finra-fixed-income",
      status: "healthy",
      records: rows.length,
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
    });
    return { attempted: true, state: "operativo", records: rows.length };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    upsertProvider(snapshot, {
      id: "finra-fixed-income",
      name: "FINRA Fixed Income API",
      state: "errore",
      coverage,
      detail: `FINRA Public OAuth configurato ma recovery fallito: ${detail}`,
    });
    pushHealth(health, {
      id: "finra-fixed-income",
      status: "failed",
      records: 0,
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
      detail,
    });
    return { attempted: true, state: "errore", records: 0, error: detail };
  }
}

export async function recoverOptionalIntelligenceSources(snapshot, health = [], options = {}) {
  const gdelt = await recoverGdelt(snapshot, health, options);
  const finra = await recoverFinra(snapshot, health, options);
  return { gdelt, finra };
}
