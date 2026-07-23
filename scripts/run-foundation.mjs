import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = path.join(root, "data", "latest-snapshot.json");
const healthPath = path.join(root, "data", "source-health.json");
const historyDir = path.join(root, "data", "history");
const job = process.env.FENICE_JOB || "daily";
const startedAt = new Date();

function runLegacyCollector() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts", "run-autonomy.mjs")], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`Collector exited with ${code}`))));
  });
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 18000);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "FeniceInvestmentSystem/2.0", accept: "application/json", ...(options.headers || {}) },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { data: await response.json(), latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timeout);
  }
}

const number = (value) => {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : undefined;
};

function upsertProvider(snapshot, status) {
  snapshot.providers = snapshot.providers.filter((item) => item.id !== status.id);
  snapshot.providers.push(status);
}

function upsertMacro(snapshot, reading) {
  snapshot.macro = snapshot.macro.filter((item) => item.id !== reading.id);
  snapshot.macro.push(reading);
}

async function collectWorldBank(snapshot, health) {
  const id = "worldbank";
  const started = Date.now();
  try {
    const indicators = [
      ["NY.GDP.MKTP.KD.ZG", "WORLD_GDP_GROWTH", "Crescita PIL mondiale", "%"],
      ["FP.CPI.TOTL.ZG", "WORLD_INFLATION", "Inflazione mondiale", "%"],
    ];
    let records = 0;
    for (const [indicator, readingId, label, unit] of indicators) {
      const { data } = await request(`https://api.worldbank.org/v2/country/WLD/indicator/${indicator}?format=json&per_page=8`);
      const row = Array.isArray(data?.[1]) ? data[1].find((item) => item.value !== null) : null;
      if (!row) continue;
      upsertMacro(snapshot, { id: readingId, label, value: number(row.value), date: row.date, unit, source: "World Bank" });
      records += 1;
    }
    const ok = records > 0;
    upsertProvider(snapshot, { id, name: "World Bank", state: ok ? "operativo" : "errore", coverage: ["PIL mondiale", "inflazione mondiale"], detail: `${records}/2 indicatori acquisiti.`, ...(ok ? { lastSuccessAt: new Date().toISOString() } : {}) });
    health.push({ id, status: ok ? "healthy" : "failed", records, latencyMs: Date.now() - started, checkedAt: new Date().toISOString() });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    upsertProvider(snapshot, { id, name: "World Bank", state: "errore", coverage: ["PIL mondiale", "inflazione mondiale"], detail });
    health.push({ id, status: "failed", records: 0, latencyMs: Date.now() - started, checkedAt: new Date().toISOString(), error: detail });
  }
}

async function collectEcb(snapshot, health) {
  const id = "ecb";
  const started = Date.now();
  try {
    const { data, latencyMs } = await request("https://data-api.ecb.europa.eu/service/data/FM/B.U2.EUR.4F.KR.MRR_FR.LEV?format=jsondata&lastNObservations=1");
    const series = data?.dataSets?.[0]?.series;
    const first = series ? Object.values(series)[0] : undefined;
    const observation = first?.observations ? Object.values(first.observations)[0] : undefined;
    const value = Array.isArray(observation) ? number(observation[0]) : undefined;
    if (value === undefined) throw new Error("Dato BCE non interpretabile");
    upsertMacro(snapshot, { id: "ECB_DEPOSIT_RATE", label: "Tasso di riferimento BCE", value, date: new Date().toISOString().slice(0, 10), unit: "%", source: "BCE Data Portal" });
    upsertProvider(snapshot, { id, name: "Banca Centrale Europea", state: "operativo", coverage: ["tassi area euro", "politica monetaria BCE"], detail: "Tasso ufficiale acquisito dal portale dati BCE.", lastSuccessAt: new Date().toISOString() });
    health.push({ id, status: "healthy", records: 1, latencyMs, checkedAt: new Date().toISOString() });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    upsertProvider(snapshot, { id, name: "Banca Centrale Europea", state: "errore", coverage: ["tassi area euro", "politica monetaria BCE"], detail });
    health.push({ id, status: "failed", records: 0, latencyMs: Date.now() - started, checkedAt: new Date().toISOString(), error: detail });
  }
}

async function collectClinicalTrials(snapshot, health) {
  const id = "clinicaltrials";
  const started = Date.now();
  try {
    const query = encodeURIComponent("AREA[StudyType]INTERVENTIONAL AND (AI OR CRISPR OR gene therapy OR oncology)");
    const { data, latencyMs } = await request(`https://clinicaltrials.gov/api/v2/studies?query.term=${query}&pageSize=20&format=json`);
    const studies = Array.isArray(data?.studies) ? data.studies : [];
    for (const study of studies.slice(0, 15)) {
      const protocol = study.protocolSection || {};
      const identification = protocol.identificationModule || {};
      const status = protocol.statusModule || {};
      const nctId = identification.nctId;
      if (!nctId) continue;
      snapshot.discoveries.push({
        id: `ct-${nctId}`,
        name: identification.briefTitle || nctId,
        category: "BIOTECH",
        signal: `Studio clinico ${status.overallStatus || "in aggiornamento"}; fase ${(protocol.designModule?.phases || []).join(", ") || "non indicata"}.`,
        score: 64,
        risk: 76,
        date: status.studyFirstPostDateStruct?.date,
        source: "ClinicalTrials.gov",
        url: `https://clinicaltrials.gov/study/${nctId}`,
      });
    }
    upsertProvider(snapshot, { id, name: "ClinicalTrials.gov", state: studies.length ? "operativo" : "parziale", coverage: ["studi clinici", "biotech", "terapia genica", "oncologia"], detail: `${studies.length} studi recenti acquisiti.`, ...(studies.length ? { lastSuccessAt: new Date().toISOString() } : {}) });
    health.push({ id, status: studies.length ? "healthy" : "degraded", records: studies.length, latencyMs, checkedAt: new Date().toISOString() });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    upsertProvider(snapshot, { id, name: "ClinicalTrials.gov", state: "errore", coverage: ["studi clinici", "biotech"], detail });
    health.push({ id, status: "failed", records: 0, latencyMs: Date.now() - started, checkedAt: new Date().toISOString(), error: detail });
  }
}

function dedupe(snapshot) {
  const seen = new Set();
  snapshot.discoveries = snapshot.discoveries.filter((item) => {
    const key = item.id || `${item.category}:${item.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 150);
  snapshot.providers.sort((a, b) => a.name.localeCompare(b.name));
}

async function main() {
  await mkdir(historyDir, { recursive: true });
  await runLegacyCollector();
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  const health = [];

  await Promise.allSettled([
    collectWorldBank(snapshot, health),
    collectEcb(snapshot, health),
    ...(job === "daily" || job === "full" ? [collectClinicalTrials(snapshot, health)] : []),
  ]);

  dedupe(snapshot);
  const healthy = health.filter((item) => item.status === "healthy").length;
  snapshot.foundation = {
    version: 1,
    job,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    sourceHealth: { healthy, total: health.length },
    immutableHistory: true,
    tradingDisabled: true,
  };
  snapshot.headline = `${snapshot.markets.length} strumenti, ${snapshot.discoveries.length} segnali, ${snapshot.macro.length} indicatori e ${snapshot.providers.length} fonti controllate.`;

  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
  await writeFile(snapshotPath, serialized, "utf8");
  await writeFile(healthPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), job, sources: health }, null, 2)}\n`, "utf8");
  await writeFile(path.join(historyDir, `${new Date().toISOString().replaceAll(":", "-")}.json`), serialized, "utf8");
  console.log(`Fenice Foundation completed (${job}): ${snapshot.headline}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
