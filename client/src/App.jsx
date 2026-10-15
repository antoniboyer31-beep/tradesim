import { useEffect, useRef, useState } from 'react';
import { useStore, setState, api, subscribeMarket, dismissToast } from './lib/store.js';
import { fmtUsd, fmtSigned, fmtPct, fmtPrice, fmtDateTime, fmtDuration, cls, pnlClass } from './lib/format.js';
import Trade from './pages/Trade.jsx';
import Portfolio from './pages/Portfolio.jsx';
import Tools from './pages/Tools.jsx';
import Academy from './pages/Academy.jsx';
import Community, { fearGreed, fgLabel } from './pages/Community.jsx';
import Journal from './pages/Journal.jsx';
import MemeZone from './pages/MemeZone.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import Admin from './pages/Admin.jsx';
import CelebAlert from './components/CelebAlert.jsx';

const PAGES = [
  ['trade', '📊 Trading'], ['meme', '🐸 Meme Zone'], ['leaderboard', '🏆 Classement'], ['portfolio', '💼 Portefeuille'], ['tools', '🧰 Outils'], ['academy', '🎓 Académie'], ['community', '🌍 Communauté'], ['journal', '📓 Journal'],
];

function Clock() {
  const [t, setT] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setT(Date.now()), 1000); return () => clearInterval(i); }, []);
  return <span className="clock mono">{new Date(t).toLocaleTimeString('fr-FR')}</span>;
}

function TopBar() {
  const page = useStore((s) => s.page);
  const account = useStore((s) => s.account);
  const connected = useStore((s) => s.connected);
  const online = useStore((s) => s.online);
  const me = useStore((s) => s.me);
  const players = useStore((s) => s.players);
  const tickers = useStore((s) => s.tickers);
  const fg = fearGreed(tickers);
  const net = account ? account.deposits - account.withdrawals : 0;
  const pnl = account ? account.equityNow - net : 0;
  return (
    <header className="topbar">
      <div className="logo" onClick={() => setState({ page: 'trade' })}>
        <svg width="26" height="26" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#141a25" /><path d="M6 22l6-7 5 4 9-11" stroke="#16c784" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <b>Trade<span>Sim</span></b>
      </div>
      <nav>
        {PAGES.map(([k, l]) => <button key={k} className={cls(page === k && 'on')} onClick={() => setState({ page: k })}>{l}</button>)}
        {me?.admin && <button className={cls(page === 'admin' && 'on')} onClick={() => setState({ page: 'admin' })}>🛡️ Admin</button>}
      </nav>
      <div className="top-right">
        <span className="fg-pill" title="Indice Peur & Avidité du marché">{fgLabel(fg)} · {fg}</span>
        <span className="online-pill" title="Vrais joueurs connectés">🎮 {players}</span>
        <span className="online-pill" title="Traders connectés"><i className={cls('dot-live', !connected && 'off')} /> {connected ? online.toLocaleString('fr-FR') : 'Hors ligne'}</span>
        <Clock />
        {account && (
          <div className="equity" onClick={() => setState({ page: 'portfolio' })}>
            <small>Capital total</small>
            <b className="mono">{fmtUsd(account.equityNow)}</b>
            <small className={pnlClass(pnl)}>{fmtSigned(pnl)}</small>
          </div>
        )}
        <button className="primary small" onClick={() => setState({ moneyOpen: true })}>💰 Argent</button>
        {me && <button className="me-btn" onClick={() => setState({ profileOpen: true })} title="Mon profil"><span>{me.avatar}</span><b>{me.name}</b></button>}
      </div>
    </header>
  );
}

function TickerTape() {
  const tickers = useStore((s) => s.tickers);
  const tf = useStore((s) => s.tf);
  const list = Object.values(tickers);
  const items = list.map((t) => (
    <span key={t.sym} className="tt-item" onClick={() => { subscribeMarket(t.sym, tf); setState({ page: 'trade' }); }}>
      <b>{t.sym}</b> <span className="mono">{fmtPrice(t.price)}</span> <span className={t.ch24 >= 0 ? 'up' : 'down'}>{fmtPct(t.ch24)}</span>
    </span>
  ));
  return (
    <div className="ticker-tape">
      <div className="tt-track">{items}{items.map((x) => <span key={x.key + '2'} className="tt-item">{x.props.children}</span>)}</div>
    </div>
  );
}

function MoneyModal() {
  const open = useStore((s) => s.moneyOpen);
  const account = useStore((s) => s.account);
  const me = useStore((s) => s.me);
  const [amount, setAmount] = useState('');
  const [resetBal, setResetBal] = useState('10000');
  const [challenge, setChallenge] = useState(() => localStorage.getItem('ts.challenge') === '1');
  if (!open || !account) return null;
  const close = () => setState({ moneyOpen: false });
  const toggleChallenge = () => { const v = !challenge; setChallenge(v); localStorage.setItem('ts.challenge', v ? '1' : '0'); };
  const dep = (a) => api('POST', '/api/account/deposit', { amount: a }).catch(() => {});
  return (
    <div className="modal-bg" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>💰 Mon argent fictif</h2><button className="x" onClick={close}>✕</button></div>
        <div className="money-summary">
          <div><span>Disponible</span><b className="mono">{fmtUsd(account.cash)}</b></div>
          <div><span>Capital total</span><b className="mono">{fmtUsd(account.equityNow)}</b></div>
          <div><span>Total déposé</span><b className="mono">{fmtUsd(account.deposits)}</b></div>
          <div><span>Total retiré</span><b className="mono">{fmtUsd(account.withdrawals)}</b></div>
        </div>
        {me?.admin ? (
          <>
            <label className="switch-row">
              <input type="checkbox" checked={challenge} onChange={toggleChallenge} />
              <div><b>Mode réaliste (challenge)</b><small className="muted">Désactive les dépôts : tu dois faire fructifier ton capital comme avec de l'argent réel.</small></div>
            </label>
            <h3>Ajouter de l'argent (admin)</h3>
            <div className={cls('presets', challenge && 'disabled')}>
              {[1000, 5000, 10000, 50000, 100000, 1000000].map((a) => <button key={a} disabled={challenge} onClick={() => dep(a)}>+{a.toLocaleString('fr-FR')} $</button>)}
            </div>
            <div className="row-input">
              <input type="number" placeholder="Montant personnalisé" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <button className="buy-btn" disabled={challenge || !amount} onClick={() => { dep(Number(amount)); setAmount(''); }}>Déposer</button>
              <button className="sell-btn" disabled={!amount} onClick={() => { api('POST', '/api/account/withdraw', { amount: Number(amount) }).catch(() => {}); setAmount(''); }}>Retirer</button>
            </div>
          </>
        ) : (
          <p className="small muted">Mode multijoueur : tout le monde démarre avec 10 000 $ et personne ne peut s'ajouter de l'argent, pour que le classement reste équitable. Seul l'admin peut en donner.</p>
        )}
        <h3>Recommencer à zéro</h3>
        <p className="small muted">Ferme tout, efface l'historique de trades et repart avec un nouveau capital (ton journal est conservé). Le marché, lui, continue.</p>
        <div className="row-input">
          {me?.admin && (
            <select value={resetBal} onChange={(e) => setResetBal(e.target.value)}>
              {[100, 1000, 10000, 50000, 100000, 1000000].map((v) => <option key={v} value={v}>{v.toLocaleString('fr-FR')} $</option>)}
            </select>
          )}
          <button className="sell-btn" onClick={() => confirm('Réinitialiser complètement ton compte ? Tu repartiras avec 10 000 $.') && api('POST', '/api/account/reset', { balance: Number(resetBal) }).then(close).catch(() => {})}>Réinitialiser le compte{me?.admin ? '' : ' (10 000 $)'}</button>
        </div>
      </div>
    </div>
  );
}

function AwayModal() {
  const account = useStore((s) => s.account);
  const [data, setData] = useState(null);
  const done = useRef(false);
  useEffect(() => {
    if (!account || done.current) return;
    done.current = true;
    const last = Number(localStorage.getItem('ts.lastSeen') || 0);
    const away = (Date.now() - last) / 1000;
    if (last && away > 120) {
      const events = account.notifications.filter((n) => n.t > last && n.type !== 'order' && n.type !== 'money');
      const before = account.equity.filter(([t]) => t * 1000 <= last).pop();
      setData({ away, events, before: before?.[1], now: account.equityNow });
    }
  }, [account]);
  useEffect(() => {
    const save = () => localStorage.setItem('ts.lastSeen', String(Date.now()));
    const i = setInterval(save, 5000);
    window.addEventListener('beforeunload', save);
    return () => { clearInterval(i); window.removeEventListener('beforeunload', save); };
  }, []);
  if (!data) return null;
  const diff = data.before ? data.now - data.before : null;
  return (
    <div className="modal-bg" onClick={() => setData(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>👋 Bon retour !</h2><button className="x" onClick={() => setData(null)}>✕</button></div>
        <p>Tu étais absent depuis <b>{fmtDuration(data.away)}</b>. Le marché a continué de tourner pendant ce temps.</p>
        {diff != null && <p>Ton capital est passé de <b className="mono">{fmtUsd(data.before)}</b> à <b className="mono">{fmtUsd(data.now)}</b> : <b className={pnlClass(diff)}>{fmtSigned(diff)}</b></p>}
        {data.events.length ? (
          <>
            <h3>Ce qui s'est passé sur ton compte</h3>
            <div className="notifs">{data.events.slice(-15).reverse().map((n) => <div key={n.id} className={cls('notif', n.type)}><span className="muted">{fmtDateTime(n.t)}</span> {n.message}</div>)}</div>
          </>
        ) : <p className="muted">Aucun ordre exécuté pendant ton absence.</p>}
        <button className="primary" onClick={() => setData(null)}>Continuer</button>
      </div>
    </div>
  );
}

function ProfileModal() {
  const open = useStore((s) => s.profileOpen);
  const me = useStore((s) => s.me);
  const avatars = useStore((s) => s.avatars);
  const [old, setOld] = useState('');
  const [pw, setPw] = useState('');
  if (!open || !me) return null;
  const close = () => setState({ profileOpen: false });
  const pick = (a) => api('POST', '/api/me/avatar', { avatar: a }).then((d) => setState({ me: d.me })).catch(() => {});
  const changePw = () => api('POST', '/api/me/password', { old, password: pw }).then(() => { location.href = '/login'; }).catch(() => {});
  return (
    <div className="modal-bg" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2><span className="lb-av big">{me.avatar}</span> {me.name}{me.admin && <span className="tag">admin</span>}</h2><button className="x" onClick={close}>✕</button></div>
        <h3>Ma photo de profil</h3>
        <p className="small muted">Elle apparaît dans le classement, le chat et sur les graphiques des meme coins à l'endroit où tu achètes.</p>
        <div className="av-grid">{avatars.map((a) => <button key={a} className={cls(a === me.avatar && 'on')} onClick={() => pick(a)}>{a}</button>)}</div>
        <h3>Changer de mot de passe</h3>
        <div className="row-input">
          <input type="password" placeholder="Ancien" value={old} onChange={(e) => setOld(e.target.value)} />
          <input type="password" placeholder="Nouveau" value={pw} onChange={(e) => setPw(e.target.value)} />
          <button className="primary" disabled={!old || pw.length < 4} onClick={changePw}>Changer</button>
        </div>
        <h3>Session</h3>
        <a className="sell-btn logout" href="/logout">Se déconnecter</a>
      </div>
    </div>
  );
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => <div key={t.id} className={cls('toast', t.type)} onClick={() => dismissToast(t.id)}>{t.message}</div>)}
    </div>
  );
}

export default function App() {
  const page = useStore((s) => s.page);
  const [sparks, setSparks] = useState({});
  useEffect(() => {
    const load = () => api('GET', '/api/sparks').then(setSparks).catch(() => {});
    load();
    const i = setInterval(load, 60000);
    return () => clearInterval(i);
  }, []);
  return (
    <div className="app">
      <TopBar />
      <TickerTape />
      <main>
        {page === 'trade' && <Trade sparks={sparks} />}
        {page === 'portfolio' && <Portfolio />}
        {page === 'tools' && <Tools />}
        {page === 'academy' && <Academy />}
        {page === 'community' && <Community />}
        {page === 'journal' && <Journal />}
        {page === 'meme' && <MemeZone />}
        {page === 'leaderboard' && <Leaderboard />}
        {page === 'admin' && <Admin />}
      </main>
      <MoneyModal />
      <AwayModal />
      <ProfileModal />
      <CelebAlert />
      <Toasts />
    </div>
  );
}
