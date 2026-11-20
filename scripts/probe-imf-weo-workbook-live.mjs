import {probeOfficialImfWeoWorkbook} from "../lib/intelligence/imf-weo-workbook-probe.mjs";
const result=await probeOfficialImfWeoWorkbook();
console.log(JSON.stringify({
  probe:"OFFICIAL_IMF_WEO_HEALTH_ONLY",status:result.ok?"PASS":"FAIL",
  httpStatus:result.httpStatus,contentType:result.contentType,
  bytesSampled:result.bytes,detail:result.detail,liveTradingAllowed:false,
  paperCredit:0
}));
if(!result.ok)process.exitCode=1;
