/**
 * Fetch two vendor responses for a strictly private research-only US EOD check.
 * node scripts/collect-one-global-first-paper-dual-eod.mjs --symbol=AAPL --session=YYYY-MM-DD --output=/private/eod.json --commit
 * ALPHA_VANTAGE_API_KEY is read from the existing environment (never logged).
 * EODHD_API_TOKEN defaults to the public 'demo' key, restricted to AAPL/MSFT/TSLA.
 * Does not place data in GitHub or execute any PAPER fill / broker order.
 */
import {existsSync,openSync,closeSync,writeFileSync,fsyncSync,unlinkSync,realpathSync} from 'node:fs';
import {isAbsolute,dirname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildFirstPaperFreeEodEvidence} from '../lib/market/one-global-first-paper-dual-eod.mjs';
const ROOT=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'..'));
const args=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith('--')&&x.includes('=')).map(x=>{const i=x.indexOf('=');return [x.slice(2,i),x.slice(i+1)];}));
const commit=process.argv.includes('--commit');
const symbol=args.symbol,session=args.session;
if(!['AAPL','MSFT','TSLA'].includes(symbol)||!/^\d{4}-\d{2}-\d{2}$/.test(session||''))throw Error('FIRST_PAPER_UNSUPPORTED_DEMO_SYMBOL_OR_SESSION');
const alpha=process.env.ALPHA_VANTAGE_API_KEY;
if(!alpha||!/^[-_A-Za-z0-9]{8,120}$/.test(alpha))throw Error('FIRST_PAPER_ALPHA_KEY_MISSING_IN_ENVIRONMENT');
const eod=process.env.EODHD_API_TOKEN||'demo';
if(!/^[-_A-Za-z0-9]{4,150}$/.test(eod))throw Error('FIRST_PAPER_EODHD_TOKEN_INVALID');
const url1=new URL('https://www.alphavantage.co/query');
url1.search=new URLSearchParams({function:'TIME_SERIES_DAILY',symbol,outputsize:'compact',apikey:alpha});
const url2=new URL('https://eodhd.com/api/eod/'+symbol+'.US');
url2.search=new URLSearchParams({api_token:eod,fmt:'json',from:session,to:session});
async function get(u){
 const ctl=new AbortController();const timeout=setTimeout(()=>ctl.abort(),12000);
 try{
   const response=await fetch(u,{redirect:'error',signal:ctl.signal,headers:{Accept:'application/json'}});
   if(!response.ok||response.url!==u.toString())throw Error('FIRST_PAPER_VENDOR_HTTP_OR_REDIRECT');
   const type=response.headers.get('content-type')||'';
   if(!type.includes('json')&&!type.includes('text/plain'))throw Error('FIRST_PAPER_VENDOR_UNEXPECTED_CONTENT_TYPE');
   const bytes=Buffer.from(await response.arrayBuffer());
   if(bytes.length>2_000_000||bytes.length<10)throw Error('FIRST_PAPER_VENDOR_RESPONSE_SIZE');
   return bytes;
 }finally{clearTimeout(timeout);}
}
const [alphaRaw,eodhdRaw]=await Promise.all([get(url1),get(url2)]);
const report=buildFirstPaperFreeEodEvidence({alphaRaw,eodhdRaw,symbol,sessionDate:session,observedAt:new Date().toISOString()});
if(commit){
 const target=args.output;
 if(!target||!isAbsolute(target))throw Error('FIRST_PAPER_PRIVATE_ABSOLUTE_OUTPUT_REQUIRED');
 const parent=realpathSync(dirname(target));
 if(parent===ROOT||parent.startsWith(ROOT+sep))throw Error('FIRST_PAPER_PUBLIC_REPO_WRITE_FORBIDDEN');
 const path=resolve(parent,target.split(/[\\/]/).at(-1));
 if(existsSync(path))throw Error('FIRST_PAPER_PRIVATE_OUTPUT_ALREADY_EXISTS');
 let fd;
 try{fd=openSync(path,'wx',0o600);writeFileSync(fd,JSON.stringify(report,null,2)+'\n','utf8');fsyncSync(fd);closeSync(fd);fd=null;}
 finally{if(fd!==null&&fd!==undefined){closeSync(fd);try{unlinkSync(path)}catch{}}}
}
console.log(JSON.stringify({mode:report.mode,symbol,sessionDate:session,
 twoPublisherResponsesParsed:true,publisherIndependenceCertified:false,
 providerUsageRightsCertified:false,paperSettlementEligible:false,
 committedPrivateResearch:commit,certifiedVirtualFills:0,phase9Credit:0,
 brokerConnectivityAllowed:false,liveTradingAllowed:false}));
