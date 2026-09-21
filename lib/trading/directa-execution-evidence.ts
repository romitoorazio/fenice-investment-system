import type { DirectaDatafeedSnapshot, DirectaQuote } from "../brokers/directa-datafeed.ts";
import {
  classifyPaperEligibilityByFreshness,
  normalizeExecutionEvidence,
  normalizeExecutionSymbol,
  parseProviderLocalTimestamp,
  type ExecutionInstrument,
  type ExecutionMarketEvidence,
} from "./execution-market-data.ts";

export type DirectaExecutionEvidenceResult = {
  accepted: boolean;
  observations: ExecutionMarketEvidence[];
  reasons: string[];
  snapshotAgeMs: number | null;
};

function datePartsInZone(timestampMs: number, timeZone: string): { year: number; month: number; day: number } | null {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const values = Object.fromEntries(
      formatter.formatToParts(new Date(timestampMs))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );
    return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
  } catch {
    return null;
  }
}

function localQuoteTimeToIso(
  value: unknown,
  snapshotGeneratedAt: string,
  timeZone = "Europe/Rome",
): string | null {
  const time = String(value || "").trim();
  if (!/^\d{2}:\d{2}:\d{2}$/.test(time)) return null;
  const snapshotMs = Date.parse(snapshotGeneratedAt);
  if (!Number.isFinite(snapshotMs)) return null;

  const candidates = [snapshotMs, snapshotMs - 24 * 60 * 60 * 1000];
  let best: { iso: string; distance: number } | null = null;
  for (const timestamp of candidates) {
    const parts = datePartsInZone(timestamp, timeZone);
    if (!parts) continue;
    const wallClock = `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")} ${time}`;
    const iso = parseProviderLocalTimestamp(wallClock, timeZone);
    if (!iso) continue;
    const distance = Math.abs(snapshotMs - Date.parse(iso));
    if (!best || distance < best.distance) best = { iso, distance };
  }
  return best?.iso || null;
}

function quotePrice(quote: DirectaQuote): number | null {
  const bid = Number(quote.bidPrice);
  const ask = Number(quote.askPrice);
  if (Number.isFinite(bid) && bid > 0 && Number.isFinite(ask) && ask > 0 && ask >= bid) {
    return (bid + ask) / 2;
  }
  const last = Number(quote.lastPrice);
  return Number.isFinite(last) && last > 0 ? last : null;
}

export function buildDirectaExecutionEvidence(
  snapshot: DirectaDatafeedSnapshot | null | undefined,
  instruments: readonly ExecutionInstrument[],
  now = new Date().toISOString(),
  options: { maxSnapshotAgeMs?: number; maxQuoteAgeSeconds?: number; timeZone?: string } = {},
): DirectaExecutionEvidenceResult {
  const reasons: string[] = [];
  const nowMs = Date.parse(now);
  const maxSnapshotAgeMs = Math.max(1_000, Number(options.maxSnapshotAgeMs ?? 15_000));
  const maxQuoteAgeSeconds = Math.max(1, Number(options.maxQuoteAgeSeconds ?? 120));
  const timeZone = String(options.timeZone || "Europe/Rome");

  if (!snapshot || typeof snapshot !== "object") {
    return { accepted: false, observations: [], reasons: ["Directa datafeed snapshot missing"], snapshotAgeMs: null };
  }
  if (!Number.isFinite(nowMs)) reasons.push("evaluation clock invalid");
  if (snapshot.source !== "directa-dapi-datafeed-local") reasons.push("unexpected Directa snapshot source");
  if (snapshot.mode !== "read-only-market-data") reasons.push("Directa snapshot is not read-only market data");
  if (snapshot.host !== "loopback") reasons.push("Directa snapshot is not loopback-bound");
  if (snapshot.writeTradingCommandsAllowed !== false) reasons.push("Directa snapshot does not prove trading writes are blocked");
  if (snapshot.subscriptionCommand !== "SUBPRZALL") reasons.push("unexpected Directa subscription command");

  const generatedMs = Date.parse(String(snapshot.generatedAt || ""));
  const snapshotAgeMs = Number.isFinite(nowMs) && Number.isFinite(generatedMs) ? nowMs - generatedMs : null;
  if (snapshotAgeMs === null || snapshotAgeMs < 0 || snapshotAgeMs > maxSnapshotAgeMs) reasons.push("Directa datafeed snapshot stale or invalid");

  const instrumentBySymbol = new Map(
    instruments.map((instrument) => [normalizeExecutionSymbol(instrument.symbol), instrument]),
  );
  const observations: ExecutionMarketEvidence[] = [];

  if (reasons.length === 0) {
    for (const quote of Array.isArray(snapshot.quotes) ? snapshot.quotes : []) {
      const symbol = normalizeExecutionSymbol(quote?.ticker);
      const instrument = instrumentBySymbol.get(symbol);
      if (!symbol || !instrument) continue;
      const price = quotePrice(quote);
      const observedAt = localQuoteTimeToIso(quote.observedAt, snapshot.generatedAt, timeZone);
      if (!price || !observedAt) continue;
      const eligibility = classifyPaperEligibilityByFreshness(observedAt, nowMs, maxQuoteAgeSeconds);
      const evidence = normalizeExecutionEvidence({
        symbol,
        currency: instrument.currency || "USD",
        assetClass: instrument.assetClass,
        source: eligibility === "PAPER"
          ? "Directa local DAPI read-only fresh market data"
          : "Directa local DAPI read-only stale validation",
        sourceFamily: "directa",
        eligibility,
        price,
        observedAt,
      });
      if (evidence) observations.push(evidence);
    }
  }

  if (observations.length === 0 && reasons.length === 0) reasons.push("Directa snapshot contains no usable requested quotes");
  return {
    accepted: reasons.length === 0,
    observations,
    reasons,
    snapshotAgeMs,
  };
}
