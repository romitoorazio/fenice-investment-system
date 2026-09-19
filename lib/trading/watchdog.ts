import type { DirectaReadOnlySnapshot } from "../brokers/directa-readonly.ts";

export type WatchdogStatus = "HEALTHY" | "DEGRADED" | "BLOCKED";

export type BrokerWatchdogReport = {
  status: WatchdogStatus;
  safeForShadow: boolean;
  reasons: string[];
  snapshotAgeSeconds: number;
};

export function evaluateDirectaWatchdog(
  snapshot: DirectaReadOnlySnapshot,
  options: { maxSnapshotAgeSeconds?: number } = {},
  now = Date.now(),
): BrokerWatchdogReport {
  const maxSnapshotAgeSeconds = Math.max(1, Number(options.maxSnapshotAgeSeconds ?? 15));
  const generatedAt = Date.parse(snapshot.generatedAt);
  const snapshotAgeSeconds = Number.isFinite(generatedAt)
    ? Math.max(0, (now - generatedAt) / 1000)
    : Number.POSITIVE_INFINITY;
  const reasons: string[] = [];

  if (!snapshot.connection.healthy) reasons.push("Directa connection is not healthy");
  if (snapshotAgeSeconds > maxSnapshotAgeSeconds) reasons.push("Directa snapshot is stale");
  if (!snapshot.diagnostics.stockListComplete) reasons.push("Directa position snapshot is incomplete");
  if (!snapshot.diagnostics.orderListComplete) reasons.push("Directa order snapshot is incomplete");
  if (snapshot.errors.length > 0) reasons.push("Directa reported protocol errors");

  const blocking = !snapshot.connection.healthy
    || snapshotAgeSeconds > maxSnapshotAgeSeconds
    || !snapshot.diagnostics.stockListComplete
    || !snapshot.diagnostics.orderListComplete;

  return {
    status: blocking ? "BLOCKED" : reasons.length > 0 ? "DEGRADED" : "HEALTHY",
    safeForShadow: !blocking,
    reasons,
    snapshotAgeSeconds: Number.isFinite(snapshotAgeSeconds) ? Number(snapshotAgeSeconds.toFixed(3)) : 999999,
  };
}
