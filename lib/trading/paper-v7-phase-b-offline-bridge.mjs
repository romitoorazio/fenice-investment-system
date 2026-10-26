/**
 * V7 Phase B OFFLINE fixture preview from real-format input boundaries.
 *
 * This is NOT the operational PAPER writer. Market-data evidence is accepted
 * for TEST-ONLY fixture calculations, never for legal rights attestation.
 * The proven right to consume exchange data must be verified out-of-band.
 *
 * No provider calls, env access, credentials, filesystem or broker imports.
 */
import { runWorldPaperV7 } from "./world-paper-v7.mjs";
import { assessV7PhaseBProposedPaperBudget } from "./paper-v7-phase-b-budget.mjs";
import { replayFixturePhaseBLedger, appendFixturePhaseBProbe }
  from "./paper-v7-phase-b-fixture-ledger.mjs";

const validIso = t => {
  if(typeof t!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(t)) return null;
  const v=Date.parse(t);
  return Number.isSafeInteger(v)&&v>=0&&new Date(v).toISOString()===t?v:null;
};
const key = i => String(i?.exchangeMic||"").trim().toUpperCase()
  + ":" + String(i?.ticker||"").trim().toUpperCase();
const blocked=(reason,fixtureLedger)=>({
  state:"OFFLINE_FIXTURE_BLOCKED",
  reasons:[reason],
  candidateFixtureLedger:fixtureLedger??null,
  fixtureGenerated:false,marketQuorumAdmitted:false,
  legalRightsIndependentlyAttested:false,
  genuineOperationalPhaseBFills:0,canCreateOperationalPaperFill:false,
  canQueueRealBrokerOrder:false,liveTradingAllowed:false,
  changesProviderKeys:false,changesV6:false,
});
export function previewV7PhaseBOfflineFixture({
  instrument, observations, operatorRightsRegistry, limits,
  fixtureLedger, intent, nowIso,
}={}) {
  const now=validIso(nowIso);
  if(now===null) return blocked("INVALID_OFFLINE_CLOCK",null);
  const replay=replayFixturePhaseBLedger(fixtureLedger);
  if(!replay.valid) return blocked("INVALID_ISOLATED_FIXTURE_LEDGER",null);
  // The rights registry is deliberately NOT sourced from observations or
  // the intent, so observations cannot self-grant exchange entitlements.
  if(!observations||typeof observations!=="object"||Array.isArray(observations)
    ||!Array.isArray(observations.quotes)||!Array.isArray(observations.sessions)
    ||!Array.isArray(observations.fx)
    ||["entitlements","rightsRegistry","intents","approval","paperRunAuthorized",
      "previousLedger","liveTradingAllowed","brokerConnectivityAllowed"]
      .some(k=>Object.hasOwn(observations,k)))
    return blocked("OBSERVATIONS_CONTAIN_MISSING_OR_FORBIDDEN_FIELDS",fixtureLedger);
  if(!operatorRightsRegistry||typeof operatorRightsRegistry!=="object"
    ||Array.isArray(operatorRightsRegistry)
    ||!Array.isArray(operatorRightsRegistry.sources)
    ||!Array.isArray(operatorRightsRegistry.sessions)
    ||!Array.isArray(operatorRightsRegistry.fx))
    return blocked("SEPARATE_OPERATOR_RIGHTS_REGISTRY_REQUIRED",fixtureLedger);
  if(!instrument||typeof instrument!=="object"||Array.isArray(instrument)
    ||instrument.paperExecutionAllowed!==true)
    return blocked("INSTRUMENT_NOT_ADMITTED_FOR_FIXTURE_PREVIEW",fixtureLedger);
  if(!intent||intent.phase!=="V7_PHASE_B_TEST_FIXTURE_ONLY"
    ||intent.side!=="BUY"||intent.instrumentKey!==key(instrument))
    return blocked("INTENT_NOT_ISOLATED_FIXTURE_ONLY",fixtureLedger);

  const world=runWorldPaperV7({
    nowIso,instruments:[instrument],
    sessions:observations.sessions,quotes:observations.quotes,
    fx:observations.fx,entitlements:operatorRightsRegistry,
    intents:[],paperRunAuthorized:false,
  });
  if(world.summary.filledPaperOrders!==0||world.paperRunAuthorized!==false
    ||world.liveTradingAllowed!==false||world.brokerConnectivityAllowed!==false)
    return blocked("WORLD_V7_SAFETY_BOUNDARY_FAILED",fixtureLedger);
  const listing=world.listings.find(r=>r.key===intent.instrumentKey);
  if(!listing||listing.ready!==true
    ||!Number.isFinite(listing.verifiedPrice)||listing.verifiedPrice<=0
    ||!Number.isFinite(listing.fxToEuro)||listing.fxToEuro<=0
    ||listing.independentFamilies.length<2)
    return blocked("WORLD_V7_ENTITLEMENT_VENUE_QUORUM_OR_FX_BLOCKED",fixtureLedger);

  // The existing budget policy is a SECOND control in addition to WORLD
  // independent-price and market-OPEN checks. Neither one is an approval.
  const equity=replay.summary.cashEuro
    +Object.values(replay.summary.positions).reduce((sum,p)=>sum+p.costEuro,0);
  const previous=fixtureLedger.attempts.map(row=>({
    id:row.intentId,phase:"V7_PHASE_B",createdAt:row.occurredAt,
    status:row.status==="SIM_FILLED"?"SIM_FILLED":"RISK_REJECTED",
  }));
  const budget=assessV7PhaseBProposedPaperBudget({
    limits,virtualEquityEuro:equity,virtualCashEuro:replay.summary.cashEuro,
    currentAssetExposureEuro:replay.summary.positions[intent.instrumentKey]?.costEuro??0,
    intent:{id:intent.id,symbol:instrument.ticker,side:intent.side,
      phase:"V7_PHASE_B",proposedNotionalEuro:intent.proposedNotionalEuro,
      createdAt:intent.createdAt},
    previousPhaseBAttempts:previous,nowMs:now,
  });
  if(budget.state!=="NUMERIC_ONLY_NOT_AUTHORIZED")
    return blocked("PHASE_B_NUMERIC_BUDGET_OR_ATTEMPT_BLOCKED",fixtureLedger);

  const simulation=appendFixturePhaseBProbe(fixtureLedger,{
    nowIso,intent,
    verifiedQuoteEuro:listing.verifiedPrice*listing.fxToEuro,
  });
  if(!["TEST_FIXTURE_SIM_FILL","TEST_FIXTURE_RISK_REJECTED"].includes(simulation.status)
    ||!simulation.ledger)
    return blocked("ISOLATED_LEDGER_REPLAY_OR_PROBE_FAILED",fixtureLedger);
  const result=replayFixturePhaseBLedger(simulation.ledger);
  if(!result.valid||result.summary.genuineOperationalPhaseBFills!==0)
    return blocked("FIXTURE_REPLAY_MISMATCH",fixtureLedger);
  return {
    state:simulation.status==="TEST_FIXTURE_SIM_FILL"
      ?"OFFLINE_FIXTURE_PREVIEW_SIMULATED":"OFFLINE_FIXTURE_PREVIEW_RISK_REJECTED",
    reasons:[],
    candidateFixtureLedger:simulation.ledger,
    fixtureGenerated:true,marketQuorumAdmitted:true,
    independentProviderFamiliesForFixture:listing.independentFamilies.length,
    observedFixtureFills:result.summary.fixtureFills,
    fixtureAttempts:result.summary.attempts,
    legalRightsIndependentlyAttested:false,
    genuineOperationalPhaseBFills:0,
    canCreateOperationalPaperFill:false,canQueueRealBrokerOrder:false,
    liveTradingAllowed:false,changesProviderKeys:false,changesV6:false,
  };
}
