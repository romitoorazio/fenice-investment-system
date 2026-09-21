import type { DirectaDatafeedSnapshot, DirectaQuote } from "../brokers/directa-datafeed.ts";
import { classifyDirectaDatafeedError } from "../brokers/directa-entitlement.ts";
import {
  directaRealtimeEntitlementReason,
  parseDirectaRealtimeMarketMics,
  readDirectaRealtimeEntitlementConfig,
} from "./directa-realtime-entitlements.ts";
import {
  classifyPaperEligibilityByFreshness,
  normalizeExecutionEvidence,
  normalizeExecutionSymbol,
  parseProviderLocalTimestamp,
  type ExecutionInstrument,
  type ExecutionMarketEvidence,
} from "./execution-market-data.ts";
import { requireValidIsin } from "./instrument-identity.ts";

export type DirectaExecutionEvidenceResult = {
  accepted: boolean;
  paperEligibilityAllowed: boolean;
  realtimeEntitlementConfirmed: boolean;
  confirmedRealtimeMarketMics: string[];
  observations: ExecutionMarketEvidence[];
  reasons: string[];
  warnings: string[];
  snapshotAgeMs: number | null;
  identityVerifiedQuotes: number;
  identityRejectedQuotes: number;
  executableBookVerifiedQuotes: number;
  executableBookRejectedQuotes: number;
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

function quoteMarketView(quote: DirectaQuote): { price: number | null; executableBook: boolean } {
  const bid = Number(quote.bidPrice);
  const ask = Number(quote.askPrice);
  const bidQuantity = Number(quote.bidQuantity);
  const askQuantity = Number(quote.askQuantity);
  const executableBook = Number.isFinite(bid)
    && bid > 0
    && Number.isFinite(ask)
    && ask > 0
    && ask >= bid
    && Number.isFinite(bidQuantity)
    && bidQuantity > 0
    && Number.isFinite(askQuantity)
    && askQuantity > 0;
  if (executableBook) return { price: (bid + ask) / 2, executableBook: true };
  const last = Number(quote.lastPrice);
  return {
    price: Number.isFinite(last) && last > 0 ? last : null,
    executableBook: false,
  };
}

export function buildDirectaExecutionEvidence(
  snapshot: DirectaDatafeedSnapshot | null | undefined,
  instruments: readonly ExecutionInstrument[],
  now = new Date().toISOString(),
  options: {
    maxSnapshotAgeMs?: number;
    maxQuoteAgeSeconds?: number;
    timeZone?: string;
    realtimeEntitlementConfirmed?: boolean;
    confirmedRealtimeMarketMics?: readonly string[];
  } = {},
): DirectaExecutionEvidenceResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const nowMs = Date.parse(now);
  const maxSnapshotAgeMs = Math.max(1_000, Number(options.maxSnapshotAgeMs ?? 15_000));
  const maxQuoteAgeSeconds = Math.max(1, Number(options.maxQuoteAgeSeconds ?? 120));
  const timeZone = String(options.timeZone || "Europe/Rome");
  const environmentEntitlement = readDirectaRealtimeEntitlementConfig();
  const realtimeEntitlementConfirmed = options.realtimeEntitlementConfirmed === undefined
    ? environmentEntitlement.apiRealtimeHistoricalConfirmed
    : options.realtimeEntitlementConfirmed === true;
  const confirmedRealtimeMarketMics = options.confirmedRealtimeMarketMics === undefined
    ? environmentEntitlement.confirmedMarketMics
    : parseDirectaRealtimeMarketMics(options.confirmedRealtimeMarketMics);
  const entitlementConfig = {
    apiRealtimeHistoricalConfirmed: realtimeEntitlementConfirmed,
    confirmedMarketMics: confirmedRealtimeMarketMics,
  };

  if (!snapshot || typeof snapshot !== "object") {
    return {
      accepted: false,
      paperEligibilityAllowed: false,
      realtimeEntitlementConfirmed,
      confirmedRealtimeMarketMics,
      observations: [],
      reasons: ["Directa datafeed snapshot missing"],
      warnings,
      snapshotAgeMs: null,
      identityVerifiedQuotes: 0,
      identityRejectedQuotes: 0,
      executableBookVerifiedQuotes: 0,
      executableBookRejectedQuotes: 0,
    };
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

  let entitlementErrorObserved = false;
  for (const error of Array.isArray(snapshot.errors) ? snapshot.errors : []) {
    const decision = classifyDirectaDatafeedError(error?.code);
    if (decision.state === "OPTIONAL_NOT_ENTITLED") {
      entitlementErrorObserved = true;
      warnings.push(`Directa API datafeed entitlement missing for ${String(error?.ticker || "UNKNOWN")}`);
    } else if (decision.state === "UNKNOWN_ERROR") {
      reasons.push(`Directa datafeed returned unclassified error ${String(error?.code ?? "UNKNOWN")}`);
    }
  }

  if (!realtimeEntitlementConfirmed) {
    warnings.push("Directa realtime/historical API service is not explicitly confirmed; evidence is validation-only");
  }
  if (confirmedRealtimeMarketMics.length === 0) {
    warnings.push("No Directa realtime market MIC is explicitly confirmed; evidence is validation-only");
  }
  if (entitlementErrorObserved) {
    warnings.push("Directa entitlement error observed; evidence cannot satisfy PAPER execution quorum");
  }

  const accepted = reasons.length === 0;
  const paperEligibilityAllowed = accepted
    && realtimeEntitlementConfirmed
    && confirmedRealtimeMarketMics.length > 0
    && !entitlementErrorObserved;
  const instrumentBySymbol = new Map(
    instruments.map((instrument) => [normalizeExecutionSymbol(instrument.symbol), instrument]),
  );
  const observations: ExecutionMarketEvidence[] = [];
  const marketWarnings = new Set<string>();
  const identityWarnings = new Set<string>();
  const bookWarnings = new Set<string>();
  let identityVerifiedQuotes = 0;
  let identityRejectedQuotes = 0;
  let executableBookVerifiedQuotes = 0;
  let executableBookRejectedQuotes = 0;

  if (accepted) {
    for (const quote of Array.isArray(snapshot.quotes) ? snapshot.quotes : []) {
      const symbol = normalizeExecutionSymbol(quote?.ticker);
      const instrument = instrumentBySymbol.get(symbol);
      if (!symbol || !instrument) continue;
      const marketView = quoteMarketView(quote);
      const observedAt = localQuoteTimeToIso(quote.observedAt, snapshot.generatedAt, timeZone);
      if (!marketView.price || !observedAt) continue;

      if (marketView.executableBook) {
        executableBookVerifiedQuotes += 1;
      } else {
        executableBookRejectedQuotes += 1;
        bookWarnings.add(`Directa executable top-of-book missing or invalid for ${symbol}; last-price data is validation-only`);
      }

      const expectedIsin = requireValidIsin(instrument.isin);
      const observedIsin = requireValidIsin(quote.isin);
      const identityVerified = Boolean(expectedIsin && observedIsin && expectedIsin === observedIsin);
      if (identityVerified) {
        identityVerifiedQuotes += 1;
      } else {
        identityRejectedQuotes += 1;
        if (!expectedIsin) {
          identityWarnings.add(`Directa identity cannot be certified for ${symbol}: instrument-master ISIN missing or checksum-invalid`);
        } else if (!observedIsin) {
          identityWarnings.add(`Directa identity cannot be certified for ${symbol}: DAPI ANAG ISIN missing or checksum-invalid`);
        } else {
          identityWarnings.add(`Directa identity mismatch for ${symbol}: expected ${expectedIsin}, observed ${observedIsin}`);
        }
      }

      const freshnessEligibility = classifyPaperEligibilityByFreshness(observedAt, nowMs, maxQuoteAgeSeconds);
      const marketEntitlementReason = directaRealtimeEntitlementReason(instrument, entitlementConfig);
      if (marketEntitlementReason) marketWarnings.add(marketEntitlementReason);
      const eligibility = paperEligibilityAllowed
        && identityVerified
        && marketView.executableBook
        && !marketEntitlementReason
        && freshnessEligibility === "PAPER"
        ? "PAPER"
        : "VALIDATION_ONLY";
      const evidence = normalizeExecutionEvidence({
        symbol,
        currency: instrument.currency || "USD",
        assetClass: instrument.assetClass,
        source: eligibility === "PAPER"
          ? `Directa local DAPI checksum-ISIN-verified entitled realtime executable top-of-book (${String(instrument.exchangeMic || "UNKNOWN")})`
          : "Directa local DAPI read-only validation data",
        sourceFamily: "directa",
        eligibility,
        price: marketView.price,
        observedAt,
      });
      if (evidence) observations.push(evidence);
    }
  }

  warnings.push(...marketWarnings, ...identityWarnings, ...bookWarnings);
  if (observations.length === 0 && accepted) reasons.push("Directa snapshot contains no usable requested quotes");
  return {
    accepted: reasons.length === 0,
    paperEligibilityAllowed,
    realtimeEntitlementConfirmed,
    confirmedRealtimeMarketMics,
    observations,
    reasons,
    warnings,
    snapshotAgeMs,
    identityVerifiedQuotes,
    identityRejectedQuotes,
    executableBookVerifiedQuotes,
    executableBookRejectedQuotes,
  };
}
