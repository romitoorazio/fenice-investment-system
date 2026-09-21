export type ExecutionInstrument = {
  symbol: string;
  currency?: string;
  assetClass?: string;
  exchangeMic?: string;
};

export type ExecutionMarketEvidence = {
  symbol: string;
  currency: string;
  assetClass?: string;
  source: string;
  price: number;
  observedAt: string;
};

const MIC_TO_YAHOO_SUFFIX: Readonly<Record<string, string>> = {
  XMIL: ".MI",
  XETR: ".DE",
  XPAR: ".PA",
  XTKS: ".T",
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
};

export function normalizeExecutionSymbol(value: unknown): string {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9._-]/g, "");
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
  const currency = String(input.currency || "").trim().toUpperCase();
  const price = Number(input.price);
  const observedAtMs = Date.parse(String(input.observedAt || ""));
  if (!symbol || !source || !currency || !Number.isFinite(price) || price <= 0 || !Number.isFinite(observedAtMs)) {
    return null;
  }
  return {
    symbol,
    currency,
    assetClass: input.assetClass ? String(input.assetClass) : undefined,
    source,
    price,
    observedAt: new Date(observedAtMs).toISOString(),
  };
}

export function deduplicateExecutionEvidence(evidence: readonly ExecutionMarketEvidence[]): ExecutionMarketEvidence[] {
  const byKey = new Map<string, ExecutionMarketEvidence>();
  for (const raw of evidence) {
    const item = normalizeExecutionEvidence(raw);
    if (!item) continue;
    const key = `${item.symbol}:${item.currency}:${item.source.toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing || Date.parse(item.observedAt) > Date.parse(existing.observedAt)) byKey.set(key, item);
  }
  return [...byKey.values()].sort((a, b) => a.symbol.localeCompare(b.symbol) || a.source.localeCompare(b.source));
}
