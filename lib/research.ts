export type ResearchDecision = "PRIORITÀ" | "APPROFONDISCI" | "OSSERVA" | "SCARTA" | "DATI INSUFFICIENTI";

export type ResearchScore = {
  overall: number;
  quality: number;
  growth: number;
  profitability: number;
  balanceSheet: number;
  dataCompleteness: number;
};

export type ResearchFinancials = {
  currency?: string;
  fiscalYear?: number;
  revenue?: number;
  revenueGrowth3YPercent?: number;
  netIncome?: number;
  operatingIncome?: number;
  operatingMarginPercent?: number;
  netMarginPercent?: number;
  operatingCashFlow?: number;
  capitalExpenditure?: number;
  freeCashFlow?: number;
  freeCashFlowMarginPercent?: number;
  cash?: number;
  debt?: number;
  equity?: number;
  debtToEquity?: number;
  dilutedEps?: number;
  price?: number;
  priceToEarnings?: number;
};

export type ResearchFiling = {
  form?: string;
  filedAt?: string;
  periodEnd?: string;
  url?: string;
};

export type FundamentalCompany = {
  ticker: string;
  name: string;
  cik: string;
  sector: string;
  status: "operativo" | "parziale" | "errore";
  observedAt: string;
  source: string;
  filing?: ResearchFiling;
  financials: ResearchFinancials;
  scores: ResearchScore;
  decision: ResearchDecision;
  thesis: string[];
  risks: string[];
  warnings: string[];
};

export type FundamentalResearchReport = {
  version: number;
  generatedAt: string;
  mode: "live" | "partial" | "bootstrap";
  source: {
    name: string;
    state: "operativo" | "parziale" | "errore";
    detail: string;
    lastSuccessAt?: string;
  };
  universeSize: number;
  companyCount: number;
  coveragePercent: number;
  averageScore: number;
  methodology: string[];
  companies: FundamentalCompany[];
  warnings: string[];
};
