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
