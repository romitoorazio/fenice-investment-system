import assert from "node:assert/strict";
import {
  ETORO_DEMO_PORTFOLIO_URL,
  readEtoroDemoPortfolio,
} from "../lib/brokers/etoro-demo-readonly.ts";

const input = {
  publicApiKey: "dummy-public",
  userKey: "dummy-user",
  requestId: "00000000-0000-4000-8000-000000000000",
};
let calls = 0;
const transport = async (url, init) => {
  calls += 1;
  assert.equal(url, ETORO_DEMO_PORTFOLIO_URL);
  assert.equal(init.method, "GET");
  assert.equal(init.body, undefined);
  assert.equal(init.cache, "no-store");
  assert.equal(init.redirect, "error");
  assert.equal(init.headers["x-api-key"], input.publicApiKey);
  assert.equal(init.headers["x-user-key"], input.userKey);
  assert.equal(init.headers["x-request-id"], input.requestId);
  assert.ok(init.signal);
  return { ok: true, status: 200, json: async () => ({ positions: [] }) };
};

const report = await readEtoroDemoPortfolio({ ...input, transport });
assert.equal(calls, 1);
assert.equal(report.broker, "etoro");
assert.equal(report.environment, "DEMO");
assert.equal(report.access, "READ_ONLY");
assert.equal(report.brokerOrderSubmissionAllowed, false);
assert.equal(report.usableAsDirectaExecutionQuote, false);
assert.equal(report.researchOnly, true);
assert.deepEqual(report.portfolio, { positions: [] });
assert.ok(Number.isFinite(Date.parse(report.observedAt)));

await assert.rejects(
  readEtoroDemoPortfolio({ ...input, publicApiKey: "", transport }),
  /ETORO_DEMO_CREDENTIALS_REQUIRED/
);
await assert.rejects(
  readEtoroDemoPortfolio({ ...input, requestId: "bad-id", transport }),
  /ETORO_DEMO_REQUEST_ID_REQUIRED/
);
assert.equal(calls, 1, "Invalid inputs must not initiate requests.");

await assert.rejects(
  readEtoroDemoPortfolio({
    ...input,
    transport: async () => ({ ok: false, status: 429, json: async () => ({ token: "never-log" }) }),
  }),
  /ETORO_DEMO_HTTP_429/
);
await assert.rejects(
  readEtoroDemoPortfolio({
    ...input,
    transport: async () => { throw new Error("secret inside transport error"); },
  }),
  /ETORO_DEMO_TRANSPORT_ERROR/
);
assert.ok(!ETORO_DEMO_PORTFOLIO_URL.includes("/real/"));
assert.ok(!ETORO_DEMO_PORTFOLIO_URL.includes("/execution/"));
console.log("Fenice eToro demo read-only adapter tests: PASS");
