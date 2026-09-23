import { recoverFinra } from "./optional-source-recovery.mjs";

const STATE_SCORE = Object.freeze({ healthy: 1, degraded: 0.65, failed: 0, unconfigured: 0 });

function authorityWeight(source) {
  if (source?.critical) return 3;
  if (source?.authority === "central-bank" || source?.authority === "regulator") return 2.5;
  if (source?.authority === "institutional") return 2;
  if (source?.authority === "market-data") return 1.5;
  return 1;
}

export function recomputeGlobalSourceHealth(report, registry) {
  const sources = Array.isArray(report?.sources) ? report.sources : [];
  const registrySources = Array.isArray(registry?.sources) ? registry.sources : [];
  const registryById = new Map(registrySources.map((source) => [source.id, source]));

  const summary = sources.reduce((acc, source) => {
    const status = String(source?.status || "failed");
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, { healthy: 0, degraded: 0, failed: 0, unconfigured: 0 });

  let earned = 0;
  let possible = 0;
  for (const source of sources) {
    const registrySource = registryById.get(source?.id) || source;
    const weight = authorityWeight(registrySource);
    possible += weight;
    earned += weight * (STATE_SCORE[source?.status] ?? 0);
  }

  const reliabilityScore = possible ? Math.round((earned / possible) * 100) : 0;
  const criticalSources = sources.filter((source) => source?.critical === true);
  const criticalReady = criticalSources.filter((source) => ["healthy", "degraded"].includes(source?.status)).length;
  const criticalFailures = criticalSources
    .filter((source) => ["failed", "unconfigured"].includes(source?.status))
    .map((source) => source.id);
  const gate = criticalFailures.length === 0 && reliabilityScore >= 80
    ? "GREEN"
    : reliabilityScore >= 65
      ? "AMBER"
      : "RED";

  return {
    ...report,
    totalSources: sources.length,
    summary,
    reliabilityScore,
    qualityScore: reliabilityScore,
    gate,
    institutionalGate: gate,
    critical: {
      ready: criticalReady,
      total: criticalSources.length,
      failures: criticalFailures,
      gate,
    },
  };
}

function replaceSource(report, replacement) {
  const sources = Array.isArray(report?.sources) ? [...report.sources] : [];
  const index = sources.findIndex((source) => source?.id === replacement.id);
  if (index >= 0) sources[index] = replacement;
  else sources.push(replacement);
  return { ...report, sources };
}

export async function reconcileFinraGlobalSourceHealth(report, registry, {
  env = process.env,
  fetchImpl = fetch,
  now = new Date(),
} = {}) {
  const source = (Array.isArray(report?.sources) ? report.sources : [])
    .find((item) => item?.id === "finra-fixed-income");
  const registrySource = (Array.isArray(registry?.sources) ? registry.sources : [])
    .find((item) => item?.id === "finra-fixed-income");
  if (!source || !registrySource) {
    return recomputeGlobalSourceHealth({
      ...report,
      reconciledAt: now.toISOString(),
      reconciliation: {
        ...(report?.reconciliation || {}),
        finraPublicOAuth: { status: "not-present" },
      },
    }, registry);
  }

  const clientId = String(env?.FINRA_CLIENT_ID || "").trim();
  const clientSecret = String(env?.FINRA_CLIENT_SECRET || "").trim();
  const configured = Boolean(clientId && clientSecret);
  let replacement;
  let reconciliation;

  if (!configured) {
    replacement = {
      ...source,
      status: "unconfigured",
      stale: false,
      httpStatus: null,
      detail: "FINRA Query API richiede credenziali OAuth Public; FINRA_CLIENT_ID/FINRA_CLIENT_SECRET non configurati.",
      auth: "oauth2-public",
      authenticationRequired: true,
      anonymousProbe: {
        httpStatus: source.httpStatus ?? null,
        detail: source.detail || null,
        checkedAt: source.checkedAt || report?.generatedAt || null,
      },
    };
    reconciliation = {
      status: "unconfigured",
      configured: false,
      scoreEffect: "none-vs-failed",
      note: "Missing Public OAuth credentials are configuration state, not a provider outage.",
    };
  } else {
    const snapshot = { providers: [], discoveries: [] };
    const health = [];
    const result = await recoverFinra(snapshot, health, { env, fetchImpl });
    const recovered = health.find((item) => item?.id === "finra-fixed-income");
    const success = result?.state === "operativo" && recovered?.status === "healthy";
    replacement = {
      ...source,
      status: success ? "healthy" : "failed",
      checkedAt: recovered?.checkedAt || now.toISOString(),
      ...(success ? { lastSuccessfulAt: recovered?.checkedAt || now.toISOString() } : {}),
      stale: false,
      latencyMs: recovered?.latencyMs ?? source.latencyMs ?? null,
      httpStatus: success ? 200 : null,
      detail: success
        ? `FINRA Public OAuth verificato; ${Number(result?.records || 0)} record fixed-income acquisiti.`
        : `FINRA Public OAuth configurato ma probe fallito: ${recovered?.detail || result?.error || "unknown error"}`,
      endpointUsed: registrySource.endpoint,
      auth: "oauth2-public",
      authenticationRequired: true,
      oauthVerified: success,
    };
    reconciliation = {
      status: success ? "healthy" : "failed",
      configured: true,
      oauthVerified: success,
      records: Number(result?.records || 0),
    };
  }

  const reconciled = replaceSource(report, replacement);
  return recomputeGlobalSourceHealth({
    ...reconciled,
    reconciledAt: now.toISOString(),
    reconciliation: {
      ...(report?.reconciliation || {}),
      finraPublicOAuth: reconciliation,
    },
  }, registry);
}
