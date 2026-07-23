import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "data", "internet-source-catalog.json");
const snapshotPath = path.join(root, "data", "latest-snapshot.json");
const reportPath = path.join(root, "data", "internet-ingestion-report.json");
const rawDir = path.join(root, "data", "raw", new Date().toISOString().slice(0, 10));

const MAX_CONCURRENCY = Number(process.env.FENICE_SOURCE_CONCURRENCY || 4);
const TIMEOUT_MS = Number(process.env.FENICE_SOURCE_TIMEOUT_MS || 20000);
const RETRIES = Number(process.env.FENICE_SOURCE_RETRIES || 2);

function runPreviousPipeline() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts", "run-osint.mjs")], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`OSINT pipeline exited with ${code}`)));
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const safeName = (value) => String(value).replace(/[^a-z0-9._-]+/gi, "-").slice(0, 120);

async function fetchWithRetry(source) {
  let lastError;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const started = Date.now();
    try {
      const response = await fetch(source.url, {
        signal: controller.signal,
        headers: {
          accept: source.format === "json" || source.format === "hn" ? "application/json" : "application/atom+xml,text/xml,text/plain,*/*",
          "user-agent": process.env.SEC_USER_AGENT || "FeniceInvestmentSystem/1.0 research@fenice.local",
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      return {
        ok: true,
        text,
        contentType: response.headers.get("content-type") || "",
        status: response.status,
        latencyMs: Date.now() - started,
        attempts: attempt + 1,
      };
    } catch (error) {
      lastError = error;
      if (attempt < RETRIES) await sleep(750 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    ok: false,
    error: lastError instanceof Error ? lastError.message : String(lastError),
    attempts: RETRIES + 1,
  };
}

function parseAtomEntries(xml) {
  const entries = [];
  const blocks = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  for (const block of blocks.slice(0, 60)) {
    const read = (tag) => {
      const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
      return match?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    };
    const link = block.match(/<link[^>]+href="([^"]+)"/i)?.[1];
    entries.push({ title: read("title"), summary: read("summary"), published: read("published"), updated: read("updated"), url: link });
  }
  return entries.filter((item) => item.title);
}

function normalizeJson(source, data) {
  if (source.id === "cisa-kev") {
    return (data.vulnerabilities || []).slice(-80).reverse().map((item) => ({
      id: `${source.id}-${item.cveID}`,
      title: `${item.cveID} · ${item.vendorProject || "Vendor"} ${item.product || ""}`.trim(),
      summary: item.shortDescription,
      date: item.dateAdded,
      url: `https://nvd.nist.gov/vuln/detail/${item.cveID}`,
      category: "CYBER",
      risk: 92,
      score: 68,
    }));
  }
  if (source.id === "nvd-cve") {
    return (data.vulnerabilities || []).slice(0, 60).map(({ cve }) => ({
      id: `${source.id}-${cve?.id}`,
      title: cve?.id || "CVE",
      summary: cve?.descriptions?.find((item) => item.lang === "en")?.value,
      date: cve?.published,
      url: cve?.id ? `https://nvd.nist.gov/vuln/detail/${cve.id}` : undefined,
      category: "CYBER",
      risk: 84,
      score: 58,
    })).filter((item) => item.id);
  }
  if (source.id === "clinical-trials") {
    return (data.studies || []).slice(0, 50).map((study) => {
      const p = study.protocolSection || {};
      const id = p.identificationModule?.nctId;
      return {
        id: `${source.id}-${id}`,
        title: p.identificationModule?.briefTitle || id,
        summary: `Studio ${p.statusModule?.overallStatus || "in aggiornamento"}; fase ${(p.designModule?.phases || []).join(", ") || "non indicata"}.`,
        date: p.statusModule?.studyFirstPostDateStruct?.date,
        url: id ? `https://clinicaltrials.gov/study/${id}` : undefined,
        category: "BIOTECH",
        risk: 76,
        score: 64,
      };
    }).filter((item) => item.title);
  }
  if (source.id === "coingecko-trending") {
    return (data.coins || []).slice(0, 20).map((entry) => ({
      id: `${source.id}-${entry.item?.id}`,
      title: entry.item?.name,
      summary: `Asset crypto in tendenza; market-cap rank ${entry.item?.market_cap_rank ?? "n/d"}.`,
      url: entry.item?.id ? `https://www.coingecko.com/en/coins/${entry.item.id}` : undefined,
      category: "CRYPTO",
      risk: 88,
      score: 60,
    })).filter((item) => item.title);
  }
  if (source.id === "world-bank") {
    const rows = Array.isArray(data?.[1]) ? data[1] : [];
    return rows.filter((item) => item.value !== null).slice(0, 8).map((item) => ({
      id: `${source.id}-${item.indicator?.id}-${item.date}`,
      title: `${item.indicator?.value || "World Bank indicator"} ${item.date}`,
      summary: `Valore: ${item.value}`,
      date: item.date,
      category: "MACRO",
      risk: 30,
      score: 70,
    }));
  }
  return [];
}

async function enrichHackerNews(ids) {
  const selected = Array.isArray(ids) ? ids.slice(0, 35) : [];
  const results = [];
  for (let index = 0; index < selected.length; index += MAX_CONCURRENCY) {
    const batch = selected.slice(index, index + MAX_CONCURRENCY);
    const items = await Promise.all(batch.map(async (id) => {
      try {
        const response = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
        if (!response.ok) return null;
        return await response.json();
      } catch {
        return null;
      }
    }));
    results.push(...items.filter(Boolean));
  }
  return results.map((item) => ({
    id: `hacker-news-${item.id}`,
    title: item.title,
    summary: `Discussione tecnologica con ${item.score || 0} punti e ${item.descendants || 0} commenti.`,
    date: item.time ? new Date(item.time * 1000).toISOString() : undefined,
    url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
    category: "TECHNOLOGY",
    risk: 66,
    score: Math.min(75, 45 + Math.log10(Math.max(1, item.score || 1)) * 12),
  })).filter((item) => item.title);
}

async function collectSource(source) {
  const fetched = await fetchWithRetry(source);
  const base = {
    id: source.id,
    name: source.name,
    tier: source.tier,
    category: source.category,
    checkedAt: new Date().toISOString(),
    ...fetched,
  };
  if (!fetched.ok) return { status: base, records: [] };

  await mkdir(rawDir, { recursive: true });
  await writeFile(path.join(rawDir, `${safeName(source.id)}.${source.format === "json" || source.format === "hn" ? "json" : "xml"}`), fetched.text, "utf8");

  try {
    if (source.format === "atom") {
      const records = parseAtomEntries(fetched.text).map((item, index) => ({
        id: `${source.id}-${index}-${item.published || item.updated || "latest"}`,
        title: item.title,
        summary: item.summary,
        date: item.published || item.updated,
        url: item.url,
        category: "RESEARCH",
        risk: 62,
        score: 66,
      }));
      return { status: { ...base, records: records.length }, records };
    }

    const data = JSON.parse(fetched.text);
    const records = source.format === "hn" ? await enrichHackerNews(data) : normalizeJson(source, data);
    return { status: { ...base, records: records.length }, records };
  } catch (error) {
    return {
      status: { ...base, ok: false, parseError: error instanceof Error ? error.message : String(error), records: 0 },
      records: [],
    };
  }
}

async function parallelMap(items, worker, concurrency) {
  const output = new Array(items.length);
  let cursor = 0;
  async function runner() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runner));
  return output;
}

function dedupeSignals(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item.id || `${item.category}:${item.title}`).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function main() {
  await runPreviousPipeline();
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const sources = (catalog.sources || []).filter((source) => source.enabled && source.format !== "special");
  const results = await parallelMap(sources, collectSource, MAX_CONCURRENCY);
  const statuses = results.map((item) => item.status);
  const collected = dedupeSignals(results.flatMap((item) => item.records));

  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  const existing = Array.isArray(snapshot.discoveries) ? snapshot.discoveries : [];
  const mapped = collected.map((item) => ({
    id: item.id,
    name: item.title,
    signal: item.summary || "Segnale acquisito da fonte internet configurata.",
    category: item.category,
    score: Math.round(item.score || 50),
    risk: Math.round(item.risk || 60),
    date: item.date,
    url: item.url,
    source: statuses.find((status) => item.id?.startsWith(`${status.id}-`))?.name || "Internet source",
    provenance: {
      collectedAt: new Date().toISOString(),
      legalPublicSource: true,
      rawArchive: true,
      requiresHumanVerification: true,
    },
  }));

  snapshot.discoveries = dedupeSignals([...mapped, ...existing]).slice(0, 300);
  snapshot.internetIngestion = {
    generatedAt: new Date().toISOString(),
    configuredSources: sources.length,
    successfulSources: statuses.filter((item) => item.ok).length,
    failedSources: statuses.filter((item) => !item.ok).length,
    recordsCollected: mapped.length,
    rawArchiveDirectory: path.relative(root, rawDir),
    concurrency: MAX_CONCURRENCY,
    retries: RETRIES,
    timeoutMs: TIMEOUT_MS,
    sourceStatuses: statuses,
    limitations: [
      "Nessun sistema può leggere o analizzare letteralmente l'intero Internet.",
      "Le fonti con autenticazione, paywall o licenza richiedono credenziali e permessi separati.",
      "Il dark web non viene interrogato direttamente; si usano soltanto fonti legali di threat intelligence.",
    ],
  };
  snapshot.headline = `${snapshot.markets?.length || 0} strumenti, ${snapshot.discoveries.length} segnali, ${snapshot.macro?.length || 0} indicatori e ${snapshot.providers?.length || 0} fonti controllate.`;

  const report = {
    ...snapshot.internetIngestion,
    catalogVersion: catalog.version,
    policy: catalog.policy,
  };

  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Fenice Internet Orchestrator: ${report.successfulSources}/${report.configuredSources} sources, ${report.recordsCollected} records.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
