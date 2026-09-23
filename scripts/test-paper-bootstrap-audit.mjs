import assert from "node:assert/strict";
import { classifyPaperBootstrapAudit } from "../lib/trading/paper-bootstrap-audit.mjs";

const closed = {
  configured: true,
  liveTradingAllowed: false,
  evidence: { state: "CLOSED", authoritative: true },
  decision: { state: "CLOSED", allowed: false, ageSeconds: 0.5 },
};
const open = {
  configured: true,
  liveTradingAllowed: false,
  evidence: { state: "OPEN", authoritative: true },
  decision: { state: "OPEN", allowed: true, ageSeconds: 0.5 },
};

assert.equal(classifyPaperBootstrapAudit(closed, { eligible: false }).status, "WAIT_MARKET_OPEN");
assert.equal(classifyPaperBootstrapAudit(closed, { eligible: true }).campaignStartAllowed, false);
assert.equal(classifyPaperBootstrapAudit(open, { eligible: true }).status, "BOOTSTRAP_REQUIRED");
assert.equal(classifyPaperBootstrapAudit(open, { eligible: true }).campaignStartAllowed, true);
assert.equal(classifyPaperBootstrapAudit(open, { eligible: false }).status, "OPEN_NOT_READY");
assert.equal(classifyPaperBootstrapAudit({
  ...open,
  evidence: { state: "OPEN", authoritative: false },
}, { eligible: true }).status, "SESSION_UNCERTAIN");
assert.equal(classifyPaperBootstrapAudit({
  ...open,
  decision: { state: "OPEN", allowed: true, ageSeconds: 121 },
}, { eligible: true }).status, "SESSION_UNCERTAIN");
assert.equal(classifyPaperBootstrapAudit({
  ...open,
  decision: { state: "OPEN", allowed: false, ageSeconds: 1 },
}, { eligible: true }).status, "SESSION_UNCERTAIN");
assert.equal(classifyPaperBootstrapAudit({
  ...open,
  liveTradingAllowed: true,
}, { eligible: true }).status, "SAFETY_FAILURE");

console.log("Fenice PAPER bootstrap audit classifier tests: PASS");
