import { useState } from 'react';
import { useStore, api } from '../lib/store.js';
import { fmtDateTime, fmtSigned, fmtPrice, cls, pnlClass } from '../lib/format.js';

const MOODS = ['😌 Calme', '😃 Confiant', '😬 Stressé', '😤 Frustré', '🤑 Avide', '😨 Peur', '😴 Fatigué'];

export default function Journal() {
  const account = useStore((s) => s.account);
  const coins = useStore((s) => s.coins);
  const sym = useStore((s) => s.sym);
  const [form, setForm] = useState({ title: '', text: '', sym, mood: MOODS[0], tags: '' });
  const [filter, setFilter] = useState('');
  if (!account) return null;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const save = async () => {
    if (!form.title.trim() && !form.text.trim()) return;
    await api('POST', '/api/journal', form).catch(() => {});
    setForm({ ...form, title: '', text: '', tags: '' });
  };
  const recent = account.trades.filter((t) => t.pnl != null).slice(-8).reverse();
  const entries = account.journal.filter((j) => !filter || (j.title + j.text + j.tags + (j.sym || '')).toLowerCase().includes(filter.toLowerCase()));
  const template = () => setForm({ ...form, text: "Setup : \nPourquoi je suis entré : \nEntrée / Stop / Objectif : \nCe qui s'est passé : \nLeçon retenue : " });

  return (
    <div className="page">
      <div className="page-head">
        <h1>Journal de trading</h1>
        <p className="muted">Le journal est l'outil n°1 des traders qui progressent : note ce que tu fais et pourquoi.</p>
      </div>
      <div className="grid-2 journal-grid">
        <div className="panel pad">
          <div className="panel-title">Nouvelle entrée</div>
          <label className="field"><span>Titre</span><input value={form.title} onChange={set('title')} placeholder="Ex : Long NOVA sur retest du support" /></label>
          <div className="fields-3">
            <label className="field"><span>Monnaie</span><select value={form.sym} onChange={set('sym')}>{coins.map((c) => <option key={c.sym}>{c.sym}</option>)}</select></label>
            <label className="field"><span>Émotion</span><select value={form.mood} onChange={set('mood')}>{MOODS.map((m) => <option key={m}>{m}</option>)}</select></label>
            <label className="field"><span>Tags</span><input value={form.tags} onChange={set('tags')} placeholder="breakout, 15m…" /></label>
          </div>
          <label className="field"><span>Notes <a onClick={template}>(utiliser un modèle)</a></span><textarea rows={8} value={form.text} onChange={set('text')} placeholder="Pourquoi ce trade ? Qu'as-tu appris ?" /></label>
          <button className="primary" onClick={save}>Enregistrer</button>
          {recent.length > 0 && (
            <>
              <div className="panel-title" style={{ marginTop: 18 }}>Tes derniers trades clôturés</div>
              {recent.map((t) => (
                <div key={t.id} className="mover" onClick={() => setForm({ ...form, sym: t.sym, title: `${t.sym} ${t.kind === 'futures' ? t.posSide + ' x' + t.leverage : 'spot'} — ${t.pnl >= 0 ? 'gain' : 'perte'} de ${Math.abs(t.pnl).toFixed(2)} $`, text: `Prix de sortie : ${fmtPrice(t.price)}\n` })}>
                  <span className="muted">{fmtDateTime(t.t)}</span><b>{t.sym}</b><span className={cls('mono', pnlClass(t.pnl))}>{fmtSigned(t.pnl)}</span>
                </div>
              ))}
              <p className="small muted">Clique sur un trade pour pré-remplir une entrée.</p>
            </>
          )}
        </div>
        <div>
          <input className="search wide" placeholder="Rechercher dans le journal…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          {entries.map((j) => (
            <div key={j.id} className="panel pad journal-entry">
              <div className="je-head">
                <b>{j.title || 'Sans titre'}</b>
                <span className="muted small">{fmtDateTime(j.t)}</span>
                <button className="mini danger" onClick={() => api('DELETE', `/api/journal/${j.id}`).catch(() => {})}>✕</button>
              </div>
              <div className="je-tags">{j.sym && <span className="tag">{j.sym}</span>}<span className="tag">{j.mood}</span>{j.tags && j.tags.split(',').map((t) => <span key={t} className="tag">#{t.trim()}</span>)}</div>
              <p className="je-text">{j.text}</p>
            </div>
          ))}
          {!entries.length && <div className="panel pad empty">Aucune entrée pour l'instant.</div>}
        </div>
      </div>
    </div>
  );
}
