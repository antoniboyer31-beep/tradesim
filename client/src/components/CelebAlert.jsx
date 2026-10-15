import { useEffect, useRef, useState } from 'react';
import { api, setState, useStore } from '../lib/store.js';
import { fmtCompact, fmtUsd } from '../lib/format.js';

const LIFETIME = 5000;

export default function CelebAlert() {
  const a = useStore((s) => s.celebAlert);
  const cash = useStore((s) => s.account?.cash ?? 0);
  const [tk, setTk] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [startMc, setStartMc] = useState(null);
  const hover = useRef(false);
  const lastActive = useRef(0);
  useEffect(() => {
    if (!a) return;
    setTk(null);
    setStartMc(null);
    let alive = true;
    const load = () => api('GET', `/api/memes/${a.id}`).then(({ token }) => {
      if (!alive) return;
      setTk(token);
      setStartMc((x) => x ?? token.mcap);
    }).catch(() => {});
    load();
    lastActive.current = Date.now();
    const i = setInterval(() => {
      setNow(Date.now());
      if (hover.current) lastActive.current = Date.now();
      else if (Date.now() - lastActive.current >= LIFETIME) return setState({ celebAlert: null });
      load();
    }, 500);
    return () => { alive = false; clearInterval(i); };
  }, [a?.id, a?.at]);
  if (!a) return null;
  const close = () => setState({ celebAlert: null });
  const buy = (usd) => api('POST', `/api/memes/${a.id}/buy`, { usd, slippage: 50 }).catch(() => {});
  const since = Math.floor((now - a.at) / 1000);
  const mult = tk && startMc ? tk.mcap / startMc : 1;
  return (
    <div className="celeb-alert" onMouseEnter={() => { hover.current = true; }} onMouseLeave={() => { hover.current = false; lastActive.current = Date.now(); }}>
      <div className="celeb-head">
        <span className="celeb-flash">🚨 ALERTE TWEET</span>
        <span className="muted small">il y a {since} s</span>
        <button className="x" onClick={close}>✕</button>
      </div>
      <div className="tweet">
        <div className="tw-av">{a.celeb.name[0]}</div>
        <div>
          <div><b>{a.celeb.name}</b> <span className="muted">{a.celeb.handle} · {a.celeb.followers} abonnés</span></div>
          <div className="tw-text">{a.celeb.tweet}</div>
        </div>
      </div>
      <div className="celeb-token">
        <span className="meme-av sm">{a.emoji}</span>
        <b>{a.name}</b> <span className="muted">${a.ticker}</span>
        {tk && <span className="mono">MC {fmtCompact(tk.mcap)} $ <b className={mult >= 1 ? 'up' : 'down'}>x{mult.toFixed(2)}</b></span>}
      </div>
      <p className="small">Ça part tout de suite : chaque seconde compte. Plus tu achètes tôt, plus tu prends le mouvement… et n'oublie pas de vendre avant que tout le monde ne revende !</p>
      <div className="celeb-buys">
        {[50, 100, 250, 500, 1000, 2500].map((v) => <button key={v} className="buy-btn" disabled={v > cash} onClick={() => buy(v)}>⚡ {v} $</button>)}
      </div>
      <div className="celeb-foot">
        <span className="small muted">Solde : {fmtUsd(cash)}</span>
        <button className="ghost small" onClick={() => { setState({ page: 'meme', memeOpen: a.id }); }}>Voir le graphique →</button>
      </div>
    </div>
  );
}
