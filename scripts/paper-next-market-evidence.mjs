// Pure fail-closed market-evidence gate for independent PAPER-next.
// Never sends broker orders or generates simulated fills.
export function assessPaperNextMarketEvidence({coverage, session, now, venue}) {
  const blocked = reason => ({ready:false,reason});
  const clock=Date.parse(String(now??""));
  if (!Number.isFinite(clock)) return blocked("INVALID_CLOCK");
  if (typeof venue!=="string" || !venue.trim()) return blocked("VENUE_REQUIRED");
  if (session?.evidence?.venue!==venue) return blocked("VENUE_MISMATCH");
  if (session?.configured!==true || session?.evidence?.authoritative!==true
    || session?.evidence?.state!=="OPEN" || session?.decision?.allowed!==true
    || session?.liveTradingAllowed!==false) return blocked("MARKET_NOT_AUTHORITATIVELY_OPEN");
  const sessionAt=Date.parse(String(session.evidence.observedAt??""));
  const coverageAt=Date.parse(String(coverage?.generatedAt??""));
  if (!Number.isFinite(sessionAt)||sessionAt>clock||clock-sessionAt>120000
    ||!Number.isFinite(coverageAt)||coverageAt>clock||clock-coverageAt>120000)
    return blocked("STALE_OR_FUTURE_EVIDENCE");
  const close=Date.parse(String(session.nextClose??""));
  if (!Number.isFinite(close)||close-clock<300000) return blocked("MARKET_CLOSE_TOO_SOON");
  if (coverage?.policy?.liveTradingAllowed!==false
    || Number(coverage?.policy?.minIndependentSourceFamilies)<2)
    return blocked("COVERAGE_POLICY_INVALID");
  const rows=Array.isArray(coverage?.rows)?coverage.rows:[];
  const eligible=rows.filter(x=>x?.paperEligible===true
    && Number(x.independentSourceFamilies)>=2
    && ["GREEN","CAUTION"].includes(x.state)
    && Number.isFinite(x.medianPrice)&&x.medianPrice>0);
  if (eligible.length<3 || Number(coverage.paperEligibleSymbols)<3)
    return blocked("INSUFFICIENT_INDEPENDENT_MARKET_QUOTES");
  return {ready:true,reason:"AUTHORITATIVE_FRESH_VENUE_EVIDENCE",eligibleSymbols:eligible.map(x=>x.symbol)};
}
