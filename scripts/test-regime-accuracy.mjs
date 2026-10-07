import assert from "node:assert/strict";
import {
  benchmarkPrices,
  buildRegimeAccuracyLedger,
  classifyRegimeOutcome,
  compositeForwardReturn,
  latestWeekdaySnapshots,
  normalizeFeniceRegime,
  summarizeRegimeAccuracy,
} from "../lib/intelligence/regime-accuracy.mjs";

function snapshot(date, regime, spy, qqq, iwm) {
  return {
    generatedAt: date,
    marketRegime: regime,
    allDecisions: [
      { symbol: "SPY", currentPrice: spy },
      { symbol: "QQQ", currentPrice: qqq },
      { symbol: "IWM", currentPrice: iwm },
    ],
  };
}

assert.equal(normalizeFeniceRegime("valutare"), "VALUTARE");
assert.equal(normalizeFeniceRegime("PROTEGGERE CAPITALE"), "PROTEGGERE CAPITALE");
assert.equal(normalizeFeniceRegime("UNKNOWN"), null);

assert.deepEqual(benchmarkPrices(snapshot("2026-10-01T20:00:00Z", "ATTENDERE", 100, 200, 50)), { SPY: 100, QQQ: 200, IWM: 50 });
const composite = compositeForwardReturn({ SPY: 100, QQQ: 200, IWM: 50 }, { SPY: 102, QQQ: 204, IWM: 50.5 });
assert.equal(composite.benchmarkCount, 3);
assert.equal(composite.compositeReturnPercent, 2);

assert.equal(classifyRegimeOutcome("VALUTARE", 2).class, "CONFERMATO");
assert.equal(classifyRegimeOutcome("VALUTARE", -2).class, "NON_CONFERMATO");
assert.equal(classifyRegimeOutcome("PROTEGGERE CAPITALE", -2).class, "PROTEZIONE_CONFERMATA");
assert.equal(classifyRegimeOutcome("PROTEGGERE CAPITALE", 2).class, "ECCESSO_PRUDENZA");
assert.equal(classifyRegimeOutcome("ATTENDERE", -2).class, "PRUDENZA_UTILE");
assert.equal(classifyRegimeOutcome("ATTENDERE", 2).class, "RIALZO_PERSO");
assert.equal(classifyRegimeOutcome("ATTENDERE", 0.5).class, "ATTESA_COERENTE");

const history = [
  snapshot("2026-10-01T18:00:00Z", "ATTENDERE", 100, 200, 50),
  snapshot("2026-10-01T22:00:00Z", "ATTENDERE", 101, 202, 50.5),
  snapshot("2026-10-02T22:00:00Z", "VALUTARE", 103, 206, 51.5),
  snapshot("2026-10-03T22:00:00Z", "PROTEGGERE CAPITALE", 90, 180, 45),
  snapshot("2026-10-04T22:00:00Z", "ATTENDERE", 999, 999, 999),
  snapshot("2026-10-05T22:00:00Z", "ATTENDERE", 102, 204, 51),
  snapshot("2026-10-06T22:00:00Z", "ATTENDERE", 104, 208, 52),
  snapshot("2026-10-07T22:00:00Z", "ATTENDERE", 105, 210, 52.5),
  snapshot("2026-10-08T22:00:00Z", "ATTENDERE", 106, 212, 53),
];

const daily = latestWeekdaySnapshots(history);
assert.equal(daily[0].prices.SPY, 101, "latest weekday snapshot must win");
assert.equal(daily.some((row) => row.date === "2026-10-03"), false, "Saturday must be excluded");
assert.equal(daily.some((row) => row.date === "2026-10-04"), false, "Sunday must be excluded");

const ledger = buildRegimeAccuracyLedger(history, { horizons: { "1session": 1, "5sessions": 5 } });
assert.equal(ledger.isolation.liveTradingAllowed, false);
assert.equal(ledger.isolation.paperCertificationEligible, false);
assert.equal(ledger.methodology.feedsV6CalibrationPolicy, false);
assert.equal(ledger.records[0].regime, "ATTENDERE");
assert(ledger.records[0].checkpoints["1session"]);
assert.equal(ledger.records[0].checkpoints["1session"].outcome.class, "RIALZO_PERSO");
assert(ledger.records[0].checkpoints["5sessions"]);

const summary = summarizeRegimeAccuracy(ledger.records, "1session");
assert(summary.sampleSize > 0);
assert(summary.byRegime.ATTENDERE.sampleSize > 0);
assert(Number.isFinite(summary.overallUtilityRatePercent));

console.log("Fenice V7 regime accuracy engine: PASS");
