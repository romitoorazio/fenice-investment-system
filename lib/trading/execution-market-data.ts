export type ExecutionInstrument = {
  symbol: string;
  currency?: string;
  assetClass?: string;
  exchangeMic?: string;
  isin?: string;
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
};

const MIC_TO_YAHOO_SUFFIX: Readonly<Record<string, string>> = {
  XMIL: ".MI",
  XETR: ".DE",
  XPAR: ".PA",
  XLON: ".L",
  XAMS: ".AS",
  XBRU: ".BR",
  XMAD: ".MC",
  XSWX: ".SW",
  XWBO: ".VI",
  XHEL: ".HE",
  XSTO: ".ST",
  XCSE: ".CO",
  XOSL: ".OL",
  XWAR: ".WA",
  XIST: ".IS",
  XTKS: ".T",
  XHKG: ".HK",
  XASX: ".AX",
  XTSE: ".TO",
  XNSE: ".NS",
  BVMF: ".SA",
  XSHG: ".SS",
};

const MIC_TO_STOOQ_SUFFIX: Readonly<Record<string, string>> = {
  XNAS: ".US",
  XNYS: ".US",
  ARCX: ".US",
  BATS: ".US",
  XMIL: ".IT",
  XETR: ".DE",
  XPAR: ".FR",
  XLON: ".UK",
  XAMS: ".NL",
  XBRU: ".BE",
  XMAD: ".ES",
  XSWX: ".CH",
};

const US_REALTIME_MICS = new Set(["XNAS", "XNYS", "ARCX", "BATS", "IEXG"]);
const US_REALTIME_EXCHANGE_LABELS = ["NASDAQ", "NYSE", "NYSE ARCA", "NYSE AMERICAN", "AMEX", "CBOE", "BATS", "IEX"];

const ELIGIBILITY_RANK: Readonly<Record<ExecutionDataEligibility, number>> = {
  VALIDATION_ONLY: 0,
  PAPER: 1,
  LIVE: 2,
};

export function normalizeExecutionSymbol(value: unknown): string {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9._-]/g, "");
}

export function inferExecutionSourceFamily(source: unknown): string {
  const normalized = String(source || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("twelve data")) return "twelve-data";
  if (normalized.includes("alpha vantage")) return "alpha-vantage";
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
  if (assetClass === "crypto" || assetClass === "criptovaluta") {
    return symbol.endsWith("-USD") ? symbol : `${symbol}-USD`;
  }
  if (/[.=^-]/.test(symbol)) return symbol;
  const suffix = MIC_TO_YAHOO_SUFFIX[String(instrument.exchangeMic || "").toUpperCase()] || "";
  return `${symbol}${suffix}`;
}

export function stooqSymbolForInstrument(instrument: ExecutionInstrument): string | null {
  const symbol = normalizeExecutionSymbol(instrument.symbol);
  if (!symbol) return null;
  const suffix = MIC_TO_STOOQ_SUFFIX[String(instrument.exchangeMic || "").toUpperCase()] || "";
  if (!suffix) return null;
  return `${symbol}${suffix}`.toLowerCase();
}

export function isTwelveDataPaperCandidate(instrument: ExecutionInstrument): boolean {
  const assetClass = String(instrument.assetClass || "").toLowerCase();
  const mic = String(instrument.exchangeMic || "").toUpperCase();
  return /equity|stock|etf|azione|azion/i.test(assetClass) && US_REALTIME_MICS.has(mic);
}

export function isAlphaVantageIntradayCandidate(instrument: ExecutionInstrument): boolean {
  const assetClass = String(instrument.assetClass || "").toLowerCase();
  const mic = String(instrument.exchangeMic || "").toUpperCase();
  return /equity|stock|etf|azione|azion/i.test(assetClass) && US_REALTIME_MICS.has(mic);
}

export function isTwelveDataUsRealtimeVenue(value: unknown): boolean {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const exchange = String(data.exchange || data.mic_code || data.mic || "").trim().toUpperCase();
  return US_REALTIME_MICS.has(exchange) || US_REALTIME_EXCHANGE_LABELS.includes(exchange);
}

export function parseProviderLocalTimestamp(value: unknown, timeZone: unknown): string | null {
  const raw = String(value || "").trim();
  const zone = String(timeZone || "").trim();
  if (!raw) return null;
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const utcGuess = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  if (!zone) return new Date(utcGuess).toISOString();
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts = Object.fromEntries(formatter.formatToParts(new Date(utcGuess)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    const zoneAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const offsetMs = zoneAsUtc - utcGuess;
    return new Date(utcGuess - offsetMs).toISOString();
  } catch {
    return null;
  }
}

export function classifyPaperEligibilityByFreshness(
  observedAt: string,
  nowMs = Date.now(),
  maxAgeSeconds = 120,
): ExecutionDataEligibility {
  const observedMs = Date.parse(String(observedAt || ""));
  const ageSeconds = (Number(nowMs) - observedMs) / 1000;
  return Number.isFinite(observedMs)
    && Number.isFinite(ageSeconds)
    && ageSeconds >= 0
    && ageSeconds <= maxAgeSeconds
    ? "PAPER"
    : "VALIDATION_ONLY";
}

export function normalizeExecutionEvidence(value: Partial<ExecutionMarketEvidence>): ExecutionMarketEvidence | null {
  const symbol = normalizeExecutionSymbol(value.symbol);
  const source = String(value.source || "").trim();
  const sourceFamily = String(value.sourceFamily || inferExecutionSourceFamily(source)).trim().toLowerCase();
  const currency = String(value.currency || "").trim().toUpperCase();
  const price = Number(value.price);
  const observedAt = String(value.observedAt || "").trim();
  const eligibility: ExecutionDataEligibility = value.eligibility === "LIVE" || value.eligibility === "PAPER"
    ? value.eligibility
    : "VALIDATION_ONLY";
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
  };
}

export function deduplicateExecutionEvidence(values: readonly ExecutionMarketEvidence[]): ExecutionMarketEvidence[] {
  const map = new Map<string, ExecutionMarketEvidence>();
  for (const item of values) {
    const normalized = normalizeExecutionEvidence(item);
    if (!normalized) continue;
    const key = `${normalized.symbol}:${normalized.sourceFamily}`;
    const previous = map.get(key);
    if (!previous
      || ELIGIBILITY_RANK[normalized.eligibility] > ELIGIBILITY_RANK[previous.eligibility]
      || (ELIGIBILITY_RANK[normalized.eligibility] === ELIGIBILITY_RANK[previous.eligibility]
        && Date.parse(normalized.observedAt) > Date.parse(previous.observedAt))) {
      map.set(key, normalized);
    }
  }
  return [...map.values()].sort((a, b) => a.symbol.localeCompare(b.symbol) || a.sourceFamily.localeCompare(b.sourceFamily));
}
