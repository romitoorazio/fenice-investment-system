import { readFile } from "node:fs/promises";

const checker = await readFile(new URL("./check-global-sources.mjs", import.meta.url), "utf8");
const publicRoute = await readFile(new URL("../app/api/sources/global/route.ts", import.meta.url), "utf8");

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

if (!publicRoute.includes("function toPublicSource")) {
  throw new Error("Public source-health API must use an explicit response whitelist.");
}
if (!publicRoute.includes("sources: health.sources.map(toPublicSource)")) {
  throw new Error("Public source-health API must map sources through the response whitelist.");
}
const publicProjection = publicRoute.match(/function toPublicSource[\s\S]*?\n}\n/)?.[0] || "";
if (publicProjection.includes("endpointUsed")) {
  throw new Error("Public source-health API must never expose endpointUsed metadata.");
}
if (!publicRoute.includes("endpointMetadataPublic: false")) {
  throw new Error("Public source-health API policy must explicitly declare endpoint metadata private.");
}

console.log("Source checker and public API security invariants PASS.");
