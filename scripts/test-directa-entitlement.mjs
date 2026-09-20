import assert from "node:assert/strict";
import { classifyDirectaDatafeedError } from "../lib/brokers/directa-entitlement.ts";

const noEntitlement = classifyDirectaDatafeedError(1032);
assert.equal(noEntitlement.state, "OPTIONAL_NOT_ENTITLED");
assert.equal(noEntitlement.critical, false);
assert.equal(noEntitlement.allowMarketDataFallback, true);
assert.equal(noEntitlement.allowTradingWrite, false);

const unknown = classifyDirectaDatafeedError(9999);
assert.equal(unknown.state, "UNKNOWN_ERROR");
assert.equal(unknown.critical, true);
assert.equal(unknown.allowMarketDataFallback, false);
assert.equal(unknown.allowTradingWrite, false);

const healthy = classifyDirectaDatafeedError(null);
assert.equal(healthy.state, "AVAILABLE");
assert.equal(healthy.allowTradingWrite, false);

console.log("Fenice Directa entitlement safety tests: PASS");
