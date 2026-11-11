/**
 * V8 technical shadow exits: cheap authoritative market clock BEFORE any
 * execution quote, FX or batch feed calls. Isolated from pinned V8 core.
 *
 * This is only permission to FETCH eligible research-only input, NOT
 * proof of executable quotes, PAPER certification or broker trading.
 */
import {readFileSync,appendFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(fileURLToPath(import.meta.url),"../..");
const asMillis=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))
  &&new Date(Date.parse(x)).toISOString()===x?Date.parse(x):null;
export function assessShadowExitSession({session,nowIso}){
  const now=asMillis(nowIso);
  if(now===null)throw Error("V8_SHADOW_CLOCK_INVALID");
  const deny=reason=>({allowed:false,reason,checkedAt:nowIso,
    providerQuotesAuthorized:false,paperOrdersAuthorized:false,
    liveTradingAllowed:false,brokerConnectivityAllowed:false});
  if(!session||session.version!==1||session.configured!==true
    ||session.diagnosticOnly!==true||session.liveTradingAllowed!==false)
    return deny("AUTHORITATIVE_US_CLOCK_UNAVAILABLE");
  if(session.error!==null||session.evidence?.source!=="Alpaca Paper Trading Clock"
    ||session.evidence?.venue!=="US_EQUITIES"
    ||session.evidence?.authoritative!==true
    ||session.evidence?.state!=="OPEN"
    ||session.decision?.allowed!==true)
    return deny("US_REGULAR_SESSION_NOT_OPEN");
  const at=asMillis(session.evidence.observedAt);
  const outputAt=asMillis(session.generatedAt);
  const close=asMillis(session.nextClose);
  const open=asMillis(session.nextOpen);
  if(at===null||outputAt===null||close===null
    ||at>now||outputAt>now||now-at>120000||now-outputAt>120000
    ||Math.abs(at-outputAt)>120000)
    return deny("US_MARKET_CLOCK_STALE_OR_UNTRUSTED");
  // Never fetch whole quote batches in the final 5 minutes of cash session:
  // late responses cannot create eligible research-only shadow exits.
  if(close-now<300000)return deny("US_SESSION_TOO_CLOSE_TO_END");
  // The next_open may be in the future even while open on some APIs;
  // the authoritative state and close time are the deciding fields.
  if(open!==null&&open>now&&close<=open)
    return deny("US_SESSION_TIME_WINDOW_INCONSISTENT");
  return {allowed:true,reason:"AUTHORITATIVE_US_SESSION_OPEN_FRESH",
    checkedAt:nowIso,providerQuotesAuthorized:true,
    paperOrdersAuthorized:false,liveTradingAllowed:false,
    brokerConnectivityAllowed:false};
}
function main(){
  const session=JSON.parse(readFileSync(resolve(root,"data/paper-market-session.json"),"utf8"));
  const report=assessShadowExitSession({session,nowIso:new Date().toISOString()});
  const output=process.env.GITHUB_OUTPUT;
  if(process.argv.includes("--github-output")){
    if(!output)throw Error("V8_SHADOW_GITHUB_OUTPUT_MISSING");
    appendFileSync(output,"allowed="+report.allowed+"\nreason="+report.reason+"\n");
  }
  console.log(JSON.stringify(report));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
