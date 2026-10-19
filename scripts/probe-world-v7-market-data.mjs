import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { WORLD_V7_PILOT, buildPilotObservation, emptyPilotObservation } from "../lib/market/world-v7-provider-probe.mjs";

const args = new Map(process.argv.slice(2).filter(a=>a.startsWith("--") && a.includes("=")).map(a=>{
  const idx=a.indexOf("="); return [a.slice(2,idx),a.slice(idx+1)];
}));
const venue = args.get("venue") || "XMIL";
const output = args.get("output") || "/tmp/fenice-world-v7-provider-observation.json";
if (!Object.hasOwn(WORLD_V7_PILOT, venue)) throw new Error("WORLD_V7_PILOT_VENUE_NOT_ALLOWLISTED");
if (process.argv.includes("--probe") && !args.has("output")) throw new Error("WORLD_V7_OUTPUT_REQUIRED_FOR_NETWORK_PROBE");
const target = WORLD_V7_PILOT[venue];
const now = new Date().toISOString();
const key = String(process.env.TWELVE_DATA_API_KEY || "").trim();
// Explicit opt-in AND configured key. No payments, retries, provider entitlements,
// broker trading, or copying raw licensed provider prices into artifact/public logs.
const probing = process.argv.includes("--probe") && key.length >= 8;
async function request(kind) {
  const params = kind === "state"
    ? new URLSearchParams({code: target.exchangeMic})
    : new URLSearchParams({symbol: target.symbol, mic_code: target.exchangeMic});
  const endpoint = kind === "state" ? "/market_state" : "/quote";
  const timeout = AbortSignal.timeout(7000);
  try {
    const response = await fetch("https://api.twelvedata.com" + endpoint + "?" + params, {
      headers: {"Authorization":"apikey " + key, Accept:"application/json"},
      signal: timeout,
      redirect:"error",
    });
    if (!response.ok) {
      return {code: response.status, status:"error"}; // No secrets nor provider response logged.
    }
    const type = response.headers.get("content-type") || "";
    if (!type.includes("json")) return {code: 502, status:"error"};
    const len = Number(response.headers.get("content-length") || 0);
    if (len > 16000) return {code: 502, status:"error"};
    const body = await response.text();
    if (body.length > 16000) return {code: 502,status:"error"};
    try { return JSON.parse(body); } catch { return {code:502,status:"error"}; }
  } catch {
    return {code: 503, status: "error"}; // Safe generic transport failure.
  }
}
let observed;
if (!probing) {
  observed=emptyPilotObservation(venue, now, key ? "NETWORK_PROBE_NOT_AUTHORIZED" : "CREDENTIAL_NOT_CONFIGURED");
} else {
  const state=await request("state");
  // Basic is 8 credits/minute; do not retry/overlap or exhaust shared quota.
  await new Promise(resolve=>setTimeout(resolve,1400));
  const quote=await request("quote");
  observed=buildPilotObservation(venue, new Date().toISOString(), state, quote);
  observed.requestedApiCreditsMax=2;
}
mkdirSync(path.dirname(output),{recursive:true});
writeFileSync(output,JSON.stringify(observed,null,2)+"\n",{mode:0o600});
const log={venue, recordedAt:observed.recordedAt, state:observed.state.status,
  reportedOpen:observed.state.reportedOpen, quote:observed.quote.status,
  quoteAgeSeconds:observed.quote.ageSeconds ?? null,
  blockers:observed.blockers, paperReady:false, usedNetwork:probing, pricePublished:false,
  file:output};
console.log(JSON.stringify(log));
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    "# WORLD V7 real provider diagnostic\n\n"+
    "Venue: **"+venue+"** | Provider: Twelve Data | Mode: **read-only**\n\n"+
    "State: "+observed.state.status+"; provider reported open: "+String(observed.state.reportedOpen)+"\n\n"+
    "Quote classification: "+observed.quote.status+" (not a licensed PAPER quote)\n\n"+
    "Approval: **NO**. Requires independent source, current permitted venue feed, applicable FX, legal entitlement evidence and strategy approval.\n\n"+
    "No raw quotation price or credentials published; V6 preserved, LIVE blocked.\n");
}
