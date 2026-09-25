import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "data", "paper-fx-evidence.json");
const apiKey = String(process.env.TWELVE_DATA_API_KEY || "").trim();
const maxAgeSeconds = 120;
const retryAttempts = Math.max(1, Number(process.env.FENICE_PAPER_FX_RETRIES || 3));
const retryDelayMs = Math.max(1, Number(process.env.FENICE_PAPER_FX_RETRY_DELAY_MS || 15_000));

if (!apiKey) {
  throw new Error("PAPER_FX_TWELVE_DATA_KEY_MISSING");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchFreshUsdEur() {
  let lastFailure = "unknown";

  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    const url = new URL("https://api.twelvedata.com/exchange_rate");
    url.searchParams.set("symbol", "USD/EUR");
    url.searchParams.set("timezone", "UTC");
    url.searchParams.set("apikey", apiKey);

    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) {
      lastFailure = `PAPER_FX_HTTP_${response.status}`;
    } else {
      const body = await response.json();
      const rate = Number(body?.rate);
      const timestampSeconds = Number(body?.timestamp);
      if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(timestampSeconds) || timestampSeconds <= 0) {
        lastFailure = `PAPER_FX_INVALID_RESPONSE: ${JSON.stringify(body)}`;
      } else {
        const observedAt = new Date(timestampSeconds * 1000).toISOString();
        const ageSeconds = Math.max(0, (Date.now() - timestampSeconds * 1000) / 1000);
        if (ageSeconds <= maxAgeSeconds) {
          return { rate, observedAt, ageSeconds };
        }
        lastFailure = `PAPER_FX_STALE: ageSeconds=${ageSeconds.toFixed(1)}`;
      }
    }

    if (attempt < retryAttempts) {
      console.warn(`Fenice PAPER FX attempt ${attempt}/${retryAttempts} not usable (${lastFailure}); retrying without relaxing ${maxAgeSeconds}s freshness gate.`);
      await sleep(retryDelayMs);
    }
  }

  throw new Error(lastFailure);
}

const { rate, observedAt, ageSeconds } = await fetchFreshUsdEur();
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
  maxAgeSeconds,
  liveTradingAllowed: false,
  brokerConnectivityAllowed: false
};

await writeFile(out, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(`Fenice PAPER FX: USD/EUR=${rate}; ageSeconds=${ageSeconds.toFixed(1)}; provider=twelve-data; attempts<=${retryAttempts}; liveTradingAllowed=false.`);
