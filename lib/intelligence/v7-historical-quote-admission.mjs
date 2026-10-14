import { admitV7ResearchQuotes } from "./v7-asof-quote-admission.mjs";

/**
 * Historical V7 bootstrap is for research only. Only snapshots whose market
 * observations existed before the committee decision may enter the NEW
 * reconstructed archive. No rewrite of legacy ledgers or frozen V6 evidence.
 */
const strictInstant = value => {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) return null;
  const date = Date.parse(value);
  if (!Number.isFinite(date) || new Date(date).toISOString().slice(0, 19) !== value.slice(0, 19)) return null;
  return date;
};

export function admitHistoricalV7ResearchSnapshots(snapshots, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : NaN;
  if (!Number.isFinite(nowMs)) throw new Error("INVALID_HISTORICAL_ADMISSION_CLOCK");
  const results = [];
  const counts = {};
  const reject = reason => { counts[reason] = (counts[reason] || 0) + 1; };
  const rows = Array.isArray(snapshots) ? snapshots : [];

  for (const snapshot of rows) {
    const asOf = strictInstant(snapshot?.generatedAt);
    if (asOf === null || asOf > nowMs) { reject("SNAPSHOT_TIME_INVALID_OR_FUTURE"); continue; }
    // Validate source observation against original snapshot time, not the
    // replay clock (historical snapshots are supposed to be old).
    const admission = admitV7ResearchQuotes(snapshot, new Date(asOf));
    for (const [reason, n] of Object.entries(admission.evidence.reasonCounts)) {
      counts[reason] = (counts[reason] || 0) + n;
    }
    if (admission.accepted.length === 0) { reject("NO_VERIFIED_HISTORICAL_PRICES"); continue; }
    results.push({
      ...snapshot,
      allDecisions: admission.accepted,
    });
  }

  return {
    verifiedSnapshots: results,
    verification: {
      snapshotsChecked: rows.length,
      snapshotsAccepted: results.length,
      snapshotsExcluded: rows.length - results.length,
      verifiedCandidateObservations: results.reduce((sum, x) => sum + x.allDecisions.length, 0),
      rejectionCounts: counts,
      researchOnly: true,
      historicallyReconstructed: true,
      independentForwardValidation: false,
      performanceOrProfitCertified: false,
      changesV6: false,
    },
  };
}
