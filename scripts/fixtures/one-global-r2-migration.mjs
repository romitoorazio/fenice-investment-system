// Isolated memory-only fixtures. Never use these bytes in a private store.
import {newOneGlobalEodPaperLedger,recordOneGlobalEodSignal} from '../../lib/trading/one-global-eod-paper.mjs';
import {LEDGER,CONTEXT,OBS,sha256} from '../../lib/trading/one-global-r2-migration-preflight.mjs';
export const uploadedAt='2026-11-12T18:15:00.237Z';
const json=value=>Buffer.from(JSON.stringify(value)+'\n');

export function syntheticInventory(){
  const authority={mode:'ONE_GLOBAL_FORWARD_EOD_PRIVATE_PAPER',ownerConsent:true,
    approvedForVirtualSimulation:true,approvalEvidence:{kind:'EXPLICIT_OWNER_CONSENT',reviewedCommit:'a'.repeat(40)},
    executionMethod:'NEXT_COMPLETED_SESSION_CLOSE_PLUS_IMPACT',allowBackfill:false,liveTradingAllowed:false,
    brokerConnectivityAllowed:false,realBrokerOrdersAllowed:false,strategyPerformanceCertified:false,
    approvedAt:uploadedAt,expiresAt:'2026-12-12T00:00:00.000Z'};
  const document=json(authority);
  const context={kind:'ONE_GLOBAL_PRIVATE_SETTLEMENT_CONTEXT',authority,authorityEvidenceSha256:sha256(document),
    documents:[{kind:'ORIGINAL_OWNER_PAPER_CONSENT',sha256:sha256(document),bodyBase64:document.toString('base64')}],
    markets:[],sessions:[]};
  const raw=Buffer.from([0,255,17,128,0]);
  const report={synthetic:true};
  const hash=sha256(JSON.stringify(report));
  const observation={kind:'ONE_GLOBAL_PRIVATE_EU_DUAL_VENUE_RESEARCH_OBSERVATION',report,rawArtifacts:{euronextHash:sha256(raw)}};
  const {ledger}=recordOneGlobalEodSignal({previousLedger:newOneGlobalEodPaperLedger(),nowIso:uploadedAt,
    signal:{signalId:'synthetic-r2-test',key:'XMIL:TEST',mic:'XMIL',side:'BUY',currency:'EUR',decisionAt:uploadedAt,
      referenceSessionDate:'2026-11-12',referenceCloseAt:'2026-11-12T16:30:00.000Z',
      referencePublishedAt:'2026-11-12T17:00:00.000Z',sourceSnapshotHash:hash,maxNotionalEuro:50,strategyReason:'UPTREND_CONFIRMATION'}});
  const objects=[{key:LEDGER,bytes:json(ledger)},{key:CONTEXT,bytes:json(context)},
    {key:OBS+hash+'.json',bytes:json(observation)},{key:OBS+'raw/'+sha256(raw),bytes:raw}];
  const manifest=objects.map(({key,bytes})=>({key,size:bytes.length,sha256:sha256(bytes),sourceUploadedAt:uploadedAt}));
  return {manifest,objects};
}
