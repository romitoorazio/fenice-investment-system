export type DcfStatus = "disponibile" | "non confrontabile" | "non applicabile" | "dati insufficienti";

export type DcfScenario = {
  id: "prudente" | "base" | "espansivo";
  label: string;
  revenueGrowthStartPercent: number;
  terminalGrowthPercent: number;
  discountRatePercent: number;
  forecastYears: number;
  enterpriseValue?: number;
  equityValue?: number;
  fairValuePerShare?: number;
  upsidePercent?: number;
};

export type DcfCompany = {
  symbol: string;
  name: string;
  sector: string;
  businessStage?: "maturo" | "crescita" | "pre-commerciale";
  status: DcfStatus;
  currency?: string;
  observedAt: string;
  source: string;
  currentPrice?: number;
  freeCashFlow?: number;
  cash?: number;
  debt?: number;
  dilutedShares?: number;
  confidence: number;
  score: number;
  fairValueLow?: number;
  fairValueBase?: number;
  fairValueHigh?: number;
  upsideBasePercent?: number;
  scenarios: DcfScenario[];
  rationale: string[];
  warnings: string[];
};

export type DcfReport = {
  version: number;
  generatedAt: string;
  mode: "live" | "partial" | "bootstrap";
  source: {
    name: string;
    state: "operativo" | "parziale" | "errore";
    detail: string;
  };
  companyCount: number;
  availableCount: number;
  coveragePercent: number;
  methodology: string[];
  companies: DcfCompany[];
  warnings: string[];
};
