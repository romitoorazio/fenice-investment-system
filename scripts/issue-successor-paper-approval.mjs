#!/usr/bin/env node
// Explicit operator-approved PAPER successor issuance. Never starts a campaign.
import { readFileSync, writeFileSync, openSync, closeSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const fail = code => { throw Error(code); };
if (process.argv.length !== 3 || process.argv[2] !== "--confirm-paper-only")
  fail("EXPLICIT_PAPER_ONLY_CONFIRMATION_REQUIRED");
const authorization = JSON.parse(readFileSync("data/paper-successor-operator-authorization.json","utf8"));
if (authorization.authorized !== true || authorization.mode !== "PAPER" ||
    authorization.liveTradingAllowed !== false || authorization.brokerConnectivityAllowed !== false ||
    authorization.automaticActivationAllowed !== false ||
    authorization.requiresFreshOperationalApproval !== true ||
    authorization.requiresMarketDataAndFxPreflight !== true ||
    authorization.requiresBaselineTransition !== true) fail("OPERATOR_CONSENT_INVALID");
const bytes=readFileSync("data/paper-validation-campaign.json");
const digest=createHash("sha256").update(bytes).digest("hex");
if(digest!=="4380ab3ce24d8b59f8f2acba390fb39c0577331970fb791a5a2ae59232a93df1")
  fail("ORIGINAL_V6_CHANGED");
if(!readFileSync("data/paper-history/v6-20260925-campaign.json").equals(bytes))
  fail("V6_ARCHIVE_MISMATCH");
const state=JSON.parse(readFileSync("data/paper-oms-state.json","utf8"));
if(state.mode!=="PAPER" || state.liveTradingAllowed!==false || state.brokerConnectivityAllowed!==false)
  fail("BROKER_SAFETY_LOCK_MISSING");
const dirty=execFileSync("git",["status","--porcelain","--untracked-files=no"],{encoding:"utf8"}).trim();
if(dirty) fail("WORKTREE_DIRTY");
const now=new Date();
if(authorization.authorizedOn !== now.toISOString().slice(0,10))
  fail("OPERATOR_CONSENT_DATE_NOT_CURRENT");
const expires=new Date(now.getTime()+45*86400000);
const old=JSON.parse(readFileSync("data/paper-validation-approval.json","utf8"));
const approval={
  ...old,
  version:7,
  approvalId:"fenice-paper-successor-"+now.toISOString().slice(0,10),
  approved:true,
  approvedAt:now.toISOString(),
  expiresAt:expires.toISOString(),
  mode:"PAPER",
  purpose:"Prospective 45-day PAPER-only successor validation; not an activation, certification, or permission for real orders.",
  approvalReference:"Explicit operator PAPER-only confirmation dated "+authorization.authorizedOn+"; separately recorded consent",
  idPrefix:"fenice-paper-successor-",
  humanConfirmation:true,
  liveTradingAllowed:false,
  brokerConnectivityAllowed:false,
  notes:"Fresh prospective approval only. All data, FX, historical archive, freeze guard and governance gates remain mandatory. No transfer of V6 evidence. No real trading."
};
const output="data/paper-successor-operational-approval.json";
let fd;
try {
  fd=openSync(output,"wx",0o600);
  writeFileSync(fd,JSON.stringify(approval,null,2)+"\n");
} finally { if(fd!==undefined) closeSync(fd); }
console.log(JSON.stringify({issued:true,path:output,approvedAt:approval.approvedAt,expiresAt:approval.expiresAt,mode:"PAPER",campaignActivated:false,liveTradingAllowed:false,brokerConnectivityAllowed:false}));
