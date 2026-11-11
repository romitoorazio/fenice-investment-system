/**
 * Supply only zero-cost quote probes for an already authorized V8 engineering
 * campaign. This is not a trading universe, strategy selection or certification.
 * The world radar, research data and existing order queue are left untouched.
 */
export const V8_TECHNICAL_PROBE_SYMBOLS = Object.freeze(["SPY","QQQ","AAPL","MSFT"]);
const instant = x => typeof x==="string" && Number.isFinite(Date.parse(x)) ? Date.parse(x) : null;

export function includeApprovedV8TechnicalProbes(existing, {
  usingTerminalFallback=false, job="", approval=null, nowIso,
}={}) {
  const symbols=Array.isArray(existing) ? [...existing] : [];
  // Never change genuine queued PAPER order identity or ranking.
  if(!usingTerminalFallback || job!=="intraday") return symbols;
  const now=instant(nowIso), start=instant(approval?.effectiveFrom),
    end=instant(approval?.expiresAt);
  if(now===null||start===null||end===null||now<start||now>=end||
     approval?.approved!==true||approval?.humanConfirmation!==true||
     approval?.mode!=="PAPER_TECHNICAL_V8"||
     approval?.prospectiveOnly!==true||approval?.allowBackfill!==false||
     approval?.liveTradingAllowed!==false||approval?.brokerConnectivityAllowed!==false)
    return symbols;
  // Only append *known* approved market identifiers to a diagnostic request
  // when no orders are queued. Existing provider caps still apply as-is.
  const seen=new Set(symbols.map(s=>String(s).trim().toUpperCase()));
  for(const symbol of V8_TECHNICAL_PROBE_SYMBOLS)
    if(!seen.has(symbol)){symbols.push(symbol);seen.add(symbol);}
  return symbols;
}
