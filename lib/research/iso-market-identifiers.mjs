export const ISO_MIC_URL = "https://www.iso20022.org/sites/default/files/ISO10383_MIC/ISO10383_MIC.csv";

export function readActiveMarketIdentifiers(csv) {
  const lines = csv.replace(/^\uFEFF/, "").trimEnd().split(/\r?\n/);
  const fields = (line) => Array.from(line.matchAll(/(?:^|,)(?:"((?:[^"]|"")*)"|([^",]*))(?=,|$)/g), match => match[1] ?? match[2]);
  const header = fields(lines.shift());
  const indexes = ["MIC", "OPERATING MIC", "ISO COUNTRY CODE (ISO 3166)", "STATUS"]
    .map(column => header.indexOf(column));
  if (indexes.includes(-1)) throw Error("WORLD_ISO_MIC_INVALID_HEADER");

  const active = new Map();
  for (const line of lines) {
    const cells = fields(line);
    if (cells.length !== header.length) throw Error("WORLD_ISO_MIC_INVALID_ROW");
    const [mic, operatingMic, country, status] = indexes.map(index => cells[index]);
    if (status !== "ACTIVE" || !/^[A-Z]{2}$/.test(country)) continue;
    if (!/^[A-Z0-9]{4}$/.test(mic) || !/^[A-Z0-9]{4}$/.test(operatingMic) || active.has(mic)) {
      throw Error("WORLD_ISO_MIC_INVALID_IDENTITY");
    }
    active.set(mic, { country, operatingMic });
  }
  if (!active.size) throw Error("WORLD_ISO_MIC_EMPTY");
  return active;
}
