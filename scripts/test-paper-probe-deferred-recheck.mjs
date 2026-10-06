import assert from "node:assert/strict";
import {
  evaluateDeferredProbeRecheck,
  PAPER_DEFERRED_RECHECK_MAX_WAIT_SECONDS,
} from "./paper-probe-deferred-recheck.mjs";

const baseCooldown = {
  ready: false,
  reason: "provider-cooldown-pending",
  requiredCooldownMinutes: 15,
  ageMinutes: 2.2,
  activeCycle: false,
};

const deferred = evaluateDeferredProbeRecheck({
  now: new Date("2026-10-02T15:50:20Z"),
  eventName: "workflow_run",
  cooldown: baseCooldown,
});
assert.equal(deferred.defer, true);
assert(deferred.waitSeconds > 0 && deferred.waitSeconds <= PAPER_DEFERRED_RECHECK_MAX_WAIT_SECONDS);
assert.equal(deferred.reason, "provider-cooldown-pending-deferred-recheck");

const noLoop = evaluateDeferredProbeRecheck({
  now: new Date("2026-10-02T16:03:00Z"),
  eventName: "workflow_dispatch",
  cooldown: { ...baseCooldown, ageMinutes: 1 },
});
assert.equal(noLoop.defer, false);
assert.equal(noLoop.reason, "deferred-recheck-already-used");

const active = evaluateDeferredProbeRecheck({
  now: new Date("2026-10-02T16:03:00Z"),
  eventName: "schedule",
  cooldown: { ...baseCooldown, activeCycle: true, reason: "canonical-paper-cycle-active" },
});
assert.equal(active.defer, false);

const alreadyReady = evaluateDeferredProbeRecheck({
  now: new Date("2026-10-02T16:03:00Z"),
  eventName: "schedule",
  cooldown: { ...baseCooldown, ready: true, reason: "provider-cooldown-complete", ageMinutes: 16 },
});
assert.equal(alreadyReady.defer, false);
assert.equal(alreadyReady.reason, "cooldown-not-pending");

const nearClose = evaluateDeferredProbeRecheck({
  now: new Date("2026-10-02T19:29:00Z"),
  eventName: "schedule",
  cooldown: { ...baseCooldown, ageMinutes: 2 },
});
assert.equal(nearClose.defer, false);
assert.equal(nearClose.reason, "deferred-recheck-would-exit-window");

const weekend = evaluateDeferredProbeRecheck({
  now: new Date("2026-10-03T16:00:00Z"),
  eventName: "schedule",
  cooldown: baseCooldown,
});
assert.equal(weekend.defer, false);

console.log("Fenice PAPER deferred cooldown recheck tests: PASS");
