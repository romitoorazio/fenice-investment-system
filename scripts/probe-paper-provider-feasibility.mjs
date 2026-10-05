import { appendFile, readFile, writeFile } from "node:fs/promises";
import {
  isAlpacaPaperCandidate,
  isTwelveDataPaperCandidate,
  isTwelveDataUsRealtimeVenue,
  normalizeExecutionSymbol,
} from "../lib/trading/execution-market-data.ts";
import { DEFAULT_MARKET_DATA_QUORUM_LIMITS } from "../lib/trading/market-data-quorum.ts";
import { parseTwelveDataQuoteTime, unwrapTwelveDataBatchQuote } from "../lib/trading/twelve-data-batch.mjs";

const targetSymbols = String(process.env.FENICE_FEASIBILITY_SYMBOLS || "ASML,TSM,NVDA,IWM,META,GOOGL,AMZN")
  .split(",")
  .map(normalizeExecutionSymbol)
  .filter(Boolean)
  .slice(0, 8);
const alpacaKey = String(process.env.APCA_API_KEY_ID || "").trim();
const alpacaSecret = String(process.env.APCA_API_SECRET_KEY || "").trim();
const twelveKey = String(process.env.TWELVE_DATA_API_KEY || "").trim();
const maxAgeSeconds = DEFAULT_MARKET_DATA_QUORUM_LIMITS.maxQuoteAgeSeconds;
const maxSpreadPercent = DEFAULT_MARKET_DATA_QUORUM_LIMITS.maxSpreadPercent;

function ageSeconds(observedAt) {
  const observedMs = Date.parse(String(observedAt || ""));
  return Number.isFinite(observedMs) ? Math.max(0, (Date.now() - observedMs) / 1000) : Number.POSITIVE_INFINITY;
}

function safeAge(observedAt) {
  const age = ageSeconds(observedAt);
  return Number.isFinite(age) ? Number(age.toFixed(1)) : null;
}

function spreadPercent(firstPrice, secondPrice) {
  const first = Number(firstPrice);
  const second = Number(secondPrice);
  if (!Number.isFinite(first) || first <= 0 || !Number.isFinite(second) || second <= 0) return null;
  const median = (first + second) / 2;
  return median > 0 ? Number((((Math.max(first, second) - Math.min(first, second)) / median) * 100).toFixed(4)) : null;
}

async function requestJson(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "FeniceInvestmentSystem/2.0 paper-provider-feasibility",
        ...headers,
      },
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function probeAlpaca(symbol) {
  if (!alpacaKey || !alpacaSecret) return { configured: false, ok: false, reason: "credentials-missing" };
  try {
    const payload = await requestJson(
      `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/quotes/latest?feed=iex`,
      {
        "APCA-API-KEY-ID": alpacaKey,
        "APCA-API-SECRET-KEY": alpacaSecret,
      },
    );
    const quote = payload?.quote || {};
    const bid = Number(quote.bp);
    const ask = Number(quote.ap);
    const observedAt = String(quote.t || "").trim();
    const valid = Number.isFinite(bid) && bid > 0 && Number.isFinite(ask) && ask >= bid && Number.isFinite(Date.parse(observedAt));
    const fresh = valid && ageSeconds(observedAt) <= maxAgeSeconds;
    return {
      configured: true,
      ok: valid,
      freshVerifiedQuote: fresh,
      observedAt: valid ? new Date(Date.parse(observedAt)).toISOString() : null,
      ageSeconds: valid ? safeAge(observedAt) : null,
      midpoint: valid ? Number(((bid + ask) / 2).toFixed(6)) : null,
      provenance: "authenticated-alpaca-iex-latest-quote",
      reason: valid ? null : "invalid-latest-quote",
    };
  } catch (error) {
    return { configured: true, ok: false, freshVerifiedQuote: false, reason: String(error?.message || "alpaca-fetch-failed") };
  }
}

async function probeTwelveBatch(instruments) {
  const bySymbol = new Map();
  if (!twelveKey) {
    for (const instrument of instruments) bySymbol.set(instrument.symbol, { configured: false, ok: false, reason: "credentials-missing" });
    return bySymbol;
  }
  if (!instruments.length) return bySymbol;

  try {
    const symbols = instruments.map((instrument) => instrument.symbol).join(",");
    const payload = await requestJson(`https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbols)}&interval=1min&apikey=${encodeURIComponent(twelveKey)}`);
    for (const instrument of instruments) {
      const row = unwrapTwelveDataBatchQuote(payload, instrument.symbol);
      if (!row) {
        bySymbol.set(instrument.symbol, { configured: true, ok: false, freshVerifiedQuote: false, reason: "symbol-missing" });
        continue;
      }
      const returnedSymbol = normalizeExecutionSymbol(row?.symbol || instrument.symbol);
      const price = Number(row?.close ?? row?.price);
      const quoteTime = parseTwelveDataQuoteTime(row);
      const venueVerified = isTwelveDataUsRealtimeVenue(row);
      const valid = returnedSymbol === instrument.symbol && Number.isFinite(price) && price > 0 && Boolean(quoteTime.observedAt) && venueVerified;
      const fresh = valid && quoteTime.paperTimestampVerified === true && ageSeconds(quoteTime.observedAt) <= maxAgeSeconds;
      bySymbol.set(instrument.symbol, {
        configured: true,
        ok: valid,
        freshVerifiedQuote: fresh,
        observedAt: quoteTime.observedAt || null,
        ageSeconds: quoteTime.observedAt ? safeAge(quoteTime.observedAt) : null,
        price: Number.isFinite(price) ? price : null,
        venueVerified,
        timestampVerified: quoteTime.paperTimestampVerified === true,
        timestampSource: quoteTime.source || null,
        provenance: "authenticated-twelve-data-batch-quote",
        reason: valid ? null : "invalid-or-non-us-realtime-quote",
      });
    }
  } catch (error) {
    for (const instrument of instruments) {
      bySymbol.set(instrument.symbol, { configured: true, ok: false, freshVerifiedQuote: false, reason: String(error?.message || "twelve-data-fetch-failed") });
    }
  }
  return bySymbol;
}

function markdown(report) {
  const lines = [
    "## Fenice provider feasibility lab",
    "",
    "Read-only diagnostic. No PAPER state, order, broker, campaign evidence or LIVE setting is modified.",
    `Current quorum spread limit: ${report.maxSpreadPercent}%.",
    "",
    "| Symbol | Venue | Alpaca fresh | Twelve Data fresh | Spread % | Quorum-compatible |",
    "| --- | --- | --- | --- | ---: | --- |",
  ];
  for (const row of report.targets) {
    lines.push(`| ${row.symbol} | ${row.exchangeMic || "unknown"} | ${row.alpaca.freshVerifiedQuote === true ? "yes" : "no"} | ${row.twelveData.freshVerifiedQuote === true ? "yes" : "no"} | ${row.crossSourceSpreadPercent ?? "n/a"} | ${row.quorumCompatible ? "yes" : "no"} |`);
  }
  return `${lines.join("\n")}\n`;
}

const master = JSON.parse(await readFile("data/instrument-master.json", "utf8"));
const masterBySymbol = new Map((Array.isArray(master?.instruments) ? master.instruments : []).map((instrument) => [normalizeExecutionSymbol(instrument?.ticker || instrument?.symbol), instrument]));
const instruments = targetSymbols.map((symbol) => {
  const source = masterBySymbol.get(symbol) || {};
  return {
    symbol,
    assetClass: source.assetClass || "unknown",
    exchangeMic: source.exchangeMic || null,
    country: source.country || null,
    alpacaCandidate: isAlpacaPaperCandidate({ symbol, assetClass: source.assetClass, exchangeMic: source.exchangeMic, country: source.country }),
    twelveDataCandidate: isTwelveDataPaperCandidate({ symbol, assetClass: source.assetClass, exchangeMic: source.exchangeMic, country: source.country }),
  };
});

const twelveMap = await probeTwelveBatch(instruments.filter((instrument) => instrument.twelveDataCandidate));
const targets = [];
for (const instrument of instruments) {
  const alpaca = instrument.alpacaCandidate
    ? await probeAlpaca(instrument.symbol)
    : { configured: Boolean(alpacaKey && alpacaSecret), ok: false, freshVerifiedQuote: false, reason: "not-paper-candidate" };
  const twelveData = instrument.twelveDataCandidate
    ? (twelveMap.get(instrument.symbol) || { configured: Boolean(twelveKey), ok: false, freshVerifiedQuote: false, reason: "not-returned" })
    : { configured: Boolean(twelveKey), ok: false, freshVerifiedQuote: false, reason: "not-paper-candidate" };
  const crossSourceSpreadPercent = spreadPercent(alpaca.midpoint, twelveData.price);
  const dualSourceFeasible = alpaca.freshVerifiedQuote === true && twelveData.freshVerifiedQuote === true;
  const withinCurrentQuorumSpreadLimit = crossSourceSpreadPercent !== null && crossSourceSpreadPercent <= maxSpreadPercent;
  targets.push({
    ...instrument,
    alpaca,
    twelveData,
    crossSourceSpreadPercent,
    withinCurrentQuorumSpreadLimit,
    dualSourceFeasible,
    quorumCompatible: dualSourceFeasible && withinCurrentQuorumSpreadLimit,
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  diagnosticOnly: true,
  paperStateModified: false,
  campaignEvidenceModified: false,
  brokerConnectivityAllowed: false,
  liveTradingAllowed: false,
  maxAgeSeconds,
  maxSpreadPercent,
  quorumCompatibleSymbols: targets.filter((row) => row.quorumCompatible).map((row) => row.symbol),
  targets,
};

const outputPath = String(process.env.FENICE_PROVIDER_FEASIBILITY_REPORT || "paper-provider-feasibility.json").trim();
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown(report));
console.log(`Fenice provider feasibility: ${targets.map((row) => `${row.symbol}=${row.quorumCompatible ? "QUORUM_COMPATIBLE" : row.dualSourceFeasible ? "SPREAD_BLOCKED" : "NOT_CONFIRMED"}`).join(", ")}; diagnosticOnly=true; paperStateModified=false; liveTradingAllowed=false; brokerConnectivityAllowed=false.`);
