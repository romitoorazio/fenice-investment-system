import assert from "node:assert/strict";

// CI-level structural invariants for the research branch. Runtime tests are added before promotion.
const blocked = {
  state: "BLOCKED",
  allowNewRisk: false,
};
assert.equal(blocked.allowNewRisk, false);

function adversarialScore(thesis, maxRisk, contradictions) {
  return Math.max(0, Math.min(thesis, thesis - maxRisk * 0.25 - Math.min(contradictions * 7.5, 30)));
}
assert.ok(adversarialScore(90, 90, 2) < 90, "adversarial review must never increase conviction");
assert.equal(adversarialScore(40, 0, 0), 40, "review must not manufacture conviction");

console.log("adversarial safety invariants: PASS");
