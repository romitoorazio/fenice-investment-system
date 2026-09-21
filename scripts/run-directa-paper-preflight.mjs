import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectDirectaQuoteSnapshot } from "../lib/brokers/directa-datafeed.ts";
import { readJsonState, writeJsonStateAtomic } from "../lib/trading/atomic-state-store.ts";
import { selectDirectaPaperPreflightTickers } from "../lib/trading/directa-paper-preflight.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const snapshotPath = String(
  process.env.DIRECTA_EXECUTION_SNAPSHOT_PATH || path.join(homedir(), ".fenice", "directa-datafeed-snapshot.json"),
).trim();
const maxTickers = Math.max(3, Math.min(90, Number(process.env.FENICE_DIRECTA_PREFLIGHT_TICKERS || 9) || 9));
const realtimeEntitlementConfirmed = String(process.env.FENICE_DIRECTA_REALTIME_ENTITLEMENT_CONFIRMED || "")
  .trim()
  .toLowerCase() === "true";

if (!realtimeEntitlementConfirmed) {
  throw new Error(
    "DIRECTA_PREFLIGHT_REALTIME_ENTITLEMENT_NOT_CONFIRMED: verify that Directa API realtime/historical market data and the required market quotations are enabled, then set FENICE_DIRECTA_REALTIME_ENTITLEMENT_CONFIRMED=true. Delayed/unconfirmed data must never satisfy PAPER quorum.",
  );
}

async function readData(name, fallback) {
  return readJsonState(path.join(dataDir, name), fallback);
}

function runNodeScript(relativePath) {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", path.join(root, relativePath)], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`${relativePath} exited with status ${result.status}`);
}

const [queue, terminal, master] = await Promise.all([
  readData("paper-order-queue.json", { orders: [] }),
  readData("terminal-intelligence.json", { assets: [] }),
  readData("instrument-master.json", { instruments: [] }),
]);

const masterByTicker = new Map(
  (Array.isArray(master.instruments) ? master.instruments : [])
    .map((instrument) => [String(instrument?.ticker || "").trim().toUpperCase(), instrument]),
);
const terminalBySymbol = new Map(
  (Array.isArray(terminal.assets) ? terminal.assets : [])
    .map((asset) => [String(asset?.symbol || "").trim().toUpperCase(), asset]),
);

const requested = new Set(
  (Array.isArray(queue.orders) ? queue.orders : [])
    .map((order) => String(order?.symbol || "").trim().toUpperCase())
    .filter(Boolean),
);
if (requested.size === 0) {
  for (const asset of (Array.isArray(terminal.assets) ? terminal.assets : []).slice(0, 12)) {
    const symbol = String(asset?.symbol || "").trim().toUpperCase();
    if (symbol) requested.add(symbol);
  }
}

const instruments = [...requested].map((symbol) => {
  const masterInstrument = masterByTicker.get(symbol) || {};
  const terminalAsset = terminalBySymbol.get(symbol) || {};
  return {
    symbol,
    currency: masterInstrument.currency || terminalAsset.currency || "USD",
    assetClass: masterInstrument.assetClass || terminalAsset.assetClass || terminalAsset.category || "unknown",
    exchangeMic: masterInstrument.exchangeMic,
    country: masterInstrument.country,
  };
});

const selection = selectDirectaPaperPreflightTickers(instruments, maxTickers);
if (selection.tickers.length < 3) {
  console.error(`DIRECTA_PREFLIGHT_BLOCKED: only ${selection.tickers.length} eligible equity/ETF ticker(s) selected; minimum is 3.`);
  process.exitCode = 2;
} else {
  const explicitPort = process.env.DIRECTA_DATAFEED_PORT ? Number(process.env.DIRECTA_DATAFEED_PORT) : undefined;
  const accountCode = String(process.env.DIRECTA_ACCOUNT_CODE || "").trim() || undefined;
  const snapshot = await collectDirectaQuoteSnapshot(selection.tickers, {
    host: "127.0.0.1",
    ...(Number.isInteger(explicitPort) ? { datafeedPort: explicitPort } : {}),
    ...(accountCode ? { accountCode } : {}),
    connectTimeoutMs: 2500,
    snapshotTimeoutMs: 4000,
  });
  await writeJsonStateAtomic(snapshotPath, snapshot);

  const priced = new Set(snapshot.diagnostics?.pricedTickers || []);
  console.log(`Directa read-only snapshot: ${priced.size}/${selection.tickers.length} requested ticker(s) priced.`);
  console.log(`Snapshot path: ${snapshotPath}`);
  console.log("Directa realtime entitlement: EXPLICITLY CONFIRMED");
  console.log(`Trading write commands allowed: ${snapshot.writeTradingCommandsAllowed === false ? "NO" : "UNSAFE"}`);

  runNodeScript("scripts/run-execution-market-data.mjs");
  runNodeScript("scripts/check-execution-market-coverage.mjs");
  runNodeScript("scripts/check-paper-baseline-eligibility.mjs");

  const coverage = await readData("execution-market-coverage.json", {});
  const summary = {
    generatedAt: new Date().toISOString(),
    requestedDirectaTickers: selection.tickers,
    directaPricedTickers: snapshot.diagnostics?.pricedTickers || [],
    directaBidAskTickers: snapshot.diagnostics?.bidAskTickers || [],
    realtimeEntitlementConfirmed: true,
    paperEligibleSymbols: Number(coverage.paperEligibleSymbols || 0),
    requestedSymbols: Number(coverage.requestedSymbols || 0),
    directaPilotEligibleSymbols: Number(coverage.directaPilotEligibleSymbols || 0),
    directaPilotCandidateSymbols: Number(coverage.directaPilotCandidateSymbols || 0),
    greenSymbols: Array.isArray(coverage.directaPilotGreenSymbols) ? coverage.directaPilotGreenSymbols : [],
    liveTradingAllowed: false,
    campaignAutoStarted: false,
  };
  await writeJsonStateAtomic(path.join(homedir(), ".fenice", "directa-paper-preflight.json"), summary);
  console.log(`DIRECTA_PAPER_PREFLIGHT=${JSON.stringify(summary)}`);
}
