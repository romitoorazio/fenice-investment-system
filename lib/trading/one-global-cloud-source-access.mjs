/** Real private source qualification; cannot create SIGNAL/FILL or approve rights. */
import {createHash} from 'node:crypto';
import {oneGlobalPublicDocumentReview} from './one-global-technical-review.mjs';
import {privateEodNewYorkClock} from './one-global-private-eod-autopilot.mjs';
import {fetchOneGlobalAlpacaSipEod} from '../market/one-global-alpaca-sip-eod.mjs';
import {fetchOneGlobalSettlementSource} from '../market/one-global-cloud-settlement-sources.mjs';
import {importOneGlobalPrivateInputs} from './one-global-private-input-intake.mjs';
import {inspectOneGlobalSettlementOriginals} from './one-global-cloud-settlement.mjs';
const originals=[
  {providerId:'alpha-vantage',kind:'ORIGINAL_PROVIDER_USAGE_RIGHTS',url:'https://www.alphavantage.co/terms_of_service/'},
  {providerId:'alpaca-sip',kind:'ORIGINAL_PROVIDER_USAGE_RIGHTS',url:'https://files.alpaca.markets/disclosures/library/TermsAndConditions.pdf'},
];
const sha=x=>createHash('sha256').update(x).digest('hex');
const safeError=e=>/^CLOUD_SETTLEMENT_SOURCE_[A-Z0-9_]{3,100}$/.test(e?.message||'')?e.message:'SOURCE_ACCESS_NOT_CONFIRMED';
async function originalDocument(source,fetcher,clock){
  try{
    const r=await fetcher(source.url,{method:'GET',redirect:'error',cache:'no-store',
      signal:AbortSignal.timeout(10000),headers:{Accept:'application/pdf'}});
    if(!r.ok||!r.body||!/application\/pdf/.test(r.headers.get('content-type')||''))throw Error('DOCUMENT');
    const reader=r.body.getReader(),parts=[];let size=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;
      if(size>350000){await reader.cancel();throw Error('SIZE');}parts.push(Buffer.from(value));}}
    finally{reader.releaseLock();}
    const raw=Buffer.concat(parts);if(raw.length<20||raw.subarray(0,5).toString()!=='%PDF-')throw Error('PDF');
    return {...source,observedAt:clock(),sha256:sha(raw),bodyBase64:raw.toString('base64'),reviewStatus:'ORIGINAL_NOT_YET_REVIEWED'};
  }catch{return {providerId:source.providerId,state:'ORIGINAL_DOCUMENT_NOT_RECEIVED'};}
}
export async function inspectOneGlobalCloudSourceAccess({storage,clock=()=>new Date().toISOString(),fetcher=fetch,env=process.env}={}){
  const observedAt=clock(),local=privateEodNewYorkClock(observedAt);
  // Candidate date only. A holiday is not guessed: each provider must return
  // the exact dated row. A previous price never becomes a prospective SIGNAL.
  let date=new Date(local.sessionDate+'T12:00:00Z');
  if(['Sat','Sun'].includes(local.weekday)||local.minute<16*60+35){
    do{date=new Date(date.getTime()-86400000);}while([0,6].includes(date.getUTCDay()));
  }
  const sessionDate=date.toISOString().slice(0,10),signal={key:'XNAS:AAPL',mic:'XNAS',currency:'USD'};
  const report={state:'SOURCE_ACCESS_NOT_CONFIRMED',symbol:'AAPL',sessionDate,
    alphaState:'NOT_REQUESTED',alpacaState:'NOT_REQUESTED',eodhdState:'NOT_REQUESTED',twoDailyRowsReceived:false,
    closesAgree:false,rawReceiptArchiveConfirmed:false,originalDocumentsArchived:0,originalDocumentsConnected:false,originalDocumentConnectionState:'NOT_REQUESTED',candidateContextBytes:0,
    technicalReviewsConnected:0,alphaDocumentReview:'UNKNOWN_ORIGINAL_REVISION',alpacaDocumentReview:'UNKNOWN_ORIGINAL_REVISION',
    rightsApproved:false,independenceCertified:false,paperFillsCreated:0,liveTradingAllowed:false};
  const snapshot=await storage.readSettlementContext();
  if(!snapshot)return {...report,state:'ORIGINAL_CONSENT_REQUIRED'};
  try{inspectOneGlobalSettlementOriginals({context:JSON.parse(snapshot.body),nowIso:observedAt});}
  catch{return {...report,state:'ORIGINAL_CONSENT_REQUIRED'};}
  const results=await Promise.allSettled([
    fetchOneGlobalSettlementSource({source:{...signal,symbol:'AAPL',providerId:'alpha-vantage',sourceFamily:'alpha-vantage'},
      signal,sessionDate,fetcher,clock,env}),
    fetchOneGlobalAlpacaSipEod({symbol:'AAPL',sessionDate,fetcher,clock,env}),
    ...originals.map(x=>originalDocument(x,fetcher,clock)),
  ]);
  const received=[];
  for(let i=0;i<2;i++){
    const result=results[i],field=i===0?'alphaState':'alpacaState';
    if(result.status==='fulfilled'){report[field]='EXACT_DAILY_ROW_RECEIVED';received.push(result.value);}
    else report[field]=safeError(result.reason);
  }
  if(received.length===1){
    try{
      received.push(await fetchOneGlobalSettlementSource({source:{...signal,symbol:'AAPL.US',providerId:'eodhd',sourceFamily:'eodhd'},
        signal,sessionDate,fetcher,clock,env}));
      report.eodhdState='EXACT_DAILY_ROW_RECEIVED';
    }catch(error){report.eodhdState=safeError(error);}
  }
  report.twoDailyRowsReceived=received.length===2;
  if(received.length===2){const [a,b]=received.map(x=>x.receipt.close);
    report.closesAgree=Math.abs(a-b)/((a+b)/2)<=0.005;}
  const documents=results.slice(2).flatMap(x=>x.status==='fulfilled'&&x.value.bodyBase64?[x.value]:[]);
  const reviews=documents.flatMap(doc=>{
    const review=oneGlobalPublicDocumentReview({providerId:doc.providerId,evidenceSha256:doc.sha256});
    if(!review)return [];
    report[doc.providerId==='alpha-vantage'?'alphaDocumentReview':'alpacaDocumentReview']=review.outcome;
    const raw=Buffer.from(JSON.stringify(review));
    return [{kind:'DELEGATED_TECHNICAL_REVIEW',sha256:sha(raw),bodyBase64:raw.toString('base64')}];
  });
  if(!received.length)return {...report,state:'NO_DAILY_ROWS_RECEIVED'};
  const observation={kind:'ONE_GLOBAL_PRIVATE_SOURCE_ACCESS_OBSERVATION',startedAt:observedAt,observedAt:clock(),sessionDate,
    receipts:received.map(x=>({receipt:x.receipt,rawBase64:x.raw.toString('base64')})),documents,technicalReviews:reviews,
    rightsApproved:false,independenceCertified:false,paperFillsCreated:0,liveTradingAllowed:false};
  const bytes=JSON.stringify(observation),hash=sha(bytes);
  try{
    const saved=await storage.createResearchObservation({hash,body:bytes+'\n'});
    if(saved?.created!==true)throw Error('ARCHIVE');
  }catch{return {...report,state:'SOURCE_ARCHIVE_NOT_CONFIRMED'};}
  // Append fetched originals and separately attributed, hash-pinned review findings.
  // Existing authority/markets/sessions/documents remain unchanged. Findings
  // do not approve rights, establish independence or manufacture owner review.
  if(documents.length){
    try{
      const current=await storage.readSettlementContext(),context=JSON.parse(current.body);
      inspectOneGlobalSettlementOriginals({context,nowIso:clock()});
      const missing=[...documents,...reviews].filter(doc=>!context.documents.some(old=>old.sha256===doc.sha256));
      if(missing.length){
        const next={...context,documents:[...context.documents,...missing]};
        report.candidateContextBytes=Buffer.byteLength(JSON.stringify(next));
        await importOneGlobalPrivateInputs({storage,nowIso:clock(),input:{kind:'SETTLEMENT_CONTEXT',
          documentBase64:Buffer.from(JSON.stringify(next)).toString('base64'),expectedEtag:current.etag}});
      }
      const check=JSON.parse((await storage.readSettlementContext()).body);
      report.technicalReviewsConnected=reviews.filter(doc=>check.documents.some(old=>old.sha256===doc.sha256)).length;
      report.originalDocumentsConnected=documents.every(doc=>check.documents.some(old=>old.sha256===doc.sha256));
      report.originalDocumentConnectionState=report.originalDocumentsConnected?'ORIGINAL_DOCUMENTS_CONNECTED':'ORIGINAL_DOCUMENT_CONNECTION_UNCONFIRMED';
    }catch(error){
      report.originalDocumentsConnected=false;
      report.originalDocumentConnectionState=/^(?:PRIVATE_INPUT|CLOUD_BLOB|CLOUD_SETTLEMENT)_[A-Z0-9_]{3,100}$/.test(error?.message||'')
        ?error.message:'ORIGINAL_DOCUMENT_CONNECTION_UNCONFIRMED';
    }
  }
  return {...report,state:received.length===2?(report.closesAgree?'TWO_DAILY_ROWS_AGREE_REVIEW_REQUIRED':'DAILY_ROWS_DIVERGE'):'ONE_DAILY_PROVIDER_ONLY',
    rawReceiptArchiveConfirmed:true,originalDocumentsArchived:documents.length};
}
