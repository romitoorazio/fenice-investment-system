import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateMarketSession } from "../lib/trading/market-session.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "data", "paper-market-session.json");
const keyId = String(process.env.APCA_API_KEY_ID || process.env.ALPACA_API_KEY || "").trim();
const secretKey = String(process.env.APCA_API_SECRET_KEY || process.env.ALPACA_API_SECRET || "").trim();
const endpoint = "https://paper-api.alpaca.markets/v2/clock";
const checkedAt = new Date().toISOString();

async function writeReport(report) {
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function main() {
  if (!keyId || !secretKey) {
    const evidence = {
      venue: "US_EQUITIES",
      state: "UNKNOWN",
      source: "Alpaca Paper Trading Clock",
      observedAt: checkedAt,
      authoritative: false,
    };
    const decision = evaluateMarketSession(evidence, { maxAgeSeconds: 120 });
    await writeReport({
      version: 1,
      generatedAt: checkedAt,
      configured: false,
      evidence,
      decision,
      nextOpen: null,
      nextClose: null,
      diagnosticOnly: true,
      liveTradingAllowed: false,
      error: "ALPACA_PAPER_CLOCK_NOT_CONFIGURED",
    });
    console.log("Fenice PAPER market session: UNKNOWN (Alpaca paper clock credentials unavailable).");
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "APCA-API-KEY-ID": keyId,
        "APCA-API-SECRET-KEY": secretKey,
        "user-agent": "FeniceInvestmentSystem/1.9 paper-session-diagnostic",
      },
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const data = await response.json();
    const providerTimestamp = String(data?.timestamp || "").trim();
    const providerTimestampValid = Number.isFinite(Date.parse(providerTimestamp));
    const evidence = {
      venue: "US_EQUITIES",
      state: data?.is_open === true ? "OPEN" : data?.is_open === false ? "CLOSED" : "UNKNOWN",
      source: "Alpaca Paper Trading Clock",
      observedAt: providerTimestampValid ? new Date(Date.parse(providerTimestamp)).toISOString() : checkedAt,
      authoritative: providerTimestampValid && typeof data?.is_open === "boolean",
    };
    const decision = evaluateMarketSession(evidence, { maxAgeSeconds: 120 });
    const report = {
      version: 1,
      generatedAt: checkedAt,
      configured: true,
      evidence,
      decision,
      nextOpen: Number.isFinite(Date.parse(String(data?.next_open || ""))) ? new Date(Date.parse(data.next_open)).toISOString() : null,
      nextClose: Number.isFinite(Date.parse(String(data?.next_close || ""))) ? new Date(Date.parse(data.next_close)).toISOString() : null,
      diagnosticOnly: true,
      liveTradingAllowed: false,
      error: null,
    };
    await writeReport(report);
    console.log(`Fenice PAPER market session: ${evidence.state}; allowed=${decision.allowed}; age=${decision.ageSeconds}s; nextOpen=${report.nextOpen || "unknown"}; nextClose=${report.nextClose || "unknown"}.`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const evidence = {
      venue: "US_EQUITIES",
      state: "UNKNOWN",
      source: "Alpaca Paper Trading Clock",
      observedAt: checkedAt,
      authoritative: false,
    };
    const decision = evaluateMarketSession(evidence, { maxAgeSeconds: 120 });
    await writeReport({
      version: 1,
      generatedAt: checkedAt,
      configured: true,
      evidence,
      decision,
      nextOpen: null,
      nextClose: null,
      diagnosticOnly: true,
      liveTradingAllowed: false,
      error: detail.replace(/[^A-Z0-9_:-]/gi, "_").slice(0, 120),
    });
    console.log(`Fenice PAPER market session: UNKNOWN (${detail}).`);
  } finally {
    clearTimeout(timer);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
