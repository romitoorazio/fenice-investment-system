import { createHash } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";

export type DurableJournalEvent = {
  timestamp: string;
  eventType: string;
  entityId: string;
  payload: Record<string, unknown>;
};

export type DurableJournalEntry = DurableJournalEvent & {
  sequence: number;
  previousHash: string | null;
  hash: string;
};

export type DurableJournalVerification = {
  valid: boolean;
  entries: DurableJournalEntry[];
  brokenAt: number | null;
  reason: string | null;
};

const sensitiveKey = /(password|passwd|secret|token|api[_-]?key|otp|pin|account[_-]?(?:code|number|identifier))/i;

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child)]),
    );
  }
  return value;
}

function assertNoSensitiveMaterial(value: unknown, trail = "payload"): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertNoSensitiveMaterial(child, `${trail}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (sensitiveKey.test(key)) throw new Error(`FENICE_JOURNAL_SENSITIVE_FIELD: ${trail}.${key}`);
    assertNoSensitiveMaterial(child, `${trail}.${key}`);
  }
}

function entryHash(entry: Omit<DurableJournalEntry, "hash">): string {
  return createHash("sha256").update(JSON.stringify(stable(entry))).digest("hex");
}

export async function verifyDurableJournal(filePath: string): Promise<DurableJournalVerification> {
  let text = "";
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return { valid: true, entries: [], brokenAt: null, reason: null };
    throw error;
  }
  if (!text.trim()) return { valid: true, entries: [], brokenAt: null, reason: null };

  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const entries: DurableJournalEntry[] = [];
  let previousHash: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    let parsed: DurableJournalEntry;
    try {
      parsed = JSON.parse(line) as DurableJournalEntry;
    } catch {
      return { valid: false, entries, brokenAt: index, reason: "invalid JSON or partial journal write" };
    }
    if (parsed.sequence !== index + 1) {
      return { valid: false, entries, brokenAt: index, reason: "journal sequence gap" };
    }
    if (parsed.previousHash !== previousHash) {
      return { valid: false, entries, brokenAt: index, reason: "journal hash-chain link mismatch" };
    }
    const { hash, ...withoutHash } = parsed;
    const expected = entryHash(withoutHash);
    if (hash !== expected) {
      return { valid: false, entries, brokenAt: index, reason: "journal entry hash mismatch" };
    }
    entries.push(parsed);
    previousHash = hash;
  }

  return { valid: true, entries, brokenAt: null, reason: null };
}

export async function appendDurableJournal(
  filePath: string,
  event: DurableJournalEvent,
): Promise<DurableJournalEntry> {
  assertNoSensitiveMaterial(event.payload);
  if (!event.eventType.trim() || !event.entityId.trim()) throw new Error("FENICE_JOURNAL_INVALID_EVENT");
  if (!Number.isFinite(Date.parse(event.timestamp))) throw new Error("FENICE_JOURNAL_INVALID_TIMESTAMP");

  await mkdir(path.dirname(filePath), { recursive: true });
  const verification = await verifyDurableJournal(filePath);
  if (!verification.valid) {
    throw new Error(`FENICE_JOURNAL_CORRUPT: ${verification.reason ?? "unknown"}`);
  }

  const last = verification.entries.at(-1);
  const withoutHash = {
    ...event,
    sequence: (last?.sequence ?? 0) + 1,
    previousHash: last?.hash ?? null,
  };
  const entry: DurableJournalEntry = { ...withoutHash, hash: entryHash(withoutHash) };

  const handle = await open(filePath, "a");
  try {
    await handle.write(`${JSON.stringify(entry)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  return entry;
}
