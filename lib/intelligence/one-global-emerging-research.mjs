// Price and volume evidence from the already completed daily chart. No additional feed requests.
const positive = value => typeof value === "number" && Number.isFinite(value) && value > 0;
export const researchStages = ["APPROACHING_HIGH", "CLOSE_BREAKOUT", "VOLUME_BACKED_ACCELERATION", "NO_SETUP"];

export function completedBarResearch(rows, splits = {}) {
  const sample = rows.slice(-21);
  if (sample.length !== 21 || !splits || typeof splits !== "object" ||
      sample.some((row, index) => !positive(row.adjustedResearchClose) || !Number.isSafeInteger(row.timestamp) ||
        (index > 0 && row.timestamp <= sample[index - 1].timestamp))) return null;
  const prior = sample.slice(0, -1);
  const last = sample.at(-1);
  // An intervening split changes the volume unit. Withhold this window when the date is unknown.
  if (Object.values(splits).some(split => !Number.isSafeInteger(split?.date) ||
      (split.date >= prior[0].timestamp && split.date < last.timestamp + 86400))) return null;
  const closes = sample.map(row => row.adjustedResearchClose);
  const priorHigh = Math.max(...closes.slice(0, -1));
  const lastClose = closes.at(-1);
  const week = lastClose / closes.at(-6) - 1;
  const priorWeek = closes.at(-6) / closes.at(-11) - 1;
  const accelerating = week > 0 && week > priorWeek;
  let relativeVolume = null;
  let upVolumeShare = null;
  if (sample.every(row => positive(row.volume))) {
    relativeVolume = last.volume / (prior.reduce((sum, row) => sum + row.volume, 0) / prior.length);
    let up = 0, down = 0;
    for (let i = 1; i < sample.length; i++) {
      if (closes[i] > closes[i-1]) up += sample[i].volume;
      if (closes[i] < closes[i-1]) down += sample[i].volume;
    }
    if (up + down > 0) upVolumeShare = up / (up + down);
  }
  const unusualVolume = relativeVolume === null ? null : relativeVolume >= 1.5;
  const upVolumeDominant = upVolumeShare === null ? null : upVolumeShare > 0.5;
  // Fixed research hypotheses. These labels do not adjust decision scores.
  let stage = "NO_SETUP";
  if (lastClose > priorHigh) stage = "CLOSE_BREAKOUT";
  else if (accelerating && lastClose >= 0.98 * priorHigh) stage = "APPROACHING_HIGH";
  else if (accelerating && lastClose > closes.at(-2) && unusualVolume && upVolumeDominant)
    stage = "VOLUME_BACKED_ACCELERATION";
  return {stage, accelerating, unusualVolume, upVolumeDominant,
    barBucketAt: new Date(last.timestamp * 1000).toISOString()};
}
