import { readFile } from "node:fs/promises";

const path = new URL("../data/global-source-health.json", import.meta.url);
const report = JSON.parse(await readFile(path, "utf8"));
const credentialPattern = /[?&](?:api_key|apikey|key|token|access_token)=([^&]+)/i;
const offenders = [];

for (const source of report.sources || []) {
  const endpoint = String(source.endpointUsed || "");
  const match = endpoint.match(credentialPattern);
  if (!match) continue;
  if (!/^REDACTED$/i.test(String(match[1] || ""))) offenders.push(source.id || "unknown");
}

if (offenders.length) {
  throw new Error(`Unredacted credentials found in generated source health for: ${offenders.join(", ")}`);
}

const serialized = JSON.stringify(report);
for (const envName of ["ALPHA_VANTAGE_API_KEY", "FRED_API_KEY", "EIA_API_KEY", "COINGECKO_API_KEY"]) {
  if (serialized.includes(envName)) throw new Error(`Environment secret name leaked into generated source health: ${envName}`);
}

console.log(`Source-health credential hygiene PASS (${report.sources?.length || 0} sources).`);
