/**
 * Reviewed 2026 Nasdaq regular-session date boundary for ORIGINAL private PAPER.
 * Uses the SAME conservative policy as the pre-existing US owner mapping:
 * exclude full closures and shortened sessions, which require a separate
 * original/attested pathway. A calendar date never proves market OPEN,
 * independent data, licensed rights, or owner PAPER authorization.
 *
 * Official exchange calendar: https://www.nasdaqtrader.com/Trader.aspx?id=Calendar
 * Recheck exchange announcements before treating any session as eligible.
 * Fail closed outside the reviewed calendar year.
 */
const CLOSED_2026=new Set([
  '2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25',
  '2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25',
]);
const EARLY_2026=new Set(['2026-11-27','2026-12-24']);

function valid2026Date(value){
  if(typeof value!=='string'||!/^2026-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(value+'T12:00:00.000Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}

/** Next Nasdaq date reviewed as a NORMAL session, not proof that it opened. */
export function oneGlobalNextReviewedNasdaqRegularSession2026(referenceSessionDate){
  if(!valid2026Date(referenceSessionDate))return null;
  const day=new Date(referenceSessionDate+'T12:00:00.000Z');
  for(let attempt=0;attempt<7;attempt++){
    day.setUTCDate(day.getUTCDate()+1);
    const candidate=day.toISOString().slice(0,10);
    if(!candidate.startsWith('2026-'))return null;
    if(![0,6].includes(day.getUTCDay())&&!CLOSED_2026.has(candidate)
      &&!EARLY_2026.has(candidate))return candidate;
  }
  return null;
}
