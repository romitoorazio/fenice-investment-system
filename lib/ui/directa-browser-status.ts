// The only data permitted in the browser is the locally redacted monitor summary.
export type LocalStatus = {
  version: 1; plane: "LOCAL_READ_ONLY"; updatedAt: string; snapshotGeneratedAt: string | null;
  state: string; snapshotState: string; comparison: string;
  connectionHealthy: boolean; positionsObserved: number | null; ordersObserved: number | null;
  comparisonBreakCount: number | null; failures: string[];
  diagnosticOnly: true; brokerReconciliationVerified: false;
  brokerWritesAuthorized: false; liveTradingAllowed: false; sentToCloud: false;
};
const keys = new Set(["version","plane","updatedAt","snapshotGeneratedAt","state","snapshotState","comparison","connectionHealthy","positionsObserved","ordersObserved","comparisonBreakCount","failures","diagnosticOnly","brokerReconciliationVerified","brokerWritesAuthorized","liveTradingAllowed","sentToCloud"]);
const states = new Set(["CURRENT_COMPLETE","SNAPSHOT_NOT_VERIFIED","COLLECTING","READ_FAILED","STOPPED"]);
const comparisons = new Set(["MATCHED_UNCERTIFIED","INDEPENDENT_LEDGER_MISSING","DIFFERENCES_FOUND","OPEN_ORDER_ID_UNAVAILABLE","NOT_PERFORMED"]);
const codes = new Set(["LOCAL_SNAPSHOT_MISSING","LOCAL_SNAPSHOT_STALE_OR_INVALID_CLOCK","READ_ONLY_BOUNDARY_UNVERIFIED","BROKER_CONNECTION_UNHEALTHY","BROKER_LISTS_INCOMPLETE","BROKER_ACCOUNT_FIELDS_INCOMPLETE","BROKER_COLLECTIONS_MISSING","BROKER_POSITION_ROWS_INCOMPLETE","BROKER_ORDER_STATE_AMBIGUOUS","BROKER_ORDER_ROWS_INCOMPLETE","BROKER_PROTOCOL_ERRORS"]);
const isCount = (x: unknown) => x === null || (typeof x === "number" && Number.isSafeInteger(x) && x >= 0 && x <= 100000);
const timestamp = (x: unknown) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(Date.parse(x)).toISOString() === x;
export function inspectBrowserStatus(raw: unknown, now = Date.now()): {status:LocalStatus|null; fresh:boolean;reason:string} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {status:null,fresh:false,reason:"INVALID"};
  const x = raw as Record<string,unknown>;
  if (!Object.keys(x).every(k=>keys.has(k))
    || x.version !== 1 || x.plane !== "LOCAL_READ_ONLY"
    || !states.has(x.state as string) || !comparisons.has(x.comparison as string)
    || !timestamp(x.updatedAt) || !(x.snapshotGeneratedAt === null || timestamp(x.snapshotGeneratedAt))
    || !["CURRENT_COMPLETE","NOT_CURRENT_COMPLETE"].includes(x.snapshotState as string)
    || typeof x.connectionHealthy !== "boolean" || !isCount(x.positionsObserved)
    || !isCount(x.ordersObserved) || !isCount(x.comparisonBreakCount)
    || !Array.isArray(x.failures) || x.failures.length > 32
    || !x.failures.every((f: unknown)=>typeof f==="string" && codes.has(f))
    || x.diagnosticOnly !== true || x.brokerReconciliationVerified !== false
    || x.brokerWritesAuthorized !== false || x.liveTradingAllowed !== false
    || x.sentToCloud !== false) return {status:null,fresh:false,reason:"INVALID"};
  const age = now - Date.parse(x.updatedAt as string);
  const fresh = Number.isFinite(now) && age >= 0 && age <= 35000;
  return {status:x as LocalStatus,fresh,reason:fresh?"OK":"STALE"};
}
