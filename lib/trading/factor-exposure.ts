export type FactorSeries = Record<string, number[]>;

export type FactorExposureResult = {
  state: "RELIABLE" | "WEAK" | "INSUFFICIENT";
  observations: number;
  intercept: number | null;
  betas: Record<string, number>;
  rSquared: number | null;
  residualVolatility: number | null;
  reasons: string[];
};

export type FactorExposureOptions = {
  minObservations?: number;
  ridge?: number;
  weakRSquared?: number;
};

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const n = vector.length;
  const augmented = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(augmented[row][col]) > Math.abs(augmented[pivot][col])) pivot = row;
    }
    if (Math.abs(augmented[pivot][col]) < 1e-12) return null;
    [augmented[col], augmented[pivot]] = [augmented[pivot], augmented[col]];
    const divisor = augmented[col][col];
    for (let j = col; j <= n; j += 1) augmented[col][j] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = augmented[row][col];
      if (factor === 0) continue;
      for (let j = col; j <= n; j += 1) augmented[row][j] -= factor * augmented[col][j];
    }
  }
  return augmented.map((row) => row[n]);
}

export function estimateFactorExposure(
  assetReturns: readonly number[],
  factorSeries: FactorSeries,
  options: FactorExposureOptions = {},
): FactorExposureResult {
  const minObservations = Math.max(20, Number(options.minObservations ?? 60));
  const ridge = Math.max(0, Number(options.ridge ?? 1e-6));
  const weakRSquared = Math.max(0, Math.min(1, Number(options.weakRSquared ?? 0.2)));
  const factorNames = Object.keys(factorSeries || {}).sort();
  const reasons: string[] = [];

  if (!factorNames.length) {
    return {
      state: "INSUFFICIENT",
      observations: 0,
      intercept: null,
      betas: {},
      rSquared: null,
      residualVolatility: null,
      reasons: ["no factor series supplied"],
    };
  }

  const length = Math.min(
    assetReturns.length,
    ...factorNames.map((name) => Array.isArray(factorSeries[name]) ? factorSeries[name].length : 0),
  );
  const rows: number[][] = [];
  const y: number[] = [];
  for (let i = 0; i < length; i += 1) {
    const target = Number(assetReturns[i]);
    const factors = factorNames.map((name) => Number(factorSeries[name][i]));
    if (!Number.isFinite(target) || factors.some((value) => !Number.isFinite(value))) continue;
    rows.push([1, ...factors]);
    y.push(target);
  }

  if (rows.length < minObservations) {
    return {
      state: "INSUFFICIENT",
      observations: rows.length,
      intercept: null,
      betas: {},
      rSquared: null,
      residualVolatility: null,
      reasons: [`factor regression requires at least ${minObservations} aligned observations`],
    };
  }

  const columns = factorNames.length + 1;
  const xtx = Array.from({ length: columns }, () => Array(columns).fill(0));
  const xty = Array(columns).fill(0);
  for (let r = 0; r < rows.length; r += 1) {
    for (let i = 0; i < columns; i += 1) {
      xty[i] += rows[r][i] * y[r];
      for (let j = 0; j < columns; j += 1) xtx[i][j] += rows[r][i] * rows[r][j];
    }
  }
  for (let i = 1; i < columns; i += 1) xtx[i][i] += ridge;

  const coefficients = solveLinearSystem(xtx, xty);
  if (!coefficients) {
    return {
      state: "INSUFFICIENT",
      observations: rows.length,
      intercept: null,
      betas: {},
      rSquared: null,
      residualVolatility: null,
      reasons: ["factor regression matrix is singular"],
    };
  }

  const meanY = y.reduce((sum, value) => sum + value, 0) / y.length;
  let residualSumSquares = 0;
  let totalSumSquares = 0;
  for (let r = 0; r < rows.length; r += 1) {
    const predicted = rows[r].reduce((sum, value, index) => sum + value * coefficients[index], 0);
    const residual = y[r] - predicted;
    residualSumSquares += residual * residual;
    const centered = y[r] - meanY;
    totalSumSquares += centered * centered;
  }
  const rSquared = totalSumSquares > 0 ? Math.max(0, Math.min(1, 1 - residualSumSquares / totalSumSquares)) : 0;
  const residualVolatility = Math.sqrt(residualSumSquares / Math.max(1, rows.length - columns));
  const betas = Object.fromEntries(
    factorNames.map((name, index) => [name, Number(coefficients[index + 1].toFixed(6))]),
  );

  let state: FactorExposureResult["state"] = "RELIABLE";
  if (rSquared < weakRSquared) {
    state = "WEAK";
    reasons.push(`factor model explanatory power is weak: R² ${rSquared.toFixed(3)} < ${weakRSquared}`);
  }

  return {
    state,
    observations: rows.length,
    intercept: Number(coefficients[0].toFixed(8)),
    betas,
    rSquared: Number(rSquared.toFixed(4)),
    residualVolatility: Number(residualVolatility.toFixed(8)),
    reasons,
  };
}
