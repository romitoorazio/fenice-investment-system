const nativeFetch = globalThis.fetch;

const secUserAgent =
  process.env.SEC_USER_AGENT ||
  "FeniceInvestmentSystem/1.0 romitoorazio@gmail.com";

function repairGdeltUrl(value) {
  const url = new URL(value);
  if (!url.hostname.endsWith("gdeltproject.org")) return url;

  const mode = url.searchParams.get("mode")?.toLowerCase();
  if (mode === "artlist") {
    url.searchParams.set(
      "query",
      '"initial public offering" OR "funding round" OR "FDA approval" OR breakthrough OR quantum OR fusion OR CRISPR',
    );
    url.searchParams.set("maxrecords", "30");
  } else {
    url.searchParams.set(
      "query",
      '"armed conflict" OR sanctions OR tariffs OR "central bank" OR inflation OR recession OR election OR cyberattack',
    );
  }

  return url;
}

globalThis.fetch = async (input, init = {}) => {
  const originalUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  let url = new URL(originalUrl);
  const headers = new Headers(init.headers || {});

  if (url.hostname === "www.sec.gov" || url.hostname === "data.sec.gov") {
    headers.set("user-agent", secUserAgent);
    headers.set("accept", "text/plain,application/json,text/html;q=0.9,*/*;q=0.8");
    headers.delete("accept-encoding");
  }

  if (url.hostname.endsWith("gdeltproject.org")) {
    url = repairGdeltUrl(url);
    headers.set("user-agent", "FeniceInvestmentSystem/1.0");
  }

  return nativeFetch(url, { ...init, headers });
};

await import("./run-autonomy.mjs");
