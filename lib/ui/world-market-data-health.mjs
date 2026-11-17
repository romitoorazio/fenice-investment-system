/** Public metadata only. Availability, research data and private PAPER proof
 * are separate dimensions; no scalar health score grants market-data rights. */
const MARKETS=Object.freeze({
  XMIL:"Italia",XETR:"Germania",XPAR:"Francia",XSWX:"Svizzera",XLON:"Regno Unito",
  XNAS:"USA Nasdaq",XNYS:"USA NYSE",XTSE:"Canada",XTKS:"Giappone",XSHG:"Cina",
  XHKG:"Hong Kong",XNSE:"India",XASX:"Australia",BVMF:"Brasile",XJSE:"Sudafrica",XSES:"Singapore",
});
const stamp=value=>typeof value==="string"&&Number.isFinite(Date.parse(value))
  &&new Date(Date.parse(value)).toISOString()===value?Date.parse(value):null;
const fresh=(value,now,maxAge)=>{const n=stamp(value);return n!==null&&n<=now&&now-n<=maxAge;};
const EOD_OK=new Set(["COMPLETE_EOD_RESEARCH","TENTATIVE_COMPLETED_DAILY_RESEARCH"]);
const nonEquity=new Set(["ETF","Obbligazioni","Materie prime","Criptovaluta"]);
export function buildWorldMarketDataHealth({health,terminal,eod,master,seeds,nowIso}){
  const now=stamp(nowIso);if(now===null)throw Error("WORLD_HEALTH_INVALID_CLOCK");
  const instruments=[...(master?.instruments??[]),...(seeds?.instruments??[])];
  const terminalCurrent=fresh(terminal?.generatedAt,now,5*86400000);
  const terminalSafe=terminal?.worldResearch?.brokerOrdersAllowed===false
    &&terminal?.worldResearch?.paperEligible===0&&terminal?.worldResearch?.verifiedExecutableQuotes===0;
  const eodCurrent=fresh(eod?.generatedAt,now,36*3600000);
  const eodSafe=eod?.mode==="WORLD_V7_EOD_RESEARCH_ONLY"&&eod?.realtimePaperEligible===false
    &&eod?.liveTradingAllowed===false&&eod?.brokerConnectivityAllowed===false;
  const markets=Object.entries(MARKETS).map(([mic,name])=>{
    const listed=instruments.filter(x=>x?.exchangeMic===mic&&x.status==="active"&&x.assetClass==="equity");
    const technical=(Array.isArray(terminal?.assets)?terminal.assets:[]).filter(x=>{
      const t=x?.technical;
      // A crypto or an issuer's home country cannot stand in for a listing.
      return !nonEquity.has(x?.assetClass)&&listed.some(i=>i.ticker===x.symbol)
        &&(t?.exchangeMic===mic||listed.some(i=>i.ticker===x.symbol&&["XNAS","XNYS"].includes(mic)&&t?.market==="USA"))
        &&terminalCurrent&&terminalSafe&&fresh(t?.observedAt,now,5*86400000)
        &&t?.timestampSemantics==="DAILY_CANDLE_SESSION_BUCKET_NOT_LAST_TRADE"
        &&Number.isFinite(t?.scores?.dataCompleteness)&&t.scores.dataCompleteness>=75;
    });
    const candidate=eod?.records?.[mic];
    const row=candidate?.venue===mic&&typeof candidate?.ticker==="string"?candidate:null;
    const validDate=typeof row?.lastCompleteBarDate==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(row.lastCompleteBarDate)
      &&Number.isFinite(Date.parse(row.lastCompleteBarDate+"T00:00:00Z"))
      &&new Date(row.lastCompleteBarDate+"T00:00:00Z").toISOString().slice(0,10)===row.lastCompleteBarDate;
    const freshEod=eodCurrent&&eodSafe&&EOD_OK.has(row?.status)&&validDate
      &&Date.parse(row.lastCompleteBarDate+"T00:00:00Z")<=now
      &&now-Date.parse(row.lastCompleteBarDate+"T00:00:00Z")<=7*86400000;
    return {mic,name,listedResearchEquities:listed.length,recentTechnicalEquities:technical.length,
      eodResearchSymbol:row?.ticker??null,eodResearchStatus:row?.status??"NOT_COLLECTED",
      eodProvider:row?.provider??null,lastCompletedResearchSession:validDate?row.lastCompleteBarDate:null,
      quoteQuality:technical.length||freshEod?"RECENT_DAILY_RESEARCH":
        row||listed.length?"MISSING_STALE_OR_REJECTED_RESEARCH":"NO_PRICE_COLLECTOR_CONNECTED",
      // Private mappings cannot be inferred from public probe health, either
      // positively OR negatively. The owner-authenticated journal is decisive.
      paperEvidence:"CHECK_ORIGINAL_PRIVATE_CONTEXT",
      publicExecutionAdmissionVerified:false,liveTradingAllowed:false};
  });
  const sources=(Array.isArray(health?.sources)?health.sources:[]).map(s=>({
    id:s.id,status:fresh(s?.checkedAt,now,24*3600000)
      &&fresh(health?.generatedAt,now,24*3600000)?s.status:"unknown",
  }));
  return {mode:"WORLD_MARKET_DATA_HEALTH_DIMENSIONS",generatedAt:nowIso,
    availability:{scope:"GENERAL_ENDPOINT_REACHABILITY_ONLY",observedAt:health?.generatedAt??null,
      total:sources.length,healthy:sources.filter(s=>s.status==="healthy").length,
      degraded:sources.filter(s=>s.status==="degraded").length,
      unknown:sources.filter(s=>s.status==="unknown").length,
      impliesQuoteQuality:false,impliesPaperRights:false},
    research:{observedAt:terminal?.generatedAt??null,eodObservedAt:eod?.generatedAt??null,
      marketsWithRecentDailyResearch:markets.filter(m=>m.quoteQuality==="RECENT_DAILY_RESEARCH").length,
      recentTechnicalEquities:markets.reduce((n,m)=>n+m.recentTechnicalEquities,0),
      dailyCandlesAreNotLiveQuotes:true},
    markets,paperEvidence:{scope:"ORIGINAL_PRIVATE_JOURNAL_AND_MARKET_CONTEXT",
      publicHealthCannotCertifyPaper:true,authenticatedReadbackRequired:true},
    brokerConnectivityAllowed:false,liveTradingAllowed:false};
}
