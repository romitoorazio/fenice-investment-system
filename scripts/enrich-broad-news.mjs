import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const snapshotPath = path.resolve(__dirname, "..", "data", "latest-snapshot.json");
const endpoint = "https://api.gdeltproject.org/api/v2/doc/doc";
const now = new Date().toISOString();

const themes = [
  {
    id: "geopolitics",
    query: '(war OR conflict OR sanctions OR tariffs OR election OR cyberattack OR "shipping route" OR energy security)',
    category: "NEWS",
  },
  {
    id: "macro",
    query: '(inflation OR recession OR "central bank" OR "interest rates" OR employment OR GDP OR commodities OR oil)',
    category: "NEWS",
  },
  {
    id: "ai",
    query: '("artificial intelligence" OR semiconductor OR datacenter OR robotics OR quantum OR cloud computing)',
    category: "NEWS",
  },
  {
    id: "biotech",
    query: '(biotech OR "FDA approval" OR "clinical trial" OR "phase 3" OR CRISPR OR gene therapy OR drug discovery)',
    category: "BIOTECH",
  },
  {
    id: "agritech",
    query: '(agritech OR "precision agriculture" OR irrigation OR fertilizer OR crop technology OR food security)',
    category: "NEWS",
  },
];

function score(title = "") {
  const text = title.toLowerCase();
  let value = 52;
  if (/fda approval|phase 3|breakthrough|merger|acquisition/.test(text)) value += 18;
  if (/sanction|war|conflict|recession|crisis|cyberattack/.test(text)) value += 12;
  if (/artificial intelligence|semiconductor|crispr|agritech|precision agriculture/.test(text)) value += 10;
  return Math.min(95, value);
}

function errorMessage(reason) {
  return reason instanceof Error ? reason.message : String(reason);
}

async function fetchTheme(theme) {
  const url = `${endpoint}?query=${encodeURIComponent(theme.query)}&mode=ArtList&maxrecords=50&format=json&sort=HybridRel`;
  const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "FeniceInvestmentSystem/1.0" } });
  if (!response.ok) throw new Error(`${theme.id}: HTTP ${response.status}`);
  const data = await response.json();
  return (data?.articles ?? []).map((article, index) => ({
    id: `broad-${theme.id}-${article.seendate || index}-${index}`,
    name: article.title || "Notizia senza titolo",
    category: theme.category,
    signal: `Segnale ${theme.id} rilevato da ${article.domain || "fonte globale"}.`,
    score: score(article.title),
    risk: theme.id === "geopolitics" ? 76 : theme.id === "biotech" ? 70 : 64,
    date: article.seendate,
    source: `GDELT ${theme.id} · ${article.domain || "fonte globale"}`,
    url: article.url,
    _domain: article.domain || "unknown",
    _theme: theme.id,
  }));
}

const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
const results = await Promise.allSettled(themes.map(fetchTheme));
const inheritedWarnings = [...(snapshot.warnings ?? [])];
const coreGdeltFailures = inheritedWarnings.filter((warning) => /^GDELT .* non acquisit[oa]:/i.test(String(warning)));
const warnings = inheritedWarnings.filter((warning) => !/^GDELT .* non acquisit[oa]:/i.test(String(warning)));
const incoming = [];
const themeFailures = [];

for (const [index, result] of results.entries()) {
  if (result.status === "fulfilled") {
    incoming.push(...result.value);
  } else {
    themeFailures.push({ theme: themes[index].id, error: errorMessage(result.reason) });
  }
}

const domainCounts = new Map();
const selected = incoming
  .sort((a, b) => b.score - a.score)
  .filter((item) => {
    const used = domainCounts.get(item._domain) ?? 0;
    if (used >= 2) return false;
    domainCounts.set(item._domain, used + 1);
    return true;
  })
  .slice(0, 60)
  .map(({ _domain, _theme, ...item }) => item);

const existing = snapshot.discoveries ?? [];
const seen = new Set();
const discoveries = [...selected, ...existing]
  .filter((item) => {
    const key = `${item.category}:${String(item.name).toLowerCase().replace(/\W+/g, " ").trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })
  .slice(0, 120);

const failedThemeNames = themeFailures.map((item) => item.theme);
if (coreGdeltFailures.length || themeFailures.length) {
  const failedPart = failedThemeNames.length ? ` Temi non aggiornati: ${failedThemeNames.join(", ")}.` : "";
  warnings.push(
    `Copertura notizie GDELT parziale: Fenice mantiene i segnali incompleti fuori dalle conferme forti e riduce la fiducia finché la fonte non recupera.${failedPart}`,
  );
}

const providers = (snapshot.providers ?? []).filter((item) => item.id !== "broad-news");
providers.push({
  id: "broad-news",
  name: "Broad News Matrix",
  state: selected.length >= 20 && themeFailures.length === 0 ? "operativo" : selected.length ? "parziale" : "errore",
  coverage: ["geopolitica", "macroeconomia", "AI", "biotech", "agritech", "fonti editoriali diversificate"],
  detail: `${selected.length} notizie selezionate da ${domainCounts.size} domini distinti; ${themes.length - themeFailures.length}/${themes.length} temi aggiornati.`,
  ...(selected.length ? { lastSuccessAt: now } : {}),
});

snapshot.discoveries = discoveries;
snapshot.providers = providers.sort((a, b) => a.name.localeCompare(b.name));
snapshot.warnings = [...new Set(warnings)].slice(0, 30);
snapshot.newsCoverage = {
  checkedAt: now,
  themes: themes.map((item) => item.id),
  distinctDomains: domainCounts.size,
  selectedArticles: selected.length,
  successfulThemes: themes.length - themeFailures.length,
  failedThemes: failedThemeNames,
  diagnostics: [
    ...coreGdeltFailures.map((warning) => ({ scope: "core", error: String(warning) })),
    ...themeFailures.map((failure) => ({ scope: failure.theme, error: failure.error })),
  ],
  rule: "Massimo due articoli per dominio per ridurre concentrazione e bias editoriale. Errori tecnici transitori restano nei diagnostics e non vengono moltiplicati negli avvisi utente.",
};

await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`Broad news enrichment: ${selected.length} articoli, ${domainCounts.size} domini distinti, ${themes.length - themeFailures.length}/${themes.length} temi aggiornati.`);
