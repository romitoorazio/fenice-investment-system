export type EventRiskSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type MarketRiskEvent = {
  id: string;
  label: string;
  scheduledAt: string;
  severity: EventRiskSeverity;
  preWindowMinutes?: number;
  postWindowMinutes?: number;
  symbols?: string[];
  currencies?: string[];
  assetClasses?: string[];
};

export type EventRiskContext = {
  symbol: string;
  currency?: string;
  assetClass?: string;
  now?: number;
};

export type EventRiskDecision = {
  state: "NORMAL" | "CAUTION" | "BLOCKED";
  allowNewRisk: boolean;
  riskMultiplier: number;
  activeEventIds: string[];
  reasons: string[];
};

const DEFAULT_WINDOWS: Record<EventRiskSeverity, { pre: number; post: number; multiplier: number; blocked: boolean }> = {
  LOW: { pre: 10, post: 5, multiplier: 1, blocked: false },
  MEDIUM: { pre: 20, post: 10, multiplier: 0.75, blocked: false },
  HIGH: { pre: 45, post: 20, multiplier: 0.5, blocked: false },
  CRITICAL: { pre: 90, post: 45, multiplier: 0, blocked: true },
};

function normalizedSet(items?: string[]): Set<string> {
  return new Set((items || []).map((item) => String(item || "").trim().toUpperCase()).filter(Boolean));
}

function eventApplies(event: MarketRiskEvent, context: EventRiskContext): boolean {
  const symbolSet = normalizedSet(event.symbols);
  const currencySet = normalizedSet(event.currencies);
  const assetClassSet = normalizedSet(event.assetClasses);
  const hasScope = symbolSet.size > 0 || currencySet.size > 0 || assetClassSet.size > 0;
  if (!hasScope) return true;
  const symbol = String(context.symbol || "").trim().toUpperCase();
  const currency = String(context.currency || "").trim().toUpperCase();
  const assetClass = String(context.assetClass || "").trim().toUpperCase();
  return symbolSet.has(symbol) || currencySet.has(currency) || assetClassSet.has(assetClass);
}

export function evaluateEventRisk(
  events: readonly MarketRiskEvent[],
  context: EventRiskContext,
): EventRiskDecision {
  const now = Number.isFinite(context.now) ? Number(context.now) : Date.now();
  const reasons: string[] = [];
  const active: MarketRiskEvent[] = [];

  for (const event of events) {
    if (!event?.id || !event?.label || !eventApplies(event, context)) continue;
    const scheduled = Date.parse(event.scheduledAt);
    if (!Number.isFinite(scheduled)) {
      if (event.severity === "CRITICAL") {
        reasons.push(`critical event ${event.id} has invalid schedule; fail-closed`);
        active.push(event);
      }
      continue;
    }
    const defaults = DEFAULT_WINDOWS[event.severity];
    const preMinutes = Number.isFinite(event.preWindowMinutes) && Number(event.preWindowMinutes) >= 0
      ? Number(event.preWindowMinutes)
      : defaults.pre;
    const postMinutes = Number.isFinite(event.postWindowMinutes) && Number(event.postWindowMinutes) >= 0
      ? Number(event.postWindowMinutes)
      : defaults.post;
    const starts = scheduled - preMinutes * 60_000;
    const ends = scheduled + postMinutes * 60_000;
    if (now >= starts && now <= ends) active.push(event);
  }

  if (active.length === 0) {
    return { state: "NORMAL", allowNewRisk: true, riskMultiplier: 1, activeEventIds: [], reasons };
  }

  let multiplier = 1;
  let blocked = false;
  for (const event of active) {
    const defaults = DEFAULT_WINDOWS[event.severity];
    multiplier = Math.min(multiplier, defaults.multiplier);
    blocked ||= defaults.blocked;
    reasons.push(`${event.severity} event window active: ${event.label}`);
  }

  if (blocked) {
    return {
      state: "BLOCKED",
      allowNewRisk: false,
      riskMultiplier: 0,
      activeEventIds: active.map((event) => event.id),
      reasons,
    };
  }

  return {
    state: "CAUTION",
    allowNewRisk: true,
    riskMultiplier: Number(multiplier.toFixed(2)),
    activeEventIds: active.map((event) => event.id),
    reasons,
  };
}
