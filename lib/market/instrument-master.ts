export type AssetClass =
  | "equity"
  | "etf"
  | "index"
  | "bond"
  | "commodity"
  | "currency"
  | "crypto"
  | "fund";

export type InstrumentStatus = "active" | "inactive" | "delisted" | "planned";

export type InstrumentIdentifier = {
  type: "ticker" | "isin" | "figi" | "cusip" | "sedol" | "lei" | "crypto-id";
  value: string;
  source: string;
};

export type Instrument = {
  id: string;
  name: string;
  assetClass: AssetClass;
  status: InstrumentStatus;
  ticker?: string;
  exchangeMic?: string;
  exchangeName?: string;
  country: string;
  region: string;
  currency: string;
  sector?: string;
  industry?: string;
  identifiers: InstrumentIdentifier[];
  primarySources: string[];
  lastVerifiedAt: string | null;
};

export type InstrumentMaster = {
  version: number;
  generatedAt: string;
  coverage: "seed" | "partial" | "global";
  instruments: Instrument[];
};

export function normalizeTicker(value: string) {
  return value.trim().toUpperCase();
}

export function validateInstrument(instrument: Instrument): string[] {
  const errors: string[] = [];
  if (!instrument.id.trim()) errors.push("missing id");
  if (!instrument.name.trim()) errors.push("missing name");
  if (!instrument.country.trim()) errors.push("missing country");
  if (!instrument.region.trim()) errors.push("missing region");
  if (!instrument.currency.trim()) errors.push("missing currency");
  if (instrument.primarySources.length === 0) errors.push("missing primary source");
  if (instrument.assetClass === "equity" && !instrument.exchangeMic) {
    errors.push("equity missing exchange MIC");
  }
  return errors;
}

export function summarizeInstrumentMaster(master: InstrumentMaster) {
  const byAssetClass: Record<string, number> = {};
  const byRegion: Record<string, number> = {};
  const byCountry: Record<string, number> = {};

  for (const instrument of master.instruments) {
    byAssetClass[instrument.assetClass] = (byAssetClass[instrument.assetClass] ?? 0) + 1;
    byRegion[instrument.region] = (byRegion[instrument.region] ?? 0) + 1;
    byCountry[instrument.country] = (byCountry[instrument.country] ?? 0) + 1;
  }

  return {
    total: master.instruments.length,
    byAssetClass,
    byRegion,
    byCountry,
  };
}
