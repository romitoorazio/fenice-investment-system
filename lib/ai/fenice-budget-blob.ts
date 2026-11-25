import { reserveAiBudget, type BudgetStore, type BudgetRecord } from "./fenice-monthly-budget.ts";
const PATH = "fenice/ai/private-budget/monthly.json";
type Read = { statusCode: number; blob: { etag: string; size?: number }; stream: ReadableStream<Uint8Array> };
type BlobClient = {
  get(path: string, options: Record<string, unknown>): Promise<Read | null>;
  head(path: string, options: Record<string, unknown>): Promise<{ etag: string; size: number }>;
  put(path: string, body: string, options: Record<string, unknown>): Promise<{ etag: string }>;
};
async function readSmall(result: Read): Promise<string> {
  if (result.statusCode !== 200 || !result.blob.etag || !result.stream || (result.blob.size ?? 0) > 1024) throw Error("BUDGET_READ_INVALID");
  const reader = result.stream.getReader();
  const parts: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 1024) { await reader.cancel(); throw Error("BUDGET_READ_TOO_LARGE"); }
      parts.push(Buffer.from(next.value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(parts).toString("utf8");
}
export function createAiBudgetStore(client: BlobClient, auth: Record<string, unknown>): BudgetStore {
  return {
    async read() {
      const first = await client.get(PATH, { access: "private", useCache: false, ...auth });
      if (first === null) return null;
      const body = await readSmall(first);
      const meta = await client.head(PATH, auth);
      if (!meta.etag || meta.etag !== first.blob.etag || meta.size !== Buffer.byteLength(body)) throw Error("BUDGET_VERSION_INVALID");
      const second = await client.get(PATH, { access: "private", useCache: false, ...auth });
      if (!second || second.blob.etag !== first.blob.etag || await readSmall(second) !== body) throw Error("BUDGET_CHANGED");
      return { body, etag: meta.etag };
    },
    async write(body, etag) {
      const receipt = await client.put(PATH, body, {
        access: "private", ...auth, contentType: "application/json", addRandomSuffix: false,
        allowOverwrite: etag !== null, ...(etag === null ? {} : { ifMatch: etag }),
        cacheControlMaxAge: 60,
      });
      return typeof receipt.etag === "string" && receipt.etag.length > 0;
    },
  };
}
export async function reserveProductionAiBudget(now: number) {
  // No preview/local or unapproved rate assumptions may consume paid credits.
  if (process.env.VERCEL_ENV !== "production" || process.env.FENICE_AI_BUDGET_RATE_CONFIRMED !== "true")
    return { allowed: false, reservedCents: null, warning: false };
  try {
    const storeId = process.env.BLOB_STORE_ID;
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const auth = storeId ? { storeId } : token ? { token } : null;
    if (!auth) throw Error("BUDGET_STORAGE_UNAVAILABLE");
    const client = await import("@vercel/blob") as unknown as BlobClient;
    const seed = process.env.FENICE_AI_BUDGET_INITIAL_CENTS;
    const month = process.env.FENICE_AI_BUDGET_INITIAL_MONTH;
    const initial: BudgetRecord | null = month && seed && /^\d{1,3}$/.test(seed)
      ? { month, reservedCents: Number(seed) } : null;
    return await reserveAiBudget(createAiBudgetStore(client, auth), now, initial);
  } catch { return { allowed: false, reservedCents: null, warning: false }; }
}
