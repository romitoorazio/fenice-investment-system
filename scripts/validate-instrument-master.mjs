import fs from "node:fs/promises";

const path = new URL("../data/instrument-master.json", import.meta.url);
const raw = await fs.readFile(path, "utf8");
const master = JSON.parse(raw);

const errors = [];
const ids = new Set();

for (const [index, instrument] of master.instruments.entries()) {
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
  if (instrument.assetClass === "equity" && !instrument.exchangeMic) {
    errors.push(`${prefix}: equity requires exchangeMic`);
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

console.log(
  JSON.stringify(
    {
      valid: true,
      coverage: master.coverage,
      instruments: master.instruments.length,
      byAssetClass,
    },
    null,
    2,
  ),
);
