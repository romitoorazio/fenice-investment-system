import { appendFile, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { classifyQuote } from "../lib/market/world-v7-provider-probe.mjs";

const micPattern = /^[A-Z0-9]{4}$/;
const quoteBudget = 4;
const day = 86_400_000;
const quoteDelay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function collectWorldMarketObservations({ catalogue, previous, request, now, delay = quoteDelay }) {
  const started = now();
  const catalogueAge = started - Date.parse(catalogue?.generatedAt);
  const catalogueUsable = catalogueAge >= 0 && catalogueAge <= 10 * day
    && catalogue?.status === "PRIVATE_RESEARCH_REFERENCES_ONLY" && catalogue?.safety?.researchOnly === true;
  const venues = new Map();
  const references = new Map();
  if (catalogueUsable) {
    for (const [mic, venue] of Object.entries(catalogue.venues ?? {})) {
      if (micPattern.test(mic) && micPattern.test(venue?.operatingMic) && /^[A-Z]{2}$/.test(venue.country)) {
        venues.set(mic, { operatingMic: venue.operatingMic, country: venue.country });
      }
    }
    for (const row of Array.isArray(catalogue.references) ? catalogue.references : []) {
      if (!micPattern.test(row?.mic) || !/^[A-Z0-9][A-Z0-9._-]{0,19}$/.test(row.ticker)
        || !/^[A-Z]{3}$/.test(row.currency) || row.referenceOnly !== true || row.paperAllowed !== false) continue;
      if (!venues.has(row.mic) && /^[A-Z]{2}$/.test(row.venueCountry)) {
        venues.set(row.mic, { operatingMic: row.mic, country: row.venueCountry });
      }
      if (!venues.has(row.mic)) continue;
      if (!references.has(row.mic)) references.set(row.mic, []);
      references.get(row.mic).push({ symbol: row.ticker, currency: row.currency, exchangeMic: row.mic });
    }
  }

  const payload = await request("market_state");
  const observed = now();
  const states = new Map();
  for (const row of Array.isArray(payload) ? payload : []) {
    if (!micPattern.test(row?.code)) continue;
    const state = typeof row.is_market_open === "boolean" ? row.is_market_open : null;
    states.set(row.code, states.has(row.code) ? null : state);
    if (!venues.has(row.code)) venues.set(row.code, { operatingMic: row.code, country: null });
  }

  const records = {};
  const pending = [];
  for (const [mic, venue] of [...venues].sort(([a], [b]) => a.localeCompare(b))) {
    const exact = states.has(mic);
    const stateMic = exact ? mic : venue.operatingMic;
    const open = states.get(stateMic) ?? null;
    const targets = references.get(mic) ?? [];
    const prior = previous?.records?.[mic];
    const attempted = Date.parse(prior?.lastQuoteAttemptAt);
    const lastAttempt = attempted <= started ? attempted : NaN;
    const nextIndex = targets.length && Number.isSafeInteger(prior?.quoteIndex) && prior.quoteIndex >= 0 && Number.isFinite(lastAttempt)
      ? (prior.quoteIndex + 1) % targets.length : 0;
    records[mic] = {
      country: venue.country,
      stateMic,
      state: open === null ? "UNVERIFIED" : open ? "PROVIDER_REPORTED_OPEN" : "PROVIDER_REPORTED_CLOSED",
      authoritativeSessionVerified: false,
      exactMicState: exact && open !== null,
      quoteStatus: open !== true ? "NO_OPEN_SESSION_HINT" : targets.length ? "WAITING_FOR_QUOTE_BUDGET" : "NO_LISTING_REFERENCE",
      lastQuoteAttemptAt: Number.isFinite(lastAttempt) ? new Date(lastAttempt).toISOString() : null,
      quoteIndex: Number.isFinite(lastAttempt) && Number.isSafeInteger(prior.quoteIndex) ? prior.quoteIndex : null,
    };
    if (open === true && targets.length) pending.push({ mic, target: targets[nextIndex], nextIndex, lastAttempt });
  }

  // Unobserved or longest-waiting venues go first. Rotate ties by hour so a
  // fresh history also gives every venue the same priority over repeated runs.
  const tieStart = pending.length ? Math.floor(started / 3_600_000) % pending.length : 0;
  const queue = [...pending.slice(tieStart), ...pending.slice(0, tieStart)]
    .sort((a, b) => (a.lastAttempt || 0) - (b.lastAttempt || 0));
  let quoteRequests = 0;
  for (const { mic, target, nextIndex } of queue.slice(0, quoteBudget)) {
    if (quoteRequests) await delay(1300);
    const params = new URLSearchParams({ symbol: target.symbol, mic_code: mic });
    const raw = await request("quote", params);
    const at = new Date(now()).toISOString();
    const quote = classifyQuote(target, raw, at);
    Object.assign(records[mic], { quoteStatus: quote.status, lastQuoteAttemptAt: at, quoteIndex: nextIndex });
    quoteRequests++;
    if (quote.status === "RATE_LIMIT") break;
  }

  return {
    version: 1,
    mode: "WORLDWIDE_RESEARCH_DIAGNOSTIC",
    observedAt: new Date(observed).toISOString(),
    catalogueAvailable: catalogueUsable,
    marketStateAvailable: states.size > 0,
    venuesTracked: venues.size,
    venuesWithExactState: Object.values(records).filter(record => record.exactMicState).length,
    quoteRequests,
    records,
    paperEligible: false,
    liveTradingAllowed: false,
    brokerConnectivityAllowed: false,
  };
}

async function readOptional(file) {
  if (!file) return null;
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return null;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [catalogueFile, previousFile, output] = process.argv.slice(2);
  if (!output) throw Error("WORLD_MARKET_OBSERVATION_OUTPUT_REQUIRED");
  const key = process.env.TWELVE_DATA_API_KEY?.trim();
  if (!key) throw Error("WORLD_MARKET_PROVIDER_KEY_UNAVAILABLE");
  const request = async (endpoint, params = new URLSearchParams()) => {
    try {
      const response = await fetch(`https://api.twelvedata.com/${endpoint}?${params}`, {
        headers: { Authorization: `apikey ${key}`, Accept: "application/json" },
        signal: AbortSignal.timeout(10_000), redirect: "error",
      });
      if (!response.ok) return { code: response.status, status: "error" };
      return await response.json();
    } catch {
      return { code: 503, status: "error" };
    }
  };
  const [catalogue, previous] = await Promise.all([readOptional(catalogueFile), readOptional(previousFile)]);
  const result = await collectWorldMarketObservations({ catalogue, previous, request, now: Date.now });
  await writeFile(output, JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
  const { observedAt, catalogueAvailable, marketStateAvailable, venuesTracked, venuesWithExactState, quoteRequests } = result;
  console.log(JSON.stringify({ observedAt, catalogueAvailable, marketStateAvailable, venuesTracked, venuesWithExactState, quoteRequests }));
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, [
      "## Raccolta mondiale", "",
      `- Stati esatti riportati dal provider: ${venuesWithExactState}/${venuesTracked} MIC osservati`,
      `- Controlli di quotazione eseguiti: ${quoteRequests}/${quoteBudget}`,
      `- Catalogo di riferimento disponibile: ${catalogueAvailable ? "sì" : "no"}`,
      "- Crediti di certificazione PAPER: 0",
      "- Broker e ordini LIVE: disabilitati", "",
    ].join("\n"));
  }
}
