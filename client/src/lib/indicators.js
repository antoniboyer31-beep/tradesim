export function sma(values, n) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

export function ema(values, n) {
  const out = new Array(values.length).fill(null);
  const k = 2 / (n + 1);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    if (prev == null) {
      if (i >= n - 1) {
        let s = 0;
        for (let j = i - n + 1; j <= i; j++) s += values[j];
        prev = s / n;
        out[i] = prev;
      }
      continue;
    }
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function bollinger(values, n = 20, mult = 2) {
  const mid = sma(values, n);
  const upper = new Array(values.length).fill(null);
  const lower = new Array(values.length).fill(null);
  for (let i = n - 1; i < values.length; i++) {
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += (values[j] - mid[i]) ** 2;
    const sd = Math.sqrt(s / n);
    upper[i] = mid[i] + mult * sd;
    lower[i] = mid[i] - mult * sd;
  }
  return { mid, upper, lower };
}

export function rsi(values, n = 14) {
  const out = new Array(values.length).fill(null);
  let gain = 0, loss = 0;
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = Math.max(0, d), l = Math.max(0, -d);
    if (i <= n) {
      gain += g; loss += l;
      if (i === n) { gain /= n; loss /= n; out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss); }
    } else {
      gain = (gain * (n - 1) + g) / n;
      loss = (loss * (n - 1) + l) / n;
      out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    }
  }
  return out;
}

export function macd(values, fast = 12, slow = 26, signal = 9) {
  const ef = ema(values, fast), es = ema(values, slow);
  const line = values.map((_, i) => (ef[i] != null && es[i] != null ? ef[i] - es[i] : null));
  const firstIdx = line.findIndex((v) => v != null);
  const sig = new Array(values.length).fill(null);
  if (firstIdx >= 0) {
    const sub = ema(line.slice(firstIdx), signal);
    for (let i = 0; i < sub.length; i++) sig[firstIdx + i] = sub[i];
  }
  const hist = line.map((v, i) => (v != null && sig[i] != null ? v - sig[i] : null));
  return { line, signal: sig, hist };
}

export function atr(candles, n = 14) {
  const out = new Array(candles.length).fill(null);
  let prev = null;
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    const tr = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    if (i < n) continue;
    if (prev == null) {
      let s = 0;
      for (let j = i - n + 1; j <= i; j++) {
        const cj = candles[j], pj = candles[j - 1];
        s += Math.max(cj.high - cj.low, Math.abs(cj.high - pj.close), Math.abs(cj.low - pj.close));
      }
      prev = s / n;
    } else prev = (prev * (n - 1) + tr) / n;
    out[i] = prev;
  }
  return out;
}

export function stochastic(candles, n = 14, d = 3) {
  const k = new Array(candles.length).fill(null);
  for (let i = n - 1; i < candles.length; i++) {
    let hi = -Infinity, lo = Infinity;
    for (let j = i - n + 1; j <= i; j++) { hi = Math.max(hi, candles[j].high); lo = Math.min(lo, candles[j].low); }
    k[i] = hi === lo ? 50 : ((candles[i].close - lo) / (hi - lo)) * 100;
  }
  const first = k.findIndex((v) => v != null);
  const dd = new Array(candles.length).fill(null);
  if (first >= 0) {
    const s = sma(k.slice(first), d);
    for (let i = 0; i < s.length; i++) dd[first + i] = s[i];
  }
  return { k, d: dd };
}

export function vwap(candles) {
  let pv = 0, v = 0;
  return candles.map((c) => {
    const tp = (c.high + c.low + c.close) / 3;
    pv += tp * c.volume;
    v += c.volume;
    return v ? pv / v : null;
  });
}

export function heikinAshi(candles) {
  const out = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const close = (c.open + c.high + c.low + c.close) / 4;
    const open = i === 0 ? (c.open + c.close) / 2 : (out[i - 1].open + out[i - 1].close) / 2;
    out.push({ time: c.time, open, close, high: Math.max(c.high, open, close), low: Math.min(c.low, open, close) });
  }
  return out;
}

// Supports / résistances : regroupe les sommets et creux locaux proches en zones.
export function supportResistance(candles, lookback = 300, wing = 5) {
  const start = Math.max(wing, candles.length - lookback);
  const pivots = [];
  for (let i = start; i < candles.length - wing; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - wing; j <= i + wing; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }
    if (isHigh) pivots.push(candles[i].high);
    if (isLow) pivots.push(candles[i].low);
  }
  if (!pivots.length) return [];
  pivots.sort((a, b) => a - b);
  const last = candles[candles.length - 1].close;
  const tol = last * 0.004 + (pivots[pivots.length - 1] - pivots[0]) * 0.01;
  const zones = [];
  for (const p of pivots) {
    const z = zones[zones.length - 1];
    if (z && p - z.max <= tol) { z.max = p; z.sum += p; z.n++; }
    else zones.push({ min: p, max: p, sum: p, n: 1 });
  }
  return zones.map((z) => ({ price: z.sum / z.n, touches: z.n })).sort((a, b) => b.touches - a.touches).slice(0, 8);
}
