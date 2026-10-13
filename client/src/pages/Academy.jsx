import { useMemo, useState } from 'react';
import { CATEGORIES, TIPS, PATTERNS, SCENARIOS, GLOSSARY } from '../data/academy.js';
import { cls } from '../lib/format.js';

const READ_KEY = 'ts.read';

export default function Academy() {
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [section, setSection] = useState('tips');
  const [read, setRead] = useState(() => new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]')));
  const toggleRead = (title) => {
    const n = new Set(read);
    n.has(title) ? n.delete(title) : n.add(title);
    setRead(n);
    localStorage.setItem(READ_KEY, JSON.stringify([...n]));
  };
  const tips = useMemo(() => TIPS.filter((t) => (cat === 'all' || t.cat === cat) && (!q || (t.title + t.text).toLowerCase().includes(q.toLowerCase()))), [cat, q]);
  const progress = Math.round((read.size / TIPS.length) * 100);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Académie du trading</h1>
        <div className="progress-wrap" title="Leçons marquées comme lues">
          <span className="muted">Progression : {read.size}/{TIPS.length}</span>
          <div className="progress"><div style={{ width: `${progress}%` }} /></div>
        </div>
      </div>
      <div className="seg big-seg">
        {[['tips', `💡 Astuces (${TIPS.length})`], ['patterns', '📐 Figures chartistes'], ['scenarios', '🎬 Scénarios du marché'], ['glossary', '📖 Glossaire'], ['routine', '✅ Routine du trader']].map(([k, l]) => (
          <button key={k} className={cls(section === k && 'on')} onClick={() => setSection(k)}>{l}</button>
        ))}
      </div>

      {section === 'tips' && (
        <>
          <div className="academy-filters">
            <input className="search" placeholder="Rechercher une astuce…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className={cls('chip', cat === 'all' && 'on')} onClick={() => setCat('all')}>Tout</button>
            {CATEGORIES.map((c) => <button key={c.id} className={cls('chip', cat === c.id && 'on')} onClick={() => setCat(c.id)}>{c.icon} {c.label}</button>)}
          </div>
          <div className="tips-grid">
            {tips.map((t) => {
              const c = CATEGORIES.find((x) => x.id === t.cat);
              return (
                <div key={t.title} className={cls('panel tip-card', read.has(t.title) && 'read')}>
                  <div className="tip-cat">{c.icon} {c.label}</div>
                  <h3>{t.title}</h3>
                  <p>{t.text}</p>
                  <button className="mini" onClick={() => toggleRead(t.title)}>{read.has(t.title) ? '✓ Lu' : 'Marquer comme lu'}</button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {section === 'patterns' && (
        <div className="tips-grid">
          {PATTERNS.map((p) => (
            <div key={p.name} className="panel tip-card">
              <svg viewBox="0 0 120 100" className="pattern-svg">
                <path d={p.svg} fill="none" stroke={p.type === 'bull' ? '#16c784' : '#ea3943'} strokeWidth="2.5" strokeLinejoin="round" />
              </svg>
              <h3>{p.name} <span className={cls('tag', p.type === 'bull' ? 'tag-up' : 'tag-down')}>{p.type === 'bull' ? 'Haussier' : 'Baissier'}</span></h3>
              <p>{p.text}</p>
            </div>
          ))}
        </div>
      )}

      {section === 'scenarios' && (
        <>
          <p className="muted intro">Le moteur du simulateur reproduit les comportements observés sur les vrais marchés crypto. Chaque monnaie passe d'une phase à l'autre de façon aléatoire mais réaliste, influencée par le marché global et les actualités. Apprends à les reconnaître sur le graphique :</p>
          <div className="tips-grid">
            {SCENARIOS.map((s) => (
              <div key={s.name} className="panel tip-card">
                <div className="scenario-icon">{s.icon}</div>
                <h3>{s.name}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {section === 'glossary' && (
        <div className="panel pad glossary">
          {GLOSSARY.map(([k, v]) => <div key={k}><b>{k}</b><span>{v}</span></div>)}
        </div>
      )}

      {section === 'routine' && (
        <div className="grid-2">
          <div className="panel pad checklist">
            <h3>Avant chaque trade</h3>
            {['Quelle est la tendance sur l\'unité de temps supérieure (4h / 1J) ?', 'Que fait NOVA (le leader du marché) ?', 'Où sont les supports et résistances les plus proches ?', 'Où je place mon stop loss (ce qui invalide mon idée) ?', 'Où je prends mes profits ? Mon ratio est-il ≥ 1:2 ?', 'Combien je risque ? (≤ 1-2 % du capital)', 'Y a-t-il une actualité récente sur cette monnaie ?', 'Suis-je calme, ou est-ce que je trade sous le coup d\'une émotion ?'].map((x) => <label key={x}><input type="checkbox" /> {x}</label>)}
          </div>
          <div className="panel pad checklist">
            <h3>Après chaque trade</h3>
            {['J\'ai noté le trade dans mon journal', 'J\'ai respecté mon plan (entrée, stop, objectif) ?', 'Qu\'est-ce que j\'ai bien fait ?', 'Qu\'est-ce que je ferais différemment ?', 'Si c\'était une perte : est-ce que j\'ai besoin d\'une pause ?'].map((x) => <label key={x}><input type="checkbox" /> {x}</label>)}
            <h3 style={{ marginTop: 18 }}>Programme pour débuter</h3>
            <ol className="steps">
              <li><b>Semaine 1 :</b> uniquement du spot, sur NOVA et AETH, en 1h. Objectif : comprendre les ordres et les bougies.</li>
              <li><b>Semaine 2 :</b> ajoute les stops loss systématiques et la règle des 1 %.</li>
              <li><b>Semaine 3 :</b> essaie le levier x2 à x5, toujours avec stop. Teste les shorts.</li>
              <li><b>Semaine 4 :</b> choisis UNE stratégie (pullback, range ou breakout) et fais 30 trades avec.</li>
              <li><b>Ensuite :</b> analyse tes statistiques dans Portefeuille et ton Journal, et améliore une seule chose à la fois.</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
