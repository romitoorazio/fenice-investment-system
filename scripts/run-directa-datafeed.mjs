import { homedir } from "node:os";
import path from "node:path";
import { collectDirectaQuoteSnapshot } from "../lib/brokers/directa-datafeed.ts";
import { writeJsonStateAtomic } from "../lib/trading/atomic-state-store.ts";

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const tickerArg = readArg("--tickers") || process.env.DIRECTA_DATAFEED_TICKERS || "";
const tickers = tickerArg.split(",").map((item) => item.trim()).filter(Boolean);
const accountCode = readArg("--account") || process.env.DIRECTA_ACCOUNT_CODE || undefined;
const explicitPort = readArg("--port") || process.env.DIRECTA_DATAFEED_PORT || undefined;
const port = explicitPort ? Number(explicitPort) : undefined;

if (!tickers.length) {
  console.error("Usage: npm run directa:datafeed -- --tickers STLAM,UCG");
  process.exitCode = 2;
} else {
  const outputPath = path.join(homedir(), ".fenice", "directa-datafeed-snapshot.json");
  try {
    const snapshot = await collectDirectaQuoteSnapshot(tickers, {
      host: "127.0.0.1",
      accountCode,
      datafeedPort: port,
    });
    await writeJsonStateAtomic(outputPath, snapshot);
    console.log("Fenice Directa read-only market-data snapshot completed.");
    console.log(`Requested: ${snapshot.diagnostics.requestedTickers.join(", ")}`);
    console.log(`Priced: ${snapshot.diagnostics.pricedTickers.join(", ") || "none"}`);
    console.log(`Bid/Ask: ${snapshot.diagnostics.bidAskTickers.join(", ") || "none"}`);
    console.log(`Trading write commands allowed: ${snapshot.writeTradingCommandsAllowed}`);
    console.log(`Snapshot saved atomically: ${outputPath}`);
    if (snapshot.quotes.length === 0 || snapshot.errors.length > 0) process.exitCode = 2;
  } catch (error) {
    console.error("Fenice Directa datafeed failed:", error instanceof Error ? error.message : String(error));
    console.error("Verify Darwin, API/price-service availability and the local datafeed socket. Do not enable paid services unless deliberately chosen.");
    process.exitCode = 1;
  }
}
