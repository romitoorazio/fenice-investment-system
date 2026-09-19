import assert from "node:assert/strict";
import {
  isDirectaBroker,
  recognizeBroker,
} from "../lib/brokers/registry.ts";
import {
  LIVE_TRADING_RELEASED,
  REQUIRED_LIVE_TRADING_GATES,
  evaluateLiveTradingAuthorization,
} from "../lib/brokers/safety.ts";
import {
  connectDirectaNetwork,
  getDirectaBridgeStatus,
  submitDirectaOrder,
} from "../lib/brokers/directa.ts";

for (const alias of [
  "Directa",
  "DIRECTA",
  "Directa SIM S.p.A.",
  "directa api",
  "Directa Darwin 2",
  "broker directa",
]) {
  assert.equal(isDirectaBroker(alias), true, `Expected Directa recognition for: ${alias}`);
}

assert.equal(recognizeBroker("Interactive Brokers").recognized, false);
assert.equal(recognizeBroker("").recognized, false);

const allPass = Object.fromEntries(REQUIRED_LIVE_TRADING_GATES.map((gate) => [gate, "PASS"]));
const allPassAuthorization = evaluateLiveTradingAuthorization(allPass);
assert.equal(LIVE_TRADING_RELEASED, false, "Live trading release lock must remain closed.");
assert.equal(allPassAuthorization.allowed, false, "All PASS gates must not bypass the explicit release lock.");
assert.equal(allPassAuthorization.releaseLockOpen, false);

const incompleteAuthorization = evaluateLiveTradingAuthorization({
  ...allPass,
  riskControls: "NOT_READY",
});
assert.equal(incompleteAuthorization.allowed, false);
assert.ok(incompleteAuthorization.failedGates.includes("riskControls"));

const noHumanConfirmation = evaluateLiveTradingAuthorization(allPass, {
  humanConfirmationRequired: false,
});
assert.equal(noHumanConfirmation.allowed, false);
assert.match(noHumanConfirmation.reasons.join(" "), /Human confirmation cannot be disabled/i);

const bridge = getDirectaBridgeStatus({
  requestedMode: "live",
  apiAccessApproved: true,
  technicalContractVerified: true,
});
assert.equal(bridge.brokerRecognized, true);
assert.equal(bridge.networkConnectionAllowed, false);
assert.equal(bridge.liveTradingAllowed, false);
assert.equal(bridge.orderSubmissionImplemented, false);

await assert.rejects(connectDirectaNetwork(), /DIRECTA_CONNECTION_BLOCKED/);
await assert.rejects(submitDirectaOrder(), /FENICE_LIVE_TRADING_LOCKED/);

console.log("Fenice broker safety tests: PASS");
