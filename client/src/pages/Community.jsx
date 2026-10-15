import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, setState, subscribeMarket, api } from '../lib/store.js';
import { fmtPct, fmtPrice, fmtTime, fmtDateTime, cls } from '../lib/format.js';

export function fearGreed(tickers) {
  const list = Object.values(tickers);
  if (!list.length) return 50;
  const avg24 = list.reduce((s, t) => s + t.ch24, 0) / list.length;
  const avg7 = list.reduce((s, t) => s + t.ch7d, 0) / list.length;
  const breadth = list.filter((t) => t.ch24 > 0).length / list.length;
  const vola = list.reduce((s, t) => s + (t.vola || 1), 0) / list.length;
  let v = 50 + avg24 * 3 + avg7 * 0.8 + (breadth - 0.5) * 40 - (vola - 1) * 8;
  return Math.max(1, Math.min(99, Math.round(v)));
}
export const fgLabel = (v) => (v < 20 ? 'Peur extrême' : v < 40 ? 'Peur' : v < 60 ? 'Neutre' : v < 80 ? 'Avidité' : 'Avidité extrême');
const fgColor = (v) => (v < 20 ? '#ea3943' : v < 40 ? '#ff8a3d' : v < 60 ? '#f0b90b' : v < 80 ? '#93d900' : '#16c784');

function heatColor(ch) {
  const a = Math.min(1, Math.abs(ch) / 10);
  return ch >= 0 ? `rgba(22,199,132,${0.15 + a * 0.75})` : `rgba(234,57,67,${0.15 + a * 0.75})`;
}

export default function Community() {
  const tickers = useStore((s) => s.tickers);
  const coins = useStore((s) => s.coins);
  const news = useStore((s) => s.news);
  const chat = useStore((s) => s.chat);
  const me = useStore((s) => s.me);
  const online = useStore((s) => s.online);
  const tf = useStore((s) => s.tf);
  const [hm, setHm] = useState('ch24');
  const [text, setText] = useState('');
  const chatRef = useRef(null);
  const fg = fearGreed(tickers);
  const sorted = useMemo(() => Object.values(tickers).sort((a, b) => b.ch24 - a.ch24), [tickers]);
  useEffect(() => { chatRef.current?.scrollTo(0, chatRef.current.scrollHeight); }, [chat.length]);
  const go = (sym) => { subscribeMarket(sym, tf); setState({ page: 'trade' }); };
  const send = async () => {
    if (!text.trim()) return;
    await api('POST', '/api/chat', { text }).catch(() => {});
    setText('');
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Marché & communauté</h1>
        <span className="online-pill"><i className="dot-live" /> {online.toLocaleString('fr-FR')} traders en ligne</span>
      </div>
      <div className="grid-3">
        <div className="panel pad">
          <div className="panel-title">Indice Peur & Avidité</div>
          <div className="fg">
            <svg viewBox="0 0 200 110" width="220">
              {[0, 1, 2, 3, 4].map((i) => {
                const a0 = Math.PI * (1 - i / 5), a1 = Math.PI * (1 - (i + 1) / 5);
                const p = (a, r) => `${100 + r * Math.cos(a)},${100 - r * Math.sin(a)}`;
                return <path key={i} d={`M${p(a0, 85)} A85,85 0 0 1 ${p(a1, 85)}`} stroke={['#ea3943', '#ff8a3d', '#f0b90b', '#93d900', '#16c784'][i]} strokeWidth="14" fill="none" />;
              })}
              <line x1="100" y1="100" x2="100" y2="30" stroke="#e6e9ef" strokeWidth="3" strokeLinecap="round" transform={`rotate(${(fg / 100) * 180 - 90} 100 100)`} />
              <circle cx="100" cy="100" r="6" fill="#e6e9ef" />
            </svg>
            <div className="fg-val" style={{ color: fgColor(fg) }}>{fg}</div>
            <div className="fg-label">{fgLabel(fg)}</div>
            <p className="small muted">« Sois craintif quand les autres sont avides, et avide quand les autres sont craintifs. » — W. Buffett</p>
          </div>
        </div>
        <div className="panel pad">
          <div className="panel-title">🚀 Plus fortes hausses 24h</div>
          {sorted.slice(0, 6).map((t) => (
            <div key={t.sym} className="mover" onClick={() => go(t.sym)}><b>{t.sym}</b><span className="mono">{fmtPrice(t.price)}</span><span className="up">{fmtPct(t.ch24)}</span></div>
          ))}
        </div>
        <div className="panel pad">
          <div className="panel-title">🔻 Plus fortes baisses 24h</div>
          {sorted.slice(-6).reverse().map((t) => (
            <div key={t.sym} className="mover" onClick={() => go(t.sym)}><b>{t.sym}</b><span className="mono">{fmtPrice(t.price)}</span><span className="down">{fmtPct(t.ch24)}</span></div>
          ))}
        </div>
      </div>

      <div className="panel pad">
        <div className="panel-title">
          Carte thermique du marché
          <span className="seg small">{[['ch1h', '1h'], ['ch24', '24h'], ['ch7d', '7j'], ['ch30d', '30j']].map(([k, l]) => <button key={k} className={cls(hm === k && 'on')} onClick={() => setHm(k)}>{l}</button>)}</span>
        </div>
        <div className="heatmap">
          {coins.map((c) => {
            const t = tickers[c.sym];
            if (!t) return null;
            const size = Math.max(1, Math.log10(c.volume) - 7);
            return (
              <div key={c.sym} className="heat" style={{ background: heatColor(t[hm]), flexGrow: size, minWidth: 70 + size * 20 }} onClick={() => go(c.sym)}>
                <b>{c.sym}</b>
                <span>{fmtPct(t[hm])}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid-2">
        <div className="panel pad">
          <div className="panel-title">📰 Fil d'actualités</div>
          <div className="news-list">
            {news.map((n) => (
              <div key={n.id} className={cls('news', n.impact)} onClick={() => n.sym && go(n.sym)}>
                <div className="news-meta">
                  <span className="muted">{fmtDateTime(n.t * 1000)}</span>
                  {n.sym ? <span className="tag">{n.sym}</span> : <span className="tag">Marché global</span>}
                  <span className={cls('tag', n.kind === 'rumeur' ? '' : n.impact === 'up' ? 'tag-up' : 'tag-down')}>{n.kind === 'rumeur' ? 'Rumeur' : n.kind === 'macro' ? 'Macro' : 'Actualité'}</span>
                  {n.move != null && <span className={n.move >= 0 ? 'up' : 'down'}>{fmtPct(n.move * 100, 1)}</span>}
                </div>
                <div>{n.title}</div>
              </div>
            ))}
            {!news.length && <div className="empty">Aucune actualité pour l'instant.</div>}
          </div>
        </div>
        <div className="panel pad chat-panel">
          <div className="panel-title">💬 Chat des traders</div>
          <div className="chat" ref={chatRef}>
            {chat.map((m, i) => (
              <div key={i} className={cls('chat-msg', m.uid && m.uid === me?.id && 'me', m.player && 'player')}>
                <span className="muted">{fmtTime(m.t, false)}</span> {m.avatar && <span>{m.avatar}</span>} <b style={{ color: m.uid && m.uid === me?.id ? '#4f8cff' : `hsl(${hash(m.user) % 360} 60% 65%)` }}>{m.user}</b>{m.player && <span className="tag">joueur</span>} {m.text}
              </div>
            ))}
          </div>
          <div className="chat-input">
            <input placeholder="Écris un message…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} maxLength={280} />
            <button className="primary small" onClick={send}>Envoyer</button>
          </div>
          <p className="small muted">⚠️ Comme sur les vrais réseaux, ne suis jamais les conseils du chat sans faire ta propre analyse.</p>
        </div>
      </div>
    </div>
  );
}

function hash(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}
