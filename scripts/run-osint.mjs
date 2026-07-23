import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = path.join(root, "data", "latest-snapshot.json");
const reportPath = path.join(root, "data", "osint-intelligence.json");

function runGovernance() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts", "run-governance.mjs")], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Governance exited with ${code}`)));
  });
}

async function request(url, { format = "json", headers = {}, timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "FeniceInvestmentSystem/0.9 lawful-osint", ...headers },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return format === "text" ? response.text() : response.json();
  } finally {
    clearTimeout(timer);
  }
}

const clamp = (n, min = 0, max = 100) => Math.min(max, Math.max(min, n));
const clean = (value) => String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function addProvider(snapshot, provider) {
  snapshot.providers = (snapshot.providers || []).filter((item) => item.id !== provider.id);
  snapshot.providers.push(provider);
}

function addDiscovery(snapshot, item) {
  snapshot.discoveries = snapshot.discoveries || [];
  snapshot.discoveries.push(item);
}

async function collectCisa(snapshot, health) {
  const started = Date.now();
  try {
    const data = await request("https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json");
    const rows = Array.isArray(data?.vulnerabilities) ? data.vulnerabilities.slice(0, 40) : [];
    for (const row of rows.slice(0, 12)) {
      addDiscovery(snapshot, {
        id: `cisa-${row.cveID}`,
        name: `${row.vendorProject || "Vendor"} · ${row.product || row.cveID}`,
        category: "CYBER",
        signal: `Vulnerabilità sfruttata attivamente ${row.cveID}. Impatto potenziale su rischio operativo, fornitori e assicurazioni cyber.`,
        score: 66,
        risk: 84,
        date: row.dateAdded,
        source: "CISA KEV",
        url: `https://www.cisa.gov/known-exploited-vulnerabilities-catalog`,
      });
    }
    addProvider(snapshot, { id: "cisa-kev", name: "CISA Known Exploited Vulnerabilities", state: rows.length ? "operativo" : "parziale", coverage: ["cyber risk", "supply chain", "vulnerabilità sfruttate"], detail: `${rows.length} vulnerabilità recenti lette.`, lastSuccessAt: new Date().toISOString() });
    health.push({ id: "cisa-kev", status: rows.length ? "healthy" : "degraded", records: rows.length, latencyMs: Date.now() - started });
  } catch (error) {
    addProvider(snapshot, { id: "cisa-kev", name: "CISA Known Exploited Vulnerabilities", state: "errore", coverage: ["cyber risk"], detail: String(error) });
    health.push({ id: "cisa-kev", status: "failed", records: 0, error: String(error) });
  }
}

async function collectHackerNews(snapshot, health) {
  const started = Date.now();
  try {
    const ids = await request("https://hacker-news.firebaseio.com/v0/newstories.json");
    const selected = Array.isArray(ids) ? ids.slice(0, 35) : [];
    const stories = (await Promise.allSettled(selected.map((id) => request(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { timeoutMs: 8000 })))).filter((r) => r.status === "fulfilled").map((r) => r.value).filter(Boolean);
    const relevant = stories.filter((s) => /ai|robot|quantum|biotech|energy|battery|space|semiconductor|security|crypto|startup|funding/i.test(s.title || "")).slice(0, 15);
    for (const story of relevant) {
      addDiscovery(snapshot, {
        id: `hn-${story.id}`,
        name: clean(story.title),
        category: "TECH",
        signal: "Segnale tecnologico emergente da comunità tecnica pubblica; richiede conferma tramite fonti primarie.",
        score: clamp(48 + Math.min(18, Number(story.score || 0) / 10)),
        risk: 72,
        date: story.time ? new Date(story.time * 1000).toISOString() : undefined,
        source: "Hacker News",
        url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
      });
    }
    addProvider(snapshot, { id: "hackernews", name: "Hacker News", state: relevant.length ? "operativo" : "parziale", coverage: ["AI", "startup", "cybersecurity", "tecnologie emergenti"], detail: `${relevant.length} segnali tecnici pertinenti rilevati.`, lastSuccessAt: new Date().toISOString() });
    health.push({ id: "hackernews", status: relevant.length ? "healthy" : "degraded", records: relevant.length, latencyMs: Date.now() - started });
  } catch (error) {
    addProvider(snapshot, { id: "hackernews", name: "Hacker News", state: "errore", coverage: ["tecnologie emergenti"], detail: String(error) });
    health.push({ id: "hackernews", status: "failed", records: 0, error: String(error) });
  }
}

async function collectArxiv(snapshot, health) {
  const started = Date.now();
  try {
    const xml = await request("https://export.arxiv.org/api/query?search_query=all:%28artificial%20intelligence%20OR%20quantum%20OR%20battery%20OR%20gene%20therapy%20OR%20robotics%29&start=0&max_results=25&sortBy=submittedDate&sortOrder=descending", { format: "text" });
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
    for (const [index, entry] of entries.slice(0, 15).entries()) {
      const title = clean(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]);
      const published = clean(entry.match(/<published>(.*?)<\/published>/)?.[1]);
      const id = clean(entry.match(/<id>(.*?)<\/id>/)?.[1]);
      if (!title) continue;
      addDiscovery(snapshot, { id: `arxiv-${index}-${published}`, name: title, category: "RESEARCH", signal: "Nuova ricerca scientifica o tecnologica; non costituisce validazione commerciale.", score: 58, risk: 70, date: published, source: "arXiv", url: id });
    }
    addProvider(snapshot, { id: "arxiv", name: "arXiv", state: entries.length ? "operativo" : "parziale", coverage: ["AI", "quantum", "robotica", "energia", "biotech"], detail: `${entries.length} pubblicazioni recenti lette.`, lastSuccessAt: new Date().toISOString() });
    health.push({ id: "arxiv", status: entries.length ? "healthy" : "degraded", records: entries.length, latencyMs: Date.now() - started });
  } catch (error) {
    addProvider(snapshot, { id: "arxiv", name: "arXiv", state: "errore", coverage: ["ricerca scientifica"], detail: String(error) });
    health.push({ id: "arxiv", status: "failed", records: 0, error: String(error) });
  }
}

async function main() {
  await runGovernance();
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  const health = [];
  await Promise.allSettled([collectCisa(snapshot, health), collectHackerNews(snapshot, health), collectArxiv(snapshot, health)]);

  const seen = new Set();
  snapshot.discoveries = (snapshot.discoveries || []).filter((item) => {
    const key = `${item.category}:${String(item.name || "").toLowerCase().replace(/\W+/g, " ").trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 180);

  snapshot.providers = (snapshot.providers || []).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  snapshot.osint = {
    generatedAt: new Date().toISOString(),
    lawfulCollectionOnly: true,
    directDarkWebAccess: false,
    illicitMarketAccess: false,
    credentialCollection: false,
    sources: health,
    note: "Fenice usa fonti pubbliche e feed legali, inclusi indicatori cyber che possono riflettere minacce discusse anche in ambienti underground, senza accedere direttamente a servizi illeciti.",
  };
  snapshot.headline = `${snapshot.markets?.length || 0} strumenti, ${snapshot.discoveries.length} segnali, ${snapshot.macro?.length || 0} indicatori e ${snapshot.providers.length} fonti controllate.`;

  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await writeFile(reportPath, `${JSON.stringify(snapshot.osint, null, 2)}\n`, "utf8");
  console.log(`Fenice lawful OSINT completed: ${health.filter((s) => s.status === "healthy").length}/${health.length} nuove fonti operative.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
