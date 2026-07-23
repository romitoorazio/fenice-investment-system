export type TabId = "overview" | "companies" | "portfolio" | "roadmap" | "controls";

export type Company = {
  ticker: string;
  name: string;
  sector: "Biotech" | "Agritech" | "AI";
  score: number;
  risk: number;
  potential: "Molto alto" | "Alto" | "Medio";
  action: "ACCUMULA" | "MANTIENI" | "ATTENDI" | "OSSERVA";
  thesis: string;
  trigger: string;
  maxWeight: number;
};

export type AllocationTarget = {
  id: string;
  label: string;
  weight: number;
  role: string;
};

export type Milestone = {
  year: number;
  baseTarget: number;
  ambitiousTarget: number;
  focus: string;
};

export const project = {
  name: "Fenice Investment System",
  goal: "Progetto 100.000 €",
  mission: "Far crescere 10.000 € in dieci anni con disciplina, diversificazione e ricerca di opportunità ad alto potenziale.",
  initialCapital: 10_000,
  targetCapital: 100_000,
  horizonYears: 10,
  requiredCagr: 25.89,
  policy: "Il software analizza e propone. Orazio conferma ogni decisione. Nessun ordine automatico.",
};

export const allocationTargets: AllocationTarget[] = [
  { id: "core", label: "Nucleo diversificato", weight: 55, role: "ETF globali, USA e infrastrutture tecnologiche" },
  { id: "alpha", label: "Aziende ad alto potenziale", weight: 30, role: "AI, biotech, agritech e nuove tecnologie" },
  { id: "reserve", label: "Riserva strategica", weight: 15, role: "Liquidità per correzioni e nuove opportunità" },
];

export const entryPlan = [
  { phase: "Ingresso iniziale", amount: 4000, timing: "Subito dopo la conferma del piano" },
  { phase: "Accumulo 1", amount: 1000, timing: "Dopo 2 mesi" },
  { phase: "Accumulo 2", amount: 1000, timing: "Dopo 4 mesi" },
  { phase: "Accumulo 3", amount: 1000, timing: "Dopo 6 mesi" },
  { phase: "Accumulo 4", amount: 1000, timing: "Dopo 8 mesi" },
  { phase: "Accumulo 5", amount: 1000, timing: "Dopo 10 mesi" },
  { phase: "Accumulo 6", amount: 1000, timing: "Dopo 12 mesi" },
];

export const companies: Company[] = [
  {
    ticker: "CRSP",
    name: "CRISPR Therapeutics",
    sector: "Biotech",
    score: 87,
    risk: 63,
    potential: "Molto alto",
    action: "ACCUMULA",
    thesis: "Piattaforma di editing genetico con potenziale trasformativo e prima validazione commerciale.",
    trigger: "Crescita commerciale, nuove indicazioni e tenuta della liquidità.",
    maxWeight: 7,
  },
  {
    ticker: "RXRX",
    name: "Recursion Pharmaceuticals",
    sector: "AI",
    score: 84,
    risk: 68,
    potential: "Molto alto",
    action: "ACCUMULA",
    thesis: "Incontro tra intelligenza artificiale, dati biologici e scoperta di farmaci.",
    trigger: "Validazione clinica della piattaforma e partnership economicamente rilevanti.",
    maxWeight: 7,
  },
  {
    ticker: "NTLA",
    name: "Intellia Therapeutics",
    sector: "Biotech",
    score: 81,
    risk: 70,
    potential: "Molto alto",
    action: "ATTENDI",
    thesis: "Editing genetico in vivo con enorme potenziale ma forte dipendenza dai risultati clinici.",
    trigger: "Dati clinici solidi e riduzione del rischio di esecuzione.",
    maxWeight: 5,
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
    trigger: "Adozione commerciale, margini migliori e riduzione del debito.",
    maxWeight: 5,
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
    trigger: "Partnership rilevanti, ricavi ricorrenti e maggiore visibilità finanziaria.",
    maxWeight: 3,
  },
];

export const milestones: Milestone[] = [
  { year: 1, baseTarget: 11_000, ambitiousTarget: 12_600, focus: "Completare l'ingresso senza inseguire i prezzi" },
  { year: 3, baseTarget: 14_000, ambitiousTarget: 20_000, focus: "Verificare che le tesi producano risultati reali" },
  { year: 5, baseTarget: 20_000, ambitiousTarget: 31_600, focus: "Aumentare il peso dei vincitori e tagliare le tesi rotte" },
  { year: 7, baseTarget: 28_000, ambitiousTarget: 50_100, focus: "Proteggere il capitale senza fermare la crescita" },
  { year: 10, baseTarget: 40_000, ambitiousTarget: 100_000, focus: "Valutare risultato, rischio e obiettivo successivo" },
];

export const decisionRules = [
  "ACCUMULA: qualità alta, prezzo accettabile e tesi confermata.",
  "MANTIENI: la tesi resta valida e non emergono rischi strutturali.",
  "ATTENDI: azienda interessante ma prezzo, dati o rischio non sono favorevoli.",
  "ESCI: la tesi è compromessa, non per una semplice discesa del titolo.",
  "Mai oltre il 7% del capitale iniziale su una singola azienda ad alto rischio.",
];

export function formatEuro(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}
