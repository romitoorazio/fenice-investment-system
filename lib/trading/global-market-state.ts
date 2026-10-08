export type GlobalMarketStateDecision = {
  provider: "twelve-data";
  exchangeMic: string;
  returnedMic: string;
  accepted: boolean;
  marketOpen: boolean;
  paperSessionAllowed: boolean;
  observedAt: string;
  reasons: string[];
};

export type GlobalMarketStateGatedEvidence<T extends { eligibility?: string; provenanceMethod?: string }> = T & {
  eligibility: "VALIDATION_ONLY" | "PAPER" | "LIVE";
  provenanceMethod?: string;
  marketState?: GlobalMarketStateDecision;
};

export const GLOBAL_MARKET_STATE_MAX_AGE_MS = 60_000;

function normalizedMic(value: unknown): string {
  const mic = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z0-9]{4}$/.test(mic) ? mic : "";
}

export function twelveDataMarketStateUrl(exchangeMic: unknown, apiKey: string): string {
  const mic = normalizedMic(exchangeMic);
  const key = String(apiKey || "").trim();
  if (!mic) throw new Error("TWELVE_DATA_MARKET_STATE_MIC_REQUIRED");
  if (!key) throw new Error("TWELVE_DATA_MARKET_STATE_API_KEY_REQUIRED");
  const params = new URLSearchParams({ code: mic, apikey: key });
  return `https://api.twelvedata.com/market_state?${params.toString()}`;
}

export function verifyTwelveDataGlobalMarketState(
  exchangeMic: unknown,
  raw: unknown,
  observedAtMs = Date.now(),
): GlobalMarketStateDecision {
  const expectedMic = normalizedMic(exchangeMic);
  const reasons: string[] = [];
  const clockValid = typeof observedAtMs === "number" && Number.isFinite(observedAtMs)
    && Number.isFinite(new Date(observedAtMs).getTime());
  const observedAt = clockValid ? new Date(observedAtMs).toISOString() : "";
  if (!clockValid) reasons.push("invalid market-state observation clock");

  if (!expectedMic) {
    return {
      provider: "twelve-data",
      exchangeMic: "",
      returnedMic: "",
      accepted: false,
      marketOpen: false,
      paperSessionAllowed: false,
      observedAt,
      reasons: ["missing expected MIC"],
    };
  }

  if (!Array.isArray(raw)) reasons.push("provider returned an API error or non-array market-state payload");

  const rows = Array.isArray(raw) ? raw : [];
  const exact = rows.filter((item) => normalizedMic((item as Record<string, unknown>)?.code) === expectedMic);
  if (exact.length === 0) reasons.push(`market_state missing exact MIC ${expectedMic}`);
  if (exact.length > 1) reasons.push(`market_state returned duplicate exact MIC ${expectedMic}`);

  const states = exact
    .map((item) => (item as Record<string, unknown>)?.is_market_open)
    .filter((value) => typeof value === "boolean") as boolean[];
  if (exact.length === 1 && states.length !== 1) reasons.push("market_state missing boolean is_market_open");
  if (new Set(states).size > 1) reasons.push("market_state returned conflicting open/closed states for the exact MIC");

  const returnedMic = exact.length ? normalizedMic((exact[0] as Record<string, unknown>)?.code) : "";
  const accepted = reasons.length === 0 && exact.length === 1 && states.length === 1 && returnedMic === expectedMic;
  const marketOpen = accepted ? states[0] === true : false;
  if (accepted && !marketOpen) reasons.push(`exact MIC ${expectedMic} is currently closed`);

  return {
    provider: "twelve-data",
    exchangeMic: expectedMic,
    returnedMic,
    accepted,
    marketOpen,
    paperSessionAllowed: accepted && marketOpen,
    observedAt,
    reasons,
  };
}

export function applyGlobalMarketStateGate<T extends { eligibility?: string; provenanceMethod?: string; exchangeMic?: string }>(
  evidence: T,
  state: GlobalMarketStateDecision | null | undefined,
  nowMs = Date.now(),
): GlobalMarketStateGatedEvidence<T> {
  const current = String(evidence?.eligibility || "VALIDATION_ONLY").toUpperCase();
  const requested: "VALIDATION_ONLY" | "PAPER" | "LIVE" = current === "LIVE"
    ? "LIVE"
    : current === "PAPER"
      ? "PAPER"
      : "VALIDATION_ONLY";

  if (requested === "VALIDATION_ONLY") {
    return { ...evidence, eligibility: "VALIDATION_ONLY" } as GlobalMarketStateGatedEvidence<T>;
  }

  const evidenceMic = normalizedMic(evidence?.exchangeMic);
  const observedAtMs = typeof state?.observedAt === "string" ? Date.parse(state.observedAt) : NaN;
  const fresh = Number.isFinite(nowMs) && Number.isFinite(observedAtMs)
    && observedAtMs <= nowMs && nowMs - observedAtMs <= GLOBAL_MARKET_STATE_MAX_AGE_MS;
  const exact = Boolean(evidenceMic) && normalizedMic(state?.exchangeMic) === evidenceMic
    && normalizedMic(state?.returnedMic) === evidenceMic;
  const allowed = state?.provider === "twelve-data" && state.accepted === true
    && state.marketOpen === true && state.paperSessionAllowed === true && fresh && exact;

  if (!allowed) {
    const suffix = state?.exchangeMic
      ? `session-gate:${normalizedMic(state.exchangeMic) || "invalid"}:${!exact ? "venue-mismatch" : !fresh ? "stale-or-invalid-time" : state.accepted === true && state.marketOpen === false ? "closed" : "unverified"}`
      : "session-gate:missing";
    const provenanceMethod = [String(evidence?.provenanceMethod || "").trim(), suffix].filter(Boolean).join(";");
    return {
      ...evidence,
      eligibility: "VALIDATION_ONLY",
      provenanceMethod,
      marketState: state ?? undefined,
    } as GlobalMarketStateGatedEvidence<T>;
  }

  return { ...evidence, eligibility: requested, marketState: state } as GlobalMarketStateGatedEvidence<T>;
}
