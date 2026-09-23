import { classifyPaperEvidence } from "./paper-evidence-policy.ts";

export type ExecutionInstrument = {
  symbol: string;
  currency?: string;
  assetClass?: string;
  exchangeMic?: string;
  isin?: string;
  country?: string;
};

export type ExecutionDataEligibility = "VALIDATION_ONLY" | "PAPER" | "LIVE";

export type ExecutionMarketEvidence = {
  symbol: string;
  currency: string;
  assetClass?: string;
  source: string;
  sourceFamily: string;
  eligibility: ExecutionDataEligibility;
  price: number;
  observedAt: string;
  provenanceVerified?: boolean;
  provenanceMethod?: string;
};

const MIC_TO_YAHOO_SUFFIX: Readonly<Record<string, string>> = {
  XMIL: ".MI", XETR: ".DE", XPAR: ".PA", XLON: ".L", XAMS: ".AS", XBRU: ".BR",
  XMAD: ".MC", XSWX: ".SW", XWBO: ".VI", XHEL: ".HE", XSTO: ".ST", XCSE: ".CO",
  XOSL: ".OL", XWAR: ".WA", XIST: ".IS", XTKS: ".T", XHKG: ".HK", XASX: ".AX",
  XTSE: ".TO", XNSE: ".NS", BVMF: ".SA", XSHG: ".SS",
};

const MIC_TO_STOOQ_SUFFIX: Readonly<Record<string, string>> = {
  XNAS: ".US", XNYS: ".US", ARCX: ".US", BATS: ".US", XMIL: ".IT", XETR: ".DE",
  XPAR: ".FR", XLON: ".UK", XAMS: ".NL", XBRU: ".BE", XMAD: ".ES", XSWX: ".CH",
};

const US_REALTIME_MICS = new Set(["XNAS", "XNYS", "ARCX", "BATS", "IEXG"]);
const US_REALTIME_EXCHANGE_LABELS = new Set([
  "NASDAQ", "NASDAQ GLOBAL SELECT MARKET", "NASDAQ GLOBAL MARKET", "NASDAQ CAPITAL MARKET",
  "NYSE", "NEW YORK STOCK EXCHANGE", "NYSE ARCA", "NYSE AMERICAN", "AMEX", "CBOE", "BATS", "IEX",
]);
const ZERO_COST_PAPER_PROBE_PRIORITY = [
  "SPY", "QQQ", "AAPL", "MSFT", "NVDA", "IWM", "META", "GOOGL", "AMZN",
] as const;
const ZERO_COST_PAPER_PROBE_PRIORITY_INDEX = new Map<string, number>(
  ZERO_COST_PAPER_PROBE_PRIORITY.map((symbol, index) => [symbol, index]),
);

const ELIGIBILITY_RANK: Readonly<Record<ExecutionDataEligibility, number>> = { VALIDATION_ONLY: 0, PAPER: 1, LIVE: 2 };

function isListedSecurity(assetClass: unknown): boolean {
  return /equity|stock|etf|azione|azion/i.test(String(assetClass || ""));
}

export function normalizeExecutionSymbol(value: unknown): string {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9._-]/g, "");
}

/**
 * Reorders only a fallback discovery universe, never a real queued PAPER order.
 * The priority symbols are deliberately liquid US securities that are broadly
 * supported by both zero-cost PAPER evidence routes. Unknown symbols retain
 * stable input order after the preferred group.
 */
export function prioritizeZeroCostPaperProbeCandidates<T extends ExecutionInstrument>(instruments: readonly T[]): T[] {
  return instruments
    .map((instrument, index) => ({ instrument, index }))
    .sort((left, right) => {
      const leftSymbol = normalizeExecutionSymbol(left.instrument.symbol);
      const rightSymbol = normalizeExecutionSymbol(right.instrument.symbol);
      const leftPriority = ZERO_COST_PAPER_PROBE_PRIORITY_INDEX.get(leftSymbol);
      const rightPriority = ZERO_COST_PAPER_PROBE_PRIORITY_INDEX.get(rightSymbol);
      const leftRank = leftPriority ?? Number.MAX_SAFE_INTEGER;
      const rightRank = rightPriority ?? Number.MAX_SAFE_INTEGER;
      if (leftRank !== rightRank) return leftRank - rightRank;

      const leftUs = String(left.instrument.country || "").trim().toUpperCase() === "US" ? 0 : 1;
      const rightUs = String(right.instrument.country || "").trim().toUpperCase() === "US" ? 0 : 1;
      if (leftUs !== rightUs) return leftUs - rightUs;
      return left.index - right.index;
    })
    .map(({ instrument }) => instrument);
}

export function inferExecutionSourceFamily(source: unknown): string {
  const normalized = String(source || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("twelve data")) return "twelve-data";
  if (normalized.includes("alpha vantage")) return "alpha-vantage";
  if (normalized.includes("alpaca")) return "alpaca";
  if (normalized.includes("yahoo")) return "yahoo";
  if (normalized.includes("stooq")) return "stooq";
  if (normalized.includes("coinbase")) return "coinbase";
  if (normalized.includes("kraken")) return "kraken";
  if (normalized.includes("directa")) return "directa";
  return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
}

export function yahooSymbolForInstrument(instrument: ExecutionInstrument): string {
  const symbol = normalizeExecutionSymbol(instrument.symbol);
  if (!symbol) return "";
  const assetClass = String(instrument.assetClass || "").toLowerCase();
  if (assetClass === "crypto" || assetClass === "criptovaluta") return symbol.endsWith("-USD") ? symbol : `${symbol}-USD`;
  if (/[.=^-]/.test(symbol)) return symbol;
  const mic = String(instrument.exchangeMic || "").toUpperCase();
  if (isListedSecurity(assetClass) && !mic) return "";
  if (US_REALTIME_MICS.has(mic)) return symbol;
  const suffix = MIC_TO_YAHOO_SUFFIX[mic] || "";
  if (isListedSecurity(assetClass) && !suffix) return "";
  return `${symbol}${suffix}`;
}

export function stooqSymbolForInstrument(instrument: ExecutionInstrument): string | null {
  const symbol = normalizeExecutionSymbol(instrument.symbol);
  if (!symbol) return null;
  const suffix = MIC_TO_STOOQ_SUFFIX[String(instrument.exchangeMic || "").toUpperCase()] || "";
  return suffix ? `${symbol}${suffix}`.toLowerCase() : null;
}

export function isTwelveDataPaperCandidate(instrument: ExecutionInstrument): boolean {
  return isListedSecurity(instrument.assetClass) && US_REALTIME_MICS.has(String(instrument.exchangeMic || "").toUpperCase());
}

export function isAlphaVantageIntradayCandidate(instrument: ExecutionInstrument): boolean {
  return isListedSecurity(instrument.assetClass) && US_REALTIME_MICS.has(String(instrument.exchangeMic || "").toUpperCase());
}

export function isAlpacaPaperCandidate(instrument: ExecutionInstrument): boolean {
  return isListedSecurity(instrument.assetClass) && US_REALTIME_MICS.has(String(instrument.exchangeMic || "").toUpperCase());
}

export function isTwelveDataUsRealtimeVenue(value: unknown): boolean {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const mic = String(data.mic_code || data.mic || "").trim().toUpperCase();
  const exchange = String(data.exchange || "").trim().toUpperCase();
  return US_REALTIME_MICS.has(mic) || US_REALTIME_EXCHANGE_LABELS.has(exchange);
}

export function parseProviderLocalTimestamp(value: unknown, timeZone: unknown): string | null {
  const raw = String(value || "").trim();
  const zone = String(timeZone || "").trim();
  if (!raw) return null;
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const utcGuess = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  if (!zone) return new Date(utcGuess).toISOString();
  try {
    const formatter = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const parts = Object.fromEntries(formatter.formatToParts(new Date(utcGuess)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    const zoneAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    return new Date(utcGuess - (zoneAsUtc - utcGuess)).toISOString();
  } catch { return null; }
}

/** Freshness is necessary but never sufficient for PAPER certification. */
export function isExecutionObservationFresh(observedAt: string, nowMs = Date.now(), maxAgeSeconds = 120): boolean {
  const observedMs = Date.parse(String(observedAt || ""));
  const ageSeconds = (Number(nowMs) - observedMs) / 1000;
  return Number.isFinite(observedMs)
    && Number.isFinite(ageSeconds)
    && ageSeconds >= 0
    && ageSeconds <= maxAgeSeconds;
}

/**
 * @deprecated Freshness does not confer PAPER eligibility.
 * Use isExecutionObservationFresh for timing checks and classifyExecutionPaperEligibility for PAPER certification.
 */
export function classifyPaperEligibilityByFreshness(observedAt: string, nowMs = Date.now(), maxAgeSeconds = 120): ExecutionDataEligibility {
  return isExecutionObservationFresh(observedAt, nowMs, maxAgeSeconds) ? "PAPER" : "VALIDATION_ONLY";
}

export function classifyExecutionPaperEligibility(input: {
  source?: string;
  sourceFamily?: string;
  observedAt?: string;
  realtime?: boolean;
  entitlement?: string;
  provenanceVerified?: boolean;
}, nowMs = Date.now(), maxAgeSeconds = 120): ExecutionDataEligibility {
  if (!isExecutionObservationFresh(String(input.observedAt || ""), nowMs, maxAgeSeconds)) return "VALIDATION_ONLY";
  return classifyPaperEvidence(input).eligibility;
}

export function normalizeExecutionEvidence(value: Partial<ExecutionMarketEvidence>): ExecutionMarketEvidence | null {
  const symbol = normalizeExecutionSymbol(value.symbol);
  const source = String(value.source || "").trim();
  const sourceFamily = String(value.sourceFamily || inferExecutionSourceFamily(source)).trim().toLowerCase();
  const currency = String(value.currency || "").trim().toUpperCase();
  const price = Number(value.price);
  const observedAt = String(value.observedAt || "").trim();
  const eligibility: ExecutionDataEligibility = value.eligibility === "LIVE" || value.eligibility === "PAPER" ? value.eligibility : "VALIDATION_ONLY";
  if (!symbol || !source || !sourceFamily || !currency || !Number.isFinite(price) || price <= 0 || !Number.isFinite(Date.parse(observedAt))) return null;
  return {
    symbol,
    currency,
    assetClass: value.assetClass,
    source,
    sourceFamily,
    eligibility,
    price,
    observedAt: new Date(Date.parse(observedAt)).toISOString(),
    provenanceVerified: value.provenanceVerified === true,
    provenanceMethod: String(value.provenanceMethod || "").trim() || undefined,
  };
}

export function deduplicateExecutionEvidence(values: readonly ExecutionMarketEvidence[]): ExecutionMarketEvidence[] {
  const map = new Map<string, ExecutionMarketEvidence>();
  for (const item of values) {
    const normalized = normalizeExecutionEvidence(item);
    if (!normalized) continue;
    const key = `${normalized.symbol}:${normalized.sourceFamily}`;
    const previous = map.get(key);
    if (!previous || ELIGIBILITY_RANK[normalized.eligibility] > ELIGIBILITY_RANK[previous.eligibility] || (ELIGIBILITY_RANK[normalized.eligibility] === ELIGIBILITY_RANK[previous.eligibility] && Date.parse(normalized.observedAt) > Date.parse(previous.observedAt))) map.set(key, normalized);
  }
  return [...map.values()].sort((a, b) => a.symbol.localeCompare(b.symbol) || a.sourceFamily.localeCompare(b.sourceFamily));
}
