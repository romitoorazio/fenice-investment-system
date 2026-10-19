// Independent research-ledger storage rule. Never changes a decision, price,
// risk score, checkpoint, PAPER execution, broker instruction or approval.
// Fail closed rather than silently discarding unseasoned 30-day evidence.
export const MAX_DECISION_LEDGER_RECORDS = 12_000;
export const REQUIRED_CHECKPOINT_DAYS = 30;
const DAY_MS = 86_400_000;

const asTime = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)
  && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const positive = x => typeof x === "number" && Number.isFinite(x) && x > 0;

function hasValidThirtyDayProof(row,createdAt,now) {
  const evidence=row?.checkpoints?.["30d"];
  const verifiedAt=asTime(evidence?.measuredAt);
  return verifiedAt!==null && verifiedAt>=createdAt+REQUIRED_CHECKPOINT_DAYS*DAY_MS
    && verifiedAt<=now && positive(evidence?.price)
    && typeof evidence.returnPercent === "number" && Number.isFinite(evidence.returnPercent);
}

export function retainDecisionLedgerRecords(records, {nowIso,maxRecords=MAX_DECISION_LEDGER_RECORDS}={}) {
  if(!Array.isArray(records))throw Error("DECISION_LEDGER_RECORDS_INVALID");
  const now=asTime(nowIso);
  if(now===null)throw Error("DECISION_LEDGER_RETENTION_CLOCK_INVALID");
  if(!Number.isInteger(maxRecords) || maxRecords<5_001 || maxRecords>12_000)
    throw Error("DECISION_LEDGER_RETENTION_LIMIT_INVALID");
  const toEvict=Math.max(0,records.length-maxRecords);
  const evictions=records.slice(0,toEvict);
  const forbidden=evictions.filter(row=>{
    const createdAt=asTime(row?.createdAt);
    if(createdAt===null || createdAt>now) return true;
    if(now-createdAt<REQUIRED_CHECKPOINT_DAYS*DAY_MS) return true;
    // Only priced original decisions can eventually furnish a 30-day
    // certification checkpoint. Never silently discard their evidence
    // if the 30-day observation has not yet been measured.
    return positive(row?.entryReferencePrice)
      && !hasValidThirtyDayProof(row,createdAt,now);
  });
  if(forbidden.length)throw Error(
    "DECISION_LEDGER_PENDING_30D_RETENTION_REQUIRED:"+forbidden.length+
    "; increase archival capacity or complete legitimate checkpoints (no synthetic backfills)"
  );
  const retained=records.slice(toEvict);
  return {
    records:retained,
    maxRecords,
    retainedRecords:retained.length,
    safelyEvictedRecords:evictions.length,
    requiredCheckpointDays:REQUIRED_CHECKPOINT_DAYS,
    pending30dRecords:retained.filter(row=>positive(row?.entryReferencePrice)
      && !hasValidThirtyDayProof(row,asTime(row?.createdAt)??Number.POSITIVE_INFINITY,now)).length,
    oldestRetainedCreatedAt:retained[0]?.createdAt??null,
    noSyntheticCheckpoints:true,
    noPaperMutations:true,
    brokerConnectivityAllowed:false,
    liveTradingAllowed:false,
  };
}
