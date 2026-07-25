import type { TerminalDecision, TechnicalSignal } from "@/lib/terminal";

export type JournalAction = "COMPRA" | "MANTIENI" | "OSSERVA" | "EVITA" | "VENDI";
export type JournalStatus = "APERTO" | "CONFERMATO" | "INVALIDATO" | "CHIUSO";

export type JournalSnapshot = {
  generatedAt: string;
  marketRegime: string;
  terminalDecision: TerminalDecision;
  technicalSignal: TechnicalSignal;
  unifiedScore: number;
  fundamentalScore?: number;
  technicalScore: number;
  valuationScore?: number;
  riskScore: number;
  confidence: number;
  price?: number;
  currency?: string;
  fairValueBase?: number;
  fairValueCurrency?: string;
  targetWeightPercent: number;
};

export type JournalEntry = {
  id: string;
  createdAt: string;
  updatedAt: string;
  symbol: string;
  name: string;
  action: JournalAction;
  status: JournalStatus;
  horizon: "1-4 settimane" | "3 mesi" | "12 mesi" | "3-10 anni";
  thesis: string;
  catalyst: string;
  invalidation: string;
  riskBudgetPercent: number;
  entryPrice?: number;
  targetPrice?: number;
  stopPrice?: number;
  reviewDate: string;
  notes: string;
  snapshot: JournalSnapshot;
  outcome?: {
    closedAt: string;
    exitPrice?: number;
    returnPercent?: number;
    result: "POSITIVO" | "NEGATIVO" | "NEUTRALE";
    lesson: string;
  };
};
