import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const snapshotPath = path.resolve(__dirname, "..", "data", "latest-snapshot.json");
const now = new Date().toISOString();

const trackedCompanies = [
  { symbol: "AAPL", cik: "0000320193" },
  { symbol: "MSFT", cik: "0000789019" },
  { symbol: "NVDA", cik: "0001045810" },
  { symbol: "AMZN", cik: "0001018724" },
  { symbol: "GOOGL", cik: "0001652044" },
  { symbol: "META", cik: "0001326801" },
  { symbol: "CRSP", cik: "0001674416" },
  { symbol: "NTLA", cik: "0001652130" },
  { symbol: "RXRX", cik: "0001601830" },
];

const clinicalQueries = [
  { id: "crispr", query: "CRISPR OR gene editing" },
  { id: "ai-drug", query: "artificial intelligence drug discovery" },
  { id: "agritech", query: "crop biotechnology OR precision agriculture" },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

function secScore(form) {
  if (["S-1", "F-1", "8-A12B", "10-12B"].includes(form)) return 88;
  if (["8-K", "6-K"].includes(form)) return 78;
  if (["10-Q", "10-K", "20-F"].includes(form)) return 72;
  if (["424B4", "DEF 14A"].includes(form)) return 68;
  return 58;
}

function secRisk(form) {
  if (["S-1", "F-1", "424B4"].includes(form)) return 72;
  if (["8-K", "6-K"].includes(form)) return 64;
  return 52;
}

async function fetchSec(company) {
  const response = await fetch(`https://data.sec.gov/submissions/CIK${company.cik}.json`, {
    headers: {
      accept: "application/json",
      "user-agent": process.env.SEC_USER_AGENT || "FeniceInvestmentSystem/1.0 romitoorazio@gmail.com",
    },
  });
  if (!response.ok) throw new Error(`${company.symbol}: HTTP ${response.status}`);
  const data = await response.json();
  const recent = data?.filings?.recent ?? {};
  const forms = recent.form ?? [];
  const filings = [];
  const cutoff = Date.now() - 45 * 24 * 60 * 60 * 1000;

  for (let index = 0; index < Math.min(forms.length, 40); index += 1) {
    const form = forms[index];
    const filingDate = recent.filingDate?.[index];
    const dateMs = new Date(filingDate || 0).getTime();
    if (!Number.isFinite(dateMs) || dateMs < cutoff) continue;
    if (!["8-K", "6-K", "10-Q", "10-K", "20-F", "S-1", "F-1", "8-A12B", "10-12B", "424B4", "DEF 14A"].includes(form)) continue;
    const accession = recent.accessionNumber?.[index];
    const primary = recent.primaryDocument?.[index];
    const accessionPath = String(accession || "").replace(/-/g, "");
    const url = accession && primary
      ? `https://www.sec.gov/Archives/edgar/data/${Number(company.cik)}/${accessionPath}/${primary}`
      : `https://www.sec.gov/edgar/browse/?CIK=${Number(company.cik)}`;
    filings.push({
      id: `sec-${company.symbol}-${accession || filingDate}-${form}`,
      name: `${company.symbol} · deposito SEC ${form}`,
      category: "SEC",
      signal: `Deposito ufficiale ${form} presentato il ${filingDate}. Richiede lettura del documento prima di modificare la tesi di investimento.`,
      score: secScore(form),
      risk: secRisk(form),
      date: filingDate,
      source: "SEC EDGAR · fonte primaria",
      url,
      symbol: company.symbol,
      sourceTier: 1,
      verification: "primary",
    });
  }
  return filings;
}

function clinicalScore(study) {
  const phases = study?.protocolSection?.designModule?.phases ?? [];
  const status = study?.protocolSection?.statusModule?.overallStatus ?? "";
  let score = phases.includes("PHASE3") ? 86 : phases.includes("PHASE2") ? 76 : 64;
  if (["COMPLETED", "ACTIVE_NOT_RECRUITING"].includes(status)) score += 4;
  return Math.min(92, score);
}

async function fetchClinical(query) {
  const params = new URLSearchParams({
    "query.term": query.query,
    format: "json",
    pageSize: "20",
    sort: "LastUpdatePostDate:desc",
  });
  const response = await fetch(`https://clinicaltrials.gov/api/v2/studies?${params}`, {
    headers: { accept: "application/json", "user-agent": "FeniceInvestmentSystem/1.0" },
  });
  if (!response.ok) throw new Error(`${query.id}: HTTP ${response.status}`);
  const data = await response.json();
  return (data?.studies ?? []).map((study) => {
    const identification = study?.protocolSection?.identificationModule ?? {};
    const status = study?.protocolSection?.statusModule ?? {};
    const design = study?.protocolSection?.designModule ?? {};
    const nctId = identification.nctId;
    const phases = (design.phases ?? []).join(", ") || "fase non indicata";
    return {
      id: `clinical-${nctId}`,
      name: clean(identification.briefTitle || nctId || "Studio clinico"),
      category: "BIOTECH",
      signal: `${phases}; stato ${status.overallStatus || "non indicato"}. Ultimo aggiornamento ufficiale ${status.studyFirstPostDateStruct?.date || status.lastUpdatePostDateStruct?.date || "non disponibile"}.`,
      score: clinicalScore(study),
      risk: 74,
      date: status.lastUpdatePostDateStruct?.date,
      source: "ClinicalTrials.gov · fonte primaria",
      url: nctId ? `https://clinicaltrials.gov/study/${nctId}` : "https://clinicaltrials.gov/",
      sourceTier: 1,
      verification: "primary",
    };
  });
}

const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
const warnings = [...(snapshot.warnings ?? [])];
const events = [];

for (const company of trackedCompanies) {
  try {
    events.push(...(await fetchSec(company)));
  } catch (error) {
    warnings.push(`SEC ${company.symbol} non disponibile: ${error instanceof Error ? error.message : String(error)}`);
  }
  await sleep(180);
}

for (const query of clinicalQueries) {
  try {
    events.push(...(await fetchClinical(query)));
  } catch (error) {
    warnings.push(`ClinicalTrials ${query.id} non disponibile: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const existing = snapshot.discoveries ?? [];
const seen = new Set();
const discoveries = [...events, ...existing]
  .sort((a, b) => (b.sourceTier ?? 3) - (a.sourceTier ?? 3) || (b.score ?? 0) - (a.score ?? 0))
  .filter((item) => {
    const urlKey = item.url ? String(item.url).replace(/\?.*$/, "") : "";
    const titleKey = clean(item.name).toLowerCase().replace(/[^a-z0-9]+/g, " ");
    const key = urlKey || `${item.category}:${titleKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })
  .slice(0, 180);

const providers = (snapshot.providers ?? []).filter((item) => !["sec-primary", "clinical-primary"].includes(item.id));
const secCount = events.filter((item) => item.category === "SEC").length;
const clinicalCount = events.filter((item) => item.category === "BIOTECH").length;
providers.push({
  id: "sec-primary",
  name: "SEC EDGAR Primary Events",
  state: secCount ? "operativo" : "parziale",
  coverage: ["8-K", "6-K", "10-Q", "10-K", "S-1", "F-1", "IPO e registrazioni"],
  detail: `${secCount} filing recenti acquisiti per ${trackedCompanies.length} società monitorate.`,
  ...(secCount ? { lastSuccessAt: now } : {}),
});
providers.push({
  id: "clinical-primary",
  name: "ClinicalTrials.gov Primary Events",
  state: clinicalCount ? "operativo" : "parziale",
  coverage: ["studi clinici", "fase 2", "fase 3", "gene editing", "AI drug discovery"],
  detail: `${clinicalCount} studi clinici recenti acquisiti da fonte ufficiale.`,
  ...(clinicalCount ? { lastSuccessAt: now } : {}),
});

snapshot.discoveries = discoveries;
snapshot.providers = providers.sort((a, b) => a.name.localeCompare(b.name));
snapshot.warnings = [...new Set(warnings)].slice(0, 40);
snapshot.primaryEventCoverage = {
  checkedAt: now,
  secFilings: secCount,
  clinicalStudies: clinicalCount,
  trackedCompanies: trackedCompanies.map((item) => item.symbol),
  policy: "Le fonti primarie aumentano la confidenza, ma non generano ordini automatici.",
};

await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`Primary events: ${secCount} SEC filings, ${clinicalCount} clinical studies.`);
