/**
 * Official-source Milan research screen for the pre-existing 00:15 UTC
 * Tuesday-Saturday EOD diagnostic opportunity. No owner credentials,
 * portfolio, private Blob, simulated orders or broker are accessed.
 *
 * IMPORTANT: "PREVIOUS_TRADING_DAY" must parse as the exact preceding
 * calendar day; holidays and late runs are deliberately not backfilled.
 */
import {writeFile} from 'node:fs/promises';
import {
  fetchOneGlobalEuronextMilanFile,fetchOneGlobalCboeCeuxFile,
  isOneGlobalMilanRegularSessionDate2026,
} from '../lib/market/one-global-eu-delayed-eod.mjs';
import {screenOneGlobalMilanResearchPair} from '../lib/market/one-global-eu-research-screen.mjs';

const at=new Date().toISOString();
const now=new Date(at);
const sessionDate=new Date(Date.parse(at.slice(0,10)+'T00:00:00.000Z')-86_400_000)
  .toISOString().slice(0,10);
const base={
  mode:'ONE_GLOBAL_MILAN_SIX_CANDIDATE_RESEARCH_ONLY',
  sessionDate,observedAt:at,sourceRightsVerified:false,
  originalPrivateJournalRead:false,originalPrivateJournalChanged:false,
  createsSignals:0,paperFillsCreated:0,phase9Credit:0,
  paperExecutionAllowed:false,brokerConnectivityAllowed:false,
  liveTradingAllowed:false,rawPricesPublished:false,
};
let report;
const scheduled=process.env.GITHUB_EVENT_NAME==='schedule';
const inWindow=now.getUTCHours()<6&&now.getUTCDay()>=2&&now.getUTCDay()<=6
  &&isOneGlobalMilanRegularSessionDate2026(sessionDate);
if(!scheduled||!inWindow){
  report={...base,status:'NOT_AN_ADMISSIBLE_RESEARCH_WINDOW'};
}else{
  try{
    const [euronext,cboe]=await Promise.all([
      fetchOneGlobalEuronextMilanFile({tradingDay:'PREVIOUS_TRADING_DAY'}),
      fetchOneGlobalCboeCeuxFile({sessionDate}),
    ]);
    report={...base,...screenOneGlobalMilanResearchPair({
      euronextRaw:euronext.raw,cboeRaw:cboe.raw,sessionDate,observedAt:new Date().toISOString(),
    }),status:'RESEARCH_DIAGNOSTIC_COMPLETED'};
  }catch{
    // No raw provider bytes, HTTP statuses or credentials may enter Actions
    // annotations, artifacts or Git. Rejected evidence cannot create trades.
    report={...base,status:'OFFICIAL_SOURCE_PAIR_UNAVAILABLE_OR_UNVERIFIED'};
  }
}
const target=process.env.FENICE_EU_RESEARCH_REPORT;
if(typeof target!=='string'||target.length<4)throw Error('RESEARCH_OUTPUT_PATH_REQUIRED');
await writeFile(target,JSON.stringify(report,null,2)+'\n');
console.log('FENICE_EU_RESEARCH='+JSON.stringify({
  state:report.status,sessionDate,validPairs:report.validPairs??0,
  agreedPairs:report.agreedPairs??0,researchUptrends:report.researchUptrends??0,
  signalsCreated:0,paperFillsCreated:0,brokerConnectivityAllowed:false,
  liveTradingAllowed:false,
}));
