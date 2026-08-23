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
  updatedAt?: string;
  classification?: string;
  region?: string;
  sector?: string;
  themes?: string[];
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
  dataQuality?: number;
  freshness?: {
    generatedAt?: string | null;
    checkedAt?: string;
    freshReadings?: number;
    totalReadings?: number;
    status?: "near-real-time" | "aggiornato" | "stale";
  };
  reliability?: Record<string, unknown>;
  executionPolicy: {
    autonomousAnalysis: true;
    autonomousTrading: false;
    humanConfirmationRequired: true;
  };
};

export const autonomousCoverage = [
  "Azioni globali: USA, Europa, Asia, mercati emergenti e nuove quotazioni",
  "ETF regionali, settoriali, obbligazionari e tematici",
  "Indici azionari e volatilità",
  "Obbligazioni, rendimenti, credito e curve dei tassi",
  "Forex e valute",
  "Materie prime: energia, metalli e agricoltura",
  "Criptovalute e token emergenti",
  "Opzioni e derivati dove disponibili, solo come segnali di mercato",
  "IPO, spin-off, fusioni, acquisizioni e delisting",
  "Depositi SEC S-1, F-1, 8-A e 10-12B",
  "Indicatori macroeconomici e banche centrali",
  "Notizie e rischio geopolitico globale",
  "Biotech: studi clinici, FDA, pipeline e solidità finanziaria",
  "Società private e pre-IPO da notizie e round di finanziamento",
  "AI, semiconduttori, cloud, cybersecurity e software",
  "Robotica, automazione, difesa, spazio e infrastrutture",
  "Energia, nucleare, rete elettrica e transizione energetica",
  "Agritech, fertilizzanti, sementi, acqua e sicurezza alimentare",
  "Healthcare, consumer, finanziari e opportunità speciali",
] as const;

export const autonomousPrinciples = [
  "Fenice parte da un universo globale e non favorisce un settore solo perché è di moda.",
  "Il motore cerca continuamente nuovi strumenti e segnali, ma assegna sempre qualità, rischio e confidenza.",
  "Una nuova società o moneta non viene considerata investibile solo perché è nuova o cresce velocemente.",
  "I dati provenienti da una sola fonte non possono generare un segnale forte.",
  "PRIORITARIA o ACCUMULA significa da verificare e pianificare, non ordine automatico.",
  "Il software non possiede credenziali di broker e non può inviare ordini senza decisione umana.",
] as const;
