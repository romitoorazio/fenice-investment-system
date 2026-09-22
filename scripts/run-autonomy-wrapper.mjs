import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const nativeFetch = globalThis.fetch;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const snapshotPath = path.resolve(__dirname, "..", "data", "latest-snapshot.json");
const startedAt = Date.now();

const secUserAgent =
  process.env.SEC_USER_AGENT ||
  "FeniceInvestmentSystem/1.0 romitoorazio@gmail.com";

const GDELT_MIN_INTERVAL_MS = 7000;
const GDELT_ATTEMPT_TIMEOUT_MS = 30000;
const GDELT_MAX_ATTEMPTS = 3;
let lastGdeltRequestAt = 0;
let gdeltQueue = Promise.resolve();

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function repairGdeltUrl(value) {
  const url = new URL(value);
  if (!url.hostname.endsWith("gdeltproject.org")) return url;

  const mode = url.searchParams.get("mode")?.toLowerCase();
  if (mode === "artlist" && !url.searchParams.get("query")) {
    url.searchParams.set(
      "query",
      '"initial public offering" OR "funding round" OR "FDA approval" OR breakthrough OR quantum OR fusion OR CRISPR',
    );
    url.searchParams.set("maxrecords", "30");
  } else if (!url.searchParams.get("query")) {
    url.searchParams.set(
      "query",
      '"armed conflict" OR sanctions OR tariffs OR "central bank" OR inflation OR recession OR election OR cyberattack',
    );
  }

  return url;
}

async function waitForGdeltSlot() {
  const elapsed = Date.now() - lastGdeltRequestAt;
  if (elapsed < GDELT_MIN_INTERVAL_MS) await sleep(GDELT_MIN_INTERVAL_MS - elapsed);
  lastGdeltRequestAt = Date.now();
}

async function gdeltResponseLooksJson(response) {
  const contentType = response.headers.get("content-type") || "";
  if (/application\/json|text\/json/i.test(contentType)) return true;
  try {
    const preview = (await response.clone().text()).trim();
    return preview.startsWith("{") || preview.startsWith("[");
  } catch {
    return false;
  }
}

function gdeltRetryDelay(status, attempt) {
  if (status === 429) return 15000;
  return 4000 * attempt;
}

async function fetchGdelt(url, init) {
  let lastResponse = null;
  let lastError = null;

  for (let attempt = 1; attempt <= GDELT_MAX_ATTEMPTS; attempt += 1) {
    await waitForGdeltSlot();

    // GDELT is materially slower than the generic 18s collector timeout when
    // throttling/retries are needed. Give each attempt its own bounded signal
    // instead of reusing an already-aborted caller signal across retries.
    const attemptInit = { ...init };
    delete attemptInit.signal;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GDELT_ATTEMPT_TIMEOUT_MS);

    try {
      const response = await nativeFetch(url, { ...attemptInit, signal: controller.signal });
      lastResponse = response;

      const transientStatus = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
      const invalidJson200 = response.ok && !(await gdeltResponseLooksJson(response));
      if (!transientStatus && !invalidJson200) return response;

      if (attempt < GDELT_MAX_ATTEMPTS) await sleep(gdeltRetryDelay(response.status, attempt));
    } catch (error) {
      lastError = error;
      if (attempt < GDELT_MAX_ATTEMPTS) await sleep(gdeltRetryDelay(0, attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError ?? new Error("GDELT request failed after bounded retries");
}

globalThis.fetch = async (input, init = {}) => {
  const originalUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  let url = new URL(originalUrl);
  const headers = new Headers(init.headers || {});

  if (url.hostname === "www.sec.gov" || url.hostname === "data.sec.gov") {
    headers.set("user-agent", secUserAgent);
    headers.set("accept", "text/plain,application/json,text/html;q=0.9,*/*;q=0.8");
    headers.delete("accept-encoding");
  }

  if (url.hostname.endsWith("gdeltproject.org")) {
    url = repairGdeltUrl(url);
    headers.set("user-agent", "FeniceInvestmentSystem/1.0");
    headers.set("accept", "application/json,text/json;q=0.9,*/*;q=0.5");
    const task = gdeltQueue.then(() => fetchGdelt(url, { ...init, headers, cache: "no-store" }));
    gdeltQueue = task.then(() => undefined, () => undefined);
    return task;
  }

  return nativeFetch(url, { ...init, headers });
};

await import("./run-autonomy.mjs");

let completed = false;
for (let attempt = 0; attempt < 180; attempt += 1) {
  try {
    const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
    const generatedAt = new Date(snapshot.generatedAt || 0).getTime();
    if (generatedAt >= startedAt - 2000) {
      completed = true;
      break;
    }
  } catch {
    // Il file può essere in scrittura durante il controllo.
  }
  await sleep(1000);
}

if (!completed) {
  throw new Error("Il motore principale non ha completato il rapporto entro il limite previsto.");
}

await import("./enrich-broad-news.mjs");
await import("./enrich-primary-events.mjs");
await import("./postprocess-snapshot.mjs");
