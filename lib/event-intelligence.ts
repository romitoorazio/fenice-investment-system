import type { AutonomySnapshot, DiscoverySignal, MarketReading } from "./autonomy";

export type EventPriority = "CRITICA" | "ALTA" | "MEDIA" | "BASSA";
export type EventImpact = "POSITIVO" | "NEGATIVO" | "MISTO" | "NEUTRALE";

export type IntelligenceEvent = {
  id: string;
  title: string;
  category: DiscoverySignal["category"];
  symbol?: string;
  date?: string;
  source: string;
  url?: string;
  impact: EventImpact;
  priority: EventPriority;
  relevance: number;
  confidence: number;
  risk: number;
  summary: string;
  requiredChecks: string[];
};

export type EventIntelligenceReport = {
  generatedAt: string;
  events: IntelligenceEvent[];
  criticalCount: number;
  highPriorityCount: number;
  coverage: {
    totalSignals: number;
    linkedToMarket: number;
    withDate: number;
    withUrl: number;
  };
  warnings: string[];
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function findMarket(signal: DiscoverySignal, markets: MarketReading[]) {
  const name = signal.name.toLowerCase();
  return markets.find((market) => {
    const symbol = market.symbol.toLowerCase();
    return name.includes(symbol) || signal.signal.toLowerCase().includes(symbol) || market.name.toLowerCase() === name;
  });
}

function inferImpact(signal: DiscoverySignal): EventImpact {
  const text = `${signal.name} ${signal.signal}`.toLowerCase();
  if (/approval|approvato|partnership|contract|acquisizione|breakthrough|positive|rialzo|crescita|finanziamento/.test(text)) return "POSITIVO";
  if (/rejection|respinto|indagine|lawsuit|frode|diluizione|fallimento|delisting|sospensione|negative|taglio/.test(text)) return "NEGATIVO";
  if (/merger|fusione|earnings|risultati|trial|studio clinico|ipo/.test(text)) return "MISTO";
  return "NEUTRALE";
}

function requiredChecks(signal: DiscoverySignal, linked?: MarketReading) {
  const checks = ["Verificare la fonte primaria e la data dell'evento."];
  if (!signal.url) checks.push("Aggiungere un collegamento alla fonte originale.");
  if (!linked) checks.push("Confermare il ticker o la società collegata.");
  if (["SEC", "IPO"].includes(signal.category)) checks.push("Controllare il deposito regolamentare originale e le eventuali modifiche.");
  if (signal.category === "BIOTECH") checks.push("Confermare fase clinica, endpoint, dimensione del campione e calendario regolatorio.");
  if (signal.category === "NEWS") checks.push("Cercare una seconda fonte indipendente prima di aumentare la convinzione.");
  if (signal.category === "CRYPTO") checks.push("Verificare liquidità, supply, concentrazione e rischio exchange.");
  return checks;
}

function normalizeEvent(signal: DiscoverySignal, markets: MarketReading[]): IntelligenceEvent {
  const linked = findMarket(signal, markets);
  const impact = inferImpact(signal);
  const sourceBonus = /sec|fda|nasdaq|nyse|borsa italiana|clinicaltrials/i.test(signal.source) ? 15 : 0;
  const evidencePenalty = signal.url ? 0 : 15;
  const marketPenalty = linked ? 0 : 10;
  const confidence = clamp(50 + sourceBonus + Math.min(20, signal.score * 0.2) - evidencePenalty - marketPenalty);
  const relevance = clamp(signal.score * 0.6 + (100 - signal.risk) * 0.2 + confidence * 0.2);
  const priority: EventPriority =
    relevance >= 75 && confidence >= 70 ? "CRITICA" :
    relevance >= 60 && confidence >= 55 ? "ALTA" :
    relevance >= 42 ? "MEDIA" : "BASSA";

  return {
    id: signal.id,
    title: signal.name,
    category: signal.category,
    symbol: linked?.symbol,
    date: signal.date,
    source: signal.source,
    url: signal.url,
    impact,
    priority,
    relevance,
    confidence,
    risk: clamp(signal.risk),
    summary: signal.signal,
    requiredChecks: requiredChecks(signal, linked),
  };
}

export function buildEventIntelligence(snapshot: AutonomySnapshot): EventIntelligenceReport {
  const events = snapshot.discoveries
    .map((signal) => normalizeEvent(signal, snapshot.markets))
    .sort((a, b) => b.relevance - a.relevance || b.confidence - a.confidence)
    .slice(0, 100);

  const warnings = [...snapshot.warnings];
  if (events.length === 0) warnings.push("Nessun catalizzatore strutturato disponibile nell'ultimo ciclo dati.");
  if (events.some((event) => event.confidence < 50)) warnings.push("Alcuni eventi hanno conferma insufficiente e non devono modificare il portafoglio.");

  return {
    generatedAt: snapshot.generatedAt ?? new Date().toISOString(),
    events,
    criticalCount: events.filter((event) => event.priority === "CRITICA").length,
    highPriorityCount: events.filter((event) => event.priority === "ALTA").length,
    coverage: {
      totalSignals: events.length,
      linkedToMarket: events.filter((event) => event.symbol).length,
      withDate: events.filter((event) => event.date).length,
      withUrl: events.filter((event) => event.url).length,
    },
    warnings: [...new Set(warnings)].slice(0, 12),
  };
}
