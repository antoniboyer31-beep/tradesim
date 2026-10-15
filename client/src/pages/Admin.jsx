import { useEffect, useState } from 'react';
import { api, toast } from '../lib/store.js';
import { fmtUsd, fmtSigned, fmtDuration, cls, pnlClass } from '../lib/format.js';

export default function Admin() {
  const [players, setPlayers] = useState([]);
  const [celeb, setCeleb] = useState(null);
  const [amounts, setAmounts] = useState({});
  const [msg, setMsg] = useState('');
  const load = () => api('GET', '/api/admin/users').then((d) => { setPlayers(d.players); setCeleb({ at: d.nextCeleb, done: d.celebDone }); }).catch(() => {});
  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, []);
  const act = (p, label) => p.then(() => { toast('fill', label); load(); }).catch(() => {});
  const money = (u, sign) => {
    const a = Number(amounts[u.id]);
    if (!a) return;
    act(api('POST', `/api/admin/users/${u.id}/money`, { amount: sign * a }), `${sign > 0 ? 'Ajouté' : 'Retiré'} ${fmtUsd(a)} ${sign > 0 ? 'à' : 'à'} ${u.name}`);
  };
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>🛡️ Administration</h1>
          <p className="muted">Gère les joueurs, déclenche des événements et envoie des annonces à tout le monde.</p>
        </div>
      </div>
      <div className="grid-2">
        <div className="panel pad">
          <h3>🚨 Tweet de célébrité</h3>
          <p className="small muted">Lance tout de suite un meme coin qui explose après le tweet d'une star. Tous les joueurs reçoivent une alerte. Il en arrive aussi automatiquement une par tranche de 2 h (0 h-2 h, 2 h-4 h…), à un moment aléatoire, et ce bouton n'y change rien.</p>
          {celeb && <p className="small">{celeb.done ? `✅ Le tweet automatique de cette tranche est déjà passé. Prochaine tranche à partir de ${new Date(celeb.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })}.` : `⏰ Prochain tweet automatique prévu vers ${new Date(celeb.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })} (secret, ne le dis pas aux joueurs 😉).`}</p>}
          <button className="primary" onClick={() => act(api('POST', '/api/admin/celeb'), 'Tweet lancé !')}>🚀 Déclencher un tweet maintenant</button>
        </div>
        <div className="panel pad">
          <h3>📢 Annonce à tous les joueurs</h3>
          <div className="row-input">
            <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Ex. : Tournoi ce soir à 21 h !" maxLength={300} />
            <button className="primary" disabled={!msg.trim()} onClick={() => { act(api('POST', '/api/admin/announce', { text: msg }), 'Annonce envoyée'); setMsg(''); }}>Envoyer</button>
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="panel-title"><span>👥 Joueurs ({players.length})</span></div>
        <table className="tbl">
          <thead><tr><th>Joueur</th><th>Liquidités</th><th>Capital</th><th>Gain</th><th>Trades</th><th>Activité</th><th>Argent</th><th>Actions</th></tr></thead>
          <tbody>
            {players.map((u) => (
              <tr key={u.id}>
                <td><span className="lb-av">{u.avatar}</span> <b>{u.name}</b> {u.admin && <span className="tag">admin</span>}</td>
                <td className="mono">{fmtUsd(u.cash)}</td>
                <td className="mono">{fmtUsd(u.equity)}</td>
                <td className={cls('mono', pnlClass(u.pnl))}>{fmtSigned(u.pnl)}</td>
                <td className="mono">{u.trades}</td>
                <td>{u.online ? <span className="up">● en ligne</span> : <span className="muted small">il y a {fmtDuration((Date.now() - u.lastSeen) / 1000)}</span>}</td>
                <td>
                  <div className="admin-money">
                    <input type="number" placeholder="Montant" value={amounts[u.id] || ''} onChange={(e) => setAmounts({ ...amounts, [u.id]: e.target.value })} />
                    <button className="buy-btn small" onClick={() => money(u, 1)}>+</button>
                    <button className="sell-btn small" onClick={() => money(u, -1)}>−</button>
                  </div>
                </td>
                <td className="admin-actions">
                  <button className="ghost small" onClick={() => confirm(`Remettre ${u.name} à 10 000 $ ? Tout son historique sera effacé.`) && act(api('POST', `/api/admin/users/${u.id}/reset`), `${u.name} remis à 10 000 $`)}>↺ Reset</button>
                  <button className="ghost small" onClick={() => { const p = prompt(`Nouveau mot de passe pour ${u.name} :`); if (p) act(api('POST', `/api/admin/users/${u.id}/password`, { password: p }), 'Mot de passe changé'); }}>🔑 Mdp</button>
                  {!u.admin && <button className="sell-btn small" onClick={() => confirm(`Supprimer définitivement le compte de ${u.name} ?`) && act(api('DELETE', `/api/admin/users/${u.id}`), `${u.name} supprimé`)}>Supprimer</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
