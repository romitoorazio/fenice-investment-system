/**
 * ONE GLOBAL: forward-only strategy decision -> PAPER intent bridge.
 * Reuses the existing worldwide PAPER simulator without giving research data
 * or the technical V8 lab any authority to certify financial performance.
 * The CLI is deliberately read-only until genuine separately approved
 * non-display venue/quote/FX entitlements exist.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { resolve, dirname, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorldPaperV7 } from "../lib/trading/world-paper-v7.mjs";
import {
  proposeOneGlobalVirtualExits,summarizeOneGlobalVirtualAccounting,
} from "../lib/trading/one-global-strategy-exits.mjs";
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const iso=v=>typeof v==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)
  &&Number.isFinite(Date.parse(v))&&new Date(Date.parse(v)).toISOString()===v?Date.parse(v):null;
const positive=n=>typeof n==="number"&&Number.isFinite(n)&&n>0;
const plainSymbol=v=>typeof v==="string"&&/^[A-Z0-9][A-Z0-9._:-]{0,23}$/.test(v);
const snapHash=v=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
const uniq=values=>[...new Set(values)];
const LIMITS=Object.freeze({maxCommitteeAgeMs:24*3600000,maxIntentAgeMs:180000,capitalEuro:1000,
  maxNotionalEuro:50,maxCandidateCount:30});

const PRIVATE_ARRAYS=Object.freeze({
  observations:["quotes","sessions","fx"],
  rights:["sources","sessions","fx"],
});
/**
 * Opt-in PRIVATE source data intake, useful for diagnosing the exact
 * source->venue->strategy boundary. The operator owns license provenance;
 * an external file CANNOT grant PAPER/LIVE authorization or prove a contract.
 * Both files must live OUTSIDE the repository, including after symlink resolution.
 */
export function loadPrivateOneGlobalEvidence({observationsPath=null,rightsRegistryPath=null}={}){
  if(!observationsPath&&!rightsRegistryPath)return {
    provided:false,observations:{quotes:[],sessions:[],fx:[]},
    rights:{sources:[],sessions:[],fx:[]},
  };
  if(!observationsPath||!rightsRegistryPath)throw Error("PRIVATE_EVIDENCE_PAIR_REQUIRED");
  const root=realpathSync(ROOT);
  const readPrivate=(file,kind)=>{
    if(typeof file!=="string"||!isAbsolute(file))
      throw Error("PRIVATE_EVIDENCE_ABSOLUTE_PATH_REQUIRED");
    const real=realpathSync(file);
    if(real===root||real.startsWith(root+sep))
      throw Error("PRIVATE_EVIDENCE_INSIDE_REPOSITORY_FORBIDDEN");
    const buffer=readFileSync(real);
    if(buffer.byteLength===0||buffer.byteLength>2_000_000)
      throw Error("PRIVATE_EVIDENCE_SIZE_INVALID");
    let doc;
    try{doc=JSON.parse(buffer.toString("utf8"));}catch{throw Error("PRIVATE_EVIDENCE_JSON_INVALID");}
    const allowed=PRIVATE_ARRAYS[kind];
    if(!doc||typeof doc!=="object"||Array.isArray(doc)
      ||Object.keys(doc).length!==allowed.length
      ||Object.keys(doc).some(key=>!allowed.includes(key))
      ||allowed.some(key=>!Array.isArray(doc[key])))
      throw Error("PRIVATE_EVIDENCE_UNTRUSTED_FIELDS_OR_SCHEMA");
    const limits=kind==="observations"?{quotes:250,sessions:250,fx:100}
      :{sources:250,sessions:250,fx:100};
    if(allowed.some(key=>doc[key].length>limits[key]))
      throw Error("PRIVATE_EVIDENCE_ITEM_LIMIT");
    return doc;
  };
  return {provided:true,observations:readPrivate(observationsPath,"observations"),
    rights:readPrivate(rightsRegistryPath,"rights")};
}


export function assessOneGlobalStrategyAuthority(authority,nowIso){
  const now=iso(nowIso),from=iso(authority?.approvedAt),until=iso(authority?.expiresAt);
  // Existing V8 technical and legacy V6/B2 approvals cannot authorize strategy PAPER.
  return Number.isFinite(now)&&Number.isFinite(from)&&Number.isFinite(until)
    &&authority?.mode==="ONE_GLOBAL_FORWARD_STRATEGY_PAPER"
    &&authority?.approved===true&&authority?.humanConfirmation===true
    &&authority?.approvedForWorldPaper===true&&authority?.approvalEvidence?.kind==="EXPLICIT_OWNER_CONSENT"
    &&typeof authority?.approvalEvidence?.reviewedCommit==="string"
    &&/^[a-f0-9]{40}$/.test(authority.approvalEvidence.reviewedCommit)
    &&authority?.allowBackfill===false
    &&authority?.liveTradingAllowed===false&&authority?.brokerConnectivityAllowed===false
    &&authority?.realBrokerOrdersAllowed===false
    &&now>=from&&now<until&&until-from<=90*86400000;
}
export function selectOneGlobalStrategyIntents({committee,instruments,nowIso}){
  const now=iso(nowIso),asOf=iso(committee?.generatedAt);
  const reasons=[];
  if(now===null)reasons.push("CLOCK_INVALID");
  if(asOf===null||now===null||asOf>now||now-asOf>LIMITS.maxCommitteeAgeMs)
    reasons.push("COMMITTEE_MISSING_FUTURE_OR_STALE");
  if(committee?.sourceGate!=="GREEN"||!Number.isFinite(committee?.dataQuality)||committee.dataQuality<90)
    reasons.push("COMMITTEE_SOURCE_QUALITY_NOT_VERIFIED");
  if(committee?.executionGate!=="PRONTO_CON_CONFERMA")
    reasons.push("COMMITTEE_NOT_READY_WITH_CONFIRMATION");
  if(!Array.isArray(committee?.allDecisions)
     ||committee.allDecisions.length>300||!Array.isArray(instruments))
    reasons.push("MISSING_OR_INVALID_INSTRUMENT_OR_COMMITTEE_UNIVERSE");
  const decisions=Array.isArray(committee?.allDecisions)?committee.allDecisions.slice(0,300):[];
  const buys=decisions.filter(d=>d?.decision==="COMPRA");
  if(committee?.buyCandidateCount!==buys.length)
    reasons.push("COMMITTEE_BUY_COUNT_INCONSISTENT");
  if(buys.length>LIMITS.maxCandidateCount)reasons.push("EXCESS_CANDIDATES_REVIEW_REQUIRED");
  const canPlan=reasons.length===0;
  const researchBuyGapReasonCounts={};
  for(const decision of decisions){
    const gaps=Array.isArray(decision?.buyGapEvidence?.gaps)?decision.buyGapEvidence.gaps:[];
    for(const gap of gaps){
      if(typeof gap?.code==="string"&&gap.code.length<=90){
        researchBuyGapReasonCounts[gap.code]=(researchBuyGapReasonCounts[gap.code]||0)+1;
      }
    }
  }
  const leadingResearchWatchlist=[...decisions]
    .filter(d=>plainSymbol(d?.symbol)&&d?.decision!=="EVITA")
    .sort((a,b)=>(a?.buyGapEvidence?.gaps?.length??99)-(b?.buyGapEvidence?.gaps?.length??99)
      ||(b.committeeScore||0)-(a.committeeScore||0))
    .slice(0,8).map(d=>({
      symbol:d.symbol,decision:d.decision,committeeScore:d.committeeScore??null,
      researchOnly:true,
      gaps:(d?.buyGapEvidence?.gaps||[]).slice(0,8).map(x=>x.code),
      paperExecutionAuthorized:false,investmentRecommendation:false,
    }));
  const intents=[], candidates=[], seen=new Set();
  for(const d of decisions){
    if(!plainSymbol(d?.symbol))continue;
    const gaps=[];
    if(d.decision!=="COMPRA")gaps.push("NO_COMMITTEE_BUY_SIGNAL");
    if(d.decision==="COMPRA"){
      if(seen.has(d.symbol))gaps.push("DUPLICATE_COMMITTEE_SYMBOL");
      seen.add(d.symbol);
      if(!Number.isFinite(d.committeeScore)||d.committeeScore<78
        ||!Number.isFinite(d.confidence)||d.confidence<72
        ||!Number.isFinite(d.riskScore)||d.riskScore>58
        ||d.terminalDecision!=="ACCUMULA")gaps.push("BUY_RULES_NOT_MET");
      if(d?.buyGapEvidence?.gaps?.length!==0
        ||!Array.isArray(d?.buyGapEvidence?.gaps))gaps.push("BUY_EVIDENCE_GAPS_OR_INVALID");
      if(d?.entryPlan?.orderMode!=="LIMITE"
        ||!positive(d.entryPlan.maxEntryPrice)
        ||!positive(d.entryPlan.firstTrancheEuro))gaps.push("NO_VALID_LIMIT_ENTRY_PLAN");
      if(d?.priceEvidence?.executionEligible===true
        &&d?.priceEvidence?.paperCertificationEligible===false)
        gaps.push("CONTRADICTORY_REFERENCE_QUOTE");
    }
    const matches=Array.isArray(instruments)?instruments.filter(i=>
      i?.ticker===d.symbol && i?.status==="active"&&
      ["equity","etf"].includes(i.assetClass)): [];
    if(d.decision==="COMPRA"){
      if(matches.length!==1)gaps.push("LISTING_IDENTITY_MISSING_OR_AMBIGUOUS");
      else if(d.currency!==matches[0].currency)
        gaps.push("INSTRUMENT_CURRENCY_CONFLICT");
      if(matches[0]?.paperExecutionAllowed===false)
        gaps.push("LISTING_IS_RESEARCH_ONLY");
    }
    if(d.decision==="COMPRA"&&canPlan&&gaps.length===0){
      const instrument=matches[0];
      const maxNotionalEuro=Math.min(d.entryPlan.firstTrancheEuro,LIMITS.maxNotionalEuro);
      const id="oneglobal-"+snapHash({generatedAt:committee.generatedAt,symbol:d.symbol,mic:instrument.exchangeMic}).slice(0,24);
      intents.push({
        id,symbol:d.symbol,exchangeMic:instrument.exchangeMic,side:"BUY",
        strategyId:"one-global-committee-forward",createdAt:nowIso,
        maxNotionalEuro,approvedForWorldPaper:false,
        // Fractional sizing is virtual-only: no assumption about Directa share lots.
        fractionalPaperAllowed:true,fractionalPaperOnly:true,
        brokerExecutionEligible:false,
        maximumLimitPrice:d.entryPlan.maxEntryPrice,
      });
    }
    if(d.decision==="COMPRA")candidates.push({
      symbol:d.symbol,listing:matches.length===1?matches[0].exchangeMic:null,
      currency:d.currency||null,entryLimit:d.entryPlan?.maxEntryPrice??null,
      approvedForSimulation:false,sourceDecisionAsOf:committee?.generatedAt||null,
      reasons:gaps.length?uniq(gaps):["AWAITING_LIVE_VENUE_AND_STRATEGY_AUTHORIZATION"],
    });
  }
  return {validInput:now!==null && !reasons.includes("MISSING_OR_INVALID_INSTRUMENT_OR_COMMITTEE_UNIVERSE"),
    committeeAsOf:committee?.generatedAt||null,decisionSnapshotSha256:snapHash(committee||{}),
    decisionCount:decisions.length,buySignals:buys.length,qualifiedResearchIntents:intents.length,
    reasons:uniq(reasons),candidates,intents,
    researchBuyGapReasonCounts,leadingResearchWatchlist,
    scope:"RESEARCH_SIGNAL_TO_FORWARD_PAPER_ADAPTER_ONLY",
    liveTradingAllowed:false,brokerConnectivityAllowed:false,
  };
}
export function evaluateOneGlobalStrategyPaper({
  committee,instruments,nowIso,authority=null,entitlements={sources:[],sessions:[],fx:[]},
  sessions=[],quotes=[],fx=[],previousLedger=null,
}){
  const plan=selectOneGlobalStrategyIntents({committee,instruments,nowIso});
  const authorized=assessOneGlobalStrategyAuthority(authority,nowIso);
  const base=runWorldPaperV7({nowIso,instruments,sessions,quotes,fx,entitlements,
    paperRunAuthorized:false,intents:[],previousLedger});
  const exits=proposeOneGlobalVirtualExits({
    ledger:base.paperLedger,listings:base.listings,nowIso,
    authorityValid:authorized,policy:authority?.exitPolicy??null,
  });
  const exitKeys=new Set(exits.intents.map(x=>x.exchangeMic+":"+x.symbol));
  // Even a qualified committee signal is not equivalent to an executable
  // market order. The venue engine separately checks contracts, open
  // sessions, 2 independent realtime providers, currency and limits.
  const approvedIntents=[];
  const proposals=[];
  for(const intent of plan.intents){
    const key=intent.exchangeMic+":"+intent.symbol;
    const market=base.listings.find(x=>x.key===key);
    const blockers=[];
    if(!authorized)blockers.push("SEPARATE_FORWARD_STRATEGY_PAPER_APPROVAL_MISSING");
    if(!market?.ready)blockers.push(...(market?.reasons||["NO_VERIFIED_MARKET_PROOF"]));
    if(market?.ready && market.verifiedPrice>intent.maximumLimitPrice)
      blockers.push("LIVE_VERIFIED_PRICE_ABOVE_STRATEGY_ENTRY_LIMIT");
    if(exitKeys.has(key))blockers.push("NO_REENTRY_DURING_STRATEGY_EXIT");
    if(blockers.length===0 && plan.reasons.length===0){
      const {maximumLimitPrice,...core}=intent;
      approvedIntents.push({...core,approvedForWorldPaper:true});
    }
    proposals.push({id:intent.id,symbol:intent.symbol,exchangeMic:intent.exchangeMic,
      marketReady:market?.ready===true,entryLimit:intent.maximumLimitPrice,
      fractionalPaperOnly:true,transferableToBroker:false,
      executable:false,blockers:uniq(blockers)});
  }
  // Portfolio exits are independent of new-entry eligibility. A temporary
  // committee ATTENDI must not obstruct a separately authorized risk exit.
  const enabled=authorized&&(exits.intents.length>0
    ||(plan.reasons.length===0&&approvedIntents.length>0));
  const cycle=enabled ? runWorldPaperV7({nowIso,instruments,sessions,quotes,fx,entitlements,
    paperRunAuthorized:true,intents:[...exits.intents,...approvedIntents],previousLedger}) : base;
  const virtualAccounting=summarizeOneGlobalVirtualAccounting(cycle.paperLedger);
  const researchCandidates=plan.candidates.map(x=>({
    ...x,
    reasons:uniq([...x.reasons,
      ...(authorized?[]:["STRATEGY_PAPER_NOT_SEPARATELY_AUTHORIZED"]),
    ]),
  }));
  return {
    version:1,generatedAt:nowIso,scope:"ONE_GLOBAL_FORWARD_STRATEGY_PAPER_DIAGNOSTIC",
    source:"CURRENT_COMMITTEE_AND_EXACT_VENUE_GATED",
    decisionSnapshotSha256:plan.decisionSnapshotSha256,
    committeeAsOf:plan.committeeAsOf,
    buySignals:plan.buySignals,qualifiedResearchIntents:plan.qualifiedResearchIntents,
    proposedPaperIntents:proposals,
    virtualExitPlans:exits.proposals,
    virtualExitPolicyValid:exits.policyValid,
    strategyVirtualAccounting:virtualAccounting,
    qualifiedMarketListings:base.summary.independentlyVerifiedListings,
    venuesChecked:base.summary.pilotListings,
    candidateDiagnostics:researchCandidates,
    researchBuyGapReasonCounts:plan.researchBuyGapReasonCounts,
    leadingResearchWatchlist:plan.leadingResearchWatchlist,
    blockers:uniq([...plan.reasons,
      ...(authorized?[]:["NO_SEPARATE_STRATEGY_PAPER_APPROVAL"]),
      ...(plan.buySignals||exits.intents.length?[]:["NO_COMPRA_DECISIONS"]),
      ...(base.summary.independentlyVerifiedListings?[]:["NO_ENTITLED_REALTIME_MARKET_IN_CURRENT_INPUT"]),
    ]),
    cycle:{
      simulatedFills:cycle.fills,
      rejectedIntents:cycle.rejectedIntents,
      cashEuro:cycle.paperLedger.cashEuro,
      positionCount:Object.values(cycle.paperLedger.positions).filter(x=>x.quantity>0).length,
      events:cycle.paperLedger.events.length,
      ledgerTip:cycle.paperLedger.lastHash,
      newlySimulatedOrders:cycle.summary.filledPaperOrders,
      newVirtualEntries:cycle.fills.filter(x=>x.side==="BUY").length,
      newVirtualExits:cycle.fills.filter(x=>x.side==="SELL").length,
    },
    // Full ledger is intentionally NOT printed by the diagnostic. A future
    // separately approved writer must atomically persist cycle.paperLedger.
    outputPaperLedger:cycle.paperLedger,
    authorizedForForwardStrategyPaper:authorized,
    creditTechnicalV8AsStrategy:false,backfillAllowed:false,
    technicalV8Modified:false,liveTradingAllowed:false,
    brokerConnectivityAllowed:false,realBrokerOrdersAllowed:false,
  };
}
async function main(){
  const options=new Map();
  for(const raw of process.argv.slice(2)){
    const parsed=/^--([a-z-]+)=(.+)$/.exec(raw);
    if(!parsed||!["output","observations","rights-registry"].includes(parsed[1])
      ||options.has(parsed[1]))throw Error("ONE_GLOBAL_UNSAFE_OR_UNKNOWN_ARG");
    options.set(parsed[1],parsed[2]);
  }
  const load=name=>JSON.parse(readFileSync(resolve(ROOT,"data",name),"utf8"));
  const privateInputs=loadPrivateOneGlobalEvidence({
    observationsPath:options.get("observations"),
    rightsRegistryPath:options.get("rights-registry"),
  });
  const nowIso=new Date().toISOString();
  const result=evaluateOneGlobalStrategyPaper({
    committee:load("investment-committee.json"),
    instruments:[...load("instrument-master.json").instruments,
      ...load("world-paper-v7-research-seeds.json").instruments],
    nowIso,
    // Read ONLY. Operator-supplied quote/rights records may be evaluated by
    // existing exact-MIC, authoritative open-session, two-provider and FX gates.
    // They must NEVER supply strategy authority, historical fills, or ledger.
    sessions:privateInputs.observations.sessions,
    quotes:privateInputs.observations.quotes,
    fx:privateInputs.observations.fx,
    entitlements:privateInputs.rights,
    authority:null,
    previousLedger:load("one-global-strategy-paper-ledger.json"),
  });
  if(result.authorizedForForwardStrategyPaper!==false
    ||result.cycle.newlySimulatedOrders!==0||result.cycle.simulatedFills.length!==0
    ||result.liveTradingAllowed!==false||result.brokerConnectivityAllowed!==false
    ||result.strategyVirtualAccounting.certifiedForwardTrades!==0)
    throw Error("ONE_GLOBAL_PRIVATE_PREFLIGHT_MUST_NEVER_EXECUTE");
  const {outputPaperLedger,...publicReport}=result;
  // Never expose source-provided prices or quote-derived projected returns.
  // They can be used privately for strict eligibility decisions only.
  publicReport.virtualExitPlans=publicReport.virtualExitPlans.map(plan=>({
    ...plan,projectedNetReturnPercent:null,
  }));
  publicReport.privateMarketDataPreflight={
    provided:privateInputs.provided,
    operatorRightsRegistryProvided:privateInputs.provided,
    exactVenueRuntimeChecksPassed:result.qualifiedMarketListings,
    sourceRightsIndependentlyLegallyCertifiedByThisScript:false,
    separateStrategyPaperApprovalProvided:false,
    simulationAuthorized:false,
    providerPricesPublished:false,
    certifiedStrategyFills:0,
    brokerConnectivityAllowed:false,liveTradingAllowed:false,
  };
  const out=options.get("output")||"/tmp/fenice-one-global-strategy-paper-readiness.json";
  mkdirSync(dirname(out),{recursive:true});
  writeFileSync(out,JSON.stringify(publicReport,null,2)+"\n",{mode:0o600});
  console.log("FENICE ONE GLOBAL strategy PAPER bridge: "+JSON.stringify({
    buySignals:result.buySignals,researchIntents:result.qualifiedResearchIntents,
    runtimeVerifiedVenues:result.qualifiedMarketListings,
    privateEvidenceProvided:privateInputs.provided,
    legalRightsIndependentlyCertified:false,newFills:0,
    blockers:result.blockers,liveTradingAllowed:false,
  }));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
