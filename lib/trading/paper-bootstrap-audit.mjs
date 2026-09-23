export function classifyPaperBootstrapAudit(
  sessionReport,
  baselineEligibility,
  { maxSessionAgeSeconds = 120 } = {},
) {
  const evidence = sessionReport?.evidence || {};
  const decision = sessionReport?.decision || {};
  const state = String(evidence?.state || decision?.state || "UNKNOWN").toUpperCase();
  const authoritative = evidence?.authoritative === true;
  const configured = sessionReport?.configured === true;
  const ageSeconds = Number(decision?.ageSeconds);
  const fresh = Number.isFinite(ageSeconds) && ageSeconds >= 0 && ageSeconds <= Math.max(1, Number(maxSessionAgeSeconds) || 120);
  const liveTradingAllowed = sessionReport?.liveTradingAllowed === true;

  if (liveTradingAllowed) {
    return {
      status: "SAFETY_FAILURE",
      campaignStartAllowed: false,
      reason: "market-session diagnostic unexpectedly allows live trading",
      state,
      authoritative,
      fresh,
    };
  }

  if (!configured || !authoritative || !fresh || !["OPEN", "CLOSED"].includes(state)) {
    return {
      status: "SESSION_UNCERTAIN",
      campaignStartAllowed: false,
      reason: "market session is missing, stale, non-authoritative or ambiguous",
      state,
      authoritative,
      fresh,
    };
  }

  if (state === "CLOSED") {
    return {
      status: "WAIT_MARKET_OPEN",
      campaignStartAllowed: false,
      reason: "authoritative market session is closed; PAPER bootstrap must wait without being reported as provider failure",
      state,
      authoritative,
      fresh,
    };
  }

  if (decision?.allowed !== true) {
    return {
      status: "SESSION_UNCERTAIN",
      campaignStartAllowed: false,
      reason: "market reports OPEN but session gate does not authorize PAPER validation",
      state,
      authoritative,
      fresh,
    };
  }

  if (baselineEligibility?.eligible !== true) {
    return {
      status: "OPEN_NOT_READY",
      campaignStartAllowed: false,
      reason: "market is open but the PAPER baseline is not eligible",
      state,
      authoritative,
      fresh,
    };
  }

  return {
    status: "BOOTSTRAP_REQUIRED",
    campaignStartAllowed: true,
    reason: "market is open and the complete PAPER baseline is eligible",
    state,
    authoritative,
    fresh,
  };
}
