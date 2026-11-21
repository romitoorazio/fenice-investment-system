/** Source-linked daily closes: observed daily moves, NOT FENICE signal outcomes. */
import {readFile,writeFile} from "node:fs/promises";
const path="artifacts/phase4/verified-web-quote-snapshot-2026-11-09.json";
const snapshot=JSON.parse(await readFile(path,"utf8"));
if(snapshot.mode!=="PUBLIC_HISTORICAL_CLOSES_MANUAL_SOURCE_SNAPSHOT_NOT_PAPER"||!Array.isArray(snapshot.quotes))throw Error("INVALID_QUOTE_SNAPSHOT");
const rows=snapshot.quotes.map(q=>{
 if(!Number.isFinite(q.close)||q.close<=0||!Number.isFinite(q.previousClose)||q.previousClose<=0||!q.source.startsWith("https://")||q.closeDate!==snapshot.asOf)throw Error("INVALID_QUOTE");
 const changePct=Number((100*(q.close/q.previousClose-1)).toFixed(4));
 return {...q,changePct,direction:changePct>0?"POSITIVE":changePct<0?"NEGATIVE":"FLAT"};
});
const report={schemaVersion:1,asOf:snapshot.asOf,mode:"OBSERVED_DAILY_MARKET_MOVES_NOT_FENICE_SIGNAL_PERFORMANCE",quotes:rows,positive:rows.filter(x=>x.direction==="POSITIVE").length,negative:rows.filter(x=>x.direction==="NEGATIVE").length,flat:rows.filter(x=>x.direction==="FLAT").length,realPaperCertified:false,ordersGenerated:0};
await writeFile("artifacts/phase4/observed-daily-market-moves-2026-11-09.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({asOf:report.asOf,positive:report.positive,negative:report.negative,flat:report.flat,mode:report.mode}));
