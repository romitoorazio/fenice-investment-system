import assert from "node:assert/strict";
import { classifyPaperBootstrapAudit } from "../lib/trading/paper-bootstrap-audit.mjs";

const now = Date.parse("2026-09-23T10:00:00Z");
const observedAt = "2026-09-23T09:59:59.500Z";
const options = { now, maxSessionAgeSeconds: 120 };
const closed = {
  configured: true,
  liveTradingAllowed: false,
  evidence: { state: "CLOSED", authoritative: true, observedAt },
  decision: { state: "CLOSED", allowed: false, ageSeconds: 0.5 },
};
const open = {
  configured: true,
  liveTradingAllowed: false,
  evidence: { state: "OPEN", authoritative: true, observedAt },
  decision: { state: "OPEN", allowed: true, ageSeconds: 0.5 },
};

assert.equal(classifyPaperBootstrapAudit(closed, { eligible: false }, options).status, "WAIT_MARKET_OPEN");
assert.equal(classifyPaperBootstrapAudit(closed, { eligible: true }, options).campaignStartAllowed, false);
assert.equal(classifyPaperBootstrapAudit(open, { eligible: true }, options).status, "BOOTSTRAP_REQUIRED");
assert.equal(classifyPaperBootstrapAudit(open, { eligible: true }, options).campaignStartAllowed, true);
assert.equal(classifyPaperBootstrapAudit(open, { eligible: false }, options).status, "OPEN_NOT_READY");
assert.equal(classifyPaperBootstrapAudit({
  ...open,
  evidence: { state: "OPEN", authoritative: false, observedAt },
}, { eligible: true }, options).status, "SESSION_UNCERTAIN");
assert.equal(classifyPaperBootstrapAudit({
  ...open,
  evidence: { state: "OPEN", authoritative: true, observedAt: "2026-09-23T09:57:59Z" },
}, { eligible: true }, options).status, "SESSION_UNCERTAIN", "stored age must not hide a stale provider timestamp");
assert.equal(classifyPaperBootstrapAudit({
  ...open,
  decision: { state: "OPEN", allowed: false, ageSeconds: 1 },
}, { eligible: true }, options).status, "SESSION_UNCERTAIN");
assert.equal(classifyPaperBootstrapAudit({
  ...open,
  liveTradingAllowed: true,
}, { eligible: true }, options).status, "SAFETY_FAILURE");

console.log("Fenice PAPER bootstrap audit classifier tests: PASS");
