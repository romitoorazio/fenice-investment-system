export type MarketSessionState = "OPEN" | "CLOSED" | "HALTED" | "UNKNOWN";

export type MarketSessionEvidence = {
  venue: string;
  state: MarketSessionState;
  source: string;
  observedAt: string;
  authoritative: boolean;
};

export type MarketSessionDecision = {
  allowed: boolean;
  reasons: string[];
  ageSeconds: number;
  state: MarketSessionState;
};

/**
 * Market-session control is deliberately provider-driven. Fenice must not
 * guess exchange holidays, extraordinary halts or early closes from weekday
 * arithmetic. Missing/stale/non-authoritative evidence fails closed.
 */
export function evaluateMarketSession(
  evidence: MarketSessionEvidence | null | undefined,
  options: { maxAgeSeconds?: number } = {},
  now = Date.now(),
): MarketSessionDecision {
  const maxAgeSeconds = options.maxAgeSeconds ?? 60;
  if (!evidence) {
    return { allowed: false, reasons: ["market-session evidence unavailable"], ageSeconds: 999999, state: "UNKNOWN" };
  }

  const observed = Date.parse(evidence.observedAt);
  const canonical = typeof evidence.observedAt === "string" && evidence.observedAt.includes(".")
    ? evidence.observedAt : String(evidence.observedAt || "").replace(/Z$/, ".000Z");
  const validTime = typeof evidence.observedAt === "string"
    && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(evidence.observedAt)
    && Number.isFinite(observed) && observed >= 0 && new Date(observed).toISOString() === canonical
    && Number.isSafeInteger(now) && now >= 0 && now <= 8.64e15 && observed <= now;
  const ageSeconds = validTime ? (now - observed) / 1000 : Number.POSITIVE_INFINITY;
  const reasons: string[] = [];
  if (evidence.authoritative !== true) reasons.push("market-session source is not authoritative");
  if (!validTime) reasons.push("market-session timestamp or clock is invalid or future");
  if (typeof maxAgeSeconds !== "number" || !Number.isFinite(maxAgeSeconds) || maxAgeSeconds <= 0)
    reasons.push("market-session freshness limit is invalid");
  if (ageSeconds > maxAgeSeconds) reasons.push("market-session evidence is stale");
  if (evidence.state === "UNKNOWN") reasons.push("market-session state is unknown");
  if (evidence.state === "CLOSED") reasons.push("market is closed");
  if (evidence.state === "HALTED") reasons.push("market or instrument is halted");

  return {
    allowed: reasons.length === 0 && evidence.state === "OPEN",
    reasons,
    ageSeconds: Number.isFinite(ageSeconds) ? Number(ageSeconds.toFixed(3)) : 999999,
    state: evidence.state,
  };
}
