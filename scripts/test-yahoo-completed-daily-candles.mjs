import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {selectCompletedYahooDailyCandles as select}
 from "../lib/intelligence/yahoo-completed-daily-candles.mjs";

const sec=iso=>Date.parse(iso)/1000;
const candle=(iso,close)=>({timestamp:sec(iso),close,high:close+1,low:close-1});
const session=(timezone,start,end)=>({
 exchangeTimezoneName:timezone,
 currentTradingPeriod:{regular:{start:sec(start),end:sec(end)}},
});
const sample=(previous,current)=>[
 candle(previous,100),
 candle(current,101),
];
const jse=session("Africa/Johannesburg",
 "2026-11-11T07:00:00.000Z","2026-11-11T15:00:00.000Z");
const jseRows=sample("2026-11-10T07:00:00.000Z","2026-11-11T07:00:00.000Z");
const jseMorning=select({rows:jseRows,meta:jse,now:new Date("2026-11-11T07:52:48.000Z")});
assert.equal(jseMorning.rows.length,1,
 "JSE Naspers 09:52 SAST quote must not be mistaken for a final daily close");
assert.equal(jseMorning.heldBack,1);
assert.equal(jseMorning.reason,"REGULAR_SESSION_NOT_SETTLED");
assert.equal(jseMorning.latestRetainedSessionBucket,"2026-11-10T07:00:00.000Z");
assert.equal(select({rows:jseRows,meta:jse,now:new Date("2026-11-11T15:19:59.000Z")}).rows.length,1);
assert.equal(select({rows:jseRows,meta:jse,now:new Date("2026-11-11T15:20:00.000Z")}).rows.length,2);
const tokyo=session("Asia/Tokyo","2026-11-11T00:00:00.000Z","2026-11-11T06:30:00.000Z");
const tokyoBars=sample("2026-11-10T00:00:00.000Z","2026-11-11T00:00:00.000Z");
assert.equal(select({rows:tokyoBars,meta:tokyo,
 now:new Date("2026-11-11T06:28:17.000Z")}).rows.length,1,
 "Tokyo local 15:28 is pre-close; never certify 15:30 bar early");
assert.equal(select({rows:tokyoBars,meta:tokyo,
 now:new Date("2026-11-11T06:50:00.000Z")}).rows.length,2);
const aus=session("Australia/Sydney",
 "2026-11-10T23:00:00.000Z","2026-11-11T05:10:00.000Z");
const ausBars=sample("2026-11-10T23:00:00.000Z","2026-11-11T05:20:59.000Z");
const ausDone=select({rows:ausBars,meta:aus,
 now:new Date("2026-11-11T06:28:17.000Z")});
assert.equal(ausDone.rows.length,2,
 "Don't unfairly delay Australia after its published local regular close");
assert.equal(ausDone.heldBack,0);
const ny=session("America/New_York",
 "2026-11-11T14:30:00.000Z","2026-11-11T21:00:00.000Z");
const nyBars=sample("2026-11-10T14:30:00.000Z","2026-11-11T14:30:00.000Z");
assert.equal(select({rows:nyBars,meta:ny,
 now:new Date("2026-11-11T18:00:00.000Z")}).rows.length,1);
assert.equal(select({rows:nyBars,meta:ny,
 now:new Date("2026-11-11T21:20:00.000Z")}).rows.length,2);
const noSession=select({rows:jseRows,meta:{exchangeTimezoneName:"Africa/Johannesburg"},
 now:new Date("2026-11-11T20:00:00.000Z")});
assert.equal(noSession.rows.length,1);
assert.equal(noSession.reason,"CURRENT_LOCAL_DAY_NO_MATCHING_REGULAR_SESSION_END");
const dayLater=select({rows:jseRows,meta:{exchangeTimezoneName:"Africa/Johannesburg"},
 now:new Date("2026-11-12T09:00:00.000Z")});
assert.equal(dayLater.rows.length,2,"A previous fully elapsed local day may be used for historical research");
const forgedNextDay=select({rows:[...jseRows,candle("2026-11-12T07:00:00.000Z",999)],
 meta:jse,now:new Date("2026-11-11T07:52:48.000Z")});
assert.equal(forgedNextDay.rows.length,1,
 "Both future and today's incomplete bucket must be withheld");
assert.equal(forgedNextDay.heldBack,2);
assert.equal(forgedNextDay.rows.at(-1).close,100);
const cryptoNoSession=select({rows:sample(
 "2026-11-10T00:00:00.000Z","2026-11-11T00:00:00.000Z"),
 meta:{exchangeTimezoneName:"UTC"},
 now:new Date("2026-11-11T13:00:00.000Z")});
assert.equal(cryptoNoSession.rows.length,1,
 "24x7 market today's daily bar not final before rollover without close proof");
assert.equal(ausDone.paperEligible,false);
assert.equal(ausDone.liveTradingAllowed,false);
assert.equal(ausDone.authorizedRealtimeQuote,false);
assert.equal(ausDone.independentExchangeCloseCertified,false);
assert.throws(()=>select({rows:jseRows,meta:{exchangeTimezoneName:"BAD/ZONE"},
 now:new Date("2026-11-11T16:00:00.000Z")}),/WORLD_DAILY_COMPLETION_TIMEZONE_INVALID/);
assert.throws(()=>select({rows:jseRows,meta:jse,now:new Date("invalid")}),
 /WORLD_DAILY_COMPLETION_INPUT_INVALID/);

const terminalSource=readFileSync(new URL("./run-terminal-engine.mjs",import.meta.url),"utf8");
assert.match(terminalSource,/selectCompletedYahooDailyCandles\(\{rows,meta:result\.meta,now\}\)/);
assert.match(terminalSource,/rows=completion\.rows/);
assert.match(terminalSource,/dailyBarCompletion/);
const writerSource=readFileSync(new URL("../lib/trading/one-global-forward-research.mjs",import.meta.url),"utf8");
assert.match(writerSource,/dailyBarCompletion/);
console.log("PASS worldwide daily candles: JSE/Tokyo active sessions withheld, Sydney/NY post-close 20m, timezone, missing meta, future bar and no PAPER/Directa");
