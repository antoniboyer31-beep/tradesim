import { useEffect, useRef, useState } from 'react';
import { useStore, subscribeMarket, toast } from '../lib/store.js';
import { fmtPrice, fmtPct, fmtCompact, fmtDuration, cls } from '../lib/format.js';
import Chart from '../components/Chart.jsx';
import MarketList from '../components/MarketList.jsx';
import { OrderBook, TradesTape } from '../components/OrderBook.jsx';
import OrderForm from '../components/OrderForm.jsx';
import BottomPanel from '../components/BottomPanel.jsx';
import Assistant from '../components/Assistant.jsx';

const TF_GROUPS = [
  ['Secondes', ['1s', '5s', '15s', '30s']],
  ['Minutes', ['1m', '3m', '5m', '15m', '30m']],
  ['Heures', ['1h', '2h', '4h', '12h']],
  ['Jours', ['1d', '1w', '1M']],
];
const TF_LABEL = { '1d': '1J', '1w': '1S', '1M': '1M', '1h': '1H', '2h': '2H', '4h': '4H', '12h': '12H' };
const TF_SEC = { '1s': 1, '5s': 5, '15s': 15, '30s': 30, '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '2h': 7200, '4h': 14400, '12h': 43200, '1d': 86400, '1w': 604800 };

const IND_LIST = [
  ['volume', 'Volume'], ['ma20', 'MA 20'], ['ema50', 'EMA 50'], ['ema200', 'EMA 200'], ['bb', 'Bollinger'], ['vwap', 'VWAP'],
  ['sr', 'Supports/Résistances auto'], ['rsi', 'RSI'], ['macd', 'MACD'], ['stoch', 'Stochastique'],
];
const DEFAULT_IND = { volume: true, ma20: false, ema50: true, ema200: false, bb: false, vwap: false, sr: true, rsi: true, macd: false, stoch: false };

function nextClose(tf) {
  const now = Date.now() / 1000;
  if (tf === '1M') { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000 - now; }
  if (tf === '1w') { const w = 604800; const b = Math.floor((now + 3 * 86400) / w) * w - 3 * 86400; return b + w - now; }
  const s = TF_SEC[tf];
  return Math.ceil(now / s) * s - now;
}

function Countdown({ tf }) {
  useStore((s) => s.tickers);
  return <span className="countdown" title="Temps avant la clôture de la bougie en cours">⏱ {fmtDuration(nextClose(tf))}</span>;
}

function CoinHeader() {
  const sym = useStore((s) => s.sym);
  const tf = useStore((s) => s.tf);
  const coin = useStore((s) => s.coinMap[s.sym]);
  const coins = useStore((s) => s.coins);
  const t = useStore((s) => s.tickers[s.sym]);
  const prev = useRef(t?.price);
  const [flash, setFlash] = useState('');
  useEffect(() => {
    if (!t) return;
    if (prev.current != null && t.price !== prev.current) {
      setFlash(t.price > prev.current ? 'flash-up' : 'flash-down');
      const id = setTimeout(() => setFlash(''), 300);
      prev.current = t.price;
      return () => clearTimeout(id);
    }
    prev.current = t.price;
  }, [t?.price]);
  useEffect(() => {
    if (t) document.title = `${fmtPrice(t.price)} ${sym} — TradeSim`;
  }, [t?.price, sym]);
  if (!coin || !t) return <div className="coin-header" />;
  return (
    <div className="coin-header">
      <div className="ch-id">
        <span className="coin-dot big" style={{ background: coin.color }}>{coin.sym[0]}</span>
        <div>
          <select className="coin-select" value={sym} onChange={(e) => subscribeMarket(e.target.value, tf)}>
            {coins.map((c) => <option key={c.sym} value={c.sym}>{c.sym}/USD — {c.name}</option>)}
          </select>
          <small className="muted">{coin.name} · {coin.cat}</small>
        </div>
      </div>
      <div className={cls('ch-price mono', t.ch1h >= 0 ? 'up' : 'down', flash)}>{fmtPrice(t.price)} $</div>
      <div className="ch-stats">
        <div><span>1h</span><b className={t.ch1h >= 0 ? 'up' : 'down'}>{fmtPct(t.ch1h)}</b></div>
        <div><span>24h</span><b className={t.ch24 >= 0 ? 'up' : 'down'}>{fmtPct(t.ch24)}</b></div>
        <div><span>7j</span><b className={t.ch7d >= 0 ? 'up' : 'down'}>{fmtPct(t.ch7d)}</b></div>
        <div><span>30j</span><b className={t.ch30d >= 0 ? 'up' : 'down'}>{fmtPct(t.ch30d)}</b></div>
        <div><span>Haut 24h</span><b className="mono">{fmtPrice(t.high24)}</b></div>
        <div><span>Bas 24h</span><b className="mono">{fmtPrice(t.low24)}</b></div>
        <div><span>Volume 24h</span><b className="mono">{fmtCompact(t.vol24)} $</b></div>
      </div>
    </div>
  );
}

export default function Trade({ sparks }) {
  const sym = useStore((s) => s.sym);
  const tf = useStore((s) => s.tf);
  const [ind, setInd] = useState(() => ({ ...DEFAULT_IND, ...JSON.parse(localStorage.getItem('ts.ind') || '{}') }));
  const [chartType, setChartType] = useState(() => localStorage.getItem('ts.ctype') || 'candles');
  const [indOpen, setIndOpen] = useState(false);
  const [draw, setDraw] = useState(false);
  const [linesVer, setLinesVer] = useState(0);

  useEffect(() => localStorage.setItem('ts.ind', JSON.stringify(ind)), [ind]);
  useEffect(() => localStorage.setItem('ts.ctype', chartType), [chartType]);

  const onDrawn = (price) => {
    const key = 'ts.lines.' + sym;
    const l = JSON.parse(localStorage.getItem(key) || '[]');
    l.push(price);
    localStorage.setItem(key, JSON.stringify(l));
    setDraw(false);
    setLinesVer((v) => v + 1);
    toast('info', `Ligne tracée à ${fmtPrice(price)} $`);
  };
  const clearLines = () => { localStorage.removeItem('ts.lines.' + sym); setLinesVer((v) => v + 1); };

  return (
    <div className="trade-grid">
      <MarketList sparks={sparks} />
      <div className="center">
        <CoinHeader />
        <div className="panel chart-panel">
          <div className="chart-toolbar">
            <div className="tfs">
              {TF_GROUPS.map(([g, list]) => (
                <div key={g} className="tf-group" title={g}>
                  {list.map((x) => <button key={x} className={cls(tf === x && 'on')} onClick={() => subscribeMarket(sym, x)}>{TF_LABEL[x] || x}</button>)}
                </div>
              ))}
            </div>
            <div className="tools">
              <div className="seg small">
                {[['candles', 'Bougies'], ['heikin', 'Heikin Ashi'], ['line', 'Ligne']].map(([k, l]) => <button key={k} className={cls(chartType === k && 'on')} onClick={() => setChartType(k)}>{l}</button>)}
              </div>
              <div className="dropdown">
                <button className="tool-btn" onClick={() => setIndOpen(!indOpen)}>ƒx Indicateurs ▾</button>
                {indOpen && (
                  <div className="dropdown-menu" onMouseLeave={() => setIndOpen(false)}>
                    {IND_LIST.map(([k, l]) => (
                      <label key={k}><input type="checkbox" checked={!!ind[k]} onChange={(e) => setInd({ ...ind, [k]: e.target.checked })} /> {l}</label>
                    ))}
                  </div>
                )}
              </div>
              <button className={cls('tool-btn', draw && 'on')} onClick={() => setDraw(!draw)} title="Clique ensuite sur le graphique pour tracer une ligne horizontale">✎ Tracer</button>
              <button className="tool-btn" onClick={clearLines} title="Effacer mes tracés sur cette monnaie">🗑</button>
              <Countdown tf={tf} />
            </div>
          </div>
          {draw && <div className="draw-hint">Clique sur le graphique au niveau de prix où tu veux tracer une ligne (support, résistance, objectif…)</div>}
          <Chart key={linesVer} sym={sym} tf={tf} ind={ind} chartType={chartType} drawMode={draw} onDrawn={onDrawn} />
        </div>
        <BottomPanel />
      </div>
      <div className="col-book">
        <OrderBook />
        <TradesTape />
      </div>
      <div className="col-right">
        <OrderForm />
        <Assistant />
      </div>
    </div>
  );
}
