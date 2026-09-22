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
  if (elapsed < 7000) await sleep(7000 - elapsed);
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

async function fetchGdelt(url, init) {
  let lastResponse = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await waitForGdeltSlot();
    const response = await nativeFetch(url, init);
    lastResponse = response;

    const transientStatus = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
    const invalidJson200 = response.ok && !(await gdeltResponseLooksJson(response));
    if (!transientStatus && !invalidJson200) return response;

    if (attempt < 3) {
      const delay = response.status === 429 ? 15000 : 5000 * attempt;
      await sleep(delay);
    }
  }

  return lastResponse;
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
    const task = gdeltQueue.then(() => fetchGdelt(url, { ...init, headers }));
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
