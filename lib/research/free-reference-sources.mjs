/**
 * FENICE100K optional, research-only reference adapters.
 * Never supplies execution-grade prices, PAPER quorum, signals, broker orders, or LIVE access.
 * Do not import into fingerprinted PAPER V6 files.
 */
export const RESEARCH_ONLY = Object.freeze({
  researchOnly: true,
  quoteFeed: false,
  realtimeCertified: false,
  paperEligible: false,
  liveTradingAllowed: false,
  brokerSubmissionAllowed: false,
  mutatesV6: false,
});

export const PUBLIC_REFERENCE_SOURCES = Object.freeze([
  { id: "openfigi", title: "OpenFIGI", kind: "identifier-mapping", url: "https://api.openfigi.com/v3/mapping", credentials: "optional", evidence: "mapping response" },
  { id: "esma-firds", title: "ESMA FIRDS", kind: "europe-reference-files", url: "https://registers.esma.europa.eu/publication/searchRegister?core=esma_registers_firds_files", credentials: "none", evidence: "bounded Solr index response; full/delta ingest not enabled" },
  { id: "sec-companyfacts", title: "SEC Companyfacts", kind: "company-fundamentals", url: "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json", credentials: "user-agent", evidence: "structured XBRL facts" },
  { id: "finra-public", title: "FINRA Public API", kind: "us-fixed-income", url: "https://developer.finra.org/docs", credentials: "FINRA_CLIENT_ID + FINRA_CLIENT_SECRET", evidence: "existing dedicated OAuth collector" },
  { id: "nasdaq-data-link", title: "Nasdaq Data Link", kind: "optional-open-dataset", url: "https://data.nasdaq.com/", credentials: "optional account/API key; dataset entitlement", evidence: "only explicit free dataset" },
  { id: "official-exchanges", title: "Official exchange registries", kind: "official-listing-and-corporate-events", url: "data/europe-market-registry.json", credentials: "venue-specific", evidence: "existing MIC/source mapping; no mass download" },
]);

export function openFigiJobs(instruments, maxJobs = 5) {
  const seen = new Set();
  const jobs = [];
  for (const row of instruments || []) {
    const isin = (row.identifiers || []).find(x => x.type === "isin")?.value;
    if (typeof isin !== "string" || !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) continue;
    if (seen.has(isin)) continue;
    seen.add(isin);
    jobs.push({ idType: "ID_ISIN", idValue: isin });
    if (jobs.length >= Math.min(5, Math.max(1, maxJobs))) break;
  }
  return jobs;
}

export function validateOpenFigiResponse(jobs, response) {
  if (!Array.isArray(response) || response.length !== jobs.length) throw new Error("OpenFIGI mapping payload malformed");
  return response.map((entry, i) => {
    const candidates = Array.isArray(entry?.data) ? entry.data.filter(x => typeof x.figi === "string") : [];
    const uniqueFigi = [...new Set(candidates.map(x => x.figi))];
    return {
      requestedIsin: jobs[i].idValue,
      candidates: uniqueFigi.length,
      status: uniqueFigi.length === 1 ? "UNIQUE_CANDIDATE_REVIEW_REQUIRED" : uniqueFigi.length > 1 ? "AMBIGUOUS" : "NO_MATCH",
      // FIGI is research-only until issuer/share class/venue independently matched; never auto-merge.
      figi: uniqueFigi.length === 1 ? uniqueFigi[0] : null,
    };
  });
}

export function summarizeCompanyfacts(payload) {
  if (!payload || !Number.isInteger(payload.cik) || typeof payload.entityName !== "string" || !payload.facts || typeof payload.facts !== "object") {
    throw new Error("SEC Companyfacts payload malformed");
  }
  const namespaces = Object.keys(payload.facts);
  return { cik: payload.cik, entityName: payload.entityName, namespaceCount: namespaces.length, taxonomyFacts: namespaces.reduce((n, k) => n + Object.keys(payload.facts[k] || {}).length, 0) };
}

export function summarizeEsmaIndex(payload) {
  const result = payload?.response;
  if (!result || !Number.isInteger(result.numFound) || !Array.isArray(result.docs)) throw new Error("ESMA FIRDS index unavailable or changed schema");
  return { availableIndexRecords: result.numFound, sampleDocuments: result.docs.length, filesDownloaded: 0, instrumentRecordsImported: 0 };
}

export function validateFreeDataset(value) {
  return typeof value === "string" && /^[A-Z0-9_]+\/[A-Z0-9_]+$/.test(value) && value.length <= 80;
}

export function sanitizeFailure(error) {
  const raw = error instanceof Error ? error.message : String(error);
  const status = raw.match(/HTTP (\d{3})/);
  return status ? "HTTP " + status[1] : "Request failed or payload invalid";
}

export async function getJson(fetcher, url, { headers = {}, method = "GET", body, timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      method, headers: { accept: "application/json", ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const type = String(response.headers?.get("content-type") || "");
    if (!/json/i.test(type)) throw new Error("Unexpected content type");
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
