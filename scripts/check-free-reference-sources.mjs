/**
 * Manual/CI opt-in public reference probe: node scripts/check-free-reference-sources.mjs
 * Optional --write stores NON-SECRET research status only, never execution data.
 * No execution API calls, no broker credentials, no PAPER changes.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  RESEARCH_ONLY, PUBLIC_REFERENCE_SOURCES, openFigiJobs, validateOpenFigiResponse,
  summarizeCompanyfacts, summarizeEsmaIndex, validateFreeDataset, sanitizeFailure, getJson,
} from "../lib/research/free-reference-sources.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async name => JSON.parse(await readFile(path.join(root, name), "utf8"));
const rows = [];
const recordedAt = new Date().toISOString();
const wantsWrite = process.argv.includes("--write");
const defaultAgent = "FeniceResearch/1.0 (https://github.com/romitoorazio/fenice-investment-system; contact: romitoorazio@users.noreply.github.com)";
const status = (id, state, detail, extra = {}) => rows.push({ id, state, detail, checkedAt: recordedAt, ...extra });
const run = async (id, action) => {
  try { await action(); }
  catch (error) { status(id, "FAILED", sanitizeFailure(error)); }
};

// OpenFIGI: at most FIVE ISIN jobs, ONE request; no implicit bulk crawl.
await run("openfigi", async () => {
  const instrumentMaster = await readJson("data/instrument-master.json");
  const jobs = openFigiJobs(instrumentMaster.instruments);
  if (!jobs.length) { status("openfigi", "NO_INPUT", "No verified ISIN inputs"); return; }
  const headers = { "content-type": "application/json" };
  if (process.env.OPENFIGI_API_KEY) headers["X-OPENFIGI-APIKEY"] = process.env.OPENFIGI_API_KEY;
  const data = await getJson(fetch, "https://api.openfigi.com/v3/mapping", { method: "POST", headers, body: jobs });
  const mapped = validateOpenFigiResponse(jobs, data);
  status("openfigi", "PROBED_RESEARCH_ONLY", "Identifier mapping checked; unresolved/ambiguous results are not merged", {
    jobs: jobs.length, uniqueCandidates: mapped.filter(x => x.status === "UNIQUE_CANDIDATE_REVIEW_REQUIRED").length,
    ambiguous: mapped.filter(x => x.status === "AMBIGUOUS").length, noMatch: mapped.filter(x => x.status === "NO_MATCH").length,
    candidates: mapped,
  });
});

// SEC: Companyfacts ALREADY exists in the fundamental engine. This is an independent one-issuer proof.
await run("sec-companyfacts", async () => {
  const data = await getJson(fetch, "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json", {
    headers: { "user-agent": process.env.SEC_USER_AGENT || defaultAgent }, timeoutMs: 15000,
  });
  status("sec-companyfacts", "PROBED_RESEARCH_ONLY", "SEC structured company facts reachable; existing fundamental collector remains authoritative", {
    sample: summarizeCompanyfacts(data),
  });
});

// ESMA: bounded register index probe only. Full/delta ZIP XML import is a separate, reviewed ETL task.
await run("esma-firds", async () => {
  const data = await getJson(fetch, "https://registers.esma.europa.eu/solr/esma_registers_firds_files/select?q=*%3A*&rows=1&wt=json");
  status("esma-firds", "INDEX_ONLY", "FIRDS public index reachable; NO bulk import or execution entitlement", {
    sample: summarizeEsmaIndex(data),
  });
});

// FINRA: already implemented in scripts/check-global-sources.mjs; never duplicate OAuth requests or secrets.
await run("finra-public", async () => {
  const global = await readJson("data/global-source-health.json");
  const existing = global.sources?.find(x => x.id === "finra-fixed-income");
  status("finra-public", "EXISTING_COLLECTOR", "Public OAuth collector is already present; this is a historical snapshot, NOT a new live check", {
    previousStatus: existing?.status || "unknown", previousCheckedAt: existing?.checkedAt || null,
    credentialNames: ["FINRA_CLIENT_ID", "FINRA_CLIENT_SECRET"], requiresOwnerProvisioning: !process.env.FINRA_CLIENT_ID || !process.env.FINRA_CLIENT_SECRET,
  });
});

// Nasdaq: Data Link is NOT a free real-time feed. Require explicit allowlisted dataset and opt-in before probing.
const dataset = process.env.NASDAQ_DATA_LINK_DATASET;
if (process.env.NASDAQ_DATA_LINK_API_KEY && validateFreeDataset(dataset) && process.env.NASDAQ_ALLOW_FREE_DATASET_PROBE === "1") {
  await run("nasdaq-data-link", async () => {
    const url = new URL("https://data.nasdaq.com/api/v3/datasets/" + dataset + ".json");
    url.searchParams.set("rows", "1");
    url.searchParams.set("api_key", process.env.NASDAQ_DATA_LINK_API_KEY);
    const response = await getJson(fetch, url.toString());
    if (!response?.dataset?.dataset_code || !Array.isArray(response?.dataset?.data)) throw new Error("Unexpected Nasdaq dataset");
    status("nasdaq-data-link", "DATASET_PROBED_NOT_REALTIME", "Only explicitly configured dataset checked; entitlement and price feed NOT certified", {
      datasetCode: response.dataset.dataset_code,
      sampleRows: response.dataset.data.length,
    });
  });
} else {
  status("nasdaq-data-link", "NOT_CONFIGURED", "Needs free account, explicitly selected open dataset and owner opt-in; never enable paid data automatically", {
    credentialName: "NASDAQ_DATA_LINK_API_KEY", datasetName: "NASDAQ_DATA_LINK_DATASET",
    optInName: "NASDAQ_ALLOW_FREE_DATASET_PROBE",
  });
}

// European exchange official sources: keep established mappings; do not claim realtime access.
await run("official-exchanges", async () => {
  const european = await readJson("data/europe-market-registry.json");
  status("official-exchanges", "REFERENCE_REGISTERED_ONLY", "Existing official market routing; prices/corporate actions not yet ingested from every venue", {
    primaryMarkets: european.markets?.length || 0, officialSourceFamilies: Object.keys(european.sourceCatalog || {}).length,
  });
});

const expected = new Set(PUBLIC_REFERENCE_SOURCES.map(x => x.id));
if (rows.length !== expected.size || rows.some(x => !expected.has(x.id))) throw new Error("Research provider coverage mismatch");
const report = {
  version: 1, generatedAt: recordedAt, purpose: "OPTIONAL_REFERENCE_RESEARCH_ONLY",
  scope: RESEARCH_ONLY, sources: rows,
  note: "No source status authorizes trading or proves a broker/market-data realtime entitlement.",
};
if (wantsWrite) await writeFile(path.join(root, "data", "free-reference-source-status.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify(report, null, 2));
