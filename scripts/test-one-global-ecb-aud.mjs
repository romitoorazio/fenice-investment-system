import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  selectEcbAudReference,summarizeEcbAudReference,
} from "../lib/market/one-global-ecb-aud.mjs";

// Synthetic ECB-shaped CSV solely to test the official AUD-per-EUR conversion.
// Never treat these rates as actual market observations or CBA trade evidence.
const header="KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE,OBS_STATUS";
const row=(date,val,currency="AUD",denom="EUR",status="A")=>
  'EXR.D.AUD.EUR.SP00.A,D,'+currency+','+denom+',SP00,A,'+date+','+val+','+status;
const csv=[header,
  row("2026-11-10","1.6200"),
  row("2026-11-11","1.6300"),
  row("2026-11-12","1.6400"),
].join("\r\n")+"\r\n";
const selected=selectEcbAudReference({
  csv,sessionDate:"2026-11-13",observedAt:"2026-11-12T16:10:00.000Z",
});
assert.equal(selected.mode,"ONE_GLOBAL_ECB_AUD_DAILY_REFERENCE_PRIVATE");
assert.equal(selected.series,"EXR.D.AUD.EUR.SP00.A");
assert.equal(selected.referenceDate,"2026-11-12");
assert.equal(selected.sessionDate,"2026-11-13");
assert.equal(selected.audPerEuro,1.64);
assert(Math.abs(selected.rateToEuro-1/1.64)<1e-12,
  "ECB daily series is AUD per 1 EUR, NEVER EUR per AUD");
assert.equal(selected.source,"ECB_REFERENCE_ONLY");
assert.equal(selected.publishedAt,"2026-11-12T16:10:00.000Z");
assert.match(selected.ecbResponseSha256,/^[a-f0-9]{64}$/);
assert.equal(selected.marketExecutionEligible,false);
assert.equal(selected.licensedEquityClosesCount,0);
assert.equal(selected.independentEquityCloseReceipts,0);
assert.equal(selected.phase9Credit,0);
assert.equal(selected.liveTradingAllowed,false);
const safe=summarizeEcbAudReference(selected);
assert.equal(safe.status,"DAILY_REFERENCE_AVAILABLE_ONLY");
assert.equal(safe.noExecutableFxPrice,true);
assert.equal(safe.noIndependentEquityCloseReceipts,true);
assert.equal(safe.phase9Credit,0);
assert(!JSON.stringify(safe).includes("1.64"),
  "Never publish private raw ECB observations in GitHub health report");
assert(!JSON.stringify(safe).includes("0.609"),
  "Do not publish the derived FX conversion rate");

const select=(content,target="2026-11-13",at="2026-11-13T08:00:00.000Z")=>
  selectEcbAudReference({csv:content,sessionDate:target,observedAt:at});
assert.equal(select(csv).referenceDate,"2026-11-12");
assert.equal(select(csv,"2026-11-12").referenceDate,"2026-11-11");
assert.throws(()=>select(csv,"2026-11-11","2026-11-10T13:00:00.000Z"),
  /EOD_AUD_FX_NO_PUBLISHED_PRIOR_SESSION_AUD_REFERENCE/);
assert.throws(()=>select(header+"\n"+row("2026-11-13","1.64")+"\n"),
  /EOD_AUD_FX_NO_PUBLISHED_PRIOR_SESSION_AUD_REFERENCE/,
  "Same-day FX cannot be the prior-ASX-session reference");
assert.throws(()=>select(header+"\n"+row("2026-11-02","1.61")+"\n"),
  /EOD_AUD_FX_NO_PUBLISHED_PRIOR_SESSION_AUD_REFERENCE/,
  "Stale FX may not silently replace a missing recent ECB reference");
assert.throws(()=>select(header+"\n"+row("2026-11-12","1.64")+"\n"
  +row("2026-11-12","1.64")+"\n"),
  /EOD_AUD_FX_DUPLICATED_ECB_REFERENCE_DATE/);
assert.throws(()=>select(header+"\n"+row("2026-11-12","1.64","USD")+"\n"),
  /EOD_AUD_FX_WRONG_ECB_SERIES_OR_PERIOD/,
  "USD source cannot be mislabeled as AUD");
assert.throws(()=>select(header+"\n"+row("2026-11-12","1.64","AUD","USD")+"\n"),
  /EOD_AUD_FX_WRONG_ECB_SERIES_OR_PERIOD/);
assert.throws(()=>select(header+"\n"+row("2026-11-12","-1.64")+"\n"),
  /EOD_AUD_FX_AUD_REFERENCE_VALUE_OR_STATUS_INVALID/);
assert.throws(()=>select(header+"\n"+row("2026-11-12","0")+"\n"),
  /EOD_AUD_FX_AUD_REFERENCE_VALUE_OR_STATUS_INVALID/);
assert.throws(()=>select(header+"\n"+row("2026-11-12","NaN")+"\n"),
  /EOD_AUD_FX_AUD_REFERENCE_VALUE_OR_STATUS_INVALID/);
assert.throws(()=>select(header+"\n"+row("2026-11-12","1.64","AUD","EUR","M")+"\n"),
  /EOD_AUD_FX_AUD_REFERENCE_VALUE_OR_STATUS_INVALID/);
assert.throws(()=>select(header.replace("TIME_PERIOD","TIME_SLOT")+"\n"
  +row("2026-11-12","1.64")+"\n"),/EOD_AUD_FX_CSV_COLUMNS_INVALID/);
assert.throws(()=>select("garbage"),/EOD_AUD_FX_CSV_SIZE_INVALID/);
assert.throws(()=>select(csv,"not-a-date"),/EOD_AUD_FX_SESSION_OR_FETCH_TIME_INVALID/);
assert.throws(()=>select(csv,"2026-11-13","invalid-time"),
  /EOD_AUD_FX_SESSION_OR_FETCH_TIME_INVALID/);

const runner=readFileSync(new URL("./run-one-global-eod-private.mjs",import.meta.url),"utf8");
assert.match(runner,/--fx=\/private\/ECB_AUD\.json/,
  "First CBA PAPER settlement must allow a separately fetched private ECB file");
assert.match(runner,/if\(fxPath&&event\.fxEvidence\)/,
  "Never select ambiguously between two private FX proofs");
assert.match(runner,/fxEvidence:fxPath\?parse\(fxPath\)/,
  "Private source must flow into strict paper FX validation");

console.log("PASS CBA official ECB AUD/EUR reference: exact series, 1/rate conversion, prior ASX day, no executable FX/stock quote, zero PAPER certification");
