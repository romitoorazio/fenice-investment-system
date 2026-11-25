/** Conservative prepaid reservation; no broker or financial ledger access. */
export const AI_MONTHLY_LIMIT_CENTS = 500;
export const AI_WARNING_CENTS = 400;
// Deliberately conservative reservation, not an invoice or measured actual cost.
// The owner must confirm that this covers the bounded request at current rates,
// including exchange rates and taxes, before enabling the gateway.
export const AI_REQUEST_RESERVE_CENTS = 2;
export type BudgetRecord = { month: string; reservedCents: number };
export type BudgetStore = {
  read(): Promise<{ body: string; etag: string } | null>;
  write(body: string, etag: string | null): Promise<boolean>;
};
export type BudgetDecision = { allowed: boolean; reservedCents: number | null; warning: boolean };
const denied: BudgetDecision = { allowed: false, reservedCents: null, warning: false };
function validCents(x: unknown): x is number {
  return typeof x === "number" && Number.isSafeInteger(x) && x >= 0 && x <= AI_MONTHLY_LIMIT_CENTS;
}
export async function reserveAiBudget(store: BudgetStore, now: number,
  initial: BudgetRecord | null): Promise<BudgetDecision> {
  try {
    if (!Number.isFinite(now)) return denied;
    const month = new Date(now).toISOString().slice(0, 7);
    // Avoid a request straddling the UTC accounting boundary.
    const next = new Date(month + "-01T00:00:00Z");
    next.setUTCMonth(next.getUTCMonth() + 1);
    if (next.getTime() - now < 60_000) return denied;
    const existing = await store.read();
    let current: BudgetRecord;
    if (existing === null) {
      if (!initial || initial.month !== month || !validCents(initial.reservedCents)) return denied;
      current = initial;
    } else {
      if (!existing.etag) return denied;
      const record = JSON.parse(existing.body);
      if (!record || typeof record.month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(record.month)
        || record.month > month || !validCents(record.reservedCents)) return denied;
      current = record.month === month ? record : { month, reservedCents: 0 };
    }
    const total = current.reservedCents + AI_REQUEST_RESERVE_CENTS;
    if (total > AI_MONTHLY_LIMIT_CENTS)
      return { allowed: false, reservedCents: current.reservedCents, warning: true };
    // No retries or refunds: ambiguous writes and concurrent conflicts deny the
    // request. A successful reservation is consumed even if the API times out.
    if (!await store.write(JSON.stringify({ month, reservedCents: total }), existing?.etag ?? null)) return denied;
    return { allowed: true, reservedCents: total, warning: total >= AI_WARNING_CENTS };
  } catch { return denied; }
}
