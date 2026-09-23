import assert from "node:assert/strict";
import {
  sanitizeDirectaDiagnosticError,
  sanitizeSocketErrorCode,
} from "../lib/brokers/directa-diagnostic-safety.ts";

const fakeAccountLikeValue = "ACCOUNT-SECRET-123";
const redacted = sanitizeDirectaDiagnosticError(fakeAccountLikeValue, 1032, ["STLAM", "UCG"]);
assert.equal(redacted.ticker, "<redacted>");
assert.equal(redacted.code, 1032);
assert.equal(JSON.stringify(redacted).includes(fakeAccountLikeValue), false);

const legitimateTicker = sanitizeDirectaDiagnosticError("ucg", "1032", ["STLAM", "UCG"]);
assert.equal(legitimateTicker.ticker, "UCG");
assert.equal(legitimateTicker.code, 1032);

const unknown = sanitizeDirectaDiagnosticError("unexpected-value", "not-a-number", ["STLAM"]);
assert.equal(unknown.ticker, "<redacted>");
assert.equal(unknown.code, null);

assert.equal(sanitizeSocketErrorCode("econnrefused"), "ECONNREFUSED");
assert.equal(sanitizeSocketErrorCode("unsafe value !"), "SOCKET_ERROR");

console.log("Fenice Directa diagnostic redaction tests: PASS");
