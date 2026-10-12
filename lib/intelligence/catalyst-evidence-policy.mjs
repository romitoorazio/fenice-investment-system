import { catalystMatchesAsset } from "./catalyst-matching.mjs";

const DAY_MS = 86_400_000;
const PRIMARY_MAX_AGE_DAYS = 14;
const PRIMARY_DOMAINS = {
  sec: new Set(["sec.gov", "www.sec.gov", "data.sec.gov"]),
  clinical: new Set(["clinicaltrials.gov", "www.clinicaltrials.gov"]),
};

function normalizedTicker(value) {
  return typeof value === "string" && /^[A-Z0-9][A-Z0-9._-]{0,24}$/i.test(value.trim())
    ? value.trim().toUpperCase() : null;
}

export function parsePrimaryEventDate(date) {
  const value = typeof date === "string" ? date.trim() : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const iso = `${value}T00:00:00.000Z`;
    const time = Date.parse(iso);
    return Number.isFinite(time) && new Date(time).toISOString() === iso ? time : null;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    const iso = value.endsWith("Z") && !value.includes(".") ? value.replace(/Z$/, ".000Z") : value;
    const time = Date.parse(iso);
    return Number.isFinite(time) && new Date(time).toISOString() === iso ? time : null;
  }
  return null;
}

export function primaryCatalystIdentity(event, nowMs = Date.now()) {
  if (event?.verification !== "primary" || event?.sourceTier !== 1 || !Number.isFinite(nowMs)) return null;
  const symbol = normalizedTicker(event.symbol);
  if (!symbol) return null; // Unattributed sector news and clinical studies are research only.
  const eventAt = parsePrimaryEventDate(event.date);
  if (eventAt === null || eventAt > nowMs || nowMs - eventAt > PRIMARY_MAX_AGE_DAYS * DAY_MS) return null;
  let link;
  try {
    link = new URL(String(event.url || ""));
  } catch {
    return null;
  }
  if (link.protocol !== "https:" || link.username || link.password || !link.hostname) return null;
  const host = link.hostname.toLowerCase();
  const source = String(event.source || "");
  const type = /^SEC EDGAR\b/i.test(source) ? "sec"
    : /^ClinicalTrials\.gov\b/i.test(source) ? "clinical" : null;
  if (!type || !PRIMARY_DOMAINS[type].has(host)) return null;
  if (type === "sec" && !/\/Archives\/|\/edgar\/browse\//i.test(link.pathname)) return null;
  if (type === "clinical" && !/^\/study\/NCT\d{8}$/i.test(link.pathname)) return null;
  const headline = String(event.name || "").trim();
  if (!headline || headline.length > 350) return null;
  return { symbol, id: `${type}:${link.origin}${link.pathname}`, url: link.toString(), title: headline, source, date: event.date };
}

export function compareDiscoveryEvidence(a, b) {
  // Smaller tier is stronger; 1 is source-primary, 3 an unattributed feed.
  const aTier = Number.isSafeInteger(a?.sourceTier) && a.sourceTier >= 1 ? a.sourceTier : 3;
  const bTier = Number.isSafeInteger(b?.sourceTier) && b.sourceTier >= 1 ? b.sourceTier : 3;
  return aTier - bTier || (Number(b?.score) || 0) - (Number(a?.score) || 0);
}

export function evaluateCatalystEvidence(asset, discoveries, nowMs = Date.now()) {
  const list = Array.isArray(discoveries) ? discoveries : [];
  const matchingMentions = list.filter(item => catalystMatchesAsset(asset, item));
  const ticker = normalizedTicker(asset?.symbol);
  const verified = [];
  const seen = new Set();
  if (ticker) for (const item of matchingMentions) {
    const evidence = primaryCatalystIdentity(item, nowMs);
    if (!evidence || evidence.symbol !== ticker || seen.has(evidence.id)) continue;
    seen.add(evidence.id);
    verified.push(evidence);
  }
  const recent = verified.slice(0, 4);
  const score = Math.min(78, 48 + Math.min(30, verified.length * 8));
  return {
    score,
    count: verified.length,
    recentCount: verified.length,
    researchMentions: matchingMentions.length,
    unverifiedMentions: matchingMentions.length - verified.length,
    evidence: recent.map(item => `${item.title} · ${item.source} · ${item.date}`),
    sourceUrls: recent.map(item => item.url),
    policy: "Solo eventi primari recenti, associati direttamente al ticker e verificabili da URL ufficiale possono incrementare lo score. Le notizie restano research-only.",
    executionEligible: false,
  };
}
