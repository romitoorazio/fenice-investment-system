/** Read-only, fail-closed US PAPER admissibility audit of ORIGINAL documents.
 * Access to a daily price never grants data rights, exchange proof, or a FILL.
 * This code cannot write private storage, issue signals, or contact brokers.
 */
import {replayOneGlobalEodPaperLedger} from './one-global-eod-paper.mjs';
import {inspectOneGlobalSettlementOriginals,validateOneGlobalSettlementContext} from './one-global-cloud-settlement.mjs';

const symbols=new Set(['XNAS:AAPL','XNAS:MSFT','XNAS:TSLA']);
const safeCode=e=>/^CLOUD_SETTLEMENT_[A-Z0-9_]{3,100}$/.test(e?.message||'')
  ?e.message:'CLOUD_SETTLEMENT_US_PRIVATE_EVIDENCE_NOT_CONFIRMED';

export function inspectOneGlobalUsAdmission({ledger,context,nowIso}={}){
  const ledgerState=replayOneGlobalEodPaperLedger(ledger);
  const pending=new Set(ledgerState.pendingSignals);
  const signals=ledger.events.filter(e=>e.kind==='SIGNAL'&&symbols.has(e.key)&&pending.has(e.key));
  const result={state:'US_NO_PENDING_PROSPECTIVE_SIGNAL',pendingUsSignals:signals.length,
    configuredUsMarketMappings:0,originalUsUsageDocuments:0,sourceRightsEvidenceValidated:false,
    independentUpstreamEvidenceValidated:false,exchangeSessionEvidenceValidated:false,
    paperFillsCreated:0,brokerConnectivityAllowed:false,liveTradingAllowed:false};
  if(!context)return {...result,state:'US_ORIGINAL_CONTEXT_NOT_CONNECTED'};
  try{const original=inspectOneGlobalSettlementOriginals({context,nowIso});
    result.originalUsUsageDocuments=[...original.documents.values()].filter(d=>d.kind==='ORIGINAL_PROVIDER_USAGE_RIGHTS'
      &&['alpha-vantage','alpaca-sip','alpaca-iex','twelve-data','eodhd'].includes(d.providerId)).length;
    result.configuredUsMarketMappings=context.markets.filter(m=>symbols.has(m?.key)&&m?.mic==='XNAS'
      &&m?.currency==='USD'&&Array.isArray(m.sources)&&m.sources.length>=2
      &&Array.isArray(m.ownerReviewedRights)&&m.ownerReviewedRights.length===m.sources.length).length;
  }catch{return {...result,state:'US_ORIGINAL_CONSENT_OR_DOCUMENTS_INVALID'};}
  if(!signals.length)return result;
  let blocker=null, waiting=false, expired=false;
  for(const signal of signals){
    try{
      validateOneGlobalSettlementContext({context,signal,nowIso});
      return {...result,state:'US_CONTEXT_READY_FOR_EXACT_DAILY_RECEIPTS',
        sourceRightsEvidenceValidated:true,independentUpstreamEvidenceValidated:true,
        exchangeSessionEvidenceValidated:true};
    }catch(e){
      const code=safeCode(e);
      if(code==='CLOUD_SETTLEMENT_NEXT_SESSION_NOT_COMPLETED')waiting=true;
      else if(code==='CLOUD_SETTLEMENT_STRICT_NEXT_SESSION_48H_WINDOW_ELAPSED')expired=true;
      else if(blocker===null)blocker=code;
    }
  }
  if(waiting)return {...result,state:'US_NEXT_SESSION_NOT_COMPLETED',
    sourceRightsEvidenceValidated:true,independentUpstreamEvidenceValidated:true,
    exchangeSessionEvidenceValidated:true};
  if(blocker)return {...result,state:'US_ADMISSION_BLOCKED',blocker};
  return {...result,state:expired?'US_SETTLEMENT_WINDOW_EXPIRED':'US_ADMISSION_BLOCKED'};
}
