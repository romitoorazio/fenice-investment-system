/**
 * Bounded FINRA Public entitlement diagnostic (research only).
 * Never print or persist credentials/tokens/response bodies. Never issue orders.
 */
import { writeFile } from "node:fs/promises";

const clientId = String(process.env.FINRA_CLIENT_ID || "").trim();
const secret = String(process.env.FINRA_CLIENT_SECRET || "").trim();
const now = new Date().toISOString();
const results = [];
const endpoints = [
  ["treasuryDailyAggregatesGET", "https://api.finra.org/data/group/fixedIncomeMarket/name/treasuryDailyAggregates?limit=1"],
  ["treasuryDailyAggregatesPOST", "https://api.finra.org/data/group/fixedIncomeMarket/name/treasuryDailyAggregates", "POST"],
  ["treasuryMonthlyAggregatesGET", "https://api.finra.org/data/group/fixedIncomeMarket/name/treasuryMonthlyAggregates?limit=1"],
  ["corporateMarketBreadthGET", "https://api.finra.org/data/group/fixedIncomeMarket/name/corporateMarketBreadth?limit=1"],
  ["corporatesAndAgenciesCappedVolumeGET", "https://api.finra.org/data/group/fixedIncomeMarket/name/corporatesAndAgenciesCappedVolume?limit=1"],
  ["otcRegShoDailyGET", "https://api.finra.org/data/group/otcMarket/name/regShoDaily?limit=1"],
  ["treasuryDailyMetadata", "https://api.finra.org/metadata/group/fixedIncomeMarket/name/treasuryDailyAggregates"],
];

async function checkedFetch(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: "error" });
  } finally {
    clearTimeout(timeout);
  }
}

async function check() {
  if (!clientId || !secret) return { state: "UNCONFIGURED", tokenHttpStatus: null };
  const url = "https://ews.fip.finra.org/fip/rest/ews/oauth2/access_token?grant_type=client_credentials";
  let response;
  try {
    response = await checkedFetch(url, {
      method: "POST", headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        authorization: "Basic " + Buffer.from(clientId + ":" + secret).toString("base64"),
      },
    });
  } catch {
    return { state: "AUTH_NETWORK_ERROR", tokenHttpStatus: null };
  }
  if (!response.ok) return { state: "AUTH_REJECTED", tokenHttpStatus: response.status };
  const tokenPayload = await response.json().catch(() => null);
  const token = typeof tokenPayload?.access_token === "string" ? tokenPayload.access_token : "";
  if (!token) return { state: "AUTH_NO_TOKEN", tokenHttpStatus: response.status };
  for (const [id, endpoint, method = "GET"] of endpoints) {
    try {
      const headers = { accept: "application/json", authorization: "Bearer " + token };
      if (method === "POST") headers["content-type"] = "application/json";
      const r = await checkedFetch(endpoint, {
        method,
        headers,
        ...(method === "POST" ? { body: JSON.stringify({ limit: 1 }) } : {}),
      });
      const json = /json/i.test(r.headers.get("content-type") || "");
      let shapeValid = false;
      if (r.ok && json) {
        const body = await r.json().catch(() => null);
        shapeValid = id.endsWith("Metadata") ? !!body && typeof body === "object" : Array.isArray(body);
      }
      const finraApiRequestId = r.headers.get("finra-api-request-id");
      results.push({
        id,
        method,
        httpStatus: r.status,
        usable: r.ok && shapeValid,
        finraApiRequestId: finraApiRequestId || null,
        observedAt: new Date().toISOString(),
      });
    } catch {
      results.push({ id, httpStatus: null, usable: false, error: "network_or_payload" });
    }
  }
  const production = results.filter(row => row.id !== "treasuryDailyMetadata");
  const usable = production.filter(row => row.usable).map(row => row.id);
  const workingFixedIncome = production.filter(row => row.id !== "otcRegShoDailyGET" && row.usable).map(row => row.id);
  return {
    state: workingFixedIncome.length ? "FIXED_INCOME_PUBLIC_DATA_AVAILABLE" : usable.length ? "OTHER_PUBLIC_DATA_OK_FIXED_INCOME_UNAVAILABLE" : "PUBLIC_TOKEN_VALID_DATA_ACCESS_NOT_VERIFIED",
    tokenHttpStatus: response.status, accessibleDatasets: usable, accessibleFixedIncomeDatasets: workingFixedIncome,
  };
}

const diagnosis = await check();
const report = {
  generatedAt: now, mode: "FINRA_PUBLIC_READONLY_ENTITLEMENT_DIAGNOSTIC", researchOnly: true,
  liveTradingAllowed: false, paperEligible: false, brokerSubmissionAllowed: false,
  ...diagnosis, results,
  hint: diagnosis.tokenHttpStatus === 200 && results.some(x => x.httpStatus === 403)
    ? "OAuth token succeeded but dataset returned 403: check FINRA Public credential permissions / dataset authorization with FINRA support; do not create paid credentials."
    : "Each dataset requires its own verified public entitlement; no result authorizes trading.",
};
const output = process.env.GITHUB_WORKSPACE
  ? new URL("./finra-public-access-report.json", "file://" + process.env.GITHUB_WORKSPACE.replace(/\/$/, "") + "/")
  : new URL("../data/finra-public-access-report.json", import.meta.url);
await writeFile(output, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify(report, null, 2));
