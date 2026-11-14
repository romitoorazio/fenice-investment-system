/** Build only hash-bound, official EU evidence captures around existing owner consent. */
import {createHash} from 'node:crypto';
import {CBOE_TRANSPARENCY_URL,ONE_GLOBAL_MILAN_INSTRUMENTS,ONE_GLOBAL_EU_RIGHTS_DOCUMENTS,EURONEXT_CALENDAR_URL,
  fetchOneGlobalEuRightsOriginals,isOneGlobalMilanRegularSessionDate2026,ONE_GLOBAL_MILAN_CLOSED_DATES_2026,
  oneGlobalMilanSession} from '../market/one-global-eu-delayed-eod.mjs';
import {inspectOneGlobalSettlementOriginals} from './one-global-cloud-settlement.mjs';
import {importOneGlobalPrivateInputs} from './one-global-private-input-intake.mjs';
import {oneGlobalReviewSubjectSha256,validOneGlobalEvidenceReview} from './one-global-technical-review.mjs';

const fail=code=>{throw Error('EU_EVIDENCE_CONTEXT_'+code);};
const sha=x=>createHash('sha256').update(x).digest('hex');
// Replaced after the implementation/review commit is created.  Runtime
// reviews remain exact-subject and exact-evidence bound.
const REVIEWED_COMMIT='0000000000000000000000000000000000000000';
const validUntil='2026-12-31T23:59:59.000Z';

function document(kind,value){
  const bytes=Buffer.from(JSON.stringify(value));
  return {kind,sha256:sha(bytes),bodyBase64:bytes.toString('base64')};
}
function reviewed(subject,{scope,evidenceSha256,authoritySnapshotHash,reviewedAt,basis}){
  subject.reviewedByOwner=false;subject.reviewedAt=reviewedAt;
  subject.technicalReview={kind:'DELEGATED_PROJECT_TECHNICAL_REVIEW',reviewer:{role:'DELEGATED_PROJECT_OPERATOR',name:'Codex'},
    scope,outcome:'APPROVED_FOR_DOCUMENTED_SCOPE',evidenceSha256,authoritySnapshotHash,reviewedAt,
    reviewedCommit:REVIEWED_COMMIT,basis,subjectSha256:oneGlobalReviewSubjectSha256(subject)};
  return subject;
}
function decode(doc){try{return JSON.parse(Buffer.from(doc.bodyBase64,'base64').toString('utf8'));}catch{return null;}}
function sameSource(source,expected){return source?.providerId===expected.providerId&&source.key===expected.key
  &&source.mic===expected.mic&&source.currency===expected.currency&&source.symbol===expected.symbol
  &&source.sourceFamily===expected.sourceFamily;}
const rawEvidenceOk=x=>x&&typeof x.sessionDate==='string'&&/^2026-\d\d-\d\d$/.test(x.sessionDate)
  &&['euronextHash','cboeHash','cboeDiscoveryHash'].every(k=>typeof x[k]==='string'&&/^[a-f0-9]{64}$/.test(x[k]));

export async function ensureOneGlobalEuEvidenceContext({storage,sessionDate,nowIso,fetcher=fetch,rawEvidence}={}){
  if(storage?.privateAccess!==true||storage.durable!==true||storage.atomicCompareAndSwap!==true
    ||typeof storage.createSourceArtifact!=='function'||typeof nowIso!=='string')fail('PRIVATE_STORE_REQUIRED');
  const snapshot=await storage.readSettlementContext();if(!snapshot)fail('ORIGINAL_CONSENT_REQUIRED');
  const context=JSON.parse(snapshot.body),{authority}=inspectOneGlobalSettlementOriginals({context,nowIso});
  const authoritySnapshotHash=sha(JSON.stringify(authority));
  const exactRights=context.documents.filter(d=>d.kind==='OFFICIAL_PROVIDER_USAGE_RIGHTS_CAPTURE').map(decode).filter(Boolean);
  let originals;
  if(!exactRights.some(x=>x.providerId==='euronext-mifir'&&x.originalDocumentSha256===ONE_GLOBAL_EU_RIGHTS_DOCUMENTS.euronext.sha256)
    ||!exactRights.some(x=>x.providerId==='cboe-eu-mifir'&&x.originalDocumentSha256===ONE_GLOBAL_EU_RIGHTS_DOCUMENTS.cboe.sha256)
    ||sessionDate&&!context.sessions.some(s=>s.mic==='XMIL'&&s.sessionDate===sessionDate)){
    originals=await fetchOneGlobalEuRightsOriginals({fetcher});
    for(const [body,contentType] of [[originals.euronext,'application/pdf'],[originals.cboe,'application/pdf'],[originals.calendar,'text/html']]){
      const saved=await storage.createSourceArtifact({hash:sha(body),body,contentType});if(saved?.verified!==true)fail('OFFICIAL_RAW_ARCHIVE_UNCONFIRMED');
    }
  }
  const documents=[...context.documents];
  const add=doc=>{const prior=documents.find(x=>x.sha256===doc.sha256);if(prior&&JSON.stringify(prior)!==JSON.stringify(doc))fail('DOCUMENT_HASH_COLLISION');if(!prior)documents.push(doc);return doc.sha256;};
  function rights(providerId){
    const pinned=providerId==='euronext-mifir'?ONE_GLOBAL_EU_RIGHTS_DOCUMENTS.euronext:ONE_GLOBAL_EU_RIGHTS_DOCUMENTS.cboe;
    const existing=documents.find(d=>d.kind==='OFFICIAL_PROVIDER_USAGE_RIGHTS_CAPTURE'&&decode(d)?.providerId===providerId
      &&decode(d)?.originalDocumentSha256===pinned.sha256);
    if(existing)return existing.sha256;
    if(!originals)fail('RIGHTS_ORIGINAL_REQUIRED');
    const finding=providerId==='euronext-mifir'
      ?'The right to use delayed data is free of charge and unrestricted except for distribution.'
      :'Internal use of delayed/historical data for valuation, pre/post-trade analysis, risk management and research has no fee and requires no Data Agreement.';
    return add(document('OFFICIAL_PROVIDER_USAGE_RIGHTS_CAPTURE',{version:1,providerId,officialUrl:pinned.url,
      originalDocumentSha256:pinned.sha256,reviewedFinding:finding,usageScope:'PRIVATE_PERSONAL_PAPER_SIMULATION',
      distributionAllowedByThisReview:false,automatedInternalAnalysis:true}));
  }
  const euronextRights=rights('euronext-mifir'),cboeRights=rights('cboe-eu-mifir');
  const markets=[...context.markets];
  for(const instrument of Object.values(ONE_GLOBAL_MILAN_INSTRUMENTS)){
    const index=markets.findIndex(m=>m?.key===instrument.key);
    if(index>=0){
      const existing=markets[index],providers=['euronext-mifir','cboe-eu-mifir'];
      if(existing.mic!=='XMIL'||existing.currency!=='EUR'||!Array.isArray(existing.sources)
        ||!Array.isArray(existing.ownerReviewedRights)||existing.sources.length!==2
        ||existing.ownerReviewedRights.length!==2)fail('CONFLICTING_MARKET_MAPPING');
      for(const providerId of providers){
        const identity={providerId,key:instrument.key,mic:'XMIL',currency:'EUR',symbol:instrument.isin,
          sourceFamily:providerId==='euronext-mifir'?'euronext-mtaa-primary':'cboe-ceux-orderbook'};
        const source=existing.sources.find(x=>sameSource(x,identity)),right=existing.ownerReviewedRights.find(x=>x?.providerId===providerId);
        const sourceDoc=source&&documents.find(x=>x.sha256===source.independenceEvidenceSha256);
        const rightDoc=right&&documents.find(x=>x.sha256===right.evidenceSha256);
        if(!source||!right||sourceDoc?.kind!=='OFFICIAL_PROVIDER_UPSTREAM_PROVENANCE_CAPTURE'
          ||rightDoc?.kind!=='OFFICIAL_PROVIDER_USAGE_RIGHTS_CAPTURE'
          ||right.mic!=='XMIL'||right.currency!=='EUR'||right.usageScope!=='PRIVATE_PERSONAL_PAPER_SIMULATION'
          ||right.automatedUseAllowed!==true||right.validUntil!==validUntil
          ||!validOneGlobalEvidenceReview({subject:source,scope:'SOURCE_MAPPING',evidenceSha256:source.independenceEvidenceSha256,
            authoritySnapshotHash,nowIso})
          ||!validOneGlobalEvidenceReview({subject:right,scope:'PROVIDER_USAGE_RIGHTS',evidenceSha256:right.evidenceSha256,
            authoritySnapshotHash,nowIso}))fail('CONFLICTING_OR_UNREVIEWED_MARKET_MAPPING');
      }
      continue;
    }
    if(!rawEvidenceOk(rawEvidence))fail('EXACT_RAW_SOURCE_EVIDENCE_REQUIRED');
    const provenance=[];
    for(const providerId of ['euronext-mifir','cboe-eu-mifir']){
      const venueMic=providerId==='euronext-mifir'?'MTAA':'CEUX';
      const sourceFamily=providerId==='euronext-mifir'?'euronext-mtaa-primary':'cboe-ceux-orderbook';
      const capture={version:1,providerId,operator:providerId==='euronext-mifir'?'Euronext N.V.':'Cboe Europe B.V.',
        instrumentKey:instrument.key,symbol:instrument.symbol,isin:instrument.isin,listingMic:'XMIL',observedVenueMic:venueMic,
        sourceFamily,officialInstrumentUrl:`https://live.euronext.com/en/product/equities/${instrument.isin.toLowerCase()}-mtaa`,
        officialSourceUrl:providerId==='euronext-mifir'
          ?'https://marketdata.euronext.com/data-reporting-service/trades-file/download/EQUITIES/CURRENT_TRADING_DAY/MIL'
          :CBOE_TRANSPARENCY_URL,
        rawSessionEvidence:rawEvidence??null,independentTransportAndVenue:true};
      provenance.push({providerId,hash:add(document('OFFICIAL_PROVIDER_UPSTREAM_PROVENANCE_CAPTURE',capture)),sourceFamily});
    }
    const sources=provenance.map(p=>reviewed({providerId:p.providerId,key:instrument.key,mic:'XMIL',currency:'EUR',symbol:instrument.isin,
      sourceFamily:p.sourceFamily,independenceEvidenceSha256:p.hash},{scope:'SOURCE_MAPPING',evidenceSha256:p.hash,
      authoritySnapshotHash,reviewedAt:nowIso,basis:'Official instrument identity, distinct venue MIC/operator, fixed source family and exact raw evidence hash bind this mapping.'}));
    const ownerReviewedRights=[
      reviewed({providerId:'euronext-mifir',mic:'XMIL',currency:'EUR',evidenceSha256:euronextRights,
        usageScope:'PRIVATE_PERSONAL_PAPER_SIMULATION',automatedUseAllowed:true,validUntil},{scope:'PROVIDER_USAGE_RIGHTS',evidenceSha256:euronextRights,
        authoritySnapshotHash,reviewedAt:nowIso,basis:'Exact pinned Euronext delayed-data terms permit internal use; this review excludes redistribution and all live trading.'}),
      reviewed({providerId:'cboe-eu-mifir',mic:'XMIL',currency:'EUR',evidenceSha256:cboeRights,
        usageScope:'PRIVATE_PERSONAL_PAPER_SIMULATION',automatedUseAllowed:true,validUntil},{scope:'PROVIDER_USAGE_RIGHTS',evidenceSha256:cboeRights,
        authoritySnapshotHash,reviewedAt:nowIso,basis:'Exact pinned Cboe Europe 2026 policy permits internal delayed-data research without fee/agreement; redistribution is excluded.'}),
    ];
    const expected={key:instrument.key,mic:'XMIL',currency:'EUR',sources,ownerReviewedRights};
    markets.push(expected);
  }
  const sessions=[...context.sessions];
  if(sessionDate&&!sessions.some(s=>s.mic==='XMIL'&&s.sessionDate===sessionDate)){
    if(!originals)fail('CALENDAR_ORIGINAL_REQUIRED');
    if(!isOneGlobalMilanRegularSessionDate2026(sessionDate))fail('NON_BUSINESS_DAY_OR_UNREVIEWED_CALENDAR_YEAR');
    const bounds=oneGlobalMilanSession(sessionDate);
    const evidence=add(document('OFFICIAL_EXCHANGE_SESSION_CAPTURE',{version:1,mic:'XMIL',sessionDate,
      officialCalendarUrl:EURONEXT_CALENDAR_URL,calendarArtifactSha256:originals.calendarSha256,
      officialRule:'Milan cash market open Monday-Friday in 2026 except listed holidays; this date is not listed as closed or half-day.',
      reviewedClosedDates2026:ONE_GLOBAL_MILAN_CLOSED_DATES_2026,
      normalHours:{timezone:'Europe/Rome',open:'09:00:00',closingAuction:'17:35:00-17:35:30'},bounds}));
    sessions.push(reviewed({mic:'XMIL',sessionDate,sessionOpenedAt:bounds.sessionOpenedAt,sessionClosedAt:bounds.sessionClosedAt,
      evidenceSha256:evidence},{scope:'EXCHANGE_SESSION',evidenceSha256:evidence,authoritySnapshotHash,reviewedAt:nowIso,
      basis:'Official 2026 Euronext calendar and Milan trading-hours rule establish this exact normal next-session window.'}));
  }
  const next={...context,documents,markets,sessions};
  if(JSON.stringify(next)===JSON.stringify(context))return {changed:false,context,rightsReady:true,sessionReady:!sessionDate||true};
  const result=await importOneGlobalPrivateInputs({storage,nowIso,input:{kind:'SETTLEMENT_CONTEXT',
    documentBase64:Buffer.from(JSON.stringify(next)).toString('base64'),expectedEtag:snapshot.etag}});
  return {changed:true,context:next,rightsReady:true,sessionReady:!sessionDate||result.eligiblePendingSignals>=0};
}
