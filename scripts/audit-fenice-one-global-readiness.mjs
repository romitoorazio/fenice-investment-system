/** Deterministic, read-only architecture readiness audit. Never equate contract PASS with live PAPER. */
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=path=>readFileSync(resolve(root,path),"utf8");
export function assessGlobalReadiness(files){
  const quote=files.quote,calendar=files.calendar,pipeline=files.pipeline,ledger=files.ledger,workflow=files.workflow,durableLedger=files.durableLedger??"";
  const checks=[
    {id:"SOURCE_PROVENANCE",passed:quote.includes("PROVIDER_RESPONSE_UNVERIFIED"),detail:"Adapter marks HTTP provider responses unverified"},
    {id:"INDEPENDENT_QUOTE_ATTESTATION",passed:/verifyIndependentMarketSource|attestProviderIndependently/.test(pipeline),detail:"A provider HTTP response alone cannot become independently verified quote evidence"},
    {id:"CALENDAR_AUTHORITY",passed:/allowlist|trustedCalendarProviders|verifyCalendarSignature/.test(calendar),detail:"Verified calendar-provider authority required, not caller-provided authoritative flag"},
    {id:"REAL_QUOTE_ORCHESTRATION",passed:/fetchTwelveDataGlobalQuote|fetchProviderQuote/.test(pipeline),detail:"PAPER entrypoint must acquire actual quote observations rather than only accept caller-supplied arrays"},
    {id:"DURABLE_LEDGER",passed:/loadDurableVirtualLedger/.test(durableLedger)&&/appendDurableVirtualFill/.test(durableLedger)&&/replayVirtualLedger/.test(durableLedger)&&/open\\(lock,\\s*["']wx["']/.test(durableLedger)&&/rename\\(temp,\\s*path\\)/.test(durableLedger)&&/await h\\.sync\\(\\)/.test(durableLedger)&&/await directory\\.sync\\(\\)/.test(durableLedger),detail:"Static implementation check for a locked, replayable, atomic SYNTHETIC-ONLY ledger; not independently certified real-source PAPER"},
    {id:"LIVE_PAPER_WORKFLOW",passed:/runPaperShadow|run-global-paper|global-paper-cycle/.test(workflow),detail:"Scheduled workflow must execute a real-source PAPER cycle, not only contract tests"},
    {id:"BROKER_ISOLATION",passed:ledger.includes("brokerConnectivityAllowed!==false")&&ledger.includes("liveTradingAllowed!==false"),detail:"Virtual ledger rejects broker and LIVE-enabled states"}
  ];
  return {schemaVersion:1,mode:"READ_ONLY_ARCHITECTURE_AUDIT",certifiedLivePaper:false,
    checks,blockers:checks.filter(x=>!x.passed).map(x=>x.id),
    verdict:checks.every(x=>x.passed)?"STATIC_GATES_PASS_NOT_LIVE_CERTIFIED":"NOT_READY_FOR_CERTIFIED_LIVE_SOURCE_PAPER"};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const files={quote:read("lib/global/quote-provider-adapter.mjs"),calendar:read("lib/global/venue-session-evidence.mjs"),pipeline:read("lib/global/paper-shadow-pipeline.mjs"),ledger:read("lib/global/virtual-ledger.mjs"),durableLedger:read("lib/global/durable-virtual-ledger.mjs"),workflow:read(".github/workflows/fenice-one-global-contracts.yml")};
 console.log(JSON.stringify(assessGlobalReadiness(files),null,2));
}
