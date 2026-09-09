import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = path.join(root, "data", "global-source-registry.json");
const outputPath = path.join(root, "data", "global-source-health.json");
const historyDir = path.join(root, "data", "source-history");
const registry = JSON.parse(await readFile(registryPath, "utf8"));
const now = new Date();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let previousReport = null;
try {
  previousReport = JSON.parse(await readFile(outputPath, "utf8"));
} catch {
  previousReport = null;
}

const secretValues = [...new Set(
  registry.sources
    .map(source => source.secret ? process.env[source.secret] : null)
    .filter(value => typeof value === "string" && value.length > 0),
)];
const sensitiveQueryKeys = new Set(["api_key", "apikey", "key", "token", "access_token"]);

function redactString(value) {
  if (typeof value !== "string") return value;
  let redacted = value;
  for (const secret of secretValues) {
    redacted = redacted.replaceAll(secret, "REDACTED");
    redacted = redacted.replaceAll(encodeURIComponent(secret), "REDACTED");
  }
  try {
    const url = new URL(redacted);
    for (const key of sensitiveQueryKeys) {
      if (url.searchParams.has(key)) url.searchParams.set(key, "REDACTED");
    }
    return url.toString();
  } catch {
    return redacted.replace(/([?&](?:api_key|apikey|key|token|access_token)=)[^&\s]+/gi, "$1REDACTED");
  }
}

function sanitizeForStorage(value) {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map(sanitizeForStorage);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, sanitizeForStorage(child)]));
  }
  return value;
}

function expandEndpoint(source, endpoint) {
  const secretValue = source.secret ? process.env[source.secret] : undefined;
  if (source.auth === "api-key" && !secretValue) return null;
  return endpoint.replace("{key}", encodeURIComponent(secretValue || ""));
}

function endpointsFor(source) {
  return [source.endpoint, ...(source.fallbackEndpoints || [])]
    .map(endpoint => expandEndpoint(source, endpoint))
    .filter(Boolean);
}

function authorityWeight(source) {
  if (source.critical) return 3;
  if (source.authority === "central-bank" || source.authority === "regulator") return 2.5;
  if (source.authority === "institutional") return 2;
  if (source.authority === "market-data") return 1.5;
  return 1;
}

function payloadLooksValid(source, text, contentType) {
  const trimmed = text.trim();
  if (trimmed.length < 8) return false;
  if (/text\/html/i.test(contentType) && /access denied|forbidden|captcha|temporarily unavailable/i.test(trimmed.slice(0, 1500))) return false;
  if (source.id === "sec") return /cik|tickers|filings|entityType/i.test(trimmed);
  if (source.id === "openfda") return /meta|results/i.test(trimmed);
  if (source.id === "clinical-trials") return /studies|protocolSection/i.test(trimmed);
  if (source.id === "fred") return /seriess|series/i.test(trimmed);
  if (source.id === "alpha-vantage") return /markets|market_type|endpoint|Information/i.test(trimmed);
  return true;
}

function retryAfterMs(response) {
  const value = response.headers.get("retry-after");
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(30000, Math.max(0, seconds * 1000));
  const dateMs = Date.parse(value);
  return Number.isFinite(dateMs) ? Math.min(30000, Math.max(0, dateMs - Date.now())) : 0;
}

function isTransientFailure(source, result) {
  if (result.httpStatus == null) return true;
  if ([408, 425, 429].includes(result.httpStatus) || result.httpStatus >= 500) return true;
  return source.id === "sec" && result.httpStatus === 403;
}

function previousSuccessfulSource(sourceId) {
  const previous = previousReport?.sources?.find(item => item.id === sourceId);
  if (!previous || !["healthy", "degraded"].includes(previous.status)) return null;
  return previous;
}

async function request(source, endpoint, attempt) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const headers = {
      accept: source.id === "ema" ? "application/rss+xml,application/xml,text/html,*/*" : "application/json,text/csv,text/plain,*/*",
      "accept-encoding": "gzip, deflate",
      "user-agent": source.id === "sec"
        ? (process.env.SEC_USER_AGENT || "FeniceInvestmentSystem/2.3 (contact: romitoorazio@users.noreply.github.com; source-health probe)")
        : "FeniceInvestmentSystem/2.3 (+https://github.com/romitoorazio/fenice-investment-system)",
    };
    if (source.id === "coingecko" && process.env.COINGECKO_API_KEY) headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;
    const response = await fetch(endpoint, { headers, signal: controller.signal, redirect: "follow" });
    const text = await response.text();
    const contentType = response.headers.get("content-type") || "";
    const validPayload = payloadLooksValid(source, text, contentType);
    return {
      ok: response.ok && validPayload,
      httpStatus: response.status,
      latencyMs: Date.now() - startedAt,
      contentType,
      bytes: text.length,
      detail: response.ok
        ? validPayload ? `Payload valido (${text.length} bytes).` : "Payload vuoto, inatteso o pagina di blocco."
        : `HTTP ${response.status}`,
      retryAfterMs: retryAfterMs(response),
      attempt,
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: null,
      latencyMs: Date.now() - startedAt,
      contentType: "",
      bytes: 0,
      detail: error instanceof Error ? error.message : String(error),
      retryAfterMs: 0,
      attempt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function probe(source) {
  const endpoints = endpointsFor(source);
  if (!endpoints.length) {
    return {
      id: source.id, name: source.name, category: source.category, authority: source.authority,
      critical: Boolean(source.critical), status: "unconfigured", checkedAt: now.toISOString(),
      latencyMs: null, httpStatus: null, detail: `Manca il secret ${source.secret}.`,
      regions: source.regions, endpointUsed: null, attempts: 0, stale: false,
    };
  }

  let best = null;
  let attempts = 0;
  for (const endpoint of endpoints) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      attempts += 1;
      const result = await request(source, endpoint, attempt);
      if (!best || (result.ok && !best.ok) || result.bytes > best.bytes) best = { ...result, endpoint };
      if (result.ok) {
        return {
          id: source.id, name: source.name, category: source.category, authority: source.authority,
          critical: Boolean(source.critical), status: attempt === 1 ? "healthy" : "degraded",
          checkedAt: now.toISOString(), lastSuccessfulAt: now.toISOString(), stale: false,
          latencyMs: result.latencyMs, httpStatus: result.httpStatus,
          detail: attempt === 1 ? result.detail : `${result.detail} Recuperata al tentativo ${attempt}.`,
          regions: source.regions, endpointUsed: redactString(endpoint), attempts, bytes: result.bytes, contentType: result.contentType,
        };
      }
      if (attempt < 3 && isTransientFailure(source, result)) {
        const baseDelay = source.id === "sec" ? 2500 : 700;
        const backoff = baseDelay * (2 ** (attempt - 1));
        await sleep(Math.max(backoff, result.retryAfterMs || 0));
      }
    }
  }

  const previous = previousSuccessfulSource(source.id);
  const transient = best ? isTransientFailure(source, best) : false;
  if (previous && transient) {
    const lastSuccessfulAt = previous.lastSuccessfulAt || previous.checkedAt;
    const staleAgeMs = now.getTime() - Date.parse(lastSuccessfulAt);
    const maxStaleMs = (source.critical ? 24 : 72) * 60 * 60 * 1000;
    if (Number.isFinite(staleAgeMs) && staleAgeMs >= 0 && staleAgeMs <= maxStaleMs) {
      return {
        id: source.id, name: source.name, category: source.category, authority: source.authority,
        critical: Boolean(source.critical), status: "degraded", checkedAt: now.toISOString(),
        lastSuccessfulAt, stale: true, staleAgeMinutes: Math.round(staleAgeMs / 60000),
        latencyMs: best?.latencyMs ?? null, httpStatus: best?.httpStatus ?? null,
        detail: `Fonte temporaneamente non raggiungibile (${best?.detail || "errore di rete"}); mantenuto l'ultimo stato valido senza considerarlo dato nuovo.`,
        regions: source.regions, endpointUsed: redactString(best?.endpoint || previous.endpointUsed), attempts,
        bytes: best?.bytes ?? 0, contentType: best?.contentType ?? "",
      };
    }
  }

  return {
    id: source.id, name: source.name, category: source.category, authority: source.authority,
    critical: Boolean(source.critical), status: "failed", checkedAt: now.toISOString(), stale: false,
    latencyMs: best?.latencyMs ?? null, httpStatus: best?.httpStatus ?? null,
    detail: best?.detail || "Nessun endpoint ha restituito un payload valido.",
    regions: source.regions, endpointUsed: redactString(best?.endpoint), attempts,
    bytes: best?.bytes ?? 0, contentType: best?.contentType ?? "",
  };
}

async function pruneHistory(maxFiles = 120) {
  const entries = (await readdir(historyDir, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith(".json"))
    .map(entry => entry.name)
    .sort()
    .reverse();
  await Promise.all(entries.slice(maxFiles).map(name => unlink(path.join(historyDir, name))));
}

await mkdir(historyDir, { recursive: true });
const results = [];
for (const source of registry.sources) results.push(await probe(source));

const counts = results.reduce((acc, source) => {
  acc[source.status] = (acc[source.status] || 0) + 1;
  return acc;
}, { healthy: 0, degraded: 0, failed: 0, unconfigured: 0 });

const stateScore = { healthy: 1, degraded: 0.65, failed: 0, unconfigured: 0 };
let weightedEarned = 0;
let weightedPossible = 0;
for (const source of results) {
  const registrySource = registry.sources.find(item => item.id === source.id) || source;
  const weight = authorityWeight(registrySource);
  weightedPossible += weight;
  weightedEarned += weight * (stateScore[source.status] ?? 0);
}
const reliabilityScore = weightedPossible ? Math.round((weightedEarned / weightedPossible) * 100) : 0;
const criticalSources = results.filter(source => source.critical);
const criticalReady = criticalSources.filter(source => source.status === "healthy" || source.status === "degraded").length;
const criticalFailures = criticalSources.filter(source => source.status === "failed" || source.status === "unconfigured").map(source => source.id);
const gate = criticalFailures.length === 0 && reliabilityScore >= 80 ? "GREEN" : reliabilityScore >= 65 ? "AMBER" : "RED";

const report = sanitizeForStorage({
  version: registry.version,
  generatedAt: now.toISOString(),
  totalSources: results.length,
  summary: counts,
  reliabilityScore,
  qualityScore: reliabilityScore,
  gate,
  institutionalGate: gate,
  critical: {
    ready: criticalReady,
    total: criticalSources.length,
    failures: criticalFailures,
    gate,
  },
  sources: results,
});
const serialized = `${JSON.stringify(report, null, 2)}\n`;
await writeFile(outputPath, serialized, "utf8");
await writeFile(path.join(historyDir, `${now.toISOString().replaceAll(":", "-")}.json`), serialized, "utf8");
await pruneHistory();
console.log(`Global sources checked: ${results.length}; reliability ${reliabilityScore}/100; gate ${gate}; healthy ${counts.healthy}; degraded ${counts.degraded}; failed ${counts.failed}; unconfigured ${counts.unconfigured}`);
