import { useEffect, useMemo, useState } from 'react';
import { useStore, setState, api, setMemeMode, subscribeMeme, onMemeTick, onPlayerTrade } from '../lib/store.js';
import { fmtUsd, fmtSigned, fmtPct, fmtCompact, fmtQty, fmtTime, fmtDuration, cls, pnlClass } from '../lib/format.js';
import MemeChart from '../components/MemeChart.jsx';
import { MEME_TIPS, MEME_GUIDE, MEME_GLOSSARY } from '../data/memeGuide.js';

const SUPPLY = 1e9;
const GRAD = 69000;
const FEE = 0.01;
const age = (ms) => fmtDuration((Date.now() - ms) / 1000);

export function riskOf(t) {
  if (t.rugged) return { score: 100, label: 'RUG', checks: [['bad', 'Le créateur a retiré la liquidité : token mort']] };
  let s = 0;
  const checks = [];
  const add = (pts, level, text) => { s += pts; checks.push([level, text]); };
  if (t.devPct > 10) add(25, 'bad', `Le créateur détient ${t.devPct.toFixed(1)} % de l'offre`);
  else if (t.devPct > 4) add(12, 'warn', `Le créateur détient ${t.devPct.toFixed(1)} % de l'offre`);
  else checks.push(['ok', t.devSold ? 'Le créateur a vendu ses jetons' : `Le créateur détient peu de jetons (${t.devPct.toFixed(1)} %)`]);
  if (t.devSold && t.devPct < 0.5 && !t.graduated && t.progress > 20) add(8, 'warn', 'Le créateur a vendu avant la migration (projet abandonné ?)');
  if (t.top10 > 50) add(25, 'bad', `Top 10 des portefeuilles : ${t.top10.toFixed(0)} % (très concentré)`);
  else if (t.top10 > 32) add(12, 'warn', `Top 10 des portefeuilles : ${t.top10.toFixed(0)} %`);
  else checks.push(['ok', `Top 10 des portefeuilles : ${t.top10.toFixed(0)} % (bien réparti)`]);
  if (t.snipers > 12) add(15, 'bad', `${t.snipers} snipers au lancement`);
  else if (t.snipers > 5) add(7, 'warn', `${t.snipers} snipers au lancement`);
  else checks.push(['ok', `Peu de snipers (${t.snipers})`]);
  if (t.bundled > 25) add(20, 'bad', `${t.bundled.toFixed(0)} % achetés en « bundle » (le dev contrôle sûrement ces portefeuilles)`);
  else if (t.bundled > 10) add(10, 'warn', `${t.bundled.toFixed(0)} % achetés en bundle`);
  else checks.push(['ok', 'Pas de bundle significatif']);
  const soc = ['x', 'tg', 'web'].filter((k) => t.socials[k]).length;
  if (soc === 0) add(10, 'warn', 'Aucun réseau social');
  else checks.push(['ok', `${soc} réseau${soc > 1 ? 'x' : ''} social${soc > 1 ? 'aux' : ''}`]);
  if (Date.now() - t.createdAt < 5 * 60_000) add(8, 'warn', 'Moins de 5 minutes : extrêmement volatil');
  if (t.holders < 40) add(5, 'warn', `Seulement ${t.holders} détenteurs`);
  s = Math.min(99, s);
  return { score: s, label: s < 25 ? 'Faible' : s < 50 ? 'Moyen' : s < 75 ? 'Élevé' : 'Extrême', checks };
}

const riskCls = (s) => (s < 25 ? 'ok' : s < 50 ? 'mid' : s < 75 ? 'high' : 'bad');

function quoteBuy(t, usd) {
  const R = t.liquidity / 2, T = R / t.price, k = R * T;
  const net = usd * (1 - FEE);
  const R2 = R + net, T2 = k / R2;
  return { tokens: T - T2, impact: (R2 / T2 / t.price - 1) * 100, mcapAfter: (R2 / T2) * SUPPLY };
}
function quoteSell(t, tokens) {
  const R = t.liquidity / 2, T = R / t.price, k = R * T;
  const T2 = T + tokens, R2 = k / T2;
  const gross = R - R2;
  return { usd: gross * (1 - FEE), impact: (R2 / T2 / t.price - 1) * 100 };
}

function Socials({ s }) {
  return <span className="meme-soc">{s.x && <i title="X / Twitter">𝕏</i>}{s.tg && <i title="Telegram">✈</i>}{s.web && <i title="Site web">🌐</i>}</span>;
}

function Progress({ t }) {
  return (
    <div className="meme-prog" title={t.graduated ? 'Migré sur le DEX' : `Courbe de liaison : ${t.progress.toFixed(0)} % vers la migration (${fmtCompact(GRAD)} $)`}>
      <div style={{ width: `${t.graduated ? 100 : t.progress}%` }} className={cls(t.graduated && 'done')} />
    </div>
  );
}

function TokenCard({ t, onOpen, quick, held }) {
  const r = riskOf(t);
  const val = held ? held.qty * t.price : 0;
  const buy = (e) => { e.stopPropagation(); api('POST', `/api/memes/${t.id}/buy`, { usd: quick, slippage: 25 }).catch(() => {}); };
  return (
    <div className={cls('meme-card', t.rugged && 'rugged', held && 'held')} onClick={() => onOpen(t.id)}>
      <div className="meme-av">{t.emoji}</div>
      <div className="meme-info">
        <div className="meme-row1"><b>{t.name}</b> <span className="muted">${t.ticker}</span> {held && <span className="tag-held">💼 MON BAG</span>}</div>
        <div className="meme-row2 small">
          <span className="muted">{age(t.createdAt)}</span>
          <span>MC <b className="mono">{fmtCompact(t.mcap)} $</b></span>
          <span className={pnlClass(t.ch5m)}>{fmtPct(t.ch5m, 1)}</span>
          <span className="muted">👥 {t.holders}</span>
          <Socials s={t.socials} />
        </div>
        <div className="meme-row3">
          <Progress t={t} />
          <span className={cls('risk-pill', riskCls(r.score))} title="Score de risque (rug check)">{r.label}</span>
          <span className="small muted">Vol 1h {fmtCompact(t.vol1h)} $</span>
        </div>
        {held && (
          <div className="held-row small">
            💼 Placé <b className="mono">{fmtUsd(held.cost)}</b> → <b className="mono">{fmtUsd(val)}</b>
            <b className={cls('mono', pnlClass(val - held.cost))}>{fmtSigned(val - held.cost)} ({held.cost ? fmtPct((val / held.cost - 1) * 100, 0) : '—'})</b>
          </div>
        )}
      </div>
      {!t.rugged && <button className="quick-buy" onClick={buy} title={`Achat express de ${quick} $`}>⚡ {quick} $</button>}
    </div>
  );
}

function Board({ tokens, onOpen, held }) {
  const [quick, setQuick] = useState(() => Number(localStorage.getItem('ts.memeQuick') || 50));
  const [q, setQ] = useState('');
  const [hideRisk, setHideRisk] = useState(false);
  const [hideDead, setHideDead] = useState(true);
  const [mine, setMine] = useState(false);
  const [tip, setTip] = useState(() => Math.floor(Math.random() * MEME_TIPS.length));
  const feed = useStore((s) => s.memeFeed);
  useEffect(() => { const i = setInterval(() => setTip((x) => (x + 1) % MEME_TIPS.length), 20000); return () => clearInterval(i); }, []);
  const filt = tokens.filter((t) => {
    if (mine && !held.has(t.id)) return false;
    if (q && !(t.name + t.ticker).toLowerCase().includes(q.toLowerCase())) return false;
    if (hideRisk && riskOf(t).score >= 50) return false;
    if (hideDead && (t.rugged || (t.vol5m < 20 && Date.now() - t.createdAt > 3600_000))) return held.has(t.id);
    return true;
  });
  const fresh = filt.filter((t) => !t.graduated && t.progress < 45).sort((a, b) => b.createdAt - a.createdAt);
  const soon = filt.filter((t) => !t.graduated && t.progress >= 45).sort((a, b) => b.progress - a.progress);
  const grad = filt.filter((t) => t.graduated).sort((a, b) => b.vol1h - a.vol1h);
  const king = [...tokens].filter((t) => !t.graduated && !t.rugged).sort((a, b) => b.mcap - a.mcap)[0];
  const setQ2 = (v) => { setQuick(v); localStorage.setItem('ts.memeQuick', String(v)); };
  const col = (title, hint, list) => (
    <div className="meme-col panel">
      <div className="panel-title"><span>{title} <span className="muted small">({list.length})</span></span><span className="small muted">{hint}</span></div>
      <div className="meme-list">{list.length ? list.map((t) => <TokenCard key={t.id} t={t} onOpen={onOpen} quick={quick} held={held.get(t.id)} />) : <p className="muted small pad">Rien pour l'instant…</p>}</div>
    </div>
  );
  return (
    <>
      <div className="meme-tip panel pad"><b>💡 Astuce degen :</b> {MEME_TIPS[tip]}</div>
      <div className="meme-toolbar">
        <input placeholder="🔍 Chercher un token ou un ticker" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="chk mine"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> 💼 Seulement mes tokens</label>
        <label className="chk"><input type="checkbox" checked={hideRisk} onChange={(e) => setHideRisk(e.target.checked)} /> Cacher les tokens à risque élevé</label>
        <label className="chk"><input type="checkbox" checked={hideDead} onChange={(e) => setHideDead(e.target.checked)} /> Cacher les tokens morts / rug</label>
        <span className="muted small">Achat express :</span>
        {[10, 25, 50, 100, 250, 500].map((v) => <button key={v} className={cls('chip', quick === v && 'on')} onClick={() => setQ2(v)}>{v} $</button>)}
      </div>
      {king && (
        <div className="meme-king panel" onClick={() => onOpen(king.id)}>
          <span className="crown">👑 Roi de la colline</span>
          <span className="meme-av sm">{king.emoji}</span>
          <b>{king.name}</b> <span className="muted">${king.ticker}</span>
          <span>MC <b className="mono">{fmtCompact(king.mcap)} $</b></span>
          <Progress t={king} />
          <span className="small muted">{king.progress.toFixed(0)} % vers la migration</span>
        </div>
      )}
      <div className="meme-board">
        {col('🌱 Nouveaux lancements', 'courbe < 45 %', fresh)}
        {col('🔥 Bientôt migrés', 'courbe ≥ 45 %', soon)}
        {col('🎓 Migrés sur le DEX', `MC > ${fmtCompact(GRAD)} $`, grad)}
        <div className="meme-col panel">
          <div className="panel-title"><span>📡 Fil en direct</span></div>
          <div className="meme-list feed">
            {feed.map((e, i) => <div key={i} className={cls('feed-item', e.kind)} onClick={() => onOpen(e.id)}><span className="muted small">{fmtTime(e.t * 1000)}</span> {e.text}</div>)}
          </div>
        </div>
      </div>
    </>
  );
}

function TradeBox({ t, holding }) {
  const cash = useStore((s) => s.account?.cash ?? 0);
  const [side, setSide] = useState('buy');
  const [amt, setAmt] = useState('50');
  const [slip, setSlip] = useState(Number(localStorage.getItem('ts.memeSlip') || 15));
  const usd = Number(amt) || 0;
  const qb = usd > 0 ? quoteBuy(t, usd) : null;
  const value = holding ? holding.qty * t.price : 0;
  const recoupPct = holding && value > 0 ? Math.min(100, (holding.cost / (value * (1 - FEE))) * 100) : 100;
  const doBuy = () => api('POST', `/api/memes/${t.id}/buy`, { usd, slippage: slip }).catch(() => {});
  const doSell = (pct) => api('POST', `/api/memes/${t.id}/sell`, { pct, slippage: slip }).catch(() => {});
  const setS = (v) => { setSlip(v); localStorage.setItem('ts.memeSlip', String(v)); };
  return (
    <div className="panel pad meme-trade">
      <div className="tabs2"><button className={cls(side === 'buy' && 'on')} onClick={() => setSide('buy')}>Acheter</button><button className={cls(side === 'sell' && 'on')} onClick={() => setSide('sell')}>Vendre</button></div>
      {t.rugged && <div className="rug-banner">💀 Ce token a été rug pull. Tu peux encore vendre, mais il ne vaut presque plus rien.</div>}
      {side === 'buy' ? (
        <>
          <div className="small muted">Solde disponible (partagé avec le trading classique) : <b className="mono">{fmtUsd(cash)}</b></div>
          <div className="presets">{[10, 25, 50, 100, 250, 500].map((v) => <button key={v} onClick={() => setAmt(String(v))}>{v} $</button>)}</div>
          <input type="number" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="Montant en $" />
          {qb && (
            <div className="quote small">
              <div><span>Tu reçois ≈</span><b className="mono">{fmtQty(qb.tokens)} ${t.ticker}</b></div>
              <div><span>Impact sur le prix</span><b className={cls('mono', qb.impact > slip ? 'down' : qb.impact > 5 ? 'warn' : '')}>+{qb.impact.toFixed(2)} %</b></div>
              <div><span>Frais (1 %)</span><b className="mono">{fmtUsd(usd * FEE)}</b></div>
              <div><span>Market cap après ton achat</span><b className="mono">{fmtCompact(qb.mcapAfter)} $</b></div>
              <div><span>Si le MC atteint 1 M $</span><b className="mono up">{fmtUsd((qb.tokens * 1e6) / SUPPLY)}</b></div>
            </div>
          )}
          <button className="buy-btn big" disabled={!usd || usd > cash} onClick={doBuy}>Acheter {usd ? fmtUsd(usd) : ''} de ${t.ticker}</button>
        </>
      ) : holding ? (
        <>
          <div className="presets">{[25, 50, 75, 100].map((p) => <button key={p} className="sellp" onClick={() => doSell(p)}>Vendre {p} %</button>)}</div>
          {value * (1 - FEE) > holding.cost * 1.05 && (
            <button className="ghost recoup" onClick={() => doSell(recoupPct)}>💸 Récupérer ma mise ({recoupPct.toFixed(0)} %) et laisser courir le reste gratuitement</button>
          )}
          <div className="quote small">
            <div><span>Tu recevrais (100 %)</span><b className="mono">{fmtUsd(quoteSell(t, holding.qty).usd)}</b></div>
            <div><span>Impact de ta vente</span><b className="mono down">{quoteSell(t, holding.qty).impact.toFixed(2)} %</b></div>
          </div>
        </>
      ) : <p className="muted small">Tu ne possèdes pas encore ce token.</p>}
      <div className="slip-row small"><span className="muted">Slippage max :</span>{[5, 15, 25, 50].map((v) => <button key={v} className={cls('chip', slip === v && 'on')} onClick={() => setS(v)}>{v} %</button>)}</div>
      {holding && (
        <div className="meme-pos">
          <div><span>Ton bag</span><b className="mono">{fmtQty(holding.qty)}</b></div>
          <div><span>Valeur</span><b className="mono">{fmtUsd(value)}</b></div>
          <div><span>Investi</span><b className="mono">{fmtUsd(holding.cost)}</b></div>
          <div><span>P&L</span><b className={cls('mono', pnlClass(value - holding.cost))}>{fmtSigned(value - holding.cost)} ({holding.cost ? 'x' + (value / holding.cost).toFixed(2) : '—'})</b></div>
          <div><span>MC d'entrée moyen</span><b className="mono">{fmtCompact((holding.cost / holding.qty) * SUPPLY)} $</b></div>
        </div>
      )}
    </div>
  );
}

function TokenView({ id, onBack }) {
  const [d, setD] = useState(null);
  const [tf, setTf] = useState('5s');
  const [mode, setMode] = useState('mcap');
  const [trades, setTrades] = useState([]);
  const [pTrades, setPTrades] = useState(null);
  const account = useStore((s) => s.account);
  const me = useStore((s) => s.me);
  const holding = account?.memes?.[id];
  useEffect(() => {
    let alive = true;
    const load = () => api('GET', `/api/memes/${id}`).then(({ token }) => { if (alive) { setD(token); setTrades((x) => (x.length ? x : token.trades.slice().reverse())); setPTrades((x) => x ?? token.playerTrades); } }).catch(() => onBack());
    load();
    const i = setInterval(load, 15000);
    return () => { alive = false; clearInterval(i); };
  }, [id]);
  useEffect(() => {
    subscribeMeme(id, tf);
    const off = onMemeTick((m) => {
      if (m.id !== id) return;
      setD((x) => (x ? { ...x, ...m.stats } : x));
      if (m.trades.length) setTrades((x) => [...m.trades.slice().reverse(), ...x].slice(0, 40));
    });
    const offP = onPlayerTrade((m) => { if (m.id === id) setPTrades((x) => [...(x || []), m.trade]); });
    return () => { off(); offP(); subscribeMeme(null); };
  }, [id, tf]);
  if (!d) return <p className="muted pad">Chargement…</p>;
  const r = riskOf(d);
  const fromAth = (d.mcap / d.athMcap - 1) * 100;
  return (
    <div className="meme-token">
      <div className="meme-head panel pad">
        <button className="ghost small" onClick={onBack}>← Retour</button>
        <div className="meme-av lg">{d.emoji}</div>
        <div>
          <h2>{d.name} <span className="muted">${d.ticker}</span> {d.graduated && <span className="tag-grad">🎓 Migré</span>} {d.rugged && <span className="tag-rug">💀 RUG</span>}</h2>
          <div className="small muted">Créé par {d.creator} · il y a {age(d.createdAt)} · <Socials s={d.socials} /></div>
          <div className="small">« {d.story} »</div>
        </div>
        {holding && (
          <div className="pos-banner">
            <small>💼 Tu as placé de l'argent ici</small>
            <b className="mono">{fmtUsd(holding.cost)} → {fmtUsd(holding.qty * d.price)}</b>
            <small className={pnlClass(holding.qty * d.price - holding.cost)}>{fmtSigned(holding.qty * d.price - holding.cost)} · x{(holding.qty * d.price / holding.cost).toFixed(2)} · entrée à {fmtCompact((holding.cost / holding.qty) * SUPPLY)} $ de MC</small>
          </div>
        )}
        <div className="meme-head-mc">
          <small className="muted">Market cap</small>
          <b className="mono">{fmtCompact(d.mcap)} $</b>
          <small className={pnlClass(d.ch5m)}>{fmtPct(d.ch5m, 1)} (5 min) · <span className={pnlClass(d.ch1h)}>{fmtPct(d.ch1h, 1)} (1 h)</span></small>
        </div>
      </div>
      <div className="meme-main">
        <div className="meme-left">
          <div className="panel">
            <div className="panel-title">
              <span className="tfs">{['5s', '15s', '1m', '5m', '15m', '1h'].map((x) => <button key={x} className={cls('chip', tf === x && 'on')} onClick={() => setTf(x)}>{x}</button>)}</span>
              <span className="tfs"><button className={cls('chip', mode === 'mcap' && 'on')} onClick={() => setMode('mcap')}>Market cap</button><button className={cls('chip', mode === 'price' && 'on')} onClick={() => setMode('price')}>Prix</button></span>
            </div>
            <MemeChart id={id} tf={tf} mode={mode} playerTrades={pTrades || []} meId={me?.id} />
          </div>
          <div className="stats-grid">
            <div className="stat"><span>Prix</span><b className="mono">{d.price.toPrecision(4)} $</b></div>
            <div className="stat"><span>Liquidité</span><b className="mono">{fmtCompact(d.liquidity)} $</b></div>
            <div className="stat"><span>Volume 5 min / 1 h</span><b className="mono">{fmtCompact(d.vol5m)} / {fmtCompact(d.vol1h)}</b></div>
            <div className="stat"><span>Détenteurs</span><b className="mono">{d.holders.toLocaleString('fr-FR')}</b></div>
            <div className="stat"><span>Achats / ventes</span><b className="mono"><span className="up">{d.buys}</span> / <span className="down">{d.sells}</span></b></div>
            <div className="stat"><span>Plus haut (ATH)</span><b className="mono">{fmtCompact(d.athMcap)} $ <small className={pnlClass(fromAth)}>{fmtPct(fromAth, 0)}</small></b></div>
          </div>
          <div className="panel pad">
            <div className="panel-title"><span>📈 Courbe de liaison (bonding curve)</span><span className="small muted">{d.graduated ? 'Migré sur le DEX' : `${d.progress.toFixed(1)} %`}</span></div>
            <Progress t={d} />
            <p className="small muted">{d.graduated ? 'Le token a atteint la market cap de migration : sa liquidité a été transférée sur un DEX, ce qui rend le prix moins sensible aux gros ordres.' : `Encore ${fmtCompact(Math.max(0, GRAD - d.mcap))} $ de market cap avant la migration sur le DEX. Plus on est tôt sur la courbe, plus le potentiel… et le risque sont élevés.`}</p>
          </div>
          <div className="grid-2">
            <div className="panel">
              <div className="panel-title"><span>⚡ Transactions en direct</span></div>
              <div className="meme-trades">
                {trades.map((x, i) => (
                  <div key={x.t + '-' + i} className={cls('mt-row', x.side)}>
                    <span className="muted">{fmtTime(x.t)}</span>
                    <span className={x.side === 'buy' ? 'up' : 'down'}>{x.side === 'buy' ? 'Achat' : 'Vente'}</span>
                    <span className="mono">{fmtUsd(x.usd)}</span>
                    <span className="muted ellip">{x.user}{x.tag && <i className={cls('wtag', x.tag)}>{x.tag}</i>}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="panel">
              <div className="panel-title"><span>💬 Commentaires</span></div>
              <div className="meme-trades">
                {d.comments.length ? d.comments.slice().reverse().map((c, i) => <div key={i} className="cm-row"><b>{c.user}</b> <span className="muted small">{fmtTime(c.t)}</span><div>{c.text}</div></div>) : <p className="muted small pad">Pas encore de commentaires.</p>}
              </div>
            </div>
          </div>
        </div>
        <div className="meme-right">
          <TradeBox t={d} holding={holding} />
          <div className="panel pad">
            <div className="panel-title"><span>🎮 Joueurs sur ce token</span><span className="small muted">{d.players.length} joueur{d.players.length > 1 ? 's' : ''}</span></div>
            {d.players.length ? d.players.map((p) => (
              <div key={p.id} className={cls('player-row small', p.id === me?.id && 'me')}>
                <span className="lb-av">{p.avatar}</span>
                <span className="ellip"><b>{p.name}</b><br /><span className="muted">entré à {fmtCompact(p.entryMcap)} $ de MC</span></span>
                <span className="mono">{fmtUsd(p.cost, 0)} → {fmtUsd(p.qty * d.price, 0)}</span>
                <b className={cls('mono', pnlClass(p.qty * d.price - p.cost))}>x{(p.qty * d.price / p.cost).toFixed(2)}</b>
              </div>
            )) : <p className="small muted">Aucun joueur n'a encore de bag ici. Sois le premier !</p>}
            {(pTrades || []).length > 0 && (
              <>
                <div className="small muted" style={{ marginTop: 8 }}>Derniers trades des joueurs</div>
                {(pTrades || []).slice(-8).reverse().map((x, i) => (
                  <div key={x.t + '-' + i} className="small player-trade">
                    <span>{x.avatar} <b>{x.name}</b></span>
                    <span className={x.side === 'buy' ? 'up' : 'down'}>{x.side === 'buy' ? 'achète' : 'vend'} {fmtUsd(x.usd, 0)}</span>
                    <span className="muted">à {fmtCompact(x.mcap)} $ · {fmtTime(x.t)}</span>
                  </div>
                ))}
              </>
            )}
          </div>
          <div className="panel pad">
            <div className="panel-title"><span>🛡️ Rug check</span><span className={cls('risk-pill', riskCls(r.score))}>Risque {r.label} · {r.score}/100</span></div>
            <div className="checks">{r.checks.map(([lvl, txt], i) => <div key={i} className={cls('check', lvl)}>{lvl === 'ok' ? '✅' : lvl === 'warn' ? '⚠️' : '❌'} {txt}</div>)}</div>
            <p className="small muted">Ce score aide à repérer les arnaques, mais il ne garantit rien : environ un rug sur quatre a l'air « propre ».</p>
          </div>
          <div className="panel pad">
            <div className="panel-title"><span>🐋 Top 10 des détenteurs</span><span className="small muted">{d.top10.toFixed(1)} % de l'offre</span></div>
            {d.holdersList.map((h, i) => (
              <div key={i} className="holder-row small">
                <span className="mono muted">{i + 1}.</span>
                <span className={cls('ellip', h.dev && 'warn')}>{h.who}{h.dev ? ' 🛠️' : ''}{h.sniper ? ' 🎯' : ''}</span>
                <div className="hbar"><div style={{ width: `${Math.min(100, h.pct * 4)}%` }} className={cls(h.dev && 'dev')} /></div>
                <span className="mono">{h.pct.toFixed(2)} %</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Bags({ tokens, onOpen }) {
  const account = useStore((s) => s.account);
  const map = Object.fromEntries(tokens.map((t) => [t.id, t]));
  const bags = Object.entries(account?.memes || {}).map(([id, h]) => ({ id: Number(id), h, t: map[id] }));
  const trades = (account?.trades || []).filter((t) => t.kind === 'meme').slice().reverse();
  const closed = trades.filter((t) => t.pnl != null);
  const wins = closed.filter((t) => t.pnl > 0);
  const total = closed.reduce((a, t) => a + t.pnl, 0);
  const best = closed.reduce((a, t) => (t.pnl > (a?.pnl ?? -Infinity) ? t : a), null);
  const worst = closed.reduce((a, t) => (t.pnl < (a?.pnl ?? Infinity) ? t : a), null);
  const sell = (id, pct) => api('POST', `/api/memes/${id}/sell`, { pct, slippage: 50 }).catch(() => {});
  return (
    <>
      <div className="cards">
        <div className="card big"><span>Valeur de tes bags</span><b className="mono">{fmtUsd(account?.memeValue ?? 0)}</b><small className="muted">Solde partagé : {fmtUsd(account?.cash ?? 0)}</small></div>
        <div className="card"><span>P&L réalisé (meme)</span><b className={cls('mono', pnlClass(total))}>{fmtSigned(total)}</b></div>
        <div className="card"><span>Ventes gagnantes</span><b className="mono">{closed.length ? ((wins.length / closed.length) * 100).toFixed(0) + ' %' : '—'}</b><small className="muted">{wins.length} / {closed.length}</small></div>
        <div className="card"><span>Meilleur trade</span><b className="mono up">{best ? fmtSigned(best.pnl) : '—'}</b><small className="muted">{best?.sym}</small></div>
        <div className="card"><span>Pire trade</span><b className="mono down">{worst ? fmtSigned(worst.pnl) : '—'}</b><small className="muted">{worst?.sym}</small></div>
      </div>
      <div className="panel">
        <div className="panel-title"><span>🎒 Mes bags</span></div>
        <table className="tbl">
          <thead><tr><th>Token</th><th>Quantité</th><th>Investi</th><th>Valeur</th><th>P&L</th><th>Multiple</th><th>MC actuel</th><th /></tr></thead>
          <tbody>
            {bags.length ? bags.map(({ id, h, t }) => {
              const v = t ? h.qty * t.price : 0;
              return (
                <tr key={id}>
                  <td><a onClick={() => onOpen(id)}>{h.emoji} {h.name} <span className="muted">${h.ticker}</span></a> {t?.rugged && <span className="tag-rug">RUG</span>}</td>
                  <td className="mono">{fmtQty(h.qty)}</td>
                  <td className="mono">{fmtUsd(h.cost)}</td>
                  <td className="mono">{fmtUsd(v)}</td>
                  <td className={cls('mono', pnlClass(v - h.cost))}>{fmtSigned(v - h.cost)}</td>
                  <td className="mono">x{h.cost ? (v / h.cost).toFixed(2) : '—'}</td>
                  <td className="mono">{t ? fmtCompact(t.mcap) + ' $' : '—'}</td>
                  <td><button className="sell-btn small" onClick={() => sell(id, 50)}>50 %</button> <button className="sell-btn small" onClick={() => sell(id, 100)}>Tout vendre</button></td>
                </tr>
              );
            }) : <tr><td colSpan={8} className="muted">Aucun bag pour l'instant. Va dans l'onglet Tokens pour acheter ton premier meme coin.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <div className="panel-title"><span>🧾 Historique meme coins</span></div>
        <table className="tbl">
          <thead><tr><th>Date</th><th>Token</th><th>Sens</th><th>Montant</th><th>Frais</th><th>P&L</th></tr></thead>
          <tbody>
            {trades.slice(0, 100).map((t) => (
              <tr key={t.id}>
                <td className="muted">{new Date(t.t).toLocaleString('fr-FR')}</td>
                <td><a onClick={() => onOpen(t.memeId)}>{t.sym}</a></td>
                <td className={t.side === 'buy' ? 'up' : 'down'}>{t.side === 'buy' ? 'Achat' : 'Vente'}</td>
                <td className="mono">{fmtUsd(t.qty * t.price)}</td>
                <td className="mono muted">{fmtUsd(t.fee)}</td>
                <td className={cls('mono', pnlClass(t.pnl))}>{t.pnl == null ? '—' : `${fmtSigned(t.pnl)} (${fmtPct(t.pnlPct, 0)})`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const N = (v) => Number(String(v).replace(',', '.')) || 0;

function MemeTools() {
  const [c1, setC1] = useState({ bet: 100, entry: 8000, target: 500000 });
  const value = c1.entry > 0 ? (c1.bet * (1 - FEE) * c1.target) / c1.entry * (1 - FEE) : 0;
  const [c2, setC2] = useState({ liq: 12000, amt: 500 });
  const R = c2.liq / 2;
  const impact = R > 0 ? (((R + c2.amt * (1 - FEE)) / R) ** 2 - 1) * 100 : 0;
  const [c3, setC3] = useState({ bet: 100 });
  const plan = [[2, 50, 'Tu récupères ta mise : le reste est « gratuit »'], [5, 25, 'Tu sécurises un gros profit'], [10, 15, 'Encore une prise de profit'], [null, 10, 'Moonbag : tu le laisses courir (ou mourir)']];
  let left = 1, cum = 0;
  const [c4, setC4] = useState({ cap: 10000, pct: 5, n: 10 });
  const budget = (c4.cap * c4.pct) / 100;
  const [c5, setC5] = useState({ win: 15, gain: 300, loss: 70 });
  const ev = (c5.win / 100) * c5.gain - (1 - c5.win / 100) * c5.loss;
  const inp = (st, set, k, label, suffix) => (
    <label className="fld"><span>{label}</span><div className="with-suffix"><input type="number" value={st[k]} onChange={(e) => set({ ...st, [k]: N(e.target.value) })} />{suffix && <i>{suffix}</i>}</div></label>
  );
  return (
    <div className="grid-2">
      <div className="panel pad">
        <h3>🎯 Calculateur de multiple</h3>
        <p className="small muted">Combien vaut ta mise si le token atteint une market cap cible ? C'est la market cap qu'il faut regarder, pas le prix unitaire.</p>
        {inp(c1, setC1, 'bet', 'Mise', '$')}{inp(c1, setC1, 'entry', "Market cap à l'achat", '$')}{inp(c1, setC1, 'target', 'Market cap cible', '$')}
        <div className="result">Valeur à la cible (frais inclus) : <b className="mono up">{fmtUsd(value)}</b> soit <b>x{c1.entry ? (c1.target / c1.entry).toFixed(1) : '—'}</b></div>
        <p className="small muted">Repère : passer de 5 k$ à 500 k$ de market cap, c'est un x100. Moins de 1 % des meme coins y arrivent.</p>
      </div>
      <div className="panel pad">
        <h3>🌊 Simulateur d'impact de prix</h3>
        <p className="small muted">Sur un petit token, ton propre achat fait monter le prix. Si tu achètes trop gros, tu paies cher et tu auras du mal à revendre.</p>
        {inp(c2, setC2, 'liq', 'Liquidité du token', '$')}{inp(c2, setC2, 'amt', "Montant de l'achat", '$')}
        <div className="result">Impact : <b className={cls('mono', impact > 15 ? 'down' : impact > 5 ? 'warn' : 'up')}>+{impact.toFixed(2)} %</b></div>
        <p className="small muted">Règle simple : garde ton achat sous 1 à 2 % de la liquidité, sinon tu deviens toi-même la « bougie verte » que les autres vont vendre.</p>
      </div>
      <div className="panel pad">
        <h3>🪜 Plan de sortie échelonné</h3>
        <p className="small muted">Les pros ne vendent presque jamais tout d'un coup : ils prennent leurs profits par paliers.</p>
        {inp(c3, setC3, 'bet', 'Mise', '$')}
        <table className="tbl small">
          <thead><tr><th>Palier</th><th>Vendre</th><th>Encaissé</th><th>Cumul</th><th /></tr></thead>
          <tbody>
            {plan.map(([x, pct, note], i) => {
              const part = pct / 100;
              const got = x ? c3.bet * x * part * (1 - FEE) : null;
              if (got) { cum += got; left -= part; }
              return <tr key={i}><td><b>{x ? 'x' + x : 'Moonbag'}</b></td><td>{pct} %</td><td className="mono">{got ? fmtUsd(got) : '—'}</td><td className="mono up">{got ? fmtUsd(cum) : '—'}</td><td className="muted">{note}</td></tr>;
            })}
          </tbody>
        </table>
        <p className="small muted">Avec ce plan, tu as déjà encaissé {fmtUsd(cum)} à x10, et il te reste {(left * 100).toFixed(0)} % du bag.</p>
      </div>
      <div className="panel pad">
        <h3>🧯 Budget degen</h3>
        <p className="small muted">Les meme coins, c'est de la loterie avec un peu d'analyse. Ne joue que ce que tu acceptes de perdre à 100 %.</p>
        {inp(c4, setC4, 'cap', 'Capital total', '$')}{inp(c4, setC4, 'pct', 'Part réservée aux meme coins', '%')}{inp(c4, setC4, 'n', 'Nombre de tokens visés', '')}
        <div className="result">Budget degen : <b className="mono">{fmtUsd(budget)}</b> · mise par token : <b className="mono">{fmtUsd(c4.n ? budget / c4.n : 0)}</b></div>
        <p className="small muted">Même si tous tes tokens font zéro, tu ne perds que {c4.pct} % de ton capital. Au-delà de 10 %, c'est trop risqué.</p>
      </div>
      <div className="panel pad">
        <h3>🎲 Espérance de ta stratégie</h3>
        <p className="small muted">Gagner souvent ne suffit pas : ce qui compte, c'est le gain moyen multiplié par la probabilité.</p>
        {inp(c5, setC5, 'win', 'Trades gagnants', '%')}{inp(c5, setC5, 'gain', 'Gain moyen quand tu gagnes', '%')}{inp(c5, setC5, 'loss', 'Perte moyenne quand tu perds', '%')}
        <div className="result">Espérance par trade : <b className={cls('mono', pnlClass(ev))}>{fmtPct(ev, 1)}</b> de la mise</div>
        <p className="small muted">{ev > 0 ? 'Stratégie gagnante sur la durée, à condition de rester discipliné.' : 'Stratégie perdante : coupe tes pertes plus tôt ou laisse courir tes gagnants plus longtemps.'}</p>
      </div>
      <div className="panel pad">
        <h3>⏱️ Repères de timing</h3>
        <ul className="tips-list small">
          <li><b>0 à 5 min :</b> zone des snipers. Énorme potentiel, énorme risque de rug.</li>
          <li><b>Courbe de 30 à 80 % :</b> le token a déjà une communauté. Un bon compromis risque/potentiel.</li>
          <li><b>Juste avant la migration :</b> souvent un pic de hype, beaucoup prennent leurs profits dès la migration.</li>
          <li><b>Après la migration :</b> plus de liquidité, mouvements moins brutaux, mais souvent un « dump de migration ».</li>
          <li><b>Volume qui s'effondre :</b> si le volume sur 5 min tombe à presque rien, l'intérêt est mort.</li>
        </ul>
      </div>
    </div>
  );
}

function Guide() {
  return (
    <div className="grid-2">
      {MEME_GUIDE.map((s) => (
        <div key={s.title} className="panel pad">
          <h3>{s.title}</h3>
          <ul className="tips-list">{s.items.map((it, i) => <li key={i} dangerouslySetInnerHTML={{ __html: it }} />)}</ul>
        </div>
      ))}
      <div className="panel pad" style={{ gridColumn: '1 / -1' }}>
        <h3>📖 Glossaire du degen</h3>
        <div className="gloss">{MEME_GLOSSARY.map(([w, d]) => <div key={w}><b>{w}</b><span className="muted"> : {d}</span></div>)}</div>
      </div>
    </div>
  );
}

function MyBagsStrip({ tokens, onOpen, current }) {
  const account = useStore((s) => s.account);
  const map = Object.fromEntries(tokens.map((t) => [t.id, t]));
  const bags = Object.entries(account?.memes || {}).map(([id, h]) => {
    const t = map[id];
    const v = t ? h.qty * t.price : 0;
    return { id: Number(id), h, t, v };
  });
  if (!bags.length) return null;
  const cost = bags.reduce((a, b) => a + b.h.cost, 0);
  const value = bags.reduce((a, b) => a + b.v, 0);
  return (
    <div className="bags-strip panel">
      <div className="bags-sum">
        <small className="muted">💼 Mes placements meme</small>
        <b className="mono">{fmtUsd(cost)} → {fmtUsd(value)}</b>
        <small className={pnlClass(value - cost)}>{fmtSigned(value - cost)} ({cost ? fmtPct((value / cost - 1) * 100, 1) : '—'})</small>
      </div>
      <div className="bags-items">
        {bags.map(({ id, h, t, v }) => (
          <button key={id} className={cls('bag-chip', current === id && 'on', t?.rugged && 'rugged')} onClick={() => onOpen(id)}>
            <span className="meme-av sm">{h.emoji}</span>
            <span className="bag-txt">
              <b>${h.ticker}</b>{t?.rugged && <span className="tag-rug">RUG</span>}
              <small className="muted mono">{fmtUsd(h.cost, 0)} → {fmtUsd(v)}</small>
            </span>
            <b className={cls('mono', pnlClass(v - h.cost))}>{h.cost ? fmtPct((v / h.cost - 1) * 100, 0) : '—'}</b>
          </button>
        ))}
      </div>
    </div>
  );
}

const hm = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
const dayLabel = (ms) => new Date(ms).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });

function Announces({ onOpen }) {
  const [d, setD] = useState(null);
  const feedLen = useStore((s) => s.memeFeed.length);
  useEffect(() => {
    const load = () => api('GET', '/api/memes/celebs').then(setD).catch(() => {});
    load();
    const i = setInterval(load, 15000);
    return () => clearInterval(i);
  }, [feedLen]);
  if (!d) return <p className="muted pad">Chargement…</p>;
  const days = [];
  for (const h of d.history) {
    const k = dayLabel(h.t);
    if (!days.length || days[days.length - 1][0] !== k) days.push([k, []]);
    days[days.length - 1][1].push(h);
  }
  const doneToday = d.slots.filter((s) => s.status === 'done').length;
  return (
    <>
      <div className="panel pad">
        <div className="panel-title"><span>🗓️ Tweets du jour, par tranche de 2 h</span><span className="small muted">{doneToday} / 12 · remis à zéro à minuit</span></div>
        <p className="small muted">Il y a exactement un tweet de célébrité par tranche de 2 heures, à un moment imprévisible. Quand le tweet d'une tranche est passé, inutile d'en attendre un autre avant la tranche suivante.</p>
        <div className="slots">
          {d.slots.map((s) => (
            <div key={s.start} className={cls('slot', s.status)} onClick={() => s.tweet && onOpen(s.tweet.id)}>
              <b>{hm(s.start)} – {hm(s.end).replace('00:00', '24:00')}</b>
              {s.status === 'done' && <span>✅ {hm(s.tweet.t)} · {s.tweet.emoji} ${s.tweet.ticker}<br /><small>x{(s.tweet.athMcap / s.tweet.startMcap).toFixed(1)} max{s.tweet.rugged ? ' · 💀 rug' : ''}</small></span>}
              {s.status === 'current' && <span>⏳ En cours : le tweet peut tomber à tout moment !</span>}
              {s.status === 'upcoming' && <span className="muted">🔒 À venir</span>}
              {s.status === 'missed' && <span className="muted">— Aucun tweet (site en pause)</span>}
            </div>
          ))}
        </div>
      </div>
      <div className="panel pad">
        <div className="panel-title"><span>📢 Historique des annonces (7 derniers jours)</span><span className="small muted">{d.history.length} tweet{d.history.length > 1 ? 's' : ''}</span></div>
        {days.length ? days.map(([day, list]) => (
          <div key={day} className="ann-day">
            <h3>{day}</h3>
            {list.map((h) => (
              <div key={h.t + '-' + h.id} className="ann-row" onClick={() => h.alive && onOpen(h.id)}>
                <span className="mono muted">{hm(h.t)}</span>
                <div className="tw-av sm">{h.celeb.name[0]}</div>
                <div className="ann-txt">
                  <div><b>{h.celeb.name}</b> <span className="muted small">{h.celeb.handle}</span> {!h.scheduled && <span className="tag">bonus admin</span>}</div>
                  <div>« {h.celeb.tweet} »</div>
                </div>
                <div className="ann-res">
                  <span>{h.emoji} <b>${h.ticker}</b></span>
                  <small className="mono">{fmtCompact(h.startMcap)} $ → plus haut {fmtCompact(h.athMcap)} $ <b className="up">x{(h.athMcap / h.startMcap).toFixed(1)}</b></small>
                  <small className={h.rugged ? 'down' : 'muted'}>{h.rugged ? '💀 rug pull' : h.alive ? `Maintenant : ${fmtCompact(h.mcap)} $` : 'token disparu'}</small>
                </div>
              </div>
            ))}
          </div>
        )) : <p className="muted small">Aucune annonce pour l'instant. La prochaine tombera dans la tranche de 2 h en cours.</p>}
      </div>
    </>
  );
}

export default function MemeZone() {
  const tokens = useStore((s) => s.memes);
  const account = useStore((s) => s.account);
  const [tab, setTab] = useState('board');
  const open = useStore((s) => s.memeOpen);
  const setOpen = (id) => setState({ memeOpen: id });
  useEffect(() => {
    setMemeMode(true);
    api('GET', '/api/memes').then((d) => setState({ memes: d.tokens, memeFeed: d.feed })).catch(() => {});
    return () => setMemeMode(false);
  }, []);
  const held = useMemo(() => new Map(Object.entries(account?.memes || {}).map(([id, h]) => [Number(id), h])), [account]);
  const openTok = (id) => { setOpen(id); window.scrollTo(0, 0); };
  return (
    <div className="page meme-page">
      <div className="page-head">
        <div>
          <h1>🐸 Meme Zone <span className="beta">degen</span></h1>
          <p className="muted">Des centaines de meme coins se lancent chaque jour. La plupart meurent, certains sont des arnaques, de rares pépites font x100. Ton argent est partagé avec le trading classique.</p>
        </div>
        <div className="meme-wallet">
          <div><small className="muted">Solde disponible</small><b className="mono">{fmtUsd(account?.cash ?? 0)}</b></div>
          <div><small className="muted">Bags meme</small><b className="mono">{fmtUsd(account?.memeValue ?? 0)}</b></div>
          <button className="primary small" onClick={() => setState({ moneyOpen: true })}>💰 Argent</button>
        </div>
      </div>
      <div className="meme-tabs">
        {[['board', '🚀 Tokens'], ['announces', '📢 Annonces'], ['bags', '🎒 Mes bags'], ['tools', '🧰 Outils degen'], ['guide', '📚 Guide & astuces']].map(([k, l]) => (
          <button key={k} className={cls(tab === k && !open && 'on')} onClick={() => { setTab(k); setOpen(null); }}>{l}{k === 'bags' && held.size ? ` (${held.size})` : ''}</button>
        ))}
      </div>
      <MyBagsStrip tokens={tokens} onOpen={openTok} current={open} />
      {open ? <TokenView key={open} id={open} onBack={() => setOpen(null)} />
        : tab === 'board' ? <Board tokens={tokens} onOpen={openTok} held={held} />
          : tab === 'announces' ? <Announces onOpen={openTok} />
          : tab === 'bags' ? <Bags tokens={tokens} onOpen={openTok} />
            : tab === 'tools' ? <MemeTools /> : <Guide />}
    </div>
  );
}
