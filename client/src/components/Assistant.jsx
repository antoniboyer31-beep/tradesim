import { useEffect, useState } from 'react';
import { useStore } from '../lib/store.js';
import { fmtPrice, fmtPct, cls } from '../lib/format.js';
import { QUICK_TIPS } from '../data/academy.js';

export default function Assistant() {
  const a = useStore((s) => s.analysis);
  const sym = useStore((s) => s.sym);
  const tf = useStore((s) => s.tf);
  const coin = useStore((s) => s.coinMap[s.sym]);
  const nova = useStore((s) => s.tickers.NOVA);
  const [tip, setTip] = useState(() => Math.floor(Math.random() * QUICK_TIPS.length));
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const i = setInterval(() => setTip((x) => (x + 1) % QUICK_TIPS.length), 12000);
    return () => clearInterval(i);
  }, []);
  const valid = a && a.sym === sym && a.tf === tf;
  const score = valid ? a.score : 0;
  const angle = (score / 100) * 90;

  return (
    <div className="panel assistant">
      <div className="panel-title" onClick={() => setOpen(!open)} style={{ cursor: 'pointer' }}>
        🤖 Assistant de trading <span className="muted small">{sym} · {tf}</span> <span className="muted">{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <>
          <div className="tip-banner" onClick={() => setTip((x) => (x + 1) % QUICK_TIPS.length)} title="Astuce suivante">
            💡 {QUICK_TIPS[tip]}
          </div>
          {valid ? (
            <>
              <div className="gauge">
                <svg viewBox="0 0 120 70" width="150">
                  <defs>
                    <linearGradient id="gg" x1="0" x2="1">
                      <stop offset="0" stopColor="#ea3943" /><stop offset=".5" stopColor="#8a94a6" /><stop offset="1" stopColor="#16c784" />
                    </linearGradient>
                  </defs>
                  <path d="M10,62 A50,50 0 0 1 110,62" stroke="url(#gg)" strokeWidth="9" fill="none" strokeLinecap="round" />
                  <line x1="60" y1="62" x2="60" y2="20" stroke="#e6e9ef" strokeWidth="3" strokeLinecap="round" transform={`rotate(${angle} 60 62)`} />
                  <circle cx="60" cy="62" r="5" fill="#e6e9ef" />
                </svg>
                <div>
                  <div className={cls('bias', score > 10 ? 'up' : score < -10 ? 'down' : '')}>{a.bias}</div>
                  <small className="muted">Score technique : {score > 0 ? '+' : ''}{score}</small>
                </div>
              </div>
              <div className="kpis">
                <div><span>RSI 14</span><b className={a.rsi > 70 ? 'down' : a.rsi < 30 ? 'up' : ''}>{a.rsi?.toFixed(1)}</b></div>
                <div><span>Volatilité (ATR)</span><b>{a.atrPct.toFixed(2)} %</b></div>
                <div><span>Support</span><b className="up mono">{a.supports[0] ? fmtPrice(a.supports[0].price) : '—'}</b></div>
                <div><span>Résistance</span><b className="down mono">{a.resistances[0] ? fmtPrice(a.resistances[0].price) : '—'}</b></div>
              </div>
              <div className="plans">
                <div className="plan up-bg">
                  <b>Idée LONG</b>
                  <span>SL {fmtPrice(a.longPlan.sl)} · TP {fmtPrice(a.longPlan.tp)}</span>
                </div>
                <div className="plan down-bg">
                  <b>Idée SHORT</b>
                  <span>SL {fmtPrice(a.shortPlan.sl)} · TP {fmtPrice(a.shortPlan.tp)}</span>
                </div>
              </div>
              <div className="insights">
                {a.items.map((it) => (
                  <div key={it.title} className={cls('insight', it.level)}>
                    <b>{it.title}</b>
                    <p>{it.text}</p>
                  </div>
                ))}
              </div>
            </>
          ) : <div className="empty">Analyse du graphique en cours…</div>}
          {sym !== 'NOVA' && nova && (
            <div className={cls('insight', 'info')}>
              <b>Contexte du marché (NOVA)</b>
              <p>NOVA {fmtPct(nova.ch1h)} sur 1h, {fmtPct(nova.ch24)} sur 24h. {nova.ch1h < -1 ? 'Le leader baisse : prudence sur les achats d\'altcoins.' : nova.ch1h > 1 ? 'Le leader monte : le vent est porteur pour les altcoins.' : 'Le leader est calme.'}</p>
            </div>
          )}
          {coin && (
            <div className="coin-info">
              <b>{coin.name} ({coin.sym})</b> <span className="tag">{coin.cat}</span>
              <p>{coin.desc}</p>
              <div className="risk-meter">Niveau de risque : {'●'.repeat(Math.min(5, Math.ceil(coin.vol * 3)))}<span className="muted">{'●'.repeat(5 - Math.min(5, Math.ceil(coin.vol * 3)))}</span></div>
            </div>
          )}
          <p className="disclaimer">Analyse automatique à but pédagogique. Aucun indicateur ne prédit l'avenir : combine toujours plusieurs signaux et gère ton risque.</p>
        </>
      )}
    </div>
  );
}
