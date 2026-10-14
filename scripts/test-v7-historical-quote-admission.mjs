import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { admitHistoricalV7ResearchSnapshots } from "../lib/intelligence/v7-historical-quote-admission.mjs";
import { buildHistoricalDecisionOutcomeBackfill } from "../lib/intelligence/decision-outcomes.mjs";

const observed = (date, price, symbol = "SPY") => ({
  generatedAt: date,
  marketRegime: "ATTENDERE",
  allDecisions: [{
    symbol, currentPrice: price, decision: "OSSERVA", currency: "USD",
    priceEvidence: {
      price, source: "Yahoo Finance chart META regularMarketPrice/regularMarketTime",
      evidenceType: "YAHOO_REGULAR_TRADE_META_RESEARCH_ONLY",
      observedAt: new Date(Date.parse(date) - 3000).toISOString(),
      executionEligible: false,
      paperCertificationEligible: false,
      brokerSubmissionAllowed: false,
      liveTradingAllowed: false,
    },
  }],
});
const first = observed("2026-09-24T20:00:00.000Z", 100);
const second = observed("2026-09-25T20:00:00.000Z", 95);
const seventh = observed("2026-10-01T20:00:00.000Z", 110);

const valid = admitHistoricalV7ResearchSnapshots([first, second, seventh],
  new Date("2026-10-14T18:00:00.000Z"));
assert.equal(valid.verification.snapshotsChecked, 3);
assert.equal(valid.verification.snapshotsAccepted, 3);
assert.equal(valid.verification.verifiedCandidateObservations, 3);
assert.equal(valid.verification.researchOnly, true);
assert.equal(valid.verification.independentForwardValidation, false);
assert.equal(valid.verification.performanceOrProfitCertified, false);
assert.equal(valid.verification.changesV6, false);
const history = buildHistoricalDecisionOutcomeBackfill(valid.verifiedSnapshots);
const entry = history.records.find(row => row.id === "2026-09-24:SPY:OSSERVA");
assert.ok(entry);
assert.equal(entry.checkpoints["1d"].price, 95);
assert.equal(entry.checkpoints["7d"].price, 110);

const malformed = [
  [null, "SNAPSHOT_TIME_INVALID_OR_FUTURE"],
  [{ ...first, generatedAt: "2026-02-30T20:00:00.000Z" }, "SNAPSHOT_TIME_INVALID_OR_FUTURE"],
  [observed("2026-10-20T20:00:00.000Z", 100), "SNAPSHOT_TIME_INVALID_OR_FUTURE"],
  [{ ...first, allDecisions: [{ ...first.allDecisions[0], priceEvidence: undefined }] }, "PRICE_MISSING_OR_MISMATCH"],
  [{ ...first, allDecisions: [{ ...first.allDecisions[0], priceEvidence: { ...first.allDecisions[0].priceEvidence, observedAt: "2026-09-24T21:00:00.000Z" } }] }, "PRICE_TIME_INVALID_STALE_OR_FUTURE"],
  [{ ...first, allDecisions: [{ ...first.allDecisions[0], priceEvidence: { ...first.allDecisions[0].priceEvidence, observedAt: "2026-09-23T20:00:00.000Z" } }] }, "PRICE_TIME_INVALID_STALE_OR_FUTURE"],
  [{ ...first, allDecisions: [{ ...first.allDecisions[0], priceEvidence: { ...first.allDecisions[0].priceEvidence, source: "anonymous blog" } }] }, "RESEARCH_ONLY_PROVENANCE_NOT_VERIFIED"],
  [{ ...first, allDecisions: [{ ...first.allDecisions[0], currentPrice: 115 }] }, "PRICE_MISSING_OR_MISMATCH"],
];
for (const [snapshot, reason] of malformed) {
  const output = admitHistoricalV7ResearchSnapshots([snapshot], new Date("2026-10-14T18:00:00.000Z"));
  assert.equal(output.verifiedSnapshots.length, 0, reason);
  assert.equal(output.verification.snapshotsExcluded, 1, reason);
  assert.equal(output.verification.rejectionCounts[reason], 1, reason);
}
const identical = admitHistoricalV7ResearchSnapshots(
  [first, first], new Date("2026-10-14T18:00:00.000Z"));
assert.equal(identical.verifiedSnapshots.length, 2);
assert.equal(identical.verification.verifiedCandidateObservations, 2);
assert.deepEqual(first.allDecisions, valid.verifiedSnapshots[0].allDecisions, "immutable original snapshot");
assert.throws(() => admitHistoricalV7ResearchSnapshots([first], new Date("invalid")), /INVALID_HISTORICAL_ADMISSION_CLOCK/);

const runner = await readFile(new URL("./run-decision-outcomes.mjs", import.meta.url), "utf8");
assert.match(runner, /admitHistoricalV7ResearchSnapshots\(snapshots, now\)/);
assert.match(runner, /buildHistoricalDecisionOutcomeBackfill\(historical\.verifiedSnapshots\)/);
assert.match(runner, /historicalAdmission: historical\.verification/);
assert.match(runner, /if \(!Array\.isArray\(previous\?\.records\) \|\| previous\.records\.length === 0\)/,
  "Existing V7 ledger must remain untouched; bootstrap only when empty");
assert.doesNotMatch(runner, /paper-validation-campaign\.json/);
console.log("Fenice historical V7 as-of provenance admission tests: PASS");
