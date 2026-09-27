export function sma(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i];
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(values: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (values.length <= period) return out;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gain += delta;
    else loss -= delta;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    const g = delta > 0 ? delta : 0;
    const l = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function stdev(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (period <= 1) return out;
  for (let i = period - 1; i < values.length; i++) {
    let mean = 0;
    for (let j = i - period + 1; j <= i; j++) mean += values[j];
    mean /= period;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = values[j] - mean;
      variance += d * d;
    }
    out[i] = Math.sqrt(variance / (period - 1));
  }
  return out;
}

export function bollinger(
  values: number[],
  period = 20,
  multiplier = 2,
): {
  mid: Array<number | null>;
  upper: Array<number | null>;
  lower: Array<number | null>;
} {
  const mid = sma(values, period);
  const sd = stdev(values, period);
  const upper: Array<number | null> = Array(values.length).fill(null);
  const lower: Array<number | null> = Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    if (mid[i] == null || sd[i] == null) continue;
    upper[i] = mid[i]! + multiplier * sd[i]!;
    lower[i] = mid[i]! - multiplier * sd[i]!;
  }
  return { mid, upper, lower };
}

export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): {
  macd: Array<number | null>;
  signal: Array<number | null>;
  histogram: Array<number | null>;
} {
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const macdLine: Array<number | null> = values.map((_, i) =>
    fastEma[i] == null || slowEma[i] == null ? null : fastEma[i]! - slowEma[i]!,
  );
  const macdValues = macdLine.map((v) => v ?? 0);
  const firstValid = macdLine.findIndex((v) => v != null);
  const signal: Array<number | null> = Array(values.length).fill(null);
  const histogram: Array<number | null> = Array(values.length).fill(null);

  if (firstValid >= 0) {
    const slice = macdValues.slice(firstValid);
    const signalSlice = ema(slice, signalPeriod);
    for (let i = 0; i < signalSlice.length; i++) {
      const idx = firstValid + i;
      signal[idx] = signalSlice[i];
      if (macdLine[idx] != null && signalSlice[i] != null) {
        histogram[idx] = macdLine[idx]! - signalSlice[i]!;
      }
    }
  }

  return { macd: macdLine, signal, histogram };
}

export function rollingMax(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let max = -Infinity;
    for (let j = i - period + 1; j <= i; j++) max = Math.max(max, values[j]);
    out[i] = max;
  }
  return out;
}

export function rollingMin(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let min = Infinity;
    for (let j = i - period + 1; j <= i; j++) min = Math.min(min, values[j]);
    out[i] = min;
  }
  return out;
}

export function roc(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  for (let i = period; i < values.length; i++) {
    if (values[i - period] === 0) continue;
    out[i] = values[i] / values[i - period] - 1;
  }
  return out;
}

export type AdxPoint = {
  adx: number | null;
  plusDi: number | null;
  minusDi: number | null;
};

/** Wilder ADX. First smoothed bar is the sum of the first `period` true ranges. */
export function adx(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): AdxPoint[] {
  const n = Math.min(highs.length, lows.length, closes.length);
  const out: AdxPoint[] = Array.from({ length: n }, () => ({
    adx: null,
    plusDi: null,
    minusDi: null,
  }));
  if (n <= period + 1) return out;

  const tr: number[] = [];
  const plusDm: number[] = [];
  const minusDm: number[] = [];
  for (let i = 1; i < n; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(
      Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1]),
      ),
    );
  }

  let smoothTr = 0;
  let smoothPlus = 0;
  let smoothMinus = 0;
  for (let i = 0; i < period; i++) {
    smoothTr += tr[i];
    smoothPlus += plusDm[i];
    smoothMinus += minusDm[i];
  }

  const dx: Array<number | null> = Array(n).fill(null);
  const plusDi: Array<number | null> = Array(n).fill(null);
  const minusDi: Array<number | null> = Array(n).fill(null);

  const writeDi = (index: number, atrSum: number, plusSum: number, minusSum: number) => {
    const pdi = atrSum === 0 ? 0 : (100 * plusSum) / atrSum;
    const mdi = atrSum === 0 ? 0 : (100 * minusSum) / atrSum;
    plusDi[index] = pdi;
    minusDi[index] = mdi;
    const sum = pdi + mdi;
    dx[index] = sum === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / sum;
  };

  writeDi(period, smoothTr, smoothPlus, smoothMinus);
  for (let i = period; i < tr.length; i++) {
    smoothTr = smoothTr - smoothTr / period + tr[i];
    smoothPlus = smoothPlus - smoothPlus / period + plusDm[i];
    smoothMinus = smoothMinus - smoothMinus / period + minusDm[i];
    writeDi(i + 1, smoothTr, smoothPlus, smoothMinus);
  }

  let adxSum = 0;
  let dxCount = 0;
  let adxValue = 0;
  let seeded = false;
  for (let i = period; i < n; i++) {
    if (dx[i] == null) continue;
    if (!seeded) {
      adxSum += dx[i]!;
      dxCount += 1;
      if (dxCount === period) {
        adxValue = adxSum / period;
        seeded = true;
        out[i] = { adx: adxValue, plusDi: plusDi[i], minusDi: minusDi[i] };
      }
      continue;
    }
    adxValue = (adxValue * (period - 1) + dx[i]!) / period;
    out[i] = { adx: adxValue, plusDi: plusDi[i], minusDi: minusDi[i] };
  }
  return out;
}
