import { createHash } from "node:crypto";

export type AuditEvent = {
  sequence: number;
  timestamp: string;
  eventType: string;
  entityId: string;
  payload: Record<string, unknown>;
  previousHash: string;
  hash: string;
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function appendAuditEvent(
  chain: AuditEvent[],
  input: Omit<AuditEvent, "sequence" | "previousHash" | "hash">,
): AuditEvent[] {
  const previous = chain.at(-1);
  const previousHash = previous?.hash ?? "GENESIS";
  const sequence = (previous?.sequence ?? 0) + 1;
  const canonical = stable({ sequence, ...input, previousHash });
  const event: AuditEvent = {
    sequence,
    ...input,
    previousHash,
    hash: digest(canonical),
  };
  return [...chain, event];
}

export function verifyAuditChain(chain: AuditEvent[]): { valid: boolean; brokenAt: number | null } {
  let previousHash = "GENESIS";
  let expectedSequence = 1;

  for (const event of chain) {
    const canonical = stable({
      sequence: event.sequence,
      timestamp: event.timestamp,
      eventType: event.eventType,
      entityId: event.entityId,
      payload: event.payload,
      previousHash: event.previousHash,
    });
    const valid = event.sequence === expectedSequence
      && event.previousHash === previousHash
      && event.hash === digest(canonical);
    if (!valid) return { valid: false, brokenAt: event.sequence };
    previousHash = event.hash;
    expectedSequence += 1;
  }

  return { valid: true, brokenAt: null };
}
