import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { optionalDcfNumber } from "../lib/intelligence/committee-valuation-numbers.mjs";

for (const value of [null, undefined, "", "0", "100", NaN, Infinity, -Infinity, {}, []]) {
  assert.equal(optionalDcfNumber(value), null, "missing/non-numeric DCF must not become zero");
}
assert.equal(optionalDcfNumber(0), 0, "explicit zero upside is valid");
assert.equal(optionalDcfNumber(-56), -56, "negative valuation upside must be retained");
assert.equal(optionalDcfNumber(100.5, { positiveOnly: true }), 100.5);
assert.equal(optionalDcfNumber(0, { positiveOnly: true }), null);
assert.equal(optionalDcfNumber(-1, { positiveOnly: true }), null);
assert.equal(optionalDcfNumber(null, { positiveOnly: true }), null);

const committee = await readFile(new URL("./run-investment-committee.mjs", import.meta.url), "utf8");
assert.match(committee, /const fairValue = optionalDcfNumber\(dcf\?\.fairValueBase, \{ positiveOnly: true \}\)/);
assert.match(committee, /else if \(fairValue === null\)/);
assert.match(committee, /fairValueBase: optionalDcfNumber\(dcf\?\.fairValueBase, \{ positiveOnly: true \}\)/);
assert.match(committee, /upsideBasePercent: optionalDcfNumber\(dcf\?\.upsideBasePercent\)/);
assert.doesNotMatch(committee, /Number\.isFinite\(Number\(dcf\?\.fairValue/);
console.log("Fenice DCF missing-versus-zero regression: PASS");
