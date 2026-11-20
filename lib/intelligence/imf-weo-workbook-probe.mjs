// Health probe ONLY for the IMF's publicly released October 2026 WEO workbook.
// Never treats a reachable workbook as an execution quote, latest daily bar,
// licensed trading feed, or evidence that any FENICE PAPER trade is admissible.
export const IMF_WEO_OFFICIAL_URL =
  "https://data.imf.org/-/media/iData/External-Storage/Documents/0FA3DC49A04D446E9D69DBEB29979E1C/en/WEOOct2026all.xlsx";
const MIME = /^(?:application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|application\/octet-stream|application\/zip)(?:\s*;|$)/i;
const MAX_FILE_BYTES = 40_000_000;
const MIN_FILE_BYTES = 100_000;

export async function probeOfficialImfWeoWorkbook({
  endpoint=IMF_WEO_OFFICIAL_URL,
  fetcher=fetch,
  attempt=1,
  timeoutMs=20_000,
  now=()=>Date.now()
}={}) {
  const started=now();
  const result=(ok,httpStatus,contentType,bytes,detail)=>({
    ok,httpStatus,latencyMs:Math.max(0,now()-started),contentType,
    bytes,detail,retryAfterMs:0,attempt
  });
  // Reject unreviewed URLs. A source-registry edit must not turn this into a
  // redirect-following arbitrary URL fetch or substitute a third-party sheet.
  if(endpoint!==IMF_WEO_OFFICIAL_URL)
    return result(false,null,"",0,"IMF_WEO_URL_NOT_PINNED");
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  let reader;
  try {
    const response=await fetcher(endpoint,{
      signal:controller.signal,redirect:"follow",
      headers:{
        accept:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        range:"bytes=0-4095",
        "user-agent":"FeniceInvestmentSystem/2.3 (+https://github.com/romitoorazio/fenice-investment-system)"
      }
    });
    const contentType=response.headers.get("content-type")||"";
    if(!response.ok) return result(false,response.status,contentType,0,"HTTP "+response.status);
    const finalHost=new URL(response.url||endpoint).hostname.toLowerCase();
    if(finalHost!=="imf.org"&&!finalHost.endsWith(".imf.org"))
      return result(false,response.status,contentType,0,"IMF_WEO_UNTRUSTED_REDIRECT");
    if(!MIME.test(contentType))
      return result(false,response.status,contentType,0,"IMF_WEO_UNEXPECTED_MIME");
    let totalSize;
    if(response.status===206){
      const range=response.headers.get("content-range")||"";
      const match=/^bytes 0-\d+\/(\d+)$/.exec(range);
      if(!match) return result(false,response.status,contentType,0,"IMF_WEO_RANGE_UNVERIFIED");
      totalSize=Number(match[1]);
    }else if(response.status===200){
      totalSize=Number(response.headers.get("content-length")||0);
    }else{
      return result(false,response.status,contentType,0,"IMF_WEO_UNEXPECTED_RESPONSE");
    }
    if(!Number.isSafeInteger(totalSize)||totalSize<MIN_FILE_BYTES||totalSize>MAX_FILE_BYTES)
      return result(false,response.status,contentType,0,"IMF_WEO_SIZE_UNVERIFIED");
    if(!response.body?.getReader)
      return result(false,response.status,contentType,0,"IMF_WEO_BODY_UNREADABLE");
    reader=response.body.getReader();
    const sample=[];
    while(sample.length<4&&sample.length<=4096){
      const {value,done}=await reader.read();
      if(done||!value?.length) break;
      for(const byte of value.subarray(0,Math.min(4096-sample.length,value.length)))sample.push(byte);
    }
    const zip=sample.length>=4&&sample[0]===0x50&&sample[1]===0x4b
      &&sample[2]===0x03&&sample[3]===0x04;
    if(!zip)return result(false,response.status,contentType,sample.length,"IMF_WEO_ZIP_SIGNATURE_INVALID");
    return result(true,response.status,contentType,sample.length,
      "Official IMF WEO October 2026 workbook: ZIP signature and published file length verified; data values not parsed or certified for trading.");
  }catch(error){
    return result(false,null,"",0,
      error?.name==="AbortError"?"IMF_WEO_TIMEOUT":"IMF_WEO_NETWORK_UNAVAILABLE");
  }finally{
    try{await reader?.cancel();}catch{}
    clearTimeout(timeout);
  }
}
