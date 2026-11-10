import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=readFileSync("app/paper-mondo/page.tsx","utf8");
const venueReport=readFileSync("scripts/diagnose-one-global-venues.mjs","utf8");
for(const mic of ["XNAS","XNYS","ARCX","XMIL","XETR","XTKS","BVMF","XASX"]){
  assert(src.includes('mic:"'+mic+'"'),"Missing eight-venue UI "+mic);
  assert(venueReport.includes('"'+mic+'"'),"Missing underlying venue "+mic);
}
assert(src.includes('readLatestWorldVenueHistory()'));
assert(src.includes('cache:"no-store"'));
assert(src.includes('book.paperEligible!==false'));
assert(src.includes('book.brokerSubmissionAllowed!==false'));
assert(src.includes('book.liveTradingAllowed!==false'));
assert(src.includes('book.certifiedPaperFills!==0'));
assert(src.includes('record?.paperEligible===false'));
assert(src.includes("PAPER strategico: NON CERTIFICATO"));
assert(src.includes("Fonte")||src.includes("Fonti"));
assert(src.includes("Osservazione assente o non recente"));
assert(!src.includes('strategyOrderAuthorizationGranted:true'));
assert(!/submit(Order|Trade)|broker\.placeOrder|directa.*execute/i.test(src));
assert(!src.includes('PAPER strategico: CERTIFICATO'));
console.log("PASS ONE GLOBAL UI: eight exchanges, source-freshness disclosure, paper rights fail-closed, no trade method");
