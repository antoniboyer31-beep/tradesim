import { useEffect, useState } from 'react';
import { api, useStore } from '../lib/store.js';
import { fmtUsd, fmtSigned, fmtPct, fmtDuration, cls, pnlClass } from '../lib/format.js';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function Leaderboard() {
  const me = useStore((s) => s.me);
  const [players, setPlayers] = useState([]);
  useEffect(() => {
    const load = () => api('GET', '/api/leaderboard').then((d) => setPlayers(d.players)).catch(() => {});
    load();
    const i = setInterval(load, 5000);
    return () => clearInterval(i);
  }, []);
  const myRank = players.findIndex((p) => p.id === me?.id) + 1;
  const podium = players.slice(0, 3);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>🏆 Classement des joueurs</h1>
          <p className="muted">Tout le monde démarre avec 10 000 $. Le classement se fait sur le gain total (capital actuel moins l'argent reçu), trading classique et meme coins confondus.</p>
        </div>
        {myRank > 0 && <div className="card big"><span>Ta place</span><b>{MEDALS[myRank - 1] || '#' + myRank} <small className="muted">sur {players.length}</small></b></div>}
      </div>
      {podium.length > 0 && (
        <div className="podium">
          {[1, 0, 2].map((i) => podium[i] && (
            <div key={podium[i].id} className={cls('podium-step', 'p' + (i + 1), podium[i].id === me?.id && 'me')}>
              <div className="pod-av">{podium[i].avatar}</div>
              <b>{MEDALS[i]} {podium[i].name}</b>
              <span className={cls('mono', pnlClass(podium[i].pnl))}>{fmtSigned(podium[i].pnl)}</span>
              <small className="muted mono">{fmtUsd(podium[i].equity)}</small>
              <div className="pod-block">{i + 1}</div>
            </div>
          ))}
        </div>
      )}
      <div className="panel">
        <table className="tbl lb">
          <thead><tr><th>#</th><th>Joueur</th><th>Capital</th><th>Gain</th><th>Gain %</th><th>Meme coins</th><th>Trades</th><th>Réussite</th><th>Vu</th></tr></thead>
          <tbody>
            {players.map((p, i) => (
              <tr key={p.id} className={cls(p.id === me?.id && 'hl')}>
                <td><b>{MEDALS[i] || i + 1}</b></td>
                <td><span className="lb-av">{p.avatar}</span> <b>{p.name}</b> {p.admin && <span className="tag">admin</span>} {p.id === me?.id && <span className="tag tag-up">toi</span>}</td>
                <td className="mono">{fmtUsd(p.equity)}</td>
                <td className={cls('mono', pnlClass(p.pnl))}>{fmtSigned(p.pnl)}</td>
                <td className={cls('mono', pnlClass(p.pnlPct))}>{fmtPct(p.pnlPct)}</td>
                <td className="mono">{fmtUsd(p.memeValue)}</td>
                <td className="mono">{p.trades}</td>
                <td className="mono">{p.winRate == null ? '—' : p.winRate.toFixed(0) + ' %'}</td>
                <td>{p.online ? <span className="up">● en ligne</span> : <span className="muted small">il y a {fmtDuration((Date.now() - p.lastSeen) / 1000)}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
