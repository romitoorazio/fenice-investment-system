import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = path.join(root, "data", "global-source-registry.json");
const outputPath = path.join(root, "data", "global-source-health.json");
const historyDir = path.join(root, "data", "source-history");
const registry = JSON.parse(await readFile(registryPath, "utf8"));
const now = new Date();

function endpointFor(source) {
  const secretValue = source.secret ? process.env[source.secret] : undefined;
  if (source.auth === "api-key" && !secretValue) return null;
  return source.endpoint.replace("{key}", encodeURIComponent(secretValue || ""));
}

async function probe(source) {
  const startedAt = Date.now();
  const endpoint = endpointFor(source);
  if (!endpoint) {
    return {
      id: source.id,
      name: source.name,
      category: source.category,
      authority: source.authority,
      status: "unconfigured",
      checkedAt: now.toISOString(),
      latencyMs: null,
      httpStatus: null,
      detail: `Manca il secret ${source.secret}.`,
      regions: source.regions,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const headers = {
      accept: source.id === "ema" ? "application/rss+xml,application/xml,text/xml,*/*" : "application/json,text/csv,text/plain,*/*",
      "user-agent": process.env.SEC_USER_AGENT || "FeniceInvestmentSystem/1.0 contact: github.com/romitoorazio",
    };
    if (source.id === "coingecko" && process.env.COINGECKO_API_KEY) {
      headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;
    }
    const response = await fetch(endpoint, { headers, signal: controller.signal });
    const latencyMs = Date.now() - startedAt;
    const text = await response.text();
    const validPayload = text.trim().length > 2;
    return {
      id: source.id,
      name: source.name,
      category: source.category,
      authority: source.authority,
      status: response.ok && validPayload ? "healthy" : response.ok ? "degraded" : "failed",
      checkedAt: now.toISOString(),
      latencyMs,
      httpStatus: response.status,
      detail: response.ok ? (validPayload ? "Risposta valida ricevuta." : "Risposta vuota o incompleta.") : `HTTP ${response.status}`,
      regions: source.regions,
    };
  } catch (error) {
    return {
      id: source.id,
      name: source.name,
      category: source.category,
      authority: source.authority,
      status: "failed",
      checkedAt: now.toISOString(),
      latencyMs: Date.now() - startedAt,
      httpStatus: null,
      detail: error instanceof Error ? error.message : String(error),
      regions: source.regions,
    };
  } finally {
    clearTimeout(timeout);
  }
}

await mkdir(historyDir, { recursive: true });
const results = await Promise.all(registry.sources.map(probe));
const counts = results.reduce(
  (acc, source) => {
    acc[source.status] = (acc[source.status] || 0) + 1;
    return acc;
  },
  { healthy: 0, degraded: 0, failed: 0, unconfigured: 0 },
);

const report = {
  version: registry.version,
  generatedAt: now.toISOString(),
  totalSources: results.length,
  summary: counts,
  sources: results,
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
await writeFile(outputPath, serialized, "utf8");
await writeFile(path.join(historyDir, `${now.toISOString().replaceAll(":", "-")}.json`), serialized, "utf8");
console.log(`Global sources checked: ${results.length}; healthy ${counts.healthy}; degraded ${counts.degraded}; failed ${counts.failed}; unconfigured ${counts.unconfigured}`);
