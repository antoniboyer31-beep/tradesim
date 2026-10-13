import { useMemo } from 'react';
import { useStore, setState, subscribeMarket } from '../lib/store.js';
import { fmtUsd, fmtSigned, fmtPct, fmtPrice, fmtQty, cls, pnlClass } from '../lib/format.js';
import { EquityChart } from '../components/Chart.jsx';
import { positionPnl } from '../components/BottomPanel.jsx';

function Donut({ parts }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  let acc = 0;
  const R = 54, C = 2 * Math.PI * R;
  return (
    <svg viewBox="0 0 140 140" width="170">
      <circle cx="70" cy="70" r={R} fill="none" stroke="#1a2130" strokeWidth="18" />
      {parts.map((p) => {
        const len = (p.value / total) * C;
        const el = <circle key={p.label} cx="70" cy="70" r={R} fill="none" stroke={p.color} strokeWidth="18" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)" />;
        acc += len;
        return el;
      })}
    </svg>
  );
}

export default function Portfolio() {
  const account = useStore((s) => s.account);
  const tickers = useStore((s) => s.tickers);
  const coinMap = useStore((s) => s.coinMap);
  const eqLen = account?.equity.length;
  const eqPoints = useMemo(() => (account ? [...account.equity, [Math.floor(Date.now() / 1000), account.equityNow]] : []), [eqLen]);

  const stats = useMemo(() => {
    if (!account) return null;
    const closed = account.trades.filter((t) => t.pnl != null);
    const wins = closed.filter((t) => t.pnl > 0), losses = closed.filter((t) => t.pnl <= 0);
    const gw = wins.reduce((s, t) => s + t.pnl, 0), gl = -losses.reduce((s, t) => s + t.pnl, 0);
    const fees = account.trades.reduce((s, t) => s + (t.fee || 0), 0);
    let peak = -Infinity, mdd = 0;
    for (const [, v] of account.equity) { peak = Math.max(peak, v); mdd = Math.max(mdd, (peak - v) / peak); }
    const bySym = {};
    for (const t of closed) bySym[t.sym] = (bySym[t.sym] || 0) + t.pnl;
    let streak = 0, best = 0, worstStreak = 0, cur = 0;
    for (const t of closed) {
      if (t.pnl > 0) { cur = cur > 0 ? cur + 1 : 1; } else { cur = cur < 0 ? cur - 1 : -1; }
      best = Math.max(best, cur); worstStreak = Math.min(worstStreak, cur);
    }
    streak = cur;
    return {
      n: closed.length, winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
      avgWin: wins.length ? gw / wins.length : 0, avgLoss: losses.length ? gl / losses.length : 0,
      pf: gl ? gw / gl : gw ? Infinity : 0, realized: gw - gl, fees, mdd: mdd * 100,
      best: closed.reduce((m, t) => (t.pnl > (m?.pnl ?? -Infinity) ? t : m), null),
      worst: closed.reduce((m, t) => (t.pnl < (m?.pnl ?? Infinity) ? t : m), null),
      bySym: Object.entries(bySym).sort((a, b) => b[1] - a[1]), streak, bestStreak: best, worstStreak,
      liquidations: closed.filter((t) => t.type === 'liquidation').length,
    };
  }, [account?.trades.length, eqLen]);

  if (!account || !stats) return null;
  const price = (s) => tickers[s]?.price ?? 0;
  const holdings = Object.entries(account.holdings).filter(([, h]) => h.qty > 1e-12);
  let spotValue = 0, spotPnl = 0;
  for (const [s, h] of holdings) { spotValue += h.qty * price(s); spotPnl += h.qty * (price(s) - h.avg); }
  let futValue = 0, futPnl = 0;
  for (const p of account.positions) { const { pnl } = positionPnl(p, price(p.sym)); futValue += Math.max(0, p.margin + pnl); futPnl += pnl; }
  const reserved = account.orders.reduce((s, o) => s + (o.reserved || 0) + (o.kind === 'spot' && o.side === 'sell' ? o.qty * price(o.sym) : 0), 0);
  const equity = account.cash + spotValue + futValue + reserved;
  const netDeposits = account.deposits - account.withdrawals;
  const totalPnl = equity - netDeposits;

  const parts = [
    { label: 'Liquidités', value: account.cash, color: '#4f8cff' },
    ...holdings.map(([s, h]) => ({ label: s, value: h.qty * price(s), color: coinMap[s]?.color || '#888' })),
    { label: 'Positions à levier', value: futValue, color: '#c77dff' },
    { label: 'Réservé (ordres)', value: reserved, color: '#5c677d' },
  ].filter((p) => p.value > 0.005);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Portefeuille</h1>
        <button className="primary" onClick={() => setState({ moneyOpen: true })}>💰 Gérer mon argent fictif</button>
      </div>
      <div className="cards">
        <div className="card big"><span>Valeur totale</span><b className="mono">{fmtUsd(equity)}</b><small className={pnlClass(totalPnl)}>{fmtSigned(totalPnl)} ({fmtPct((totalPnl / netDeposits) * 100)}) depuis le début</small></div>
        <div className="card"><span>Liquidités disponibles</span><b className="mono">{fmtUsd(account.cash)}</b></div>
        <div className="card"><span>Investi en spot</span><b className="mono">{fmtUsd(spotValue)}</b><small className={pnlClass(spotPnl)}>{fmtSigned(spotPnl)} latent</small></div>
        <div className="card"><span>Positions à levier</span><b className="mono">{fmtUsd(futValue)}</b><small className={pnlClass(futPnl)}>{fmtSigned(futPnl)} latent</small></div>
        <div className="card"><span>Dépôts nets</span><b className="mono">{fmtUsd(netDeposits)}</b><small className="muted">Capital de départ {fmtUsd(account.startBalance, 0)}</small></div>
      </div>

      <div className="grid-2">
        <div className="panel pad">
          <div className="panel-title">Évolution du capital</div>
          <div style={{ height: 280 }}>{eqPoints.length > 1 ? <EquityChart points={eqPoints} /> : <div className="empty">La courbe se remplit toutes les 5 minutes.</div>}</div>
        </div>
        <div className="panel pad">
          <div className="panel-title">Répartition</div>
          <div className="alloc">
            <Donut parts={parts} />
            <div className="legend-list">
              {parts.map((p) => (
                <div key={p.label}><i style={{ background: p.color }} /> {p.label} <b className="mono">{((p.value / equity) * 100).toFixed(1)} %</b></div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="panel pad">
        <div className="panel-title">Statistiques de performance</div>
        <div className="stats-grid">
          <Stat label="Trades clôturés" value={stats.n} />
          <Stat label="Taux de réussite" value={`${stats.winRate.toFixed(1)} %`} cls={stats.winRate >= 50 ? 'up' : 'down'} hint="Pourcentage de trades gagnants." />
          <Stat label="Gain moyen" value={fmtUsd(stats.avgWin)} cls="up" />
          <Stat label="Perte moyenne" value={fmtUsd(stats.avgLoss)} cls="down" />
          <Stat label="Profit factor" value={isFinite(stats.pf) ? stats.pf.toFixed(2) : '∞'} cls={stats.pf >= 1 ? 'up' : 'down'} hint="Gains totaux ÷ pertes totales. Au-dessus de 1,5 = bonne stratégie." />
          <Stat label="PnL réalisé" value={fmtSigned(stats.realized)} cls={pnlClass(stats.realized)} />
          <Stat label="Frais payés" value={fmtUsd(stats.fees)} cls="warn" hint="Les frais réduisent directement ton gain." />
          <Stat label="Drawdown max" value={`${stats.mdd.toFixed(1)} %`} cls={stats.mdd > 20 ? 'down' : ''} hint="Plus forte baisse de ton capital depuis un sommet." />
          <Stat label="Meilleur trade" value={stats.best ? `${fmtSigned(stats.best.pnl)} (${stats.best.sym})` : '—'} cls="up" />
          <Stat label="Pire trade" value={stats.worst ? `${fmtSigned(stats.worst.pnl)} (${stats.worst.sym})` : '—'} cls="down" />
          <Stat label="Série en cours" value={stats.streak > 0 ? `${stats.streak} gain(s)` : stats.streak < 0 ? `${-stats.streak} perte(s)` : '—'} />
          <Stat label="Liquidations" value={stats.liquidations} cls={stats.liquidations ? 'down' : ''} />
        </div>
        {stats.n >= 5 && (
          <div className="coach">
            <b>🧑‍🏫 Le coach analyse tes résultats :</b>
            <ul>
              {stats.winRate < 40 && stats.pf < 1 && <li>Ton taux de réussite est faible et tes pertes dépassent tes gains. Prends moins de trades, mais de meilleure qualité (dans le sens de la tendance).</li>}
              {stats.avgLoss > stats.avgWin * 1.2 && <li>Tes pertes moyennes sont plus grosses que tes gains moyens : tu coupes tes gagnants trop tôt ou laisses courir tes perdants. Utilise systématiquement un stop loss et un ratio 1:2.</li>}
              {stats.fees > Math.abs(stats.realized) * 0.3 && <li>Les frais représentent une grosse part de ton résultat. Trade moins souvent ou utilise des ordres limites (frais réduits).</li>}
              {stats.liquidations > 0 && <li>Tu as été liquidé {stats.liquidations} fois. Réduis ton levier et place ton stop loss avant le prix de liquidation.</li>}
              {stats.mdd > 25 && <li>Ton drawdown dépasse 25 % : tu risques trop par trade. Reviens à 1 % de risque maximum.</li>}
              {stats.pf >= 1.5 && <li>Excellent profit factor ! Ta stratégie semble fonctionner : continue à la noter dans ton journal pour la reproduire.</li>}
              {stats.winRate >= 55 && stats.avgWin < stats.avgLoss && <li>Tu gagnes souvent mais petit : essaie de laisser courir un peu plus tes gains (objectif plus lointain ou stop suiveur).</li>}
            </ul>
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="panel pad">
          <div className="panel-title">Avoirs spot</div>
          {holdings.length ? (
            <table className="tbl">
              <thead><tr><th>Monnaie</th><th>Quantité</th><th>Prix moyen</th><th>Valeur</th><th>PnL</th></tr></thead>
              <tbody>
                {holdings.map(([s, h]) => (
                  <tr key={s} onClick={() => { subscribeMarket(s, useStoreTf()); setState({ page: 'trade' }); }} style={{ cursor: 'pointer' }}>
                    <td><span className="coin-dot" style={{ background: coinMap[s]?.color }}>{s[0]}</span> <b>{s}</b></td>
                    <td className="mono">{fmtQty(h.qty)}</td>
                    <td className="mono">{fmtPrice(h.avg)}</td>
                    <td className="mono">{fmtUsd(h.qty * price(s))}</td>
                    <td className={cls('mono', pnlClass(price(s) - h.avg))}>{fmtPct((price(s) / h.avg - 1) * 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty">Aucun avoir.</div>}
        </div>
        <div className="panel pad">
          <div className="panel-title">Résultat par monnaie</div>
          {stats.bySym.length ? stats.bySym.map(([s, v]) => (
            <div key={s} className="bar-row">
              <span>{s}</span>
              <div className="bar-track"><div className={cls('bar', v >= 0 ? 'up-bg' : 'down-bg')} style={{ width: `${Math.min(100, (Math.abs(v) / Math.max(...stats.bySym.map((x) => Math.abs(x[1])))) * 100)}%` }} /></div>
              <b className={cls('mono', pnlClass(v))}>{fmtSigned(v)}</b>
            </div>
          )) : <div className="empty">Aucun trade clôturé.</div>}
        </div>
      </div>
    </div>
  );
}

function useStoreTf() {
  return localStorage.getItem('ts.tf') || '1m';
}

function Stat({ label, value, cls: c, hint }) {
  return (
    <div className="stat" title={hint}>
      <span>{label}{hint && ' ⓘ'}</span>
      <b className={cls('mono', c)}>{value}</b>
    </div>
  );
}
