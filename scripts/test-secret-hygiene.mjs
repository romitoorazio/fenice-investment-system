import { readFile } from "node:fs/promises";

const health = JSON.parse(await readFile(new URL("../data/global-source-health.json", import.meta.url), "utf8"));
const credentialPattern = /[?&](?:api_key|apikey|key|token|access_token)=([^&]+)/i;
const unsafe = [];
for (const source of health.sources || []) {
  const endpoint = String(source.endpointUsed || "");
  const match = endpoint.match(credentialPattern);
  if (!match) continue;
  const value = String(match[1] || "");
  if (!/^REDACTED$/i.test(value)) unsafe.push(source.id || "unknown-source");
}
if (unsafe.length) throw new Error(`Generated source-health contains unredacted credential material for: ${unsafe.join(", ")}`);
const serialized = JSON.stringify(health);
for (const forbidden of ["ALPHA_VANTAGE_API_KEY", "FRED_API_KEY", "EIA_API_KEY", "COINGECKO_API_KEY"]) {
  if (serialized.includes(`\"${forbidden}\":`)) throw new Error(`Generated source-health must not serialize environment secret ${forbidden}`);
}
console.log(`Secret hygiene PASS: ${health.sources?.length || 0} source-health entries inspected.`);
