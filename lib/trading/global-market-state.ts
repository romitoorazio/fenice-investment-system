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
};

function normalizedMic(value: unknown): string {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
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
  const observedAt = new Date(observedAtMs).toISOString();

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

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const object = raw as Record<string, unknown>;
    if (String(object.status || "").toLowerCase() === "error" || object.code && !Array.isArray(raw)) {
      reasons.push("provider returned an API error or non-array market-state payload");
    }
  }

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

export function applyGlobalMarketStateGate<T extends { eligibility?: string; provenanceMethod?: string }>(
  evidence: T,
  state: GlobalMarketStateDecision | null | undefined,
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

  if (!state?.paperSessionAllowed) {
    const suffix = state?.exchangeMic
      ? `session-gate:${state.exchangeMic}:${state.accepted ? "closed" : "unverified"}`
      : "session-gate:missing";
    const provenanceMethod = [String(evidence?.provenanceMethod || "").trim(), suffix].filter(Boolean).join(";");
    return {
      ...evidence,
      eligibility: "VALIDATION_ONLY",
      provenanceMethod,
    } as GlobalMarketStateGatedEvidence<T>;
  }

  return { ...evidence, eligibility: requested } as GlobalMarketStateGatedEvidence<T>;
}
