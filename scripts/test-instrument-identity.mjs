import assert from "node:assert/strict";
import { isValidIsin, normalizeIsin, requireValidIsin } from "../lib/trading/instrument-identity.ts";

const valid = [
  "US5949181045",
  "US0378331005",
  "US67066G1040",
  "US30303M1027",
  "US02079K3059",
  "US0231351067",
  "USN070592100",
  "US8740391003",
  "US78462F1030",
  "US46090E1038",
  "US4642876555",
  "DE0007164600",
];
for (const isin of valid) {
  assert.equal(isValidIsin(isin), true, `${isin} should pass ISO/Luhn validation`);
  assert.equal(requireValidIsin(isin), isin);
}

assert.equal(normalizeIsin(" us5949181045 "), "US5949181045");
assert.equal(isValidIsin("US5949181044"), false, "wrong check digit must fail");
assert.equal(isValidIsin("US0378331006"), false, "plausible-format but checksum-invalid ISIN must fail");
assert.equal(isValidIsin("BAD"), false);
assert.equal(isValidIsin(""), false);
assert.equal(requireValidIsin("US5949181044"), null);

console.log("Fenice instrument identity/ISIN checksum tests: PASS");
