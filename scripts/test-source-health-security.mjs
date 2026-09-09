import { readFile } from "node:fs/promises";

const checker = await readFile(new URL("./check-global-sources.mjs", import.meta.url), "utf8");
const sourceHealth = JSON.parse(await readFile(new URL("../data/global-source-health.json", import.meta.url), "utf8"));
const governance = JSON.parse(await readFile(new URL("../data/decision-governance.json", import.meta.url), "utf8"));

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

// SEC asks automated clients to identify themselves with a descriptive User-Agent
// and contact information. Validate the invariant without coupling the test to one
// specific mailbox/provider so an intentionally updated contact does not break CI.
const hasSecUserAgentOverride = /SEC_USER_AGENT/.test(checker);
const hasDescriptiveSecFallback = /FeniceInvestmentSystem\/3\.2\s+[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(checker);
if (!hasSecUserAgentOverride || !hasDescriptiveSecFallback) {
  throw new Error("SEC requests must carry a descriptive User-Agent with contact information.");
}

const secretQueryNames = new Set(["api_key", "apikey", "key", "token", "access_token"]);
for (const source of sourceHealth.sources || []) {
  if (!source.endpointUsed) continue;
  let url;
  try {
    url = new URL(source.endpointUsed);
  } catch {
    throw new Error(`Source ${source.id} persists an invalid endpointUsed URL.`);
  }
  for (const [key, value] of url.searchParams.entries()) {
    if (secretQueryNames.has(key.toLowerCase()) && value !== "REDACTED") {
      throw new Error(`Source ${source.id} persists a non-redacted credential in query parameter ${key}.`);
    }
  }
}

if (governance?.guardrails?.blockAutonomousTrading !== true) {
  throw new Error("Certification requires autonomous trading to remain hard-blocked.");
}
if (governance?.guardrails?.requireHumanConfirmation !== true) {
  throw new Error("Certification requires explicit human confirmation for actionable decisions.");
}
const prohibited = new Set(governance?.prohibitedActions || []);
for (const action of ["inviare ordini", "collegarsi a broker", "usare leva automaticamente"]) {
  if (!prohibited.has(action)) throw new Error(`Governance must explicitly prohibit: ${action}`);
}

console.log("Source credential persistence and live-trading safety invariants PASS.");
