import { readFile } from "node:fs/promises";

const checker = await readFile(new URL("./check-global-sources.mjs", import.meta.url), "utf8");
const publicRoute = await readFile(new URL("../app/api/sources/global/route.ts", import.meta.url), "utf8");
const persistedHealth = await readFile(new URL("../data/global-source-health.json", import.meta.url), "utf8");

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
if (!publicRoute.includes("health.sources.map(toPublicSource)")) {
  throw new Error("Public source-health API must map through an explicit allowlist.");
}
if (/endpointUsed:\s*source\.endpointUsed/.test(publicRoute)) {
  throw new Error("Public source-health API must not expose endpointUsed metadata.");
}
if (!publicRoute.includes("endpointMetadataPublic: false")) {
  throw new Error("Public source-health API must explicitly document endpoint metadata as private.");
}

const secretQueryPattern = /[?&](?:api_key|apikey|key|token|access_token)=((?!REDACTED)[^&"\\\s]+)/gi;
if (secretQueryPattern.test(persistedHealth)) {
  throw new Error("Persisted source-health dataset contains an unredacted query-string credential.");
}

console.log("Source checker security invariants PASS.");
