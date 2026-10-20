import assert from "node:assert/strict";
import {readFileSync, mkdtempSync, writeFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {gate} from "./paper-probe-operator-gate.mjs";
const plan=JSON.parse(readFileSync(new URL("../data/paper-v6-continuation-plan.json",import.meta.url),"utf8"));
const approval=JSON.parse(readFileSync(new URL("../data/paper-validation-approval.json",import.meta.url),"utf8"));
const campaign={version:6,liveTradingAllowed:false,baselineCommit:plan.v6.baselineCommit,
  baselineFingerprint:{digest:plan.v6.baselineDigest,complete:true}};
const queue={mode:"PAPER",orders:[]};
const input={plan,approval,campaign,queue,now:Date.parse("2026-10-16T18:00:00Z")};
assert.equal(gate(input).allowed,true);
for(const [name,patch,reason] of [
  ["expired",{now:Date.parse("2026-10-25T00:00:00Z")},"expiry-too-close"],
  ["near-expiry",{now:Date.parse("2026-10-24T21:40:00Z")},"expiry-too-close"],
  ["forged extension",{approval:{...approval,expiresAt:"2026-11-24T21:59:59.000Z"}},"expiry-invalid"],
  ["no human",{approval:{...approval,humanConfirmation:false}},"safety-lock-invalid"],
  ["LIVE",{approval:{...approval,liveTradingAllowed:true}},"safety-lock-invalid"],
  ["broker",{approval:{...approval,brokerConnectivityAllowed:true}},"safety-lock-invalid"],
  ["cap",{approval:{...approval,maxNotionalEuroPerOrder:301}},"limits-invalid"],
  ["FX",{approval:{...approval,fxPolicy:{...approval.fxPolicy,requiredForNonEuro:false}}},"limits-invalid"],
  ["baseline",{campaign:{...campaign,baselineCommit:"a".repeat(40)}},"baseline-invalid"],
  ["pending",{queue:{mode:"PAPER",orders:[{clientOrderId:"test"}]}},"queue-pending"],
  ["wrong mode",{queue:{mode:"LIVE",orders:[]}},"queue-invalid"],
  ["NaN",{now:NaN},"clock-invalid"]
]){
 const result=gate({...input,...patch});
 assert.equal(result.allowed,false,name);
 assert.equal(result.reason,reason,name);
 assert.equal(result.authorizesOrders,false,name);
}

// Regression: large campaign history must never enter execve's argv/env.
// Passing CAMPAIGN_JSON in an environment variable failed at ~128 KiB (E2BIG).
const temp = mkdtempSync(join(tmpdir(), "fenice-paper-operator-"));
try {
  const farFuture = "2099-01-01T00:00:00.000Z";
  const fixtures = {
    approval: {...approval, expiresAt: farFuture},
    queue,
    campaign: {...campaign, historicalEvidencePadding: "x".repeat(400_000)},
    plan: {...plan, v6: {...plan.v6, originalExpiresAt: farFuture}},
  };
  for (const [name, payload] of Object.entries(fixtures)) {
    writeFileSync(join(temp, name + ".json"), JSON.stringify(payload), "utf8");
  }
  const command = fileURLToPath(new URL("./paper-probe-operator-gate.mjs", import.meta.url));
  const args = [
    "--approval-file", join(temp, "approval.json"),
    "--queue-file", join(temp, "queue.json"),
    "--campaign-file", join(temp, "campaign.json"),
    "--plan-file", join(temp, "plan.json"),
  ];
  const invoke = (passedArgs = args) => {
    const child = spawnSync(process.execPath, [command, ...passedArgs], {
      encoding: "utf8", timeout: 15_000, maxBuffer: 64 * 1024,
    });
    assert.ifError(child.error);
    assert.equal(child.status, 0, child.stderr);
    return JSON.parse(child.stdout);
  };
  assert.equal(readFileSync(join(temp, "campaign.json")).length > 131_072, true);
  const validFiles = invoke();
  assert.equal(validFiles.allowed, true, "oversized input should reach pre-dispatch gate");
  assert.equal(validFiles.authorizesOrders, false);
  assert.equal(validFiles.liveTradingAllowed, false);

  // Fail-closed parsing: malformed or missing inputs must never allow probes.
  writeFileSync(join(temp, "approval.json"), "{malformed", "utf8");
  assert.equal(invoke().reason, "input-invalid");
  assert.equal(invoke().allowed, false);
  assert.equal(invoke(args.slice(0, -2)).reason, "input-invalid");
  writeFileSync(join(temp, "approval.json"), JSON.stringify({...fixtures.approval, humanConfirmation:false}), "utf8");
  const denied = invoke();
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, "safety-lock-invalid");
} finally {
  rmSync(temp, {recursive:true, force:true});
}

console.log("Fenice V6 operator pre-dispatch safety gate PASS");
