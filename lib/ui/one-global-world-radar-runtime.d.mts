import type {WorldRadarResearchView} from './one-global-world-radar.mjs';
export type WorldMarketDataHealth={
  availability:{scope:string;observedAt:string|null;total:number;healthy:number;degraded:number;unknown:number;
    impliesQuoteQuality:false;impliesPaperRights:false};
  research:{observedAt:string|null;eodObservedAt:string|null;marketsWithRecentDailyResearch:number;
    recentTechnicalEquities:number;dailyCandlesAreNotLiveQuotes:true};
  markets:Array<{mic:string;name:string;listedResearchEquities:number;recentTechnicalEquities:number;
    eodResearchSymbol:string|null;eodResearchStatus:string;eodProvider:string|null;
    lastCompletedResearchSession:string|null;quoteQuality:string;paperEvidence:string;
    publicExecutionAdmissionVerified:false;liveTradingAllowed:false}>;
  paperEvidence:{scope:string;publicHealthCannotCertifyPaper:true;authenticatedReadbackRequired:true};
  brokerConnectivityAllowed:false;liveTradingAllowed:false;
};
export type WorldTacticalEvidence={radar:WorldRadarResearchView|null;dataHealth:WorldMarketDataHealth|null;source:string};
export declare function readLatestWorldTacticalEvidence(args:{
  fallback:{terminal:unknown;ledger:unknown;health:unknown;eod:unknown;master:unknown;seeds:unknown};
  nowIso:string;fetcher?:typeof fetch;
}):Promise<WorldTacticalEvidence>;
