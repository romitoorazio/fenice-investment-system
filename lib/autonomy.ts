export type AutonomousVerdict =
  | "ATTENDERE"
  | "VALUTARE"
  | "PROTEGGERE CAPITALE";

export type ProviderState = "operativo" | "parziale" | "non configurato" | "errore";

export type ProviderStatus = {
  id: string;
  name: string;
  state: ProviderState;
  coverage: string[];
  detail: string;
  lastSuccessAt?: string;
};

export type MarketReading = {
  symbol: string;
  name: string;
  assetClass: string;
  market?: string;
  price?: number;
  currency?: string;
  changePercent?: number;
  score: number;
  risk: number;
  source: string;
  observedAt?: string;
};

export type DiscoverySignal = {
  id: string;
  name: string;
  category: "IPO" | "SEC" | "CRYPTO" | "PRIVATE" | "BIOTECH" | "NEWS";
  signal: string;
  score: number;
  risk: number;
  date?: string;
  source: string;
  url?: string;
};

export type MacroReading = {
  id: string;
  label: string;
  value?: number;
  date?: string;
  unit: string;
  source: string;
};

export type AutonomySnapshot = {
  version: number;
  generatedAt: string | null;
  mode: "bootstrap" | "live" | "partial";
  headline: string;
  pulse: {
    verdict: AutonomousVerdict;
    opportunity: number;
    risk: number;
    confidence: number;
    marketMomentum: number;
    macroHealth: number;
    discoveryHeat: number;
  };
  providers: ProviderStatus[];
  markets: MarketReading[];
  macro: MacroReading[];
  discoveries: DiscoverySignal[];
  warnings: string[];
  executionPolicy: {
    autonomousAnalysis: true;
    autonomousTrading: false;
    humanConfirmationRequired: true;
  };
};

export const autonomousCoverage = [
  "Azioni globali e nuove quotazioni",
  "ETF e fondi quotati",
  "Indici azionari e volatilità",
  "Obbligazioni, rendimenti e curve dei tassi",
  "Forex e valute",
  "Materie prime ed energia",
  "Criptovalute e token emergenti",
  "Opzioni e derivati dove disponibili",
  "IPO, spin-off, fusioni e delisting",
  "Depositi SEC S-1, F-1, 8-A e 10-12B",
  "Indicatori macroeconomici e banche centrali",
  "Notizie e rischio geopolitico globale",
  "Biotech: studi clinici e segnali FDA",
  "Società private e pre-IPO da notizie e round di finanziamento",
  "Temi emergenti: AI, robotica, energia, spazio, agritech e medicina",
] as const;

export const autonomousPrinciples = [
  "Il motore cerca continuamente nuovi strumenti e segnali, ma assegna sempre una qualità e un rischio.",
  "Una nuova società o moneta non viene considerata investibile solo perché è nuova o cresce velocemente.",
  "I dati provenienti da una sola fonte non possono generare un segnale forte.",
  "Il software non possiede credenziali di broker e non può inviare ordini.",
] as const;
