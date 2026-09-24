import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "data", "paper-fx-evidence.json");
const apiKey = String(process.env.TWELVE_DATA_API_KEY || "").trim();

if (!apiKey) {
  throw new Error("PAPER_FX_TWELVE_DATA_KEY_MISSING");
}

const url = new URL("https://api.twelvedata.com/exchange_rate");
url.searchParams.set("symbol", "USD/EUR");
url.searchParams.set("timezone", "UTC");
url.searchParams.set("apikey", apiKey);

const response = await fetch(url, { headers: { accept: "application/json" } });
if (!response.ok) throw new Error(`PAPER_FX_HTTP_${response.status}`);
const body = await response.json();
const rate = Number(body?.rate);
const timestampSeconds = Number(body?.timestamp);
if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(timestampSeconds) || timestampSeconds <= 0) {
  throw new Error(`PAPER_FX_INVALID_RESPONSE: ${JSON.stringify(body)}`);
}

const observedAt = new Date(timestampSeconds * 1000).toISOString();
const ageSeconds = Math.max(0, (Date.now() - timestampSeconds * 1000) / 1000);
if (ageSeconds > 120) throw new Error(`PAPER_FX_STALE: ageSeconds=${ageSeconds.toFixed(1)}`);

const evidence = {
  version: 1,
  generatedAt: new Date().toISOString(),
  baseCurrency: "EUR",
  provider: "twelve-data",
  provenanceVerified: true,
  ratesToEuro: {
    EUR: { rate: 1, observedAt: new Date().toISOString(), source: "identity" },
    USD: { rate, observedAt, source: "Twelve Data /exchange_rate USD/EUR" }
  },
  maxAgeSeconds: 120,
  liveTradingAllowed: false,
  brokerConnectivityAllowed: false
};

await writeFile(out, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(`Fenice PAPER FX: USD/EUR=${rate}; ageSeconds=${ageSeconds.toFixed(1)}; provider=twelve-data; liveTradingAllowed=false.`);
