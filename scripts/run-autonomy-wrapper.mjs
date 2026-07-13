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
  if (mode === "artlist") {
    url.searchParams.set(
      "query",
      '"initial public offering" OR "funding round" OR "FDA approval" OR breakthrough OR quantum OR fusion OR CRISPR',
    );
    url.searchParams.set("maxrecords", "30");
  } else {
    url.searchParams.set(
      "query",
      '"armed conflict" OR sanctions OR tariffs OR "central bank" OR inflation OR recession OR election OR cyberattack',
    );
  }

  return url;
}

async function fetchGdelt(url, init) {
  const elapsed = Date.now() - lastGdeltRequestAt;
  if (elapsed < 7000) await sleep(7000 - elapsed);
  lastGdeltRequestAt = Date.now();

  let response = await nativeFetch(url, init);
  if (response.status === 429) {
    await sleep(15000);
    lastGdeltRequestAt = Date.now();
    response = await nativeFetch(url, init);
  }
  return response;
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

await import("./postprocess-snapshot.mjs");
