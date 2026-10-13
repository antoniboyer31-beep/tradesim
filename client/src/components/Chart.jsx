import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, AreaSeries, CrosshairMode, LineStyle, createSeriesMarkers } from 'lightweight-charts';
import { onCandle, setState, useStore, api } from '../lib/store.js';
import { sma, ema, bollinger, rsi, macd, stochastic, vwap, heikinAshi, supportResistance } from '../lib/indicators.js';
import { analyze } from '../lib/analysis.js';
import { decimalsFor, fmtPrice, fmtCompact } from '../lib/format.js';

const TZ = -new Date().getTimezoneOffset() * 60;
const UP = '#16c784', DOWN = '#ea3943';

const TF_SEC = { '1s': 1, '5s': 5, '15s': 15, '30s': 30, '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '2h': 7200, '4h': 14400, '12h': 43200, '1d': 86400, '1w': 604800, '1M': 2592000 };

function bucket(tSec, tf) {
  if (tf === '1w') return Math.floor((tSec + 3 * 86400) / 604800) * 604800 - 3 * 86400;
  if (tf === '1M') { const d = new Date(tSec * 1000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000; }
  return Math.floor(tSec / TF_SEC[tf]) * TF_SEC[tf];
}

const toPoint = (c) => ({ time: c[0] + TZ, open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5] });

export default function Chart({ sym, tf, ind, chartType, drawMode, onDrawn }) {
  const el = useRef(null);
  const refs = useRef({});
  const [legend, setLegend] = useState(null);
  const [loading, setLoading] = useState(true);
  const account = useStore((s) => s.account);
  const [ready, setReady] = useState(0);
  const drawRef = useRef(drawMode);
  drawRef.current = drawMode;
  const indKey = JSON.stringify(ind);

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    const chart = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: 'solid', color: '#0d1119' }, textColor: '#8a94a6', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 11, panes: { separatorColor: '#1f2633', separatorHoverColor: '#2a3344', enableResize: true }, attributionLogo: false },
      grid: { vertLines: { color: '#141a25' }, horzLines: { color: '#141a25' } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: '#4a5568', labelBackgroundColor: '#2a3344' }, horzLine: { color: '#4a5568', labelBackgroundColor: '#2a3344' } },
      rightPriceScale: { borderColor: '#1f2633' },
      timeScale: { borderColor: '#1f2633', timeVisible: true, secondsVisible: tf.endsWith('s'), rightOffset: 8, barSpacing: 7 },
      localization: { locale: 'fr-FR' },
    });
    const r = { chart, data: [], ind: {}, lines: [], userLines: [], srLines: [] };
    refs.current = r;

    const seriesOpts = { priceFormat: { type: 'price', precision: 2, minMove: 0.01 }, lastValueVisible: true, priceLineVisible: true };
    if (chartType === 'line') {
      r.main = chart.addSeries(AreaSeries, { ...seriesOpts, lineColor: '#4f8cff', topColor: 'rgba(79,140,255,0.28)', bottomColor: 'rgba(79,140,255,0.02)', lineWidth: 2 });
    } else {
      r.main = chart.addSeries(CandlestickSeries, { ...seriesOpts, upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN });
    }
    if (ind.volume) {
      r.volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
      chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    }
    const line = (color, width = 1, pane = 0, extra = {}) => chart.addSeries(LineSeries, { color, lineWidth: width, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...extra }, pane);
    if (ind.ma20) r.ind.ma20 = line('#f0b90b', 1.5);
    if (ind.ema50) r.ind.ema50 = line('#c77dff', 1.5);
    if (ind.ema200) r.ind.ema200 = line('#ff6b6b', 2);
    if (ind.bb) { r.ind.bbU = line('rgba(79,140,255,.7)'); r.ind.bbM = line('rgba(79,140,255,.4)', 1, 0, { lineStyle: LineStyle.Dashed }); r.ind.bbL = line('rgba(79,140,255,.7)'); }
    if (ind.vwap) r.ind.vwap = line('#00d1b2', 1.5, 0, { lineStyle: LineStyle.Dotted });
    let pane = 1;
    if (ind.rsi) {
      r.ind.rsi = line('#c77dff', 1.5, pane, { lastValueVisible: true, priceFormat: { type: 'price', precision: 1, minMove: 0.1 } });
      r.ind.rsi.createPriceLine({ price: 70, color: 'rgba(234,57,67,.5)', lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false });
      r.ind.rsi.createPriceLine({ price: 30, color: 'rgba(22,199,132,.5)', lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false });
      r.rsiPane = pane++;
    }
    if (ind.macd) {
      const fmt = { type: 'price', precision: 6, minMove: 0.000001 };
      r.ind.macdH = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false, priceFormat: fmt }, pane);
      r.ind.macdL = line('#4f8cff', 1.5, pane, { priceFormat: fmt });
      r.ind.macdS = line('#f0b90b', 1.5, pane, { priceFormat: fmt });
      r.macdPane = pane++;
    }
    if (ind.stoch) {
      const fmt = { type: 'price', precision: 1, minMove: 0.1 };
      r.ind.stK = line('#4f8cff', 1.5, pane, { priceFormat: fmt, lastValueVisible: true });
      r.ind.stD = line('#f0b90b', 1.2, pane, { priceFormat: fmt });
      r.ind.stK.createPriceLine({ price: 80, color: 'rgba(234,57,67,.5)', lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false });
      r.ind.stK.createPriceLine({ price: 20, color: 'rgba(22,199,132,.5)', lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false });
      pane++;
    }
    const panes = chart.panes();
    for (let i = 1; i < panes.length; i++) panes[i].setHeight(110);

    r.markers = createSeriesMarkers(r.main, []);

    const mainPoints = (data) => {
      if (chartType === 'line') return data.map((d) => ({ time: d.time, value: d.close }));
      if (chartType === 'heikin') return heikinAshi(data);
      return data;
    };

    const computeInd = () => {
      const d = r.data;
      const closes = d.map((c) => c.close);
      const out = {};
      const toLine = (arr) => arr.map((v, i) => (v == null ? { time: d[i].time } : { time: d[i].time, value: v }));
      if (r.ind.ma20) out.ma20 = toLine(sma(closes, 20));
      if (r.ind.ema50) out.ema50 = toLine(ema(closes, 50));
      if (r.ind.ema200) out.ema200 = toLine(ema(closes, 200));
      if (r.ind.bbU) { const b = bollinger(closes); out.bbU = toLine(b.upper); out.bbM = toLine(b.mid); out.bbL = toLine(b.lower); }
      if (r.ind.vwap) out.vwap = toLine(vwap(d));
      if (r.ind.rsi) out.rsi = toLine(rsi(closes));
      if (r.ind.macdL) {
        const m = macd(closes);
        out.macdL = toLine(m.line); out.macdS = toLine(m.signal);
        out.macdH = m.hist.map((v, i) => (v == null ? { time: d[i].time } : { time: d[i].time, value: v, color: v >= 0 ? (v >= (m.hist[i - 1] ?? 0) ? '#16c784' : '#0e7a52') : (v <= (m.hist[i - 1] ?? 0) ? '#ea3943' : '#8f242b') }));
      }
      if (r.ind.stK) { const s = stochastic(d); out.stK = toLine(s.k); out.stD = toLine(s.d); }
      return out;
    };

    const volPoint = (c) => ({ time: c.time, value: c.volume, color: c.close >= c.open ? 'rgba(22,199,132,.35)' : 'rgba(234,57,67,.35)' });

    const renderAll = () => {
      const d = r.data;
      const prec = decimalsFor(d[d.length - 1]?.close);
      r.main.applyOptions({ priceFormat: { type: 'price', precision: prec, minMove: 10 ** -prec } });
      for (const k of ['ma20', 'ema50', 'ema200', 'bbU', 'bbM', 'bbL', 'vwap']) r.ind[k]?.applyOptions({ priceFormat: { type: 'price', precision: prec, minMove: 10 ** -prec } });
      r.main.setData(mainPoints(d));
      r.volume?.setData(d.map(volPoint));
      const out = computeInd();
      for (const [k, v] of Object.entries(out)) r.ind[k].setData(v);
    };

    const renderLast = () => {
      const d = r.data;
      const lastC = d[d.length - 1];
      if (chartType === 'heikin') {
        const ha = heikinAshi(d.slice(-200));
        r.main.update(ha[ha.length - 1]);
      } else r.main.update(chartType === 'line' ? { time: lastC.time, value: lastC.close } : lastC);
      r.volume?.update(volPoint(lastC));
      const out = computeInd();
      for (const [k, v] of Object.entries(out)) r.ind[k].update(v[v.length - 1]);
    };

    const showLegend = (c, prev) => {
      if (!c) return;
      setLegend({ ...c, ch: prev ? (c.close / prev.close - 1) * 100 : (c.close / c.open - 1) * 100 });
    };

    chart.subscribeCrosshairMove((param) => {
      if (!param.time) { const d = r.data; showLegend(d[d.length - 1], d[d.length - 2]); return; }
      const idx = r.data.findIndex((c) => c.time === param.time);
      if (idx >= 0) showLegend(r.data[idx], r.data[idx - 1]);
    });
    chart.subscribeClick((param) => {
      if (!drawRef.current || !param.point) return;
      const price = r.main.coordinateToPrice(param.point.y);
      if (price != null) onDrawn?.(price);
    });

    api('GET', `/api/candles?sym=${sym}&tf=${tf}&limit=${tf === '1s' ? 3000 : 2000}`).then(({ candles }) => {
      if (disposed) return;
      r.data = candles.map(toPoint);
      renderAll();
      const n = r.data.length;
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - (TF_SEC[tf] >= 86400 ? 120 : 160)), to: n + 6 });
      setLoading(false);
      showLegend(r.data[n - 1], r.data[n - 2]);
      setReady((x) => x + 1);
    }).catch(() => setLoading(false));

    const off = onCandle((msg) => {
      if (msg.sym !== sym || msg.tf !== tf || !msg.candle || !r.data.length) return;
      const c = toPoint(msg.candle);
      const d = r.data;
      const last = d[d.length - 1];
      if (c.time < last.time) return;
      if (c.time === last.time) d[d.length - 1] = c;
      else { d.push(c); if (d.length > 4000) d.shift(); }
      renderLast();
    });

    const publish = () => {
      const a = analyze(r.data);
      if (a) {
        a.sym = sym; a.tf = tf;
        if (ind.sr) drawSR(a);
        setState({ analysis: a });
      }
    };
    const drawSR = (a) => {
      for (const l of r.srLines) r.main.removePriceLine(l);
      r.srLines = [...a.supports.slice(0, 2).map((z) => ({ ...z, s: true })), ...a.resistances.slice(0, 2)].map((z) =>
        r.main.createPriceLine({ price: z.price, color: z.s ? 'rgba(22,199,132,.55)' : 'rgba(234,57,67,.55)', lineStyle: LineStyle.LargeDashed, lineWidth: 1, axisLabelVisible: true, title: z.s ? 'Support' : 'Résistance' }));
    };
    const int = setInterval(publish, 2000);
    setTimeout(publish, 600);

    return () => {
      disposed = true;
      off();
      clearInterval(int);
      chart.remove();
    };
  }, [sym, tf, indKey, chartType]);

  // Positions, ordres, tracés et exécutions affichés sur le graphique
  useEffect(() => {
    const r = refs.current;
    if (!r.main || !account || !r.data.length) return;
    for (const l of r.lines) r.main.removePriceLine(l);
    r.lines = [];
    const add = (price, color, title, style = LineStyle.Solid) => r.lines.push(r.main.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title }));
    for (const p of account.positions.filter((x) => x.sym === sym)) {
      add(p.entry, p.side === 'long' ? UP : DOWN, `${p.side === 'long' ? 'LONG' : 'SHORT'} x${p.leverage}`);
      if (p.sl) add(p.sl, '#ff9f43', 'SL', LineStyle.Dashed);
      if (p.tp) add(p.tp, '#2ed573', 'TP', LineStyle.Dashed);
      add(p.liq, '#a55eea', 'Liquidation', LineStyle.Dotted);
    }
    for (const o of account.orders.filter((x) => x.sym === sym)) {
      const buy = o.side === 'buy' || o.side === 'long';
      add(o.price, buy ? 'rgba(22,199,132,.8)' : 'rgba(234,57,67,.8)', `${o.type === 'stop' ? 'Stop' : 'Limite'} ${buy ? 'achat' : 'vente'}`, LineStyle.SparseDotted);
    }
    for (const a of account.alerts.filter((x) => x.sym === sym && !x.triggeredAt)) add(a.price, '#f0b90b', '🔔 Alerte', LineStyle.Dotted);
    const user = JSON.parse(localStorage.getItem('ts.lines.' + sym) || '[]');
    for (const p of user) add(p, '#8a94a6', 'Tracé', LineStyle.Solid);

    const first = r.data[0].time;
    const markers = account.trades
      .filter((t) => t.sym === sym)
      .map((t) => {
        const time = bucket(Math.floor(t.t / 1000), tf) + TZ;
        const buy = t.side === 'buy';
        return { time, position: buy ? 'belowBar' : 'aboveBar', color: buy ? UP : DOWN, shape: buy ? 'arrowUp' : 'arrowDown', text: t.kind === 'futures' ? (t.type === 'open' ? (t.posSide === 'long' ? 'Long' : 'Short') : t.type === 'liquidation' ? 'Liq.' : 'Fermé') : buy ? 'Achat' : 'Vente' };
      })
      .filter((m) => m.time >= first)
      .sort((a, b) => a.time - b.time);
    r.markers?.setMarkers(markers);
  }, [account, ready, sym, tf]);

  return (
    <div className="chart-wrap">
      <div ref={el} className={'chart' + (drawMode ? ' drawing' : '')} />
      {legend && (
        <div className="legend">
          <span>O <b>{fmtPrice(legend.open)}</b></span>
          <span>H <b>{fmtPrice(legend.high)}</b></span>
          <span>B <b>{fmtPrice(legend.low)}</b></span>
          <span>C <b className={legend.close >= legend.open ? 'up' : 'down'}>{fmtPrice(legend.close)}</b></span>
          <span className={legend.ch >= 0 ? 'up' : 'down'}>{legend.ch >= 0 ? '+' : ''}{legend.ch.toFixed(2)} %</span>
          <span>Vol <b>{fmtCompact(legend.volume)}</b></span>
          <span className="legend-key">
            {ind.ma20 && <i style={{ color: '#f0b90b' }}>MA20</i>}
            {ind.ema50 && <i style={{ color: '#c77dff' }}>EMA50</i>}
            {ind.ema200 && <i style={{ color: '#ff6b6b' }}>EMA200</i>}
            {ind.bb && <i style={{ color: '#4f8cff' }}>BB(20,2)</i>}
            {ind.vwap && <i style={{ color: '#00d1b2' }}>VWAP</i>}
          </span>
        </div>
      )}
      {loading && <div className="chart-loading"><div className="spinner" /></div>}
      <button className="rt-btn" title="Revenir au temps réel" onClick={() => refs.current.chart?.timeScale().scrollToRealTime()}>⟫</button>
    </div>
  );
}

export function EquityChart({ points }) {
  const el = useRef(null);
  useEffect(() => {
    const chart = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#8a94a6', attributionLogo: false, fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: '#141a25' } },
      rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, timeVisible: true },
      localization: { locale: 'fr-FR' }, handleScroll: false, handleScale: false,
    });
    const s = chart.addSeries(AreaSeries, { lineColor: '#4f8cff', topColor: 'rgba(79,140,255,.3)', bottomColor: 'rgba(79,140,255,0)', lineWidth: 2, priceFormat: { type: 'price', precision: 2, minMove: 0.01 } });
    const seen = new Set();
    const data = [];
    for (const [t, v] of points) { const tt = t + TZ; if (!seen.has(tt)) { seen.add(tt); data.push({ time: tt, value: v }); } }
    data.sort((a, b) => a.time - b.time);
    s.setData(data);
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [points]);
  return <div ref={el} style={{ width: '100%', height: '100%' }} />;
}
