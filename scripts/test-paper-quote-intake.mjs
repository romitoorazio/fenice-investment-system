import assert from "node:assert/strict";
import { parsePaperQuoteCandidate, comparePaperCandidates } from "../lib/trading/paper-quote-intake.ts";
const now = Date.parse("2026-10-09T18:00:00.000Z");
const base = { provider:"alpaca", symbol:"AAPL", price:250, currency:"USD", eligibility:"PAPER", observedAt:"2026-10-09T17:59:30Z" };
const good = parsePaperQuoteCandidate(base, now);
assert.equal(good.accepted,true);
if (good.accepted) {
  assert.equal(good.value.provenanceVerified,false);
  assert.equal(good.value.executionAuthorized,false);
}
for (const [patch, reason] of [
  [{ eligibility:"LIVE" }, "NOT_PAPER"],
  [{ provider:"unknown" }, "UNAPPROVED_SOURCE"],
  [{ price:0 }, "INVALID_PRICE"],
  [{ price:Infinity }, "INVALID_PRICE"],
  [{ observedAt:"2026-10-09T17:57:59Z" }, "STALE_OR_FUTURE_TIMESTAMP"],
  [{ observedAt:"2026-10-09T18:00:01Z" }, "STALE_OR_FUTURE_TIMESTAMP"],
  [{ currency:"" }, "INVALID_CURRENCY"],
  [{ symbol:"../bad" }, "INVALID_SYMBOL"],
]) {
  const result = parsePaperQuoteCandidate({...base,...patch},now);
  assert.equal(result.accepted,false);
  if (!result.accepted) assert.equal(result.reason,reason);
}
const independent = parsePaperQuoteCandidate({...base,provider:"twelve-data",price:250.5},now);
const compare=comparePaperCandidates(good,independent);
assert.equal(compare.comparable,true);
assert.equal(compare.executionAuthorized,false);
assert.equal(comparePaperCandidates(good,good).comparable,false);
assert.equal(comparePaperCandidates(good,parsePaperQuoteCandidate({...base, provider:"twelve-data",currency:"EUR"},now)).comparable,false);
assert.equal(comparePaperCandidates(good,parsePaperQuoteCandidate({...base, provider:"twelve-data",price:260},now)).comparable,false);
console.log("PAPER quote intake fail-closed tests passed");
