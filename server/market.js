import { COINS, COIN_MAP } from './coins.js';
import { coinNews, marketNews, randomUser } from './social.js';

export const SEC = 1, MIN = 60, HOUR = 3600, DAY = 86400, YEAR = 365 * DAY;
export const S1_KEEP = 3 * HOUR;
export const M1_KEEP = 7 * DAY;
export const H1_KEEP = 3 * YEAR;

let spare = null;
export function randn() {
  if (spare !== null) { const s = spare; spare = null; return s; }
  let u = 0;
  while (u === 0) u = Math.random();
  const v = Math.random();
  const r = Math.sqrt(-2 * Math.log(u));
  spare = r * Math.sin(2 * Math.PI * v);
  return r * Math.cos(2 * Math.PI * v);
}
const rand = (a, b) => a + Math.random() * (b - a);
function pickWeighted(weights) {
  const entries = Object.entries(weights);
  let total = 0;
  for (const [, w] of entries) total += w;
  let r = Math.random() * total;
  for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
  return entries[entries.length - 1][0];
}

// drift = rendement logarithmique quotidien moyen, vol = multiplicateur de volatilité,
// dur = durée en heures, extreme = amplifié par le "tail" de la monnaie.
export const COIN_REGIMES = {
  accumulation: { label: 'Accumulation', drift: 0.002, vol: 0.6, dur: [12, 72], next: { uptrend: 4, range: 3, downtrend: 1, squeeze: 0.4, pump: 0.3 } },
  uptrend: { label: 'Tendance haussière', drift: 0.022, vol: 1.0, dur: [12, 120], next: { distribution: 3, range: 2.5, parabolic: 0.8, uptrend: 1, pullback: 2.5 } },
  pullback: { label: 'Correction', drift: -0.12, vol: 1.1, dur: [2, 12], next: { uptrend: 3, range: 2, downtrend: 1 } },
  parabolic: { label: 'Euphorie', drift: 0.09, vol: 1.5, dur: [4, 30], next: { distribution: 3, capitulation: 1, pullback: 2 }, extreme: true },
  distribution: { label: 'Distribution', drift: -0.003, vol: 0.95, dur: [12, 60], next: { downtrend: 4, range: 2, uptrend: 1, dump: 0.3 } },
  downtrend: { label: 'Tendance baissière', drift: -0.022, vol: 1.1, dur: [12, 120], next: { accumulation: 3, range: 2.5, capitulation: 0.6, relief: 2.5, downtrend: 1 } },
  relief: { label: 'Rebond technique', drift: 0.12, vol: 1.1, dur: [2, 12], next: { downtrend: 3, range: 2, uptrend: 1 } },
  capitulation: { label: 'Capitulation', drift: -0.6, vol: 2.4, dur: [1, 5], next: { accumulation: 3, relief: 3, range: 1 }, extreme: true },
  range: { label: 'Range', drift: 0, vol: 0.7, dur: [6, 72], meanRevert: true, next: { uptrend: 2, downtrend: 2, accumulation: 1, distribution: 1, pump: 0.35, squeeze: 0.3, dump: 0.2 } },
  pump: { label: 'Pump', drift: 0.9, vol: 2.2, dur: [0.5, 3], next: { dump: 2.5, distribution: 2, range: 1 }, extreme: true },
  dump: { label: 'Dump', drift: -0.8, vol: 2.2, dur: [0.5, 3], next: { range: 2, accumulation: 1, downtrend: 1 }, extreme: true },
  squeeze: { label: 'Short squeeze', drift: 1.0, vol: 2.0, dur: [0.3, 1.5], next: { distribution: 1, uptrend: 2, pullback: 2 }, extreme: true },
};

export const MARKET_REGIMES = {
  neutral: { label: 'Neutre', drift: 0, vol: 1, dur: [24, 168], next: { bull: 2, bear: 2, neutral: 1 } },
  bull: { label: 'Marché haussier', drift: 0.01, vol: 0.9, dur: [48, 336], next: { neutral: 2, euphoria: 0.7, bear: 1 } },
  euphoria: { label: 'Euphorie', drift: 0.05, vol: 1.3, dur: [6, 48], next: { neutral: 1, panic: 0.8, bear: 1.5 } },
  bear: { label: 'Marché baissier', drift: -0.01, vol: 1.2, dur: [48, 336], next: { neutral: 2, panic: 0.6, bull: 1 } },
  panic: { label: 'Panique', drift: -0.4, vol: 2.5, dur: [1, 6], next: { neutral: 1.5, bear: 2, bull: 0.3 } },
};

const MARKET_VOL = 0.4 / Math.sqrt(YEAR);
const FUNDAMENTAL_THETA = Math.LN2 / (25 * DAY);
const RANGE_THETA = 1 / (3 * HOUR);
const CLUSTER_DECAY = 4 * HOUR;

function seasonality(t) {
  const h = (t % DAY) / HOUR;
  return 1 + 0.35 * Math.sin(((h - 9) / 24) * 2 * Math.PI);
}

export function bucketStart(t, tf) {
  if (tf === '1w') return Math.floor((t + 3 * DAY) / (7 * DAY)) * 7 * DAY - 3 * DAY;
  if (tf === '1M') {
    const d = new Date(t * 1000);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
  }
  const s = TIMEFRAMES[tf].sec;
  return Math.floor(t / s) * s;
}

export const TIMEFRAMES = {
  '1s': { src: 's1', sec: 1 }, '5s': { src: 's1', sec: 5 }, '15s': { src: 's1', sec: 15 }, '30s': { src: 's1', sec: 30 },
  '1m': { src: 'm1', sec: 60 }, '3m': { src: 'm1', sec: 180 }, '5m': { src: 'm1', sec: 300 }, '15m': { src: 'm1', sec: 900 }, '30m': { src: 'm1', sec: 1800 },
  '1h': { src: 'h1', sec: 3600 }, '2h': { src: 'h1', sec: 7200 }, '4h': { src: 'h1', sec: 14400 }, '12h': { src: 'h1', sec: 43200 },
  '1d': { src: 'h1', sec: DAY }, '1w': { src: 'h1', sec: 7 * DAY }, '1M': { src: 'h1', sec: 30 * DAY },
};

function round(x) {
  return Number(x.toPrecision(8));
}

function addTick(series, bucket, price, vol) {
  const last = series[series.length - 1];
  if (last && last[0] === bucket) {
    if (price > last[2]) last[2] = price;
    if (price < last[3]) last[3] = price;
    last[4] = price;
    last[5] += vol;
  } else {
    const open = last ? last[4] : price;
    series.push([bucket, open, Math.max(open, price), Math.min(open, price), price, vol]);
  }
}

function lowerBound(series, t) {
  let lo = 0, hi = series.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (series[mid][0] < t) lo = mid + 1; else hi = mid; }
  return lo;
}

export class Market {
  constructor() {
    this.coins = {};
    this.market = null;
    this.news = [];
    this.trades = {};
    this.time = 0;
    this.s1From = 0;
    this.m1From = 0;
    this.onStep = null;
    this.onNews = null;
    this.nextNewsId = 1;
    this.stats = {};
  }

  initFresh(now) {
    this.time = now - H1_KEEP;
    this.market = { regime: 'neutral', regimeEnd: this.time + 48 * HOUR, c: 1, level: 1000 };
    for (const coin of COINS) {
      const start = coin.base * Math.exp(randn() * 0.45);
      this.coins[coin.sym] = this.newCoinState(coin, start, this.time);
    }
    this.simulate(now);
    this.rebase();
  }

  // Recale tout l'historique pour que le prix actuel corresponde exactement au prix de base.
  rebase() {
    for (const coin of COINS) {
      const cs = this.coins[coin.sym];
      const k = coin.base / cs.price;
      for (const key of ['s1', 'm1', 'h1']) {
        for (const c of cs[key]) { c[1] = round(c[1] * k); c[2] = round(c[2] * k); c[3] = round(c[3] * k); c[4] = round(c[4] * k); c[5] /= k; }
      }
      cs.price = coin.base;
      const lk = Math.log(k);
      cs.rangeCenter += lk;
      cs.logF = Math.log(coin.base);
    }
    this.computeStats();
  }

  newCoinState(coin, price, t) {
    return {
      sym: coin.sym, price, logF: Math.log(coin.base), regime: 'range', regimeEnd: t + rand(6, 48) * HOUR,
      rangeCenter: Math.log(price), c: 1, s1: [], m1: [], h1: [],
    };
  }

  load(data) {
    this.time = data.time;
    this.market = data.market;
    this.news = data.news || [];
    this.nextNewsId = data.nextNewsId || 1;
    for (const coin of COINS) {
      const saved = data.coins[coin.sym];
      if (saved) this.coins[coin.sym] = { ...saved, s1: [] };
      else this.coins[coin.sym] = this.newCoinState(coin, coin.base, this.time);
    }
  }

  *serializeChunks() {
    const pack = (arr, d) => arr.map((c) => [c[0], +c[1].toPrecision(d), +c[2].toPrecision(d), +c[3].toPrecision(d), +c[4].toPrecision(d), +c[5].toPrecision(3)]);
    yield `{"time":${this.time},"market":${JSON.stringify(this.market)},"news":${JSON.stringify(this.news.slice(-200))},"nextNewsId":${this.nextNewsId},"coins":{`;
    let first = true;
    for (const [sym, cs] of Object.entries(this.coins)) {
      const { s1, m1, h1, ...rest } = cs;
      yield (first ? '' : ',') + JSON.stringify(sym) + ':' + JSON.stringify({ ...rest, m1: pack(m1, 7), h1: pack(h1, 6) });
      first = false;
    }
    yield '}}';
  }

  // Avance la simulation jusqu'à `to` avec un pas adapté à l'ancienneté :
  // 5 min pour l'historique lointain, 15 s pour la semaine écoulée, 0,25 s pour les 3 dernières heures.
  simulate(to) {
    this.s1From = to - S1_KEEP;
    this.m1From = to - M1_KEEP;
    let t = this.time;
    let n = 0;
    while (t < to) {
      const age = to - t;
      const dt = age > M1_KEEP ? 300 : age > S1_KEEP ? 15 : 0.25;
      const nt = Math.min(to, t + dt);
      this.step(nt - t, nt, false);
      t = nt;
      if (++n % 20000 === 0) this.trim(t);
    }
    this.time = to;
    this.s1From = 0;
    this.m1From = 0;
    this.trim(to);
    this.computeStats();
  }

  trim(now) {
    for (const cs of Object.values(this.coins)) {
      for (const [key, keep] of [['s1', S1_KEEP], ['m1', M1_KEEP], ['h1', H1_KEEP]]) {
        const arr = cs[key];
        if (!arr.length) continue;
        const idx = lowerBound(arr, now - keep);
        if (idx > 0) arr.splice(0, idx);
      }
    }
  }

  pushNews(item) {
    item.id = this.nextNewsId++;
    this.news.push(item);
    if (this.news.length > 300) this.news.splice(0, this.news.length - 200);
    this.onNews?.(item);
  }

  switchMarketRegime(t) {
    const m = this.market;
    const cur = MARKET_REGIMES[m.regime];
    m.regime = pickWeighted(cur.next);
    const r = MARKET_REGIMES[m.regime];
    m.regimeEnd = t + rand(r.dur[0], r.dur[1]) * HOUR;
  }

  switchCoinRegime(cs, t) {
    const cur = COIN_REGIMES[cs.regime];
    const weights = { ...cur.next };
    const mr = this.market.regime;
    // Le régime du marché global biaise les régimes individuels, comme en vrai.
    if (mr === 'bull' || mr === 'euphoria') { weights.uptrend = (weights.uptrend || 0) * 1.6; weights.pump = (weights.pump || 0) * 1.5; }
    if (mr === 'bear' || mr === 'panic') { weights.downtrend = (weights.downtrend || 0) * 1.6; weights.dump = (weights.dump || 0) * 1.5; weights.capitulation = (weights.capitulation || 0) * 1.5; }
    cs.regime = pickWeighted(weights);
    const r = COIN_REGIMES[cs.regime];
    cs.regimeEnd = t + rand(r.dur[0], r.dur[1]) * HOUR;
    if (r.meanRevert) cs.rangeCenter = Math.log(cs.price);
    if ((cs.regime === 'pump' || cs.regime === 'squeeze') && Math.random() < 0.35) {
      this.pushNews({ t, sym: cs.sym, title: coinNews(COIN_MAP[cs.sym], true), impact: 'up', kind: 'rumeur' });
    }
    if ((cs.regime === 'dump' || cs.regime === 'capitulation') && Math.random() < 0.35) {
      this.pushNews({ t, sym: cs.sym, title: coinNews(COIN_MAP[cs.sym], false), impact: 'down', kind: 'rumeur' });
    }
  }

  step(dt, t, live) {
    const m = this.market;
    if (t >= m.regimeEnd) this.switchMarketRegime(t);
    const mr = MARKET_REGIMES[m.regime];
    const sq = Math.sqrt(dt);
    m.c = 1 + (m.c - 1) * Math.exp(-dt / CLUSTER_DECAY);
    m.c *= Math.exp(0.03 * Math.sqrt(dt / 60) * randn());
    m.c = Math.min(4, Math.max(0.5, m.c));
    let mret = (mr.drift / DAY) * dt + MARKET_VOL * mr.vol * m.c * sq * randn();
    if (Math.random() < dt / (6 * DAY)) {
      const up = Math.random() < 0.5;
      const size = (up ? 1 : -1) * rand(0.015, 0.05);
      mret += size;
      m.c += 0.8;
      this.pushNews({ t, sym: null, title: marketNews(up), impact: up ? 'up' : 'down', kind: 'macro', move: size });
    }
    m.level *= Math.exp(mret);

    const season = seasonality(t);
    const keepS1 = live || t >= this.s1From;
    const keepM1 = live || t >= this.m1From;
    const b1 = Math.floor(t);
    const bm = Math.floor(t / 60) * 60;
    const bh = Math.floor(t / 3600) * 3600;

    for (const coin of COINS) {
      const cs = this.coins[coin.sym];
      if (t >= cs.regimeEnd) this.switchCoinRegime(cs, t);
      const r = COIN_REGIMES[cs.regime];
      const amp = r.extreme ? coin.tail : 1;
      const logP = Math.log(cs.price);
      let drift = (r.drift * amp * Math.min(1.3, coin.vol / 0.75) / DAY) * dt;
      if (r.meanRevert) drift -= (logP - cs.rangeCenter) * Math.min(1, dt * RANGE_THETA);
      drift -= (logP - cs.logF) * dt * FUNDAMENTAL_THETA;
      const sig = (coin.vol / Math.sqrt(YEAR)) * r.vol * cs.c;
      let z = randn();
      if (Math.random() < 0.01) z *= 2.5;
      let ret = coin.beta * mret * Math.min(1, 0.5 + coin.vol) + drift + sig * sq * z;
      let shock = 0;
      if (Math.random() < (dt / DAY) * coin.jumpRate) {
        const regimeBias = r.drift > 0 ? 0.62 : r.drift < 0 ? 0.38 : 0.5;
        const up = Math.random() < regimeBias;
        shock = (up ? 1 : -1) * Math.min(0.35, Math.exp(randn() * 0.5) * 0.035 * coin.tail);
        ret += shock;
        cs.c += 0.6 + Math.abs(shock) * 6;
        this.pushNews({ t, sym: coin.sym, title: coinNews(coin, up), impact: up ? 'up' : 'down', kind: 'actu', move: shock });
      }
      cs.c = 1 + (cs.c - 1) * Math.exp(-dt / CLUSTER_DECAY);
      cs.c *= Math.exp(0.03 * Math.sqrt(dt / 60) * randn());
      cs.c = Math.min(3.5, Math.max(0.45, cs.c));
      cs.logF += 0.4 * coin.beta * mret + (0.15 / Math.sqrt(YEAR)) * sq * randn();

      const prev = cs.price;
      cs.price = Math.max(1e-10, prev * Math.exp(ret));
      const price = round(cs.price);
      const volUsd = coin.volume * (dt / DAY) * r.vol * cs.c * season * (0.25 + 0.75 * Math.abs(z)) * (1 + Math.abs(shock) * 40);
      const vol = volUsd / price;

      if (keepS1) addTick(cs.s1, b1, price, vol);
      if (keepM1) addTick(cs.m1, bm, price, vol);
      addTick(cs.h1, bh, price, vol);

      if (live) this.genTrades(coin, cs, prev, dt, t);
      if (this.onStep) {
        const lo = Math.min(prev, cs.price), hi = Math.max(prev, cs.price);
        this.onStep(coin.sym, lo, hi, cs.price, t);
      }
    }
    this.time = t;
  }

  genTrades(coin, cs, prev, dt, t) {
    const list = this.trades[coin.sym] || (this.trades[coin.sym] = []);
    const rate = Math.min(12, Math.log10(coin.volume) - 6) * COIN_REGIMES[cs.regime].vol * cs.c;
    const n = Math.random() < rate * dt * 0.6 ? 1 + Math.floor(Math.random() * Math.min(4, rate)) : 0;
    const upBias = cs.price >= prev ? 0.65 : 0.35;
    for (let i = 0; i < n; i++) {
      const buy = Math.random() < upBias;
      const p = cs.price * (1 + (buy ? 1 : -1) * coin.spread * 0.5);
      const usd = Math.exp(randn() * 1.4) * 400 * Math.max(1, Math.log10(coin.volume) - 7);
      list.push({ t: t * 1000 + i, p: round(p), q: usd / p, side: buy ? 'buy' : 'sell', user: randomUser() });
    }
    if (list.length > 60) list.splice(0, list.length - 40);
  }

  orderBook(sym, depth = 18) {
    const coin = COIN_MAP[sym];
    const cs = this.coins[sym];
    const p = cs.price;
    const tick = p * Math.max(coin.spread, 0.00002);
    const baseUsd = coin.volume / 6000;
    const side = (dir) => {
      const rows = [];
      for (let i = 0; i < depth; i++) {
        const price = p + dir * tick * (0.5 + i * (1 + i * 0.12));
        let usd = baseUsd * (0.25 + Math.random()) * (1 + i * 0.08);
        if (Math.random() < 0.05) usd *= 5 + Math.random() * 8;
        rows.push([round(price), usd / price]);
      }
      return rows;
    };
    return { sym, bids: side(-1), asks: side(1), t: Date.now() };
  }

  computeStats() {
    const now = this.time;
    for (const coin of COINS) {
      const cs = this.coins[coin.sym];
      const m1 = cs.m1;
      const i24 = lowerBound(m1, now - DAY);
      const i1h = lowerBound(m1, now - HOUR);
      let hi = -Infinity, lo = Infinity, vol = 0;
      for (let i = i24; i < m1.length; i++) {
        const c = m1[i];
        if (c[2] > hi) hi = c[2];
        if (c[3] < lo) lo = c[3];
        vol += c[5] * c[4];
      }
      const o24 = m1[i24] ? m1[i24][1] : cs.price;
      const o1h = m1[i1h] ? m1[i1h][1] : cs.price;
      const h1 = cs.h1;
      const i7 = lowerBound(h1, now - 7 * DAY);
      const o7 = h1[i7] ? h1[i7][1] : cs.price;
      const i30 = lowerBound(h1, now - 30 * DAY);
      const o30 = h1[i30] ? h1[i30][1] : cs.price;
      const spark = [];
      for (let i = i24; i < m1.length; i += 30) spark.push(m1[i][4]);
      spark.push(cs.price);
      this.stats[coin.sym] = {
        sym: coin.sym, price: round(cs.price),
        ch1h: (cs.price / o1h - 1) * 100, ch24: (cs.price / o24 - 1) * 100,
        ch7d: (cs.price / o7 - 1) * 100, ch30d: (cs.price / o30 - 1) * 100,
        high24: hi, low24: lo, vol24: vol, spark,
        vola: COIN_REGIMES[cs.regime].vol * cs.c,
      };
    }
  }

  tickers() {
    const out = [];
    for (const coin of COINS) {
      const st = this.stats[coin.sym];
      const price = round(this.coins[coin.sym].price);
      out.push({ ...st, price, spark: undefined });
    }
    return out;
  }

  candles(sym, tf, limit = 1500) {
    const cs = this.coins[sym];
    const spec = TIMEFRAMES[tf];
    if (!cs || !spec) return null;
    const src = cs[spec.src];
    const srcSec = spec.src === 's1' ? 1 : spec.src === 'm1' ? 60 : 3600;
    const ratio = Math.max(1, Math.ceil(spec.sec / srcSec));
    const start = Math.max(0, src.length - limit * ratio - ratio);
    const out = [];
    for (let i = start; i < src.length; i++) {
      const c = src[i];
      const b = bucketStart(c[0], tf);
      const last = out[out.length - 1];
      if (last && last[0] === b) {
        if (c[2] > last[2]) last[2] = c[2];
        if (c[3] < last[3]) last[3] = c[3];
        last[4] = c[4];
        last[5] += c[5];
      } else {
        out.push([b, c[1], c[2], c[3], c[4], c[5]]);
      }
    }
    return out.length > limit ? out.slice(out.length - limit) : out;
  }

  lastCandle(sym, tf) {
    const cs = this.coins[sym];
    const spec = TIMEFRAMES[tf];
    if (!cs || !spec) return null;
    const src = cs[spec.src];
    if (!src.length) return null;
    const b = bucketStart(src[src.length - 1][0], tf);
    let i = src.length - 1;
    while (i > 0 && src[i - 1][0] >= b) i--;
    const first = src[i];
    const out = [b, first[1], first[2], first[3], first[4], 0];
    for (let j = i; j < src.length; j++) {
      const c = src[j];
      if (c[2] > out[2]) out[2] = c[2];
      if (c[3] < out[3]) out[3] = c[3];
      out[4] = c[4];
      out[5] += c[5];
    }
    return out;
  }

  regimeInfo() {
    return {
      market: { regime: this.market.regime, label: MARKET_REGIMES[this.market.regime].label, level: this.market.level },
    };
  }
}
