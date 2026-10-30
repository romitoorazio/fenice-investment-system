// Alpaca IEX market-data WebSocket only. No broker trading/account APIs.
// Independent RESEARCH SHADOW, never writes a PAPER ledger or market-evidence state.
import { writeFile, appendFile } from "node:fs/promises";
import { makeIexShadowProof, observeIexShadowProof, finishIexShadowProof,
  parseIexShadowSymbols } from "../lib/monitor/iex-shadow-proof.mjs";

const publicKey = String(process.env.APCA_API_KEY_ID || "").trim();
const secret = String(process.env.APCA_API_SECRET_KEY || "").trim();
const out = String(process.env.FENICE_IEX_SHADOW_OUTPUT || "iex-shadow-proof.json");
const symbols = parseIexShadowSymbols(process.env.FENICE_IEX_SHADOW_SYMBOLS || "AAPL,MSFT,SPY,QQQ,NVDA,AMZN");
const duration = Math.min(600, Math.max(30, Math.floor(Number(process.env.FENICE_IEX_SHADOW_SECONDS || 180)) || 180));
const proof = makeIexShadowProof(symbols, new Date().toISOString());
let terminalError = null;
let ended = false;
let timer;

if (!publicKey || !secret) {
  console.error("IEX_SHADOW_CREDENTIALS_MISSING: configure existing APCA read-only data secrets.");
  process.exitCode = 2;
} else if (typeof WebSocket !== "function") {
  console.error("IEX_SHADOW_NODE_WEBSOCKET_UNAVAILABLE");
  process.exitCode = 2;
} else {
  // Strictly never connect to paper-api.alpaca.markets, api.alpaca.markets or Directa.
  // Only the Basic-market-data IEX feed, not consolidated SIP.
  const socket = new WebSocket("wss://stream.data.alpaca.markets/v2/iex");
  await new Promise((resolve) => {
    const finish = (reason) => {
      if (ended) return;
      ended = true;
      terminalError = reason;
      clearTimeout(timer);
      try { socket.close(1000, "shadow measurement complete"); } catch { /* not open */ }
      resolve();
    };
    timer = setTimeout(() => finish(null), duration * 1000);
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ action: "auth", key: publicKey, secret }));
    });
    socket.addEventListener("message", (event) => {
      let messages;
      try { messages = JSON.parse(String(event.data)); }
      catch { return finish("IEX_SHADOW_INVALID_JSON"); }
      for (const row of Array.isArray(messages) ? messages : [messages]) {
        if (row?.T === "error") return finish("IEX_SHADOW_PROVIDER_ERROR_" + String(Number(row.code) || "UNKNOWN"));
        if (row?.T === "success" && row.msg === "authenticated" && !proof.authenticated) {
          proof.authenticated = true;
          socket.send(JSON.stringify({ action: "subscribe", trades: symbols, quotes: symbols }));
          continue;
        }
        if (row?.T === "subscription") {
          // Fail closed if the data provider did not acknowledge every requested symbol.
          const trades = new Set(Array.isArray(row.trades) ? row.trades : []);
          const quotes = new Set(Array.isArray(row.quotes) ? row.quotes : []);
          proof.subscriptionConfirmed = symbols.every(s => trades.has(s) && quotes.has(s));
          if (!proof.subscriptionConfirmed) return finish("IEX_SHADOW_INCOMPLETE_SUBSCRIPTION");
          continue;
        }
        if (row?.T === "t" || row?.T === "q") {
          if (proof.authenticated && proof.subscriptionConfirmed) {
            observeIexShadowProof(proof, row, Date.now());
          }
        }
      }
    });
    socket.addEventListener("error", () => finish("IEX_SHADOW_SOCKET_ERROR"));
    socket.addEventListener("close", () => finish("IEX_SHADOW_CLOSED_EARLY"));
  });
}

const report = finishIexShadowProof(proof, new Date().toISOString());
if (terminalError) report.errorCode = terminalError;
await writeFile(out, JSON.stringify(report, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
console.log("FENICE IEX read-only SHADOW: " + JSON.stringify({
  status: report.status, authenticated: report.authenticated,
  subscriptionConfirmed: report.subscriptionConfirmed, sampledSymbols: report.sampledSymbols,
  freshEvents: report.freshEvents, staleEvents: report.staleEvents,
  p95DeliveryUpperBoundMs: report.providerToReceiptP95UpperBoundMs,
  futureEvents: report.futureEvents, malformedEvents: report.malformedEvents,
  errorCode: report.errorCode ?? null, paperQuorumCredit: 0, liveTradingAllowed: false,
}));
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY,
    "## FENICE Alpaca IEX — RESEARCH SHADOW (NO PAPER)\n\n" +
    "| Verifica | Risultato |\n|---|---|\n" +
    "| Stato | " + report.status + " |\n" +
    "| Simboli con tick freschi | " + report.sampledSymbols + "/" + symbols.length + " |\n" +
    "| Eventi freschi / stantii | " + report.freshEvents + " / " + report.staleEvents + " |\n" +
    "| Orario ultimo tick provider | " + (report.lastProviderAt ?? "N/D") + " |\n" +
    "| P95 consegna provider → monitor (limite superiore) | " + (report.providerToReceiptP95UpperBoundMs === null ? "non misurabile / >120 s" : report.providerToReceiptP95UpperBoundMs + " ms") + " |\n" +
    "| Credito al quorum PAPER | **0** |\n" +
    "| Broker LIVE e ordini | **disabilitati** |\n\n" +
    "Feed IEX Basic, non SIP. Nessun prezzo grezzo salvato; no autorizzazione all'esecuzione.\n");
}
if (terminalError || !report.authenticated || !report.subscriptionConfirmed) process.exitCode = 2;
