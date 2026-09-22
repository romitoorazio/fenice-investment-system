import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const snapshotPath = path.resolve(__dirname, "..", "data", "latest-snapshot.json");
const endpoint = "https://api.gdeltproject.org/api/v2/doc/doc";
const rssEndpoint = "https://news.google.com/rss/search";
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

function decodeXml(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function xmlTag(block, tag) {
  const match = String(block).match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return decodeXml(match?.[1] ?? "").trim();
}

function publisherFromTitle(title) {
  const parts = String(title).split(" - ").map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts.at(-1) : "Google News RSS";
}

function parseRssItems(xml, theme) {
  const blocks = String(xml).match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  return blocks.slice(0, 25).map((block, index) => {
    const title = xmlTag(block, "title") || "Notizia senza titolo";
    const link = xmlTag(block, "link");
    const published = xmlTag(block, "pubDate");
    const publisher = publisherFromTitle(title);
    const parsedDate = Date.parse(published);
    return {
      id: `rss-${theme.id}-${Number.isFinite(parsedDate) ? parsedDate : index}-${index}`,
      name: title,
      category: theme.category,
      signal: `Segnale ${theme.id} rilevato tramite feed RSS pubblico; richiede conferma da fonte primaria o indipendente.`,
      score: Math.max(0, score(title) - 8),
      risk: theme.id === "geopolitics" ? 80 : theme.id === "biotech" ? 74 : 68,
      date: Number.isFinite(parsedDate) ? new Date(parsedDate).toISOString() : undefined,
      source: `Google News RSS · ${publisher}`,
      url: link || undefined,
      _domain: publisher,
      _theme: theme.id,
      _fallback: true,
    };
  });
}

async function fetchGdeltTheme(theme) {
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
    source: `GDELT ${theme.id} · ${article.domain || "notizie globali"}`,
    url: article.url,
    _domain: article.domain || "unknown",
    _theme: theme.id,
    _fallback: false,
  }));
}

async function fetchRssTheme(theme) {
  const url = `${rssEndpoint}?q=${encodeURIComponent(theme.query)}&hl=en-US&gl=US&ceid=US:en`;
  const response = await fetch(url, {
    headers: {
      accept: "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.5",
      "user-agent": "FeniceInvestmentSystem/1.0",
    },
  });
  if (!response.ok) throw new Error(`${theme.id}: RSS HTTP ${response.status}`);
  const items = parseRssItems(await response.text(), theme);
  if (!items.length) throw new Error(`${theme.id}: RSS senza articoli validi`);
  return items;
}

async function fetchThemeWithFallback(theme) {
  try {
    return { items: await fetchGdeltTheme(theme), primary: true, primaryError: null };
  } catch (primaryError) {
    try {
      return {
        items: await fetchRssTheme(theme),
        primary: false,
        primaryError: errorMessage(primaryError),
      };
    } catch (fallbackError) {
      const error = new Error(`${theme.id}: GDELT ${errorMessage(primaryError)}; RSS ${errorMessage(fallbackError)}`);
      error.cause = { primaryError, fallbackError };
      throw error;
    }
  }
}

const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
const results = await Promise.allSettled(themes.map(fetchThemeWithFallback));
const inheritedWarnings = [...(snapshot.warnings ?? [])];
const coreGdeltFailures = inheritedWarnings.filter((warning) => /^GDELT .* non acquisit[oa]:/i.test(String(warning)));
const warnings = inheritedWarnings.filter((warning) => !/^GDELT .* non acquisit[oa]:/i.test(String(warning)));
const incoming = [];
const themeFailures = [];
const fallbackThemes = [];
const primaryDiagnostics = [];

for (const [index, result] of results.entries()) {
  const theme = themes[index];
  if (result.status === "fulfilled") {
    incoming.push(...result.value.items);
    if (!result.value.primary) {
      fallbackThemes.push(theme.id);
      primaryDiagnostics.push({ scope: theme.id, error: result.value.primaryError });
    }
  } else {
    themeFailures.push({ theme: theme.id, error: errorMessage(result.reason) });
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
  .map(({ _domain, _theme, _fallback, ...item }) => item);

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
if (coreGdeltFailures.length || fallbackThemes.length || themeFailures.length) {
  const fallbackPart = fallbackThemes.length ? ` Fallback RSS attivo per: ${fallbackThemes.join(", ")}.` : "";
  const failedPart = failedThemeNames.length ? ` Temi senza copertura: ${failedThemeNames.join(", ")}.` : "";
  warnings.push(
    `Copertura notizie primaria parziale: Fenice non usa il fallback RSS come conferma forte e riduce la fiducia dove GDELT non è disponibile.${fallbackPart}${failedPart}`,
  );
}

const successfulThemes = themes.length - themeFailures.length;
const primaryThemes = successfulThemes - fallbackThemes.length;
const providers = (snapshot.providers ?? []).filter((item) => item.id !== "broad-news");
providers.push({
  id: "broad-news",
  name: "Broad News Matrix",
  state: selected.length >= 20 && primaryThemes === themes.length ? "operativo" : selected.length ? "parziale" : "errore",
  coverage: ["geopolitica", "macroeconomia", "AI", "biotech", "agritech", "fonti editoriali diversificate"],
  detail: `${selected.length} notizie selezionate da ${domainCounts.size} domini distinti; ${primaryThemes}/${themes.length} temi da GDELT, ${fallbackThemes.length} via fallback RSS.`,
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
  successfulThemes,
  primaryThemes,
  fallbackThemes,
  failedThemes: failedThemeNames,
  fallbackPolicy: "Google News RSS è solo discovery/fallback e non vale come conferma forte o fonte primaria.",
  diagnostics: [
    ...coreGdeltFailures.map((warning) => ({ scope: "core", error: String(warning) })),
    ...primaryDiagnostics,
    ...themeFailures.map((failure) => ({ scope: failure.theme, error: failure.error })),
  ],
  rule: "Massimo due articoli per editore/dominio per ridurre concentrazione e bias. Errori tecnici transitori restano nei diagnostics e non vengono moltiplicati negli avvisi utente.",
};

await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`Broad news enrichment: ${selected.length} articoli, ${domainCounts.size} domini, ${primaryThemes}/${themes.length} temi primari, ${fallbackThemes.length} fallback RSS.`);
