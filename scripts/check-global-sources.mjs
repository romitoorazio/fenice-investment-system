import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = path.join(root, "data", "global-source-registry.json");
const outputPath = path.join(root, "data", "global-source-health.json");
const historyDir = path.join(root, "data", "source-history");
const registry = JSON.parse(await readFile(registryPath, "utf8"));
const now = new Date();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const defaultSecUserAgent = "FeniceInvestmentSystem/2.2 (research-only; contact: romitoorazio@users.noreply.github.com)";

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

async function request(source, endpoint, attempt) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const isSec = source.id === "sec";
    const secUserAgent = process.env.SEC_USER_AGENT?.trim() || defaultSecUserAgent;
    const headers = {
      accept: source.id === "ema" ? "application/rss+xml,application/xml,text/html,*/*" : "application/json,text/csv,text/plain,*/*",
      "accept-encoding": "gzip, deflate",
      "user-agent": isSec
        ? secUserAgent
        : "FeniceInvestmentSystem/2.2 (+https://github.com/romitoorazio/fenice-investment-system)",
    };
    if (isSec) {
      headers["accept-language"] = "en-US,en;q=0.9";
      headers.from = secUserAgent.includes("@") ? secUserAgent.match(/[\w.+-]+@[\w.-]+/)?.[0] || "" : "";
      if (!headers.from) delete headers.from;
    }
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
      regions: source.regions, endpointUsed: null, attempts: 0,
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
          checkedAt: now.toISOString(), latencyMs: result.latencyMs, httpStatus: result.httpStatus,
          detail: attempt === 1 ? result.detail : `${result.detail} Recuperata al tentativo ${attempt}.`,
          regions: source.regions, endpointUsed: endpoint, attempts, bytes: result.bytes, contentType: result.contentType,
        };
      }
      if (attempt < 3) await sleep(700 * attempt);
    }
  }

  return {
    id: source.id, name: source.name, category: source.category, authority: source.authority,
    critical: Boolean(source.critical), status: "failed", checkedAt: now.toISOString(),
    latencyMs: best?.latencyMs ?? null, httpStatus: best?.httpStatus ?? null,
    detail: best?.detail || "Nessun endpoint ha restituito un payload valido.",
    regions: source.regions, endpointUsed: best?.endpoint ?? null, attempts,
    bytes: best?.bytes ?? 0, contentType: best?.contentType ?? "",
  };
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

const report = {
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
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
await writeFile(outputPath, serialized, "utf8");
await writeFile(path.join(historyDir, `${now.toISOString().replaceAll(":", "-")}.json`), serialized, "utf8");
const unhealthy = results.filter(source => source.status === "failed" || source.status === "unconfigured");
console.log(`Global sources checked: ${results.length}; reliability ${reliabilityScore}/100; gate ${gate}; healthy ${counts.healthy}; degraded ${counts.degraded}; failed ${counts.failed}; unconfigured ${counts.unconfigured}`);
for (const source of unhealthy) console.log(`SOURCE_FAIL id=${source.id} critical=${source.critical} status=${source.status} http=${source.httpStatus ?? "n/a"} detail=${source.detail} endpoint=${source.endpointUsed || "n/a"}`);
