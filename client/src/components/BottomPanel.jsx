import { useState } from 'react';
import { useStore, api, subscribeMarket, toast } from '../lib/store.js';
import { fmtPrice, fmtUsd, fmtSigned, fmtPct, fmtQty, fmtDateTime, cls, pnlClass } from '../lib/format.js';

export function positionPnl(p, price) {
  const dir = p.side === 'long' ? 1 : -1;
  const pnl = (price - p.entry) * p.qty * dir;
  return { pnl, roe: (pnl / p.margin) * 100 };
}

function PositionRow({ p, price, tf }) {
  const [edit, setEdit] = useState(false);
  const [sl, setSl] = useState(p.sl ?? '');
  const [tp, setTp] = useState(p.tp ?? '');
  const { pnl, roe } = positionPnl(p, price);
  const liqDist = (Math.abs(price - p.liq) / price) * 100;
  const save = async () => {
    try { await api('PATCH', `/api/positions/${p.id}`, { sl: sl === '' ? null : Number(sl), tp: tp === '' ? null : Number(tp) }); setEdit(false); } catch { /* toast */ }
  };
  const breakEven = () => api('PATCH', `/api/positions/${p.id}`, { sl: p.entry, tp: p.tp }).catch(() => {});
  const addMargin = async () => {
    const v = prompt('Montant de marge à ajouter ($) : cela éloigne le prix de liquidation.');
    if (v) api('POST', `/api/positions/${p.id}/margin`, { amount: Number(v) }).catch(() => {});
  };
  return (
    <tr>
      <td><a onClick={() => subscribeMarket(p.sym, tf)}><b>{p.sym}</b></a> <span className={cls('tag', p.side === 'long' ? 'tag-up' : 'tag-down')}>{p.side === 'long' ? 'LONG' : 'SHORT'} x{p.leverage}</span></td>
      <td className="mono">{fmtQty(p.qty)}</td>
      <td className="mono">{fmtPrice(p.entry)}</td>
      <td className="mono">{fmtPrice(price)}</td>
      <td className="mono liq" title={`À ${liqDist.toFixed(1)} % du prix actuel`}>{fmtPrice(p.liq)} <small className={liqDist < 3 ? 'down' : 'muted'}>({liqDist.toFixed(1)}%)</small></td>
      <td className="mono">{fmtUsd(p.margin)}</td>
      <td className={cls('mono', pnlClass(pnl))}><b>{fmtSigned(pnl)}</b><br /><small>{fmtPct(roe)}</small></td>
      <td>
        {edit ? (
          <div className="inline-edit">
            <input type="number" placeholder="SL" value={sl} onChange={(e) => setSl(e.target.value)} />
            <input type="number" placeholder="TP" value={tp} onChange={(e) => setTp(e.target.value)} />
            <button className="mini" onClick={save}>OK</button>
          </div>
        ) : (
          <span className="mono small" onClick={() => setEdit(true)} style={{ cursor: 'pointer' }} title="Cliquer pour modifier">
            <span className="warn">{p.sl ? fmtPrice(p.sl) : '—'}</span> / <span className="up">{p.tp ? fmtPrice(p.tp) : '—'}</span> ✎
          </span>
        )}
      </td>
      <td className="actions">
        <button className="mini" onClick={breakEven} title="Déplacer le stop loss au prix d'entrée">BE</button>
        <button className="mini" onClick={addMargin} title="Ajouter de la marge">+M</button>
        <button className="mini" onClick={() => api('POST', `/api/positions/${p.id}/close`, { pct: 50 }).catch(() => {})}>50%</button>
        <button className="mini danger" onClick={() => api('POST', `/api/positions/${p.id}/close`, { pct: 100 }).catch(() => {})}>Fermer</button>
      </td>
    </tr>
  );
}

export default function BottomPanel() {
  const account = useStore((s) => s.account);
  const tickers = useStore((s) => s.tickers);
  const sym = useStore((s) => s.sym);
  const tf = useStore((s) => s.tf);
  const [tab, setTab] = useState('positions');
  const [onlyCur, setOnlyCur] = useState(false);
  const [alertPrice, setAlertPrice] = useState('');
  const [alertNote, setAlertNote] = useState('');
  if (!account) return null;
  const price = (s) => tickers[s]?.price ?? 0;
  const f = (l) => (onlyCur ? l.filter((x) => x.sym === sym) : l);
  const holdings = Object.entries(account.holdings).filter(([, h]) => h.qty > 1e-12);
  const pendingAlerts = account.alerts.filter((a) => !a.triggeredAt).length;
  const tabs = [
    ['positions', `Positions (${account.positions.length})`],
    ['orders', `Ordres ouverts (${account.orders.length})`],
    ['holdings', `Avoirs spot (${holdings.length})`],
    ['history', 'Historique'],
    ['alerts', `Alertes (${pendingAlerts})`],
    ['notifs', 'Notifications'],
  ];

  const addAlert = async () => {
    if (!alertPrice) return;
    try {
      await api('POST', '/api/alerts', { sym, price: Number(alertPrice), note: alertNote });
      setAlertPrice(''); setAlertNote('');
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    } catch { /* toast */ }
  };

  return (
    <div className="panel bottom">
      <div className="bottom-tabs">
        {tabs.map(([k, l]) => <button key={k} className={cls(tab === k && 'on')} onClick={() => setTab(k)}>{l}</button>)}
        <label className="only-cur"><input type="checkbox" checked={onlyCur} onChange={(e) => setOnlyCur(e.target.checked)} /> Seulement {sym}</label>
        {tab === 'positions' && account.positions.length > 0 && <button className="mini danger" onClick={() => confirm('Fermer toutes les positions au prix du marché ?') && api('POST', '/api/positions/close-all').catch(() => {})}>Tout fermer</button>}
      </div>
      <div className="bottom-body">
        {tab === 'positions' && (
          f(account.positions).length ? (
            <table className="tbl">
              <thead><tr><th>Marché</th><th>Quantité</th><th>Entrée</th><th>Prix</th><th>Liquidation</th><th>Marge</th><th>PnL (ROE)</th><th>SL / TP</th><th /></tr></thead>
              <tbody>{f(account.positions).map((p) => <PositionRow key={p.id} p={p} price={price(p.sym)} tf={tf} />)}</tbody>
            </table>
          ) : <Empty text="Aucune position à levier ouverte. Utilise l'onglet « Levier » du formulaire pour parier à la hausse (long) ou à la baisse (short)." />
        )}
        {tab === 'orders' && (
          f(account.orders).length ? (
            <table className="tbl">
              <thead><tr><th>Date</th><th>Marché</th><th>Type</th><th>Sens</th><th>Prix</th><th>Quantité</th><th>Écart au prix</th><th /></tr></thead>
              <tbody>
                {f(account.orders).map((o) => {
                  const dist = (o.price / price(o.sym) - 1) * 100;
                  return (
                    <tr key={o.id}>
                      <td className="muted">{fmtDateTime(o.createdAt)}</td>
                      <td><b>{o.sym}</b> {o.kind === 'futures' && <span className="tag">x{o.leverage}</span>}</td>
                      <td>{o.type === 'limit' ? 'Limite' : 'Stop'}</td>
                      <td className={o.side === 'buy' || o.side === 'long' ? 'up' : 'down'}>{{ buy: 'Achat', sell: 'Vente', long: 'Long', short: 'Short' }[o.side]}</td>
                      <td className="mono">{fmtPrice(o.price)}</td>
                      <td className="mono">{fmtQty(o.qty)}</td>
                      <td className="mono muted">{fmtPct(dist)}</td>
                      <td><button className="mini danger" onClick={() => api('DELETE', `/api/orders/${o.id}`).catch(() => {})}>Annuler</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <Empty text="Aucun ordre en attente. Les ordres limites et stops restent actifs même si tu fermes le site : ils s'exécuteront automatiquement." />
        )}
        {tab === 'holdings' && (
          holdings.length ? (
            <table className="tbl">
              <thead><tr><th>Monnaie</th><th>Quantité</th><th>Prix moyen</th><th>Prix</th><th>Valeur</th><th>PnL latent</th><th /></tr></thead>
              <tbody>
                {holdings.filter(([s]) => !onlyCur || s === sym).map(([s, h]) => {
                  const v = h.qty * price(s);
                  const pnl = v - h.qty * h.avg;
                  return (
                    <tr key={s}>
                      <td><a onClick={() => subscribeMarket(s, tf)}><b>{s}</b></a></td>
                      <td className="mono">{fmtQty(h.qty)}</td>
                      <td className="mono">{fmtPrice(h.avg)}</td>
                      <td className="mono">{fmtPrice(price(s))}</td>
                      <td className="mono">{fmtUsd(v)}</td>
                      <td className={cls('mono', pnlClass(pnl))}>{fmtSigned(pnl)} <small>({fmtPct((price(s) / h.avg - 1) * 100)})</small></td>
                      <td><button className="mini danger" onClick={() => api('POST', '/api/spot', { sym: s, side: 'sell', type: 'market', qty: h.qty }).catch(() => {})}>Tout vendre</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <Empty text="Tu ne possèdes aucune monnaie en spot pour l'instant." />
        )}
        {tab === 'history' && (
          account.trades.length ? (
            <table className="tbl">
              <thead><tr><th>Date</th><th>Marché</th><th>Type</th><th>Sens</th><th>Prix</th><th>Quantité</th><th>Frais</th><th>PnL réalisé</th></tr></thead>
              <tbody>
                {f(account.trades).slice(-200).reverse().map((t) => (
                  <tr key={t.id}>
                    <td className="muted">{fmtDateTime(t.t)}</td>
                    <td><b>{t.sym}</b> {t.kind === 'futures' && <span className="tag">x{t.leverage}</span>}</td>
                    <td>{tradeType(t)}</td>
                    <td className={t.side === 'buy' ? 'up' : 'down'}>{t.side === 'buy' ? 'Achat' : 'Vente'}</td>
                    <td className="mono">{fmtPrice(t.price)}</td>
                    <td className="mono">{fmtQty(t.qty)}</td>
                    <td className="mono muted">{fmtUsd(t.fee)}</td>
                    <td className={cls('mono', pnlClass(t.pnl))}>{t.pnl == null ? '—' : <>{fmtSigned(t.pnl)} <small>({fmtPct(t.pnlPct)})</small></>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty text="Ton historique de trades apparaîtra ici." />
        )}
        {tab === 'alerts' && (
          <div className="alerts">
            <div className="alert-form">
              <span>Alerte sur <b>{sym}</b> quand le prix atteint</span>
              <input type="number" placeholder={fmtPrice(price(sym))} value={alertPrice} onChange={(e) => setAlertPrice(e.target.value)} step="any" />
              <input placeholder="Note (optionnel)" value={alertNote} onChange={(e) => setAlertNote(e.target.value)} />
              <button className="mini primary" onClick={addAlert}>Créer l'alerte</button>
              {'Notification' in window && Notification.permission !== 'granted' && (
                <button className="mini" onClick={() => Notification.requestPermission().then((p) => p === 'granted' && toast('info', 'Notifications activées'))}>Activer les notifications du navigateur</button>
              )}
            </div>
            <table className="tbl">
              <thead><tr><th>Marché</th><th>Condition</th><th>Prix</th><th>Note</th><th>Statut</th><th /></tr></thead>
              <tbody>
                {f(account.alerts).slice().reverse().map((a) => (
                  <tr key={a.id}>
                    <td><b>{a.sym}</b></td>
                    <td>{a.cond === 'above' ? 'Passe au-dessus de' : 'Passe sous'}</td>
                    <td className="mono">{fmtPrice(a.price)}</td>
                    <td className="muted">{a.note}</td>
                    <td>{a.triggeredAt ? <span className="tag tag-up">Déclenchée {fmtDateTime(a.triggeredAt)}</span> : <span className="tag">En attente</span>}</td>
                    <td><button className="mini danger" onClick={() => api('DELETE', `/api/alerts/${a.id}`).catch(() => {})}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'notifs' && (
          <div className="notifs">
            {account.notifications.length > 0 && <button className="mini" onClick={() => api('POST', '/api/notifications/clear')}>Tout effacer</button>}
            {account.notifications.slice().reverse().map((n) => (
              <div key={n.id} className={cls('notif', n.type)}><span className="muted">{fmtDateTime(n.t)}</span> {n.message}</div>
            ))}
            {!account.notifications.length && <Empty text="Aucune notification." />}
          </div>
        )}
      </div>
    </div>
  );
}

function tradeType(t) {
  if (t.kind === 'spot') return { market: 'Marché', limit: 'Limite', stop: 'Stop' }[t.type] || t.type;
  return { open: `Ouverture ${t.posSide}`, manual: `Fermeture ${t.posSide}`, sl: 'Stop loss', tp: 'Take profit', liquidation: 'Liquidation' }[t.type] || t.type;
}

function Empty({ text }) {
  return <div className="empty">{text}</div>;
}
