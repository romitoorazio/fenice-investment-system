import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluatePaperBaselineEligibility } from "../lib/trading/paper-baseline.mjs";
import { computePaperValidationFingerprint } from "../lib/trading/validation-fingerprint.mjs";

const requireReadyIfOpen = process.argv.includes("--require-ready-if-open");
const requireSession = process.argv.includes("--require-session");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "data", "paper-open-readiness.json");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

const [session, sources, intelligence, executionMarket, executionCoverage, governance, fingerprint] = await Promise.all([
  readJson("data/paper-market-session.json"),
  readJson("data/global-source-health.json"),
  readJson("data/intelligence-quality.json"),
  readJson("data/execution-market-evidence.json"),
  readJson("data/execution-market-coverage.json"),
  readJson("data/decision-governance.json"),
  computePaperValidationFingerprint(root),
]);

const baseline = evaluatePaperBaselineEligibility({
  sources,
  intelligence,
  executionMarket,
  executionCoverage,
  governance,
  fingerprint,
});

const state = String(session?.evidence?.state || "UNKNOWN").toUpperCase();
const sessionAuthoritative = session?.evidence?.authoritative === true;
const sessionAllowed = session?.decision?.allowed === true;
const sessionConfigured = session?.configured === true;
const sessionAgeSeconds = Number(session?.decision?.ageSeconds ?? Number.POSITIVE_INFINITY);
const sessionReasons = Array.isArray(session?.decision?.reasons) ? session.decision.reasons : [];
const sessionFresh = Number.isFinite(sessionAgeSeconds)
  && sessionAgeSeconds >= 0
  && sessionAgeSeconds <= 120
  && !sessionReasons.includes("market-session evidence is stale");
const sessionReliable = sessionConfigured
  && sessionAuthoritative
  && sessionFresh
  && ["OPEN", "CLOSED"].includes(state);
const marketOpen = sessionReliable && state === "OPEN" && sessionAllowed;
const marketClosed = sessionReliable && state === "CLOSED" && sessionAllowed === false;

let status;
if (!sessionReliable) status = "SESSION_UNCERTAIN";
else if (marketClosed) status = "WAIT_MARKET_OPEN";
else if (marketOpen && baseline.eligible) status = "PAPER_READY";
else if (marketOpen) status = "OPEN_NOT_READY";
else status = "SESSION_UNCERTAIN";

const paperProviderFamilies = new Set(["alpaca", "twelve-data", "directa"]);
const executionErrors = Array.isArray(executionMarket?.errors) ? executionMarket.errors : [];
const paperProviderErrors = executionErrors.filter((row) => paperProviderFamilies.has(String(row?.provider || "").trim().toLowerCase()));
const validationProviderErrors = executionErrors.filter((row) => !paperProviderFamilies.has(String(row?.provider || "").trim().toLowerCase()));

const report = {
  version: 2,
  generatedAt: new Date().toISOString(),
  status,
  marketSession: {
    configured: sessionConfigured,
    state,
    authoritative: sessionAuthoritative,
    fresh: sessionFresh,
    allowed: sessionAllowed,
    ageSeconds: Number.isFinite(sessionAgeSeconds) ? sessionAgeSeconds : 999999,
    reasons: sessionReasons,
    nextOpen: session?.nextOpen || null,
    nextClose: session?.nextClose || null,
    error: session?.error || null,
  },
  baseline,
  diagnostics: {
    executionErrors: executionErrors.length,
    paperProviderErrors,
    validationProviderErrors,
    paperProviderErrorCount: paperProviderErrors.length,
    validationProviderErrorCount: validationProviderErrors.length,
    stooqErrorsAreValidationNoise: validationProviderErrors.some((row) => String(row?.provider || "").toLowerCase() === "stooq"),
  },
  policy: {
    marketSessionMaxAgeSeconds: 120,
    closedMarketIsNotProviderFailure: true,
    staleClosedMarketFailsClosed: true,
    uncertainSessionFailsClosed: true,
    openMarketRequiresFullPaperBaseline: true,
    validationOnlyProviderErrorsDoNotSatisfyOrBlockPaperQuorumByThemselves: true,
    liveTradingAllowed: false,
  },
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Fenice PAPER open readiness: ${status}; session=${state}; fresh=${sessionFresh}; baseline=${baseline.eligible ? "ELIGIBLE" : "NOT_ELIGIBLE"}; coverage=${baseline.metrics.paperEligibleSymbols}/${baseline.metrics.requestedExecutionSymbols} (${baseline.metrics.paperEligiblePercent}%).`);

if (status === "SESSION_UNCERTAIN" && requireSession) {
  console.error("PAPER_OPEN_READINESS_SESSION_UNCERTAIN: provider-driven market-session evidence is unavailable, stale, or non-authoritative.");
  process.exitCode = 3;
} else if (status === "OPEN_NOT_READY" && requireReadyIfOpen) {
  console.error(`PAPER_OPEN_READINESS_FAILED: ${baseline.reasons.join(" | ")}`);
  process.exitCode = 2;
}
