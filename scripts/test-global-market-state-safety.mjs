import assert from "node:assert/strict";
import {
  applyGlobalMarketStateGate,
  twelveDataMarketStateUrl,
  verifyTwelveDataGlobalMarketState,
} from "../lib/trading/global-market-state.ts";

const now = Date.parse("2026-09-28T09:00:00.000Z");

const url = new URL(twelveDataMarketStateUrl("xmil", "test-key"));
assert.equal(url.hostname, "api.twelvedata.com");
assert.equal(url.pathname, "/market_state");
assert.equal(url.searchParams.get("code"), "XMIL");
assert.equal(url.searchParams.get("apikey"), "test-key");
assert.throws(() => twelveDataMarketStateUrl("", "test-key"), /MIC_REQUIRED/);
assert.throws(() => twelveDataMarketStateUrl("XMIL", ""), /API_KEY_REQUIRED/);

const open = verifyTwelveDataGlobalMarketState("XMIL", [
  {
    name: "Borsa Italiana",
    code: "XMIL",
    country: "Italy",
    is_market_open: true,
    time_after_open: "00:30:00",
    time_to_open: "00:00:00",
    time_to_close: "07:30:00",
  },
], now);
assert.equal(open.accepted, true);
assert.equal(open.marketOpen, true);
assert.equal(open.paperSessionAllowed, true);
assert.equal(open.returnedMic, "XMIL");
assert.deepEqual(open.reasons, []);

const closed = verifyTwelveDataGlobalMarketState("XMIL", [
  {
    name: "Borsa Italiana",
    code: "XMIL",
    country: "Italy",
    is_market_open: false,
    time_after_open: "00:00:00",
    time_to_open: "16:30:00",
    time_to_close: "00:00:00",
  },
], now);
assert.equal(closed.accepted, true, "a valid closed-state response is accepted as evidence but must not allow PAPER");
assert.equal(closed.marketOpen, false);
assert.equal(closed.paperSessionAllowed, false);
assert.ok(closed.reasons.some((reason) => reason.includes("currently closed")));

const wrongMic = verifyTwelveDataGlobalMarketState("XMIL", [
  { code: "XPAR", country: "France", is_market_open: true },
], now);
assert.equal(wrongMic.accepted, false);
assert.equal(wrongMic.paperSessionAllowed, false);
assert.ok(wrongMic.reasons.some((reason) => reason.includes("missing exact MIC")));

const missingBoolean = verifyTwelveDataGlobalMarketState("XMIL", [
  { code: "XMIL", country: "Italy" },
], now);
assert.equal(missingBoolean.accepted, false);
assert.equal(missingBoolean.paperSessionAllowed, false);
assert.ok(missingBoolean.reasons.some((reason) => reason.includes("boolean is_market_open")));

const duplicate = verifyTwelveDataGlobalMarketState("XMIL", [
  { code: "XMIL", is_market_open: true },
  { code: "XMIL", is_market_open: false },
], now);
assert.equal(duplicate.accepted, false);
assert.equal(duplicate.paperSessionAllowed, false);
assert.ok(duplicate.reasons.some((reason) => reason.includes("duplicate exact MIC")));
assert.ok(duplicate.reasons.some((reason) => reason.includes("conflicting")));

const providerError = verifyTwelveDataGlobalMarketState("XMIL", {
  status: "error",
  code: 401,
  message: "Unauthorized",
}, now);
assert.equal(providerError.accepted, false);
assert.equal(providerError.paperSessionAllowed, false);

const paperEvidence = {
  symbol: "ENEL",
  exchangeMic: "XMIL",
  sourceFamily: "twelve-data",
  eligibility: "PAPER",
  price: 8.12,
  observedAt: "2026-09-28T08:59:30.000Z",
  provenanceMethod: "authenticated-exact-mic:XMIL;entitlement:verified",
};

const allowed = applyGlobalMarketStateGate(paperEvidence, open);
assert.equal(allowed.eligibility, "PAPER");

const downgradedClosed = applyGlobalMarketStateGate(paperEvidence, closed);
assert.equal(downgradedClosed.eligibility, "VALIDATION_ONLY");
assert.match(downgradedClosed.provenanceMethod, /session-gate:XMIL:closed/);

const downgradedMissing = applyGlobalMarketStateGate(paperEvidence, null);
assert.equal(downgradedMissing.eligibility, "VALIDATION_ONLY");
assert.match(downgradedMissing.provenanceMethod, /session-gate:missing/);

const validationEvidence = applyGlobalMarketStateGate({ ...paperEvidence, eligibility: "VALIDATION_ONLY" }, null);
assert.equal(validationEvidence.eligibility, "VALIDATION_ONLY");

console.log("Fenice global market-state safety tests: PASS");
