/**
 * Read-only V8 proof post-mortem for an actual completed independent PAPER lab.
 * No provider calls, approvals, broker actions or certification credit.
 * A green GitHub job with skipped quote steps is NOT an admissible V8 day.
 */
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { replayV8Days } from "./run-v8-technical-evidence.mjs";
import { replayExecutionLabLedger } from "./run-paper-execution-lab.mjs";

const isoMs = value => {
  const n = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(n) && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) ? n : null;
};
const stepResult = (job, name) => (job?.steps || []).find(x => x.name === name)?.conclusion || "missing";
const failingStep = job => (job?.steps || []).find(x => x.conclusion === "failure")?.name || null;

export function identifySafeSourceClues(log = "") {
  // Only known diagnostic categories are extracted, never raw provider logs,
  // request URLs, headers, keys or untrusted free-form error messages.
  const lines = String(log).split(/\r?\n/).filter(x =>
    /\b(error|failed|http[_ ]?(401|403|429|5\d\d)|rate.limit|quota|not.configured)\b/i.test(x));
  const details = lines.slice(-120).join("\n").toLowerCase();
  const families = [];
  if (/\balpaca\b|apca_api_key|paper-api\.alpaca/.test(details)) families.push("ALPACA");
  if (/twelve.?data|refresh-twelve-data|twelve_data/.test(details)) families.push("TWELVE_DATA");
  if (/\bfx\b|refresh-paper-fx|exchange.rate/.test(details)) families.push("EUR_FX");
  if (/coverage|independent.source|quorum/.test(details)) families.push("QUOTE_COVERAGE");
  const errors = [];
  if (/http[_ ]?429|rate.limit|quota/.test(details)) errors.push("RATE_LIMIT_OR_QUOTA");
  if (/http[_ ]?(401|403)|not.configured/.test(details)) errors.push("AUTH_OR_ACCESS");
  if (/http[_ ]?5\d\d/.test(details)) errors.push("PROVIDER_SERVER_ERROR");
  return { families: [...new Set(families)], errors: [...new Set(errors)] };
}

export function diagnoseV8ProofRun({ run, jobs, days, samples, status, integrityValid, log = "" }) {
  const started = isoMs(run?.run_started_at), ended = isoMs(run?.updated_at);
  if (started === null || ended === null || ended < started)
    throw Error("V8_DIAGNOSTIC_RUN_TIMESTAMPS_INVALID");
  if (!Array.isArray(jobs) || !Array.isArray(days?.records) || !Array.isArray(samples?.events))
    throw Error("V8_DIAGNOSTIC_INPUT_INVALID");
  const date = run.run_started_at.slice(0,10);
  const observe = jobs.find(x => x.name === "observe") || null;
  const inRun = record => {
    const at = isoMs(record?.observedAt);
    return at !== null && at >= started - 30000 && at <= ended + 120000;
  };
  const today's = days.records.find(x => x.date === date);
  const thisRunProof = days.records.find(x => x.date === date && inRun(x));
  const todaySamples = samples.events.filter(x => x.occurredAt?.slice(0,10) === date).length;
  const marketMatches = [...String(log).matchAll(/Fenice PAPER market session:\s*(OPEN|CLOSED|UNKNOWN)/g)];
  const marketState = marketMatches.length ? marketMatches.at(-1)[1] : "NOT_OBSERVED";
  const clues = identifySafeSourceClues(log);
  const base = {
    version:1, runId:run.id, runUrl:run.html_url, observedDateUTC:date,
    workflowConclusion:run.conclusion, marketStateInJobLog:marketState,
    sourceClues:clues, v8DayAlreadyRecorded:!!today's,
    v8DayRecordedByThisRun:!!thisRunProof, recordedTechnicalSamplesToday:todaySamples,
    certificationScope:"V8_TECHNICAL_ONLY", strategyPaperTradeCertified:false,
    certificationCredit:0, liveTradingAllowed:false, brokerConnectivityAllowed:false,
  };
  const result = (statusCode, stage, detail) => ({
    ...base, status:statusCode, stage, detail,
    newAdmissibleTechnicalDay:statusCode === "ADMISSIBLE_V8_TECHNICAL_DAY",
  });
  if (integrityValid !== true)
    return result("EVIDENCE_INTEGRITY_FAILED","HASH_CHAIN_REPLAY","V8 day or sample ledger replay failed");
  if (thisRunProof)
    return result("ADMISSIBLE_V8_TECHNICAL_DAY","LEDGER_PERSISTED",
      "Prospective date-matched signed technical day exists inside actual run window");
  if (today's)
    return result("ALREADY_ADMITTED_TODAY","DAILY_DEDUPLICATION",
      "A valid earlier technical day already exists; do not add duplicate evidence");
  if (run.conclusion !== "success")
    return result("UPSTREAM_WORKFLOW_FAILED",failingStep(observe)||"WORKFLOW",
      "Independent PAPER lab did not complete successfully");
  if (!observe || observe.conclusion === "skipped")
    return result("OBSERVER_NOT_EXECUTED","JOB_GATE","No V8 observation job executed");
  const session=stepResult(observe,"Verify session is OPEN, fresh and not near closing");
  const collection=stepResult(observe,"Collect genuine, independent quote and FX evidence");
  const proof=stepResult(observe,"Record V8 verified day or precise fail-closed diagnostic");
  const persist=stepResult(observe,"Persist independent V8 and lab evidence even when V8 reports BLOCKED");
  if (session === "skipped" || session === "missing")
    return result("SESSION_CHECK_NOT_REACHED","EARLY_BUDGET_OR_DUPLICATE_GATE",
      "Opening clock was not queried; no fresh proof could be produced");
  if (collection === "skipped")
    return result("SESSION_GATE_BLOCKED","AUTHORITATIVE_US_CLOCK",
      marketState === "CLOSED" ? "Alpaca reports CLOSED: not an eligible trading session at run time"
      : marketState === "UNKNOWN" ? "Alpaca clock UNKNOWN: credentials, freshness or provider must be checked"
      : "Open-session authorization failed; inspect lab market-clock step and fresh session validity");
  if (collection === "failure")
    return result("SOURCE_COLLECTION_FAILED","EXECUTION_QUOTES_OR_FX",
      "Quote/FX acquisition failed: check sourceClues and the linked upstream job logs");
  if (proof === "failure")
    return result("V8_PROOF_VALIDATION_FAILED","V8_PROOF_CHECK",
      "Observer failed to accept or record a V8 technical day");
  if (persist === "failure")
    return result("PROOF_PERSISTENCE_FAILED","GIT_LEDGER_PUSH",
      "Technical evidence could not be committed; never credit a transient snapshot");
  const statusTime=isoMs(status?.generatedAt);
  const currentStatus=statusTime!==null && statusTime>=started-30000 && statusTime<=ended+120000;
  if (currentStatus && status?.reason)
    return result("V8_PROOF_BLOCKED",String(status.reason).slice(0,100),
      "Current run produced an explicit V8 fail-closed rejection");
  return result("NO_ADMISSIBLE_PROOF","PROOF_OR_PERSISTENCE_NOT_CONFIRMED",
    "No validated V8 day from this run is present in persistent signed evidence");
}

function main(){
  const read = p => JSON.parse(readFileSync(p,"utf8"));
  const args = Object.fromEntries(process.argv.slice(2).filter(x=>x.includes("=")).map(x=>{
    const i=x.indexOf("=");return [x.slice(0,i),x.slice(i+1)];
  }));
  for(const key of ["--run","--jobs","--output"])
    if(!args[key])throw Error("V8_DIAGNOSTIC_REQUIRED_ARG_"+key);
  const dataDir = "data/";
  const approval=read(dataDir+"paper-v8-technical-approval.json");
  const days=read(dataDir+"paper-v8-technical-days.json");
  const samples=read(dataDir+"paper-v8-technical-samples.json");
  const status=read(dataDir+"paper-v8-technical-status.json");
  const integrityValid=replayV8Days(days,approval).valid && replayExecutionLabLedger(samples).valid;
  const jobsDocument=read(args["--jobs"]);
  const log=args["--log"]?readFileSync(args["--log"],"utf8"):"";
  const report=diagnoseV8ProofRun({run:read(args["--run"]),jobs:jobsDocument.jobs,
    days,samples,status,integrityValid,log});
  writeFileSync(args["--output"],JSON.stringify(report,null,2)+"\n");
  const summary="V8 PAPER proof: "+report.status+"; blocker="+report.stage+
    "; market="+report.marketStateInJobLog+"; technical-day-recorded="+
    report.v8DayAlreadyRecorded+"; source-clues="+report.sourceClues.families.join(",");
  console.log(summary);
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    "### FENICE V8 actual-session evidence\n\n"+summary+"\n\n"+
    "[Upstream lab and full logs]("+report.runUrl+")\n\n"+
    "Engineering PAPER only. No strategy certification or Directa LIVE permission.\n");
}
if(process.argv[1] && import.meta.url === new URL("file://"+process.argv[1]).href) main();
