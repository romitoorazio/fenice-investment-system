import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checker = await readFile(new URL("./check-global-sources.mjs", import.meta.url), "utf8");

if (!checker.includes("function redactEndpoint")) {
  throw new Error("Global source checker must define credential redaction before persisting endpointUsed.");
}
if (!/endpointUsed:\s*redactEndpoint\(source,\s*endpoint\)/.test(checker)) {
  throw new Error("Successful source probes must persist only a redacted endpointUsed value.");
}
if (!/endpointUsed:\s*redactEndpoint\(source,\s*best\?\.endpoint\)/.test(checker)) {
  throw new Error("Failed source probes must persist only a redacted endpointUsed value.");
}
if (!/api_key\|apikey\|key\|token\|access_token/.test(checker)) {
  throw new Error("Credential redaction must cover common query-string secret names.");
}
if (!/SEC_USER_AGENT/.test(checker) || !/@users\.noreply\.github\.com/.test(checker)) {
  throw new Error("SEC requests must carry a descriptive User-Agent with contact information.");
}

const sensitiveKeys = new Set(["api_key", "apikey", "api-key", "key", "token", "access_token", "secret"]);
const safeValues = new Set(["", "redacted", "***", "<redacted>"]);

function assertSafeEndpoint(endpoint, label) {
  if (!endpoint || typeof endpoint !== "string") return;
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return;
  }
  for (const [key, value] of url.searchParams.entries()) {
    if (!sensitiveKeys.has(key.toLowerCase())) continue;
    if (!safeValues.has(String(value).trim().toLowerCase())) {
      throw new Error(`${label} persists a non-redacted credential in query parameter ${key}.`);
    }
  }
}

const healthPath = path.join(root, "data", "global-source-health.json");
const health = JSON.parse(await readFile(healthPath, "utf8"));
if (!Array.isArray(health.sources)) {
  throw new Error("Persisted global source health report must contain a sources array.");
}
for (const source of health.sources) {
  assertSafeEndpoint(source?.endpointUsed, `Source ${source?.id || "unknown"}`);
}

console.log("Source checker security invariants PASS.");
