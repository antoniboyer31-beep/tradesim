import { useMemo, useState } from 'react';
import { useStore, subscribeMarket } from '../lib/store.js';
import { fmtPrice, fmtPct, fmtCompact, cls } from '../lib/format.js';

export function Sparkline({ data, width = 64, height = 22 }) {
  if (!data || data.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...data), max = Math.max(...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / (max - min || 1)) * (height - 2) - 1}`).join(' ');
  const up = data[data.length - 1] >= data[0];
  return (
    <svg width={width} height={height} className="spark">
      <polyline points={pts} fill="none" stroke={up ? '#16c784' : '#ea3943'} strokeWidth="1.4" />
    </svg>
  );
}

const FAV_KEY = 'ts.favs';

export default function MarketList({ sparks }) {
  const coins = useStore((s) => s.coins);
  const tickers = useStore((s) => s.tickers);
  const sym = useStore((s) => s.sym);
  const tf = useStore((s) => s.tf);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('default');
  const [favs, setFavs] = useState(() => JSON.parse(localStorage.getItem(FAV_KEY) || '[]'));
  const [onlyFav, setOnlyFav] = useState(false);

  const toggleFav = (s) => {
    const next = favs.includes(s) ? favs.filter((x) => x !== s) : [...favs, s];
    setFavs(next);
    localStorage.setItem(FAV_KEY, JSON.stringify(next));
  };

  const list = useMemo(() => {
    let l = coins.filter((c) => (!q || (c.sym + c.name).toLowerCase().includes(q.toLowerCase())) && (!onlyFav || favs.includes(c.sym)));
    const t = (c) => tickers[c.sym] || {};
    if (sort === 'up') l = [...l].sort((a, b) => (t(b).ch24 ?? 0) - (t(a).ch24 ?? 0));
    if (sort === 'down') l = [...l].sort((a, b) => (t(a).ch24 ?? 0) - (t(b).ch24 ?? 0));
    if (sort === 'vol') l = [...l].sort((a, b) => (t(b).vol24 ?? 0) - (t(a).vol24 ?? 0));
    return l;
  }, [coins, tickers, q, sort, favs, onlyFav]);

  return (
    <div className="panel market-list">
      <div className="panel-head">
        <input className="search" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="ml-filters">
        <button className={cls('chip', onlyFav && 'on')} onClick={() => setOnlyFav(!onlyFav)}>★</button>
        {[['default', 'Tous'], ['up', 'Hausses'], ['down', 'Baisses'], ['vol', 'Volume']].map(([k, l]) => (
          <button key={k} className={cls('chip', sort === k && 'on')} onClick={() => setSort(k)}>{l}</button>
        ))}
      </div>
      <div className="ml-rows">
        {list.map((c) => {
          const t = tickers[c.sym] || {};
          return (
            <div key={c.sym} className={cls('ml-row', c.sym === sym && 'active')} onClick={() => subscribeMarket(c.sym, tf)}>
              <span className={cls('fav', favs.includes(c.sym) && 'on')} onClick={(e) => { e.stopPropagation(); toggleFav(c.sym); }}>★</span>
              <span className="coin-dot" style={{ background: c.color }}>{c.sym[0]}</span>
              <div className="ml-name">
                <b>{c.sym}</b>
                <small>{fmtCompact(t.vol24)} $</small>
              </div>
              <Sparkline data={sparks?.[c.sym]} width={46} height={20} />
              <div className="ml-price">
                <b className="mono">{fmtPrice(t.price)}</b>
                <small className={t.ch24 >= 0 ? 'up' : 'down'}>{fmtPct(t.ch24)}</small>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
