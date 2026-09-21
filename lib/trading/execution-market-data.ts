export type ExecutionInstrument = {
  symbol: string;
  currency?: string;
  assetClass?: string;
  exchangeMic?: string;
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
  const suffix = MIC_TO_STOOQ_SUFFIX[String(instrument.exchangeMic || "").toUpperCase()];
  if (!suffix) return null;
  return `${symbol}${suffix}`.toLowerCase();
}

function isUsdNonCryptoCandidate(instrument: ExecutionInstrument): boolean {
  const symbol = normalizeExecutionSymbol(instrument.symbol);
  if (!symbol || !/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) return false;
  const assetClass = String(instrument.assetClass || "").toLowerCase();
  if (assetClass === "crypto" || assetClass === "criptovaluta") return false;
  const mic = String(instrument.exchangeMic || "").toUpperCase();
  if (US_REALTIME_MICS.has(mic)) return true;
  return String(instrument.currency || "").toUpperCase() === "USD";
}

export function isTwelveDataPaperCandidate(instrument: ExecutionInstrument): boolean {
  return isUsdNonCryptoCandidate(instrument);
}

export function isAlphaVantageIntradayCandidate(instrument: ExecutionInstrument): boolean {
  return isUsdNonCryptoCandidate(instrument);
}

export function isTwelveDataUsRealtimeVenue(quote: { mic_code?: unknown; mic?: unknown; exchange?: unknown; currency?: unknown }): boolean {
  const mic = String(quote?.mic_code || quote?.mic || "").trim().toUpperCase();
  if (US_REALTIME_MICS.has(mic)) return true;
  const currency = String(quote?.currency || "").trim().toUpperCase();
  if (currency && currency !== "USD") return false;
  const exchange = String(quote?.exchange || "").trim().toUpperCase().replace(/\s+/g, " ");
  return US_REALTIME_EXCHANGE_LABELS.some((label) => exchange === label || exchange.startsWith(`${label} `));
}

function zonedParts(timestampMs: number, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const values = Object.fromEntries(
    formatter.formatToParts(new Date(timestampMs))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

/**
 * Convert a provider-local wall clock (for example Alpha Vantage US/Eastern)
 * to an ISO UTC timestamp. Invalid/unsupported zones fail closed with null.
 */
export function parseProviderLocalTimestamp(value: unknown, timeZone: unknown): string | null {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  const zone = String(timeZone || "").trim();
  if (!match || !zone) return null;
  const target = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] || 0),
  };
  if (target.month < 1 || target.month > 12 || target.day < 1 || target.day > 31 || target.hour > 23 || target.minute > 59 || target.second > 59) return null;
  const targetAsUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, target.second);
  let guess = targetAsUtc;
  try {
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const actual = zonedParts(guess, zone);
      const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
      guess += targetAsUtc - actualAsUtc;
    }
    const verified = zonedParts(guess, zone);
    if (Object.keys(target).some((key) => verified[key as keyof typeof verified] !== target[key as keyof typeof target])) return null;
    return new Date(guess).toISOString();
  } catch {
    return null;
  }
}

/** PAPER means suitable only for simulation. LIVE is never inferred here. */
export function classifyPaperEligibilityByFreshness(observedAt: unknown, now = Date.now(), maxAgeSeconds = 120): ExecutionDataEligibility {
  const timestamp = Date.parse(String(observedAt || ""));
  const ageSeconds = (Number(now) - timestamp) / 1000;
  return Number.isFinite(timestamp)
    && Number.isFinite(ageSeconds)
    && ageSeconds >= 0
    && ageSeconds <= Math.max(1, Number(maxAgeSeconds) || 120)
    ? "PAPER"
    : "VALIDATION_ONLY";
}

export function normalizeExecutionEvidence(input: Partial<ExecutionMarketEvidence>): ExecutionMarketEvidence | null {
  const symbol = normalizeExecutionSymbol(input.symbol);
  const source = String(input.source || "").trim();
  const sourceFamily = String(input.sourceFamily || inferExecutionSourceFamily(source)).trim().toLowerCase();
  const currency = String(input.currency || "").trim().toUpperCase();
  const price = Number(input.price);
  const observedAtMs = Date.parse(String(input.observedAt || ""));
  const eligibility = (["VALIDATION_ONLY", "PAPER", "LIVE"] as const).includes(input.eligibility as ExecutionDataEligibility)
    ? input.eligibility as ExecutionDataEligibility
    : "VALIDATION_ONLY";
  if (!symbol || !source || !sourceFamily || !currency || !Number.isFinite(price) || price <= 0 || !Number.isFinite(observedAtMs)) {
    return null;
  }
  return {
    symbol,
    currency,
    assetClass: input.assetClass ? String(input.assetClass) : undefined,
    source,
    sourceFamily,
    eligibility,
    price,
    observedAt: new Date(observedAtMs).toISOString(),
  };
}

export function deduplicateExecutionEvidence(evidence: readonly ExecutionMarketEvidence[]): ExecutionMarketEvidence[] {
  const byKey = new Map<string, ExecutionMarketEvidence>();
  for (const raw of evidence) {
    const item = normalizeExecutionEvidence(raw);
    if (!item) continue;
    const key = `${item.symbol}:${item.currency}:${item.sourceFamily}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      continue;
    }
    const itemTime = Date.parse(item.observedAt);
    const existingTime = Date.parse(existing.observedAt);
    const itemRank = ELIGIBILITY_RANK[item.eligibility];
    const existingRank = ELIGIBILITY_RANK[existing.eligibility];
    if (itemRank > existingRank || (itemRank === existingRank && itemTime > existingTime)) byKey.set(key, item);
  }
  return [...byKey.values()].sort((a, b) => a.symbol.localeCompare(b.symbol) || a.sourceFamily.localeCompare(b.sourceFamily));
}
