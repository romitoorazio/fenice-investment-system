import assert from "node:assert/strict";
import { estimateFactorExposure } from "../lib/trading/factor-exposure.ts";

const market = [];
const tech = [];
const asset = [];
for (let i = 0; i < 120; i += 1) {
  const m = Math.sin(i / 7) * 0.01 + Math.cos(i / 11) * 0.004;
  const t = Math.cos(i / 5) * 0.008 + Math.sin(i / 13) * 0.003;
  const noise = Math.sin(i * 1.7) * 0.0002;
  market.push(m);
  tech.push(t);
  asset.push(0.0005 + 1.2 * m + 0.5 * t + noise);
}

const result = estimateFactorExposure(asset, { MARKET: market, TECH: tech }, { minObservations: 60 });
assert.equal(result.state, "RELIABLE", result.reasons.join(" | "));
assert(result.rSquared > 0.95, `R2 too low: ${result.rSquared}`);
assert(Math.abs(result.betas.MARKET - 1.2) < 0.05, `market beta ${result.betas.MARKET}`);
assert(Math.abs(result.betas.TECH - 0.5) < 0.05, `tech beta ${result.betas.TECH}`);
assert.equal(result.observations, 120);

const insufficient = estimateFactorExposure(asset.slice(0, 10), { MARKET: market.slice(0, 10) }, { minObservations: 60 });
assert.equal(insufficient.state, "INSUFFICIENT");
assert.equal(insufficient.betas.MARKET, undefined);

const noFactors = estimateFactorExposure(asset, {}, { minObservations: 60 });
assert.equal(noFactors.state, "INSUFFICIENT");

console.log("Fenice factor exposure regression tests: PASS");
