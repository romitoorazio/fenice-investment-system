import fs from "node:fs/promises";
import { isValidIsin } from "../lib/trading/instrument-identity.ts";

const path = new URL("../data/instrument-master.json", import.meta.url);
const raw = await fs.readFile(path, "utf8");
const master = JSON.parse(raw);

const errors = [];
const ids = new Set();
const listings = new Set();
const DIRECTA_PILOT_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE"]);

function identifierValue(instrument, type) {
  const expected = String(type || "").toLowerCase();
  const identifiers = Array.isArray(instrument?.identifiers) ? instrument.identifiers : [];
  const match = identifiers.find((item) => String(item?.type || "").toLowerCase() === expected);
  return String(match?.value || "").trim().toUpperCase();
}

if (!Number.isInteger(Number(master.version)) || Number(master.version) < 1) errors.push("master: version must be a positive integer");
if (!Number.isFinite(Date.parse(String(master.generatedAt || "")))) errors.push("master: generatedAt must be a valid timestamp");
if (!Array.isArray(master.instruments) || master.instruments.length === 0) errors.push("master: instruments must be a non-empty array");

for (const [index, instrument] of (Array.isArray(master.instruments) ? master.instruments : []).entries()) {
  const prefix = `instruments[${index}]`;
  for (const field of ["id", "name", "assetClass", "status", "country", "region", "currency"]) {
    if (!instrument[field]) errors.push(`${prefix}: missing ${field}`);
  }
  if (ids.has(instrument.id)) errors.push(`${prefix}: duplicate id ${instrument.id}`);
  ids.add(instrument.id);

  if (!Array.isArray(instrument.identifiers)) errors.push(`${prefix}: identifiers must be an array`);
  if (!Array.isArray(instrument.primarySources) || instrument.primarySources.length === 0) {
    errors.push(`${prefix}: at least one primary source is required`);
  }

  const assetClass = String(instrument.assetClass || "").toLowerCase();
  const ticker = String(instrument.ticker || "").trim().toUpperCase();
  const mic = String(instrument.exchangeMic || "").trim().toUpperCase();
  const isListedSecurity = assetClass === "equity" || assetClass === "etf";
  if (isListedSecurity && !ticker) errors.push(`${prefix}: listed security requires ticker`);
  if (isListedSecurity && !mic) errors.push(`${prefix}: listed security requires exchangeMic`);
  if (ticker && mic) {
    const listingKey = `${ticker}:${mic}`;
    if (listings.has(listingKey)) errors.push(`${prefix}: duplicate listing ${listingKey}`);
    listings.add(listingKey);
  }

  if (DIRECTA_PILOT_MICS.has(mic) && isListedSecurity) {
    const isin = identifierValue(instrument, "isin");
    if (!isValidIsin(isin)) {
      errors.push(`${prefix}: Directa pilot listing ${ticker}:${mic} requires a checksum-valid ISIN identity`);
    }
  }
}

if (errors.length > 0) {
  console.error(`Instrument master validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const byAssetClass = master.instruments.reduce((result, instrument) => {
  result[instrument.assetClass] = (result[instrument.assetClass] ?? 0) + 1;
  return result;
}, {});
const directaPilotListings = master.instruments.filter((instrument) => {
  const assetClass = String(instrument.assetClass || "").toLowerCase();
  return (assetClass === "equity" || assetClass === "etf")
    && DIRECTA_PILOT_MICS.has(String(instrument.exchangeMic || "").toUpperCase());
}).length;

console.log(
  JSON.stringify(
    {
      valid: true,
      coverage: master.coverage,
      instruments: master.instruments.length,
      directaPilotListings,
      byAssetClass,
    },
    null,
    2,
  ),
);
