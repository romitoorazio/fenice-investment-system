import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildCapitalGoalPlan, DEFAULT_CAPITAL_GOAL } from "../lib/capital-goal.ts";

const goal = DEFAULT_CAPITAL_GOAL;
assert.equal(goal.input.initialCapital, 10_000);
assert.equal(goal.input.targetCapital, 100_000);
assert.equal(goal.input.horizonYears, 10);
assert.equal(goal.input.annualContribution, 0);
assert.equal(goal.capitalMultiple, 10);
assert(Math.abs(goal.requiredAnnualReturnPercent - 25.89) < 0.02);
assert.equal(goal.verdict, "obiettivo estremamente ambizioso");
assert.equal(goal.scenarios.find(row => row.id === "obiettivo")?.targetReached, true);

const lowerReturn = buildCapitalGoalPlan({
  initialCapital: 10_000,
  targetCapital: 100_000,
  horizonYears: 10,
  annualContribution: 0,
}).scenarios.find(row => row.id === "aggressivo");
assert(lowerReturn?.projectedCapital < 100_000, "15% is not sufficient to promise 10x in 10y");
assert.equal(lowerReturn?.targetReached, false);

const missionSource = await readFile(new URL("../lib/mission.ts", import.meta.url), "utf8");
const homeSource = await readFile(new URL("../components/MissionControl.tsx", import.meta.url), "utf8");
assert.match(missionSource, /const CAPITAL = 10_000;/);
assert.match(missionSource, /const GOAL = 100_000;/);
assert.match(missionSource, /const YEARS = 10;/);

assert.match(homeSource, /aria-label="Obiettivo economico Fenice"/);
assert.match(homeSource, /euro\.format\(data\.capital\).*?euro\.format\(data\.stretchGoal\)/s);
assert.match(homeSource, /data\.horizonYears/);
assert.match(homeSource, /data\.requiredAnnualReturn\.toFixed\(2\)/);
assert.match(homeSource, /href="\/performance"/);
assert.match(homeSource, /Profitto netto dimostrato rispetto all'obiettivo/);
assert.match(homeSource, /NON VERIFICATO/);
assert.match(homeSource, /Capitale reale Directa verificato/);
assert.match(homeSource, /NON INVESTIRE ANCORA/);
assert.match(homeSource, /nessuna scorciatoia sblocca gli ordini reali/);
console.log("Fenice 10k-to-100k mission displayed honestly with LIVE controls intact: PASS");
