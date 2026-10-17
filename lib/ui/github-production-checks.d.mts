export type ProductionGitHubCI = {
  state: "DEPLOYMENT_METADATA_UNAVAILABLE"|"INVALID_SHA_OR_CLOCK"|
    "GITHUB_CHECKS_INCOMPLETE"|"GITHUB_CHECKS_UNAVAILABLE"|
    "EXACT_SHA_CHECKS_NOT_GREEN"|"EXACT_SHA_CHECKS_VERIFIED";
  commit:string|null;
  verified:boolean;
  source:string;
  requiredChecks:string[];
  passedChecks:string[];
  failedChecks:string[];
  authorizesPaper:false;
  authorizesLive:false;
  brokerSubmissionAllowed:false;
  verifiesVercelAlias:false;
  certifiesEconomicPerformance:false;
};
export declare const REQUIRED_FENICE_CHECKS:readonly string[];
export declare function assessGitHubProductionChecks(payload:unknown, commit:string, nowMs?:number):ProductionGitHubCI;
export declare function readGitHubProductionChecks(options?:{
  commit?:string|null; environment?:string|null; nowMs?:number; fetcher?:typeof fetch;
}):Promise<ProductionGitHubCI>;
