export type TabId = "overview" | "autonomy" | "companies" | "portfolio" | "reports" | "controls";

export type Indicator = {
  label: string;
  value: number;
  trend: "up" | "down" | "stable";
  note: string;
};

export type Company = {
  ticker: string;
  name: string;
  sector: "Biotech" | "Agritech" | "AI";
  score: number;
  risk: number;
  potential: "Molto alto" | "Alto" | "Medio";
  action: "OSSERVA" | "ATTENDI" | "CANDIDATA";
  thesis: string;
  trigger: string;
};

export type PortfolioTarget = {
  ticker: string;
  weight: number;
  role: string;
};

export type FeniceAlert = {
  level: "alta" | "media" | "informativa";
  title: string;
  detail: string;
};

export type AnalysisReport = {
  date: string;
  verdict: "ATTENDERE" | "MANTENERE" | "VALUTARE ACQUISTO";
  opportunity: number;
  risk: number;
  confidence: number;
  summary: string;
};

export const project = {
  name: "Fenice Investment System",
  goal: "Progetto 100.000 €",
  initialCapital: 10_000,
  horizonYears: 10,
  verdict: "ATTENDERE" as const,
  opportunity: 76,
  risk: 58,
  confidence: 87,
  updatedAt: "13 luglio 2026, 18:55",
};

export const indicators: Indicator[] = [
  {
    label: "Geopolitica",
    value: 65,
    trend: "stable",
    note: "Tensione elevata: mantenere prudenza e liquidità.",
  },
  {
    label: "Macroeconomia",
    value: 74,
    trend: "up",
    note: "Scenario favorevole, ma non ancora privo di rischi.",
  },
  {
    label: "Mercati globali",
    value: 80,
    trend: "up",
    note: "Forza generale positiva con valutazioni da sorvegliare.",
  },
  {
    label: "Intelligenza artificiale",
    value: 96,
    trend: "up",
    note: "Tema strutturale più forte del paniere monitorato.",
  },
  {
    label: "Biotech",
    value: 88,
    trend: "up",
    note: "Potenziale alto, accompagnato da rischio clinico elevato.",
  },
  {
    label: "Agritech",
    value: 84,
    trend: "stable",
    note: "Crescita di lungo periodo legata a clima e produttività.",
  },
];

export const companies: Company[] = [
  {
    ticker: "CRSP",
    name: "CRISPR Therapeutics",
    sector: "Biotech",
    score: 87,
    risk: 63,
    potential: "Molto alto",
    action: "CANDIDATA",
    thesis: "Piattaforma di editing genetico con potenziale trasformativo.",
    trigger: "Conferme commerciali e nuove indicazioni cliniche.",
  },
  {
    ticker: "RXRX",
    name: "Recursion Pharmaceuticals",
    sector: "AI",
    score: 84,
    risk: 68,
    potential: "Molto alto",
    action: "CANDIDATA",
    thesis: "Incontro tra intelligenza artificiale e scoperta di farmaci.",
    trigger: "Validazione della piattaforma e avanzamento della pipeline.",
  },
  {
    ticker: "NTLA",
    name: "Intellia Therapeutics",
    sector: "Biotech",
    score: 81,
    risk: 70,
    potential: "Molto alto",
    action: "ATTENDI",
    thesis: "Editing genetico in vivo con forte leva sui risultati clinici.",
    trigger: "Dati clinici solidi e riduzione del rischio di esecuzione.",
  },
  {
    ticker: "BIOX",
    name: "Bioceres Crop Solutions",
    sector: "Agritech",
    score: 73,
    risk: 55,
    potential: "Alto",
    action: "OSSERVA",
    thesis: "Tecnologie agricole resilienti a siccità e cambiamento climatico.",
    trigger: "Adozione commerciale e miglioramento della redditività.",
  },
  {
    ticker: "EVGN",
    name: "Evogene",
    sector: "Agritech",
    score: 65,
    risk: 74,
    potential: "Alto",
    action: "OSSERVA",
    thesis: "Biologia computazionale applicata ad agricoltura e life science.",
    trigger: "Partnership rilevanti e maggiore visibilità sui ricavi.",
  },
];

export const portfolioTargets: PortfolioTarget[] = [
  { ticker: "CRSP", weight: 25, role: "Leader biotech" },
  { ticker: "RXRX", weight: 20, role: "AI applicata ai farmaci" },
  { ticker: "NTLA", weight: 20, role: "Editing genetico in vivo" },
  { ticker: "BIOX", weight: 20, role: "Agritech resiliente" },
  { ticker: "EVGN", weight: 15, role: "Opzione ad alto potenziale" },
];

export const alerts: FeniceAlert[] = [
  {
    level: "alta",
    title: "Nessun ordine automatico autorizzato",
    detail: "Ogni acquisto richiede una conferma esplicita di Orazio.",
  },
  {
    level: "media",
    title: "Rischio complessivo ancora sopra la soglia ideale",
    detail: "Il verdetto resta ATTENDERE finché rischio e prezzo non migliorano.",
  },
  {
    level: "informativa",
    title: "Watchlist concentrata su innovazione di lungo periodo",
    detail: "Biotech, AI e agritech restano i tre settori principali.",
  },
];

export const reports: AnalysisReport[] = [
  {
    date: "13 luglio 2026",
    verdict: "ATTENDERE",
    opportunity: 76,
    risk: 58,
    confidence: 87,
    summary: "Opportunità interessanti, ma il rapporto rischio/prezzo non giustifica ancora l'ingresso completo.",
  },
  {
    date: "12 luglio 2026",
    verdict: "ATTENDERE",
    opportunity: 74,
    risk: 59,
    confidence: 86,
    summary: "Portafoglio candidato invariato. Priorità alla disciplina e alla conservazione della liquidità.",
  },
  {
    date: "11 luglio 2026",
    verdict: "ATTENDERE",
    opportunity: 74,
    risk: 59,
    confidence: 87,
    summary: "Nessuna modifica alle cinque aziende monitorate. Attesa di segnali migliori.",
  },
];

export function formatEuro(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}
