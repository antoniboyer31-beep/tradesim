import { useState } from 'react';
import { useStore, setState } from '../lib/store.js';
import { fmtPrice, fmtQty, fmtTime, cls } from '../lib/format.js';

export function OrderBook() {
  const book = useStore((s) => s.book);
  const sym = useStore((s) => s.sym);
  const t = useStore((s) => s.tickers[s.sym]);
  const [mode, setMode] = useState('both');
  if (!book || book.sym !== sym) return <div className="panel book"><div className="panel-title">Carnet d'ordres</div><div className="empty">Chargement…</div></div>;
  const rows = mode === 'both' ? 11 : 22;
  const asks = book.asks.slice(0, rows);
  const bids = book.bids.slice(0, rows);
  let cum = 0;
  const askCum = asks.map(([, q]) => (cum += q));
  cum = 0;
  const bidCum = bids.map(([, q]) => (cum += q));
  const max = Math.max(askCum[askCum.length - 1] || 1, bidCum[bidCum.length - 1] || 1);
  const spread = asks[0][0] - bids[0][0];
  const bidTotal = bidCum[bidCum.length - 1], askTotal = askCum[askCum.length - 1];
  const bidPct = (bidTotal / (bidTotal + askTotal)) * 100;
  const pick = (p) => setState({ pickedPrice: { p, at: Date.now() } });

  return (
    <div className="panel book">
      <div className="panel-title">
        Carnet d'ordres
        <span className="seg small">
          {[['both', '⇅'], ['bids', '▲'], ['asks', '▼']].map(([k, l]) => <button key={k} className={cls(mode === k && 'on')} onClick={() => setMode(k)}>{l}</button>)}
        </span>
      </div>
      <div className="book-head"><span>Prix ($)</span><span>Quantité</span><span>Total</span></div>
      {mode !== 'bids' && (
        <div className="book-side asks">
          {asks.map(([p, q], i) => ({ p, q, c: askCum[i] })).reverse().map((r) => (
            <div key={r.p} className="book-row" onClick={() => pick(r.p)}>
              <div className="depth" style={{ width: `${(r.c / max) * 100}%` }} />
              <span className="down mono">{fmtPrice(r.p)}</span><span className="mono">{fmtQty(r.q)}</span><span className="mono muted">{fmtQty(r.c)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="book-mid">
        <b className={cls('mono', t?.ch1h >= 0 ? 'up' : 'down')}>{fmtPrice(t?.price)}</b>
        <small className="muted">Spread {fmtPrice(spread)} ({((spread / t?.price) * 100).toFixed(3)} %)</small>
      </div>
      {mode !== 'asks' && (
        <div className="book-side bids">
          {bids.map(([p, q], i) => (
            <div key={p} className="book-row" onClick={() => pick(p)}>
              <div className="depth" style={{ width: `${(bidCum[i] / max) * 100}%` }} />
              <span className="up mono">{fmtPrice(p)}</span><span className="mono">{fmtQty(q)}</span><span className="mono muted">{fmtQty(bidCum[i])}</span>
            </div>
          ))}
        </div>
      )}
      <div className="pressure" title="Rapport entre les ordres d'achat et de vente visibles">
        <span className="up">A {bidPct.toFixed(0)} %</span>
        <div className="pressure-bar"><div style={{ width: `${bidPct}%` }} /></div>
        <span className="down">{(100 - bidPct).toFixed(0)} % V</span>
      </div>
    </div>
  );
}

export function TradesTape() {
  const trades = useStore((s) => s.trades);
  return (
    <div className="panel tape">
      <div className="panel-title">Transactions en direct</div>
      <div className="book-head"><span>Prix ($)</span><span>Quantité</span><span>Heure</span></div>
      <div className="tape-rows">
        {[...trades].reverse().map((t) => (
          <div key={t.t + t.user} className={cls('tape-row', t.q * t.p > 20000 && 'big')} title={`Trader : ${t.user}`}>
            <span className={cls('mono', t.side === 'buy' ? 'up' : 'down')}>{fmtPrice(t.p)}</span>
            <span className="mono">{fmtQty(t.q)}</span>
            <span className="mono muted">{fmtTime(t.t)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
