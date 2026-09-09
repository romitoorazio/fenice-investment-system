import { readFile } from "node:fs/promises";

const checker = await readFile(new URL("./check-global-sources.mjs", import.meta.url), "utf8");

if (!checker.includes("function redactString") || !checker.includes("function sanitizeForStorage")) {
  throw new Error("Global source checker must define recursive credential redaction before persisting source-health data.");
}
if (!/endpointUsed:\s*redactString\(endpoint\)/.test(checker)) {
  throw new Error("Successful source probes must persist only a redacted endpointUsed value.");
}
if (!/endpointUsed:\s*redactString\(best\?\.endpoint\)/.test(checker)) {
  throw new Error("Failed source probes must persist only a redacted endpointUsed value.");
}
if (!/const report = sanitizeForStorage\(/.test(checker)) {
  throw new Error("The complete source-health report must be sanitized before it is serialized.");
}
if (!/api_key\|apikey\|key\|token\|access_token/.test(checker)) {
  throw new Error("Credential redaction must cover common query-string secret names.");
}
if (!/SEC_USER_AGENT/.test(checker) || !/@users\.noreply\.github\.com/.test(checker)) {
  throw new Error("SEC requests must carry a descriptive User-Agent with contact information.");
}
if (!/source\.id === "sec" && result\.httpStatus === 403/.test(checker)) {
  throw new Error("SEC HTTP 403 responses must be handled as transient source failures.");
}
if (!/stale:\s*true/.test(checker) || !/lastSuccessfulAt/.test(checker)) {
  throw new Error("Transient source fallback must be explicitly marked stale and preserve lastSuccessfulAt.");
}

console.log("Source checker security invariants PASS.");
