import { useEffect, useRef } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, CrosshairMode, LineStyle, createSeriesMarkers } from 'lightweight-charts';
import { api, onMemeTick, useStore } from '../lib/store.js';
import { fmtCompact } from '../lib/format.js';

const UP = '#16c784', DOWN = '#ea3943';
const SUPPLY = 1e9;
const TF_SEC = { '5s': 5, '15s': 15, '1m': 60, '5m': 300, '15m': 900, '1h': 3600 };

export default function MemeChart({ id, tf, mode }) {
  const el = useRef(null);
  const r = useRef({});
  const account = useStore((s) => s.account);
  const mul = mode === 'mcap' ? SUPPLY : 1;

  useEffect(() => {
    const chart = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: 'solid', color: '#0d1119' }, textColor: '#8a94a6', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: '#141a25' }, horzLines: { color: '#141a25' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#1f2633', scaleMargins: { top: 0.08, bottom: 0.22 } },
      timeScale: { borderColor: '#1f2633', timeVisible: true, secondsVisible: tf.endsWith('s'), rightOffset: 6, barSpacing: 8 },
      localization: { locale: 'fr-FR' },
    });
    const priceFormat = mode === 'mcap'
      ? { type: 'custom', formatter: (v) => fmtCompact(v) + ' $', minMove: 1 }
      : { type: 'custom', formatter: (v) => v.toPrecision(4), minMove: 1e-12 };
    const main = chart.addSeries(CandlestickSeries, { priceFormat, upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN });
    const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    r.current = { chart, main, vol, markers: createSeriesMarkers(main, []), lines: [] };
    let alive = true;
    api('GET', `/api/memes/${id}/candles?tf=${tf}`).then(({ candles }) => {
      if (!alive) return;
      main.setData(candles.map((c) => ({ time: c[0], open: c[1] * mul, high: c[2] * mul, low: c[3] * mul, close: c[4] * mul })));
      vol.setData(candles.map((c) => ({ time: c[0], value: c[5], color: c[4] >= c[1] ? 'rgba(22,199,132,.35)' : 'rgba(234,57,67,.35)' })));
      const n = candles.length;
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 140), to: n + 5 });
    }).catch(() => {});
    const off = onMemeTick((m) => {
      if (m.id !== id || m.tf !== tf || !m.candle) return;
      const c = m.candle;
      try {
        main.update({ time: c[0], open: c[1] * mul, high: c[2] * mul, low: c[3] * mul, close: c[4] * mul });
        vol.update({ time: c[0], value: c[5], color: c[4] >= c[1] ? 'rgba(22,199,132,.35)' : 'rgba(234,57,67,.35)' });
      } catch { /* bougie plus ancienne que la dernière affichée */ }
    });
    return () => { alive = false; off(); chart.remove(); };
  }, [id, tf, mode]);

  useEffect(() => {
    const { main, markers } = r.current;
    if (!main || !account) return;
    const sec = TF_SEC[tf];
    const mine = account.trades.filter((t) => t.kind === 'meme' && t.memeId === id);
    markers.setMarkers(mine.map((t) => ({
      time: Math.floor(t.t / 1000 / sec) * sec,
      position: t.side === 'buy' ? 'belowBar' : 'aboveBar',
      color: t.side === 'buy' ? UP : DOWN,
      shape: t.side === 'buy' ? 'arrowUp' : 'arrowDown',
      text: t.side === 'buy' ? 'Achat' : 'Vente',
    })).sort((a, b) => a.time - b.time));
    r.current.lines.forEach((l) => main.removePriceLine(l));
    r.current.lines = [];
    const h = account.memes?.[id];
    if (h && h.qty > 0) {
      const avg = (h.cost / h.qty) * mul;
      r.current.lines.push(main.createPriceLine({ price: avg, color: '#4f8cff', lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: 'Ton entrée' }));
      r.current.lines.push(main.createPriceLine({ price: avg * 2, color: '#f0b90b', lineStyle: LineStyle.Dotted, lineWidth: 1, axisLabelVisible: true, title: 'x2 (récupère ta mise)' }));
    }
  }, [account, id, tf, mode]);

  return <div ref={el} className="meme-chart" />;
}
