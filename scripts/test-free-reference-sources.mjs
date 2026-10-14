import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  RESEARCH_ONLY, PUBLIC_REFERENCE_SOURCES, openFigiJobs, validateOpenFigiResponse,
  summarizeCompanyfacts, summarizeEsmaIndex, validateFreeDataset, sanitizeFailure, getJson,
} from "../lib/research/free-reference-sources.mjs";

assert.equal(RESEARCH_ONLY.paperEligible, false);
assert.equal(RESEARCH_ONLY.liveTradingAllowed, false);
assert.equal(RESEARCH_ONLY.brokerSubmissionAllowed, false);
assert.equal(RESEARCH_ONLY.quoteFeed, false);
assert.equal(RESEARCH_ONLY.mutatesV6, false);
assert.equal(PUBLIC_REFERENCE_SOURCES.length, 6);
assert.equal(new Set(PUBLIC_REFERENCE_SOURCES.map(s => s.id)).size, 6);

const master = JSON.parse(await readFile(new URL("../data/instrument-master.json", import.meta.url), "utf8"));
const jobs = openFigiJobs(master.instruments, 300);
assert.ok(jobs.length >= 1 && jobs.length <= 5);
assert.ok(jobs.every(j => j.idType === "ID_ISIN" && /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(j.idValue)));
assert.equal(new Set(jobs.map(j => j.idValue)).size, jobs.length);
assert.equal(openFigiJobs([{ identifiers: [{ type: "isin", value: "INVALID" }] }]).length, 0);
const sampleJobs = [{ idType: "ID_ISIN", idValue: "US0378331005" }, { idType: "ID_ISIN", idValue: "US5949181045" }, { idType: "ID_ISIN", idValue: "US67066G1040" }];
const out = validateOpenFigiResponse(sampleJobs, [
  { data: [{ figi: "BBG000B9XRY4" }] },
  { data: [{ figi: "FIGI1" }, { figi: "FIGI2" }] },
  { error: "No identifier found" },
]);
assert.deepEqual(out.map(x => x.status), ["UNIQUE_CANDIDATE_REVIEW_REQUIRED", "AMBIGUOUS", "NO_MATCH"]);
assert.equal(out[1].figi, null);
assert.throws(() => validateOpenFigiResponse(sampleJobs, [{}]));
assert.throws(() => summarizeCompanyfacts({ foo: "bar" }));
assert.deepEqual(summarizeCompanyfacts({ cik: 320193, entityName: "Apple Inc.", facts: { "us-gaap": { Revenue: {} } } }), {
  cik: 320193, entityName: "Apple Inc.", namespaceCount: 1, taxonomyFacts: 1,
});
assert.deepEqual(summarizeEsmaIndex({ response: { numFound: 123, docs: [{}] } }), {
  availableIndexRecords: 123, sampleDocuments: 1, filesDownloaded: 0, instrumentRecordsImported: 0,
});
assert.throws(() => summarizeEsmaIndex({ response: { docs: [] } }));
assert.equal(validateFreeDataset("FRED/GDP"), true);
assert.equal(validateFreeDataset("../PAID"), false);
assert.equal(validateFreeDataset("FRED/GDP?api_key=secret"), false);
assert.equal(sanitizeFailure(new Error("unexpected bearer SECRETKEY")), "Request failed or payload invalid");
assert.equal(sanitizeFailure(new Error("HTTP 429 token SECRETKEY")), "HTTP 429");
let call;
const mockFetch = async (url, options) => {
  call = { url, options };
  return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ([{ data: [{ figi: "BBG000B9XRY4" }] }]) };
};
const got = await getJson(mockFetch, "https://api.openfigi.com/v3/mapping", { method: "POST", headers: { "content-type": "application/json" }, body: [sampleJobs[0]] });
assert.equal(got[0].data[0].figi, "BBG000B9XRY4");
assert.equal(call.options.method, "POST");
assert.equal(call.options.redirect, "error");
assert.equal(JSON.parse(call.options.body)[0].idType, "ID_ISIN");
await assert.rejects(getJson(async () => ({
  ok: true, headers: { get: () => "text/html" }, json: async () => ({ data: [] }),
}), "https://example.org"), /Unexpected content type/);
const script = await readFile(new URL("./check-free-reference-sources.mjs", import.meta.url), "utf8");
assert.match(script, /free-reference-source-status\.json/);
assert.match(script, /NASDAQ_ALLOW_FREE_DATASET_PROBE/);
assert.match(script, /EXISTING_COLLECTOR/);
assert.match(script, /RESEARCH_ONLY/);
assert.doesNotMatch(script, /submitOrder|sendOrder|broker\.placeOrder|liveTradingAllowed:\s*true/);
console.log("Free reference source integration OFFLINE regression PASS");
