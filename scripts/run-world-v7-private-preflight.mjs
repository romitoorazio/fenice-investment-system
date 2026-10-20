// Private, read-only V7 data bridge. Never publishes quotes or creates fills.
// A separate operator-controlled rights registry is required; this script
// cannot itself certify legal entitlements, exchange clock or vendor contracts.
import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { runWorldPaperV7 } from "../lib/trading/world-paper-v7.mjs";

const args = new Map(process.argv.slice(2).map(arg => {
  if (!/^--[a-z-]+=/.test(arg)) throw Error("UNKNOWN_OR_UNSAFE_ARG");
  const i = arg.indexOf("=");
  return [arg.slice(2,i),arg.slice(i+1)];
}));
const supported = new Set(["observations", "rights-registry", "output", "at"]);
if ([...args.keys()].some(k => !supported.has(k))) throw Error("UNKNOWN_OR_UNSAFE_ARG");
if (args.has("observations") !== args.has("rights-registry")) throw Error("BOTH_PRIVATE_FILES_REQUIRED");

function privateJson(filename) {
  if (!path.isAbsolute(filename)) throw Error("ABSOLUTE_PRIVATE_PATH_REQUIRED");
  const resolved = realpathSync(filename);
  const root = realpathSync(process.cwd());
  if (resolved === root || resolved.startsWith(root + path.sep))
    throw Error("PRIVATE_EVIDENCE_CANNOT_BE_INSIDE_REPOSITORY");
  const buffer = readFileSync(resolved);
  if (buffer.byteLength > 2_000_000 || buffer.byteLength === 0)
    throw Error("PRIVATE_EVIDENCE_FILE_SIZE_INVALID");
  return JSON.parse(buffer.toString("utf8"));
}

const master = JSON.parse(readFileSync(new URL("../data/instrument-master.json", import.meta.url), "utf8"));
const seeds = JSON.parse(readFileSync(new URL("../data/world-paper-v7-research-seeds.json", import.meta.url), "utf8"));
const instruments = [...master.instruments, ...seeds.instruments];
const nowIso = args.get("at") || new Date().toISOString();
if (typeof nowIso !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(nowIso) ||
    new Date(nowIso).toISOString() !== nowIso) throw Error("INVALID_AT");

let observations = {sessions:[], quotes:[], fx:[]};
let rights = {sources:[], sessions:[], fx:[]};
if (args.has("observations")) {
  observations = privateJson(args.get("observations"));
  rights = privateJson(args.get("rights-registry"));
  if (!observations || typeof observations !== "object" || Array.isArray(observations) ||
      !rights || typeof rights !== "object" || Array.isArray(rights))
    throw Error("PRIVATE_EVIDENCE_SHAPE_INVALID");
  // The observation bundle must never supply its own entitlement registry,
  // strategy orders, PAPER approval, broker privileges or a claimed ledger.
  for (const key of ["entitlements","intents","paperRunAuthorized","previousLedger",
    "liveTradingAllowed","brokerConnectivityAllowed","approval","instruments"]) {
    if (Object.hasOwn(observations,key)) throw Error("UNTRUSTED_EXECUTION_FIELD_IN_OBSERVATIONS");
  }
  for (const key of ["sources","sessions","fx"]) {
    if (!Array.isArray(rights[key]) || !Array.isArray(observations[key]))
      throw Error("PRIVATE_EVIDENCE_ARRAY_MISSING");
  }
  if (Object.keys(rights).some(key => !["sources","sessions","fx"].includes(key)))
    throw Error("RIGHTS_REGISTRY_UNEXPECTED_FIELD");
}

const result = runWorldPaperV7({
  nowIso, instruments, sessions:observations.sessions, quotes:observations.quotes,
  fx:observations.fx, entitlements:rights, intents:[], paperRunAuthorized:false,
});
const report = {
  version:1, generatedAt:nowIso, mode:"V7_PRIVATE_EVIDENCE_PREFLIGHT_READ_ONLY",
  evidenceProvided:args.has("observations"),
  rightsRegistryProvided:args.has("rights-registry"),
  externalLegalRightsIndependentlyCertifiedByThisScript:false,
  // Approval and execution are separate future operations; zero is deliberate.
  paperAuthorized:false, simulatedFills:0, brokerConnectivityAllowed:false,
  liveTradingAllowed:false, modifiesV6:false,
  evaluatedListings:result.summary.pilotListings,
  listingsAdmittedByRuntimeQuorum:result.summary.independentlyVerifiedListings,
  blockersByListing:result.listings.map(x => ({
    symbol:x.symbol, mic:x.mic, currency:x.currency, region:x.region,
    ready:x.ready, reasons:x.reasons,
    independentProviderFamilyCount:x.independentFamilies.length,
  })),
};
if (result.summary.filledPaperOrders !== 0 ||
    result.liveTradingAllowed !== false || result.brokerConnectivityAllowed !== false ||
    result.modifiesV6 !== false || result.paperRunAuthorized !== false)
  throw Error("WORLD_V7_PREFLIGHT_SAFETY_INVARIANT");
if (args.has("output")) {
  const p = path.resolve(args.get("output"));
  // Reports are sanitized, but keep output out of the source tree.
  const root = realpathSync(process.cwd());
  if (p === root || p.startsWith(root+path.sep)) throw Error("NO_OUTPUT_IN_REPOSITORY");
  writeFileSync(p, JSON.stringify(report,null,2)+"\n", {mode:0o600,flag:"w"});
}
console.log(JSON.stringify({
  mode:report.mode,evidenceProvided:report.evidenceProvided,
  listingsAdmittedByRuntimeQuorum:report.listingsAdmittedByRuntimeQuorum,
  checked:report.evaluatedListings,simulatedFills:0,liveTradingAllowed:false,
  rightsIndependentlyCertified:false,
}));
