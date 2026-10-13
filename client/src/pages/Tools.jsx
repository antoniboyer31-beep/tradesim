import { useEffect, useState } from 'react';
import { useStore, api } from '../lib/store.js';
import { fmtUsd, fmtPrice, fmtQty, fmtPct, cls } from '../lib/format.js';

function useNum(init) {
  const [v, setV] = useState(String(init));
  return [Number(v) || 0, { value: v, onChange: (e) => setV(e.target.value), type: 'number', step: 'any' }, setV];
}

function Card({ icon, title, desc, children }) {
  return (
    <div className="panel pad tool-card">
      <div className="tool-title">{icon} {title}</div>
      {desc && <p className="muted small">{desc}</p>}
      {children}
    </div>
  );
}

const F = ({ label, ...p }) => (
  <label className="field"><span>{label}</span><input {...p} /></label>
);
const R = ({ label, value, c }) => (
  <div className="res"><span>{label}</span><b className={cls('mono', c)}>{value}</b></div>
);

function PositionSize() {
  const account = useStore((s) => s.account);
  const [cap, capP, setCap] = useNum(10000);
  const [risk, riskP] = useNum(1);
  const [entry, entryP] = useNum(100);
  const [stop, stopP] = useNum(95);
  useEffect(() => { if (account) setCap(account.equityNow.toFixed(2)); }, [!!account]);
  const riskUsd = (cap * risk) / 100;
  const dist = Math.abs(entry - stop);
  const qty = dist ? riskUsd / dist : 0;
  const notional = qty * entry;
  return (
    <Card icon="⚖️" title="Taille de position" desc="Combien acheter pour ne perdre que X % de ton capital si le stop est touché.">
      <div className="fields-2">
        <F label="Capital ($)" {...capP} /><F label="Risque (%)" {...riskP} />
        <F label="Prix d'entrée" {...entryP} /><F label="Stop loss" {...stopP} />
      </div>
      <R label="Montant risqué" value={fmtUsd(riskUsd)} c="down" />
      <R label="Quantité à acheter" value={fmtQty(qty)} />
      <R label="Taille de la position" value={fmtUsd(notional)} />
      <R label="Levier nécessaire" value={notional > cap ? `x${Math.ceil(notional / cap)}` : 'Aucun (x1)'} c={notional > cap * 10 ? 'down' : ''} />
      <R label="Distance du stop" value={entry ? `${((dist / entry) * 100).toFixed(2)} %` : '—'} />
    </Card>
  );
}

function RiskReward() {
  const [entry, entryP] = useNum(100);
  const [sl, slP] = useNum(95);
  const [tp, tpP] = useNum(112);
  const risk = Math.abs(entry - sl), reward = Math.abs(tp - entry);
  const rr = risk ? reward / risk : 0;
  const be = rr ? 100 / (1 + rr) : 0;
  return (
    <Card icon="🎯" title="Ratio risque / rendement" desc="Le taux de réussite minimum pour être rentable dépend de ton ratio.">
      <div className="fields-3"><F label="Entrée" {...entryP} /><F label="Stop loss" {...slP} /><F label="Take profit" {...tpP} /></div>
      <div className="rr-visual">
        <div className="rr-loss" style={{ flex: risk || 1 }}>-{entry ? ((risk / entry) * 100).toFixed(1) : 0} %</div>
        <div className="rr-gain" style={{ flex: reward || 1 }}>+{entry ? ((reward / entry) * 100).toFixed(1) : 0} %</div>
      </div>
      <R label="Ratio" value={`1 : ${rr.toFixed(2)}`} c={rr >= 2 ? 'up' : rr >= 1.5 ? 'warn' : 'down'} />
      <R label="Taux de réussite minimum pour être rentable" value={`${be.toFixed(1)} %`} />
      <p className="small muted">{rr >= 2 ? '✅ Bon ratio : tu peux te tromper plus d\'une fois sur deux et rester gagnant.' : '⚠️ Ratio faible : il faudra avoir raison très souvent.'}</p>
    </Card>
  );
}

function Liquidation() {
  const [entry, entryP] = useNum(100);
  const [lev, levP] = useNum(10);
  const [side, setSide] = useState('long');
  const liq = lev ? (side === 'long' ? entry * (1 - 1 / lev + 0.005) : entry * (1 + 1 / lev - 0.005)) : 0;
  return (
    <Card icon="💀" title="Prix de liquidation" desc="Le prix auquel ta position à levier est fermée de force.">
      <div className="seg full"><button className={cls(side === 'long' && 'on')} onClick={() => setSide('long')}>Long</button><button className={cls(side === 'short' && 'on')} onClick={() => setSide('short')}>Short</button></div>
      <div className="fields-2"><F label="Prix d'entrée" {...entryP} /><F label="Levier" {...levP} /></div>
      <R label="Prix de liquidation" value={fmtPrice(liq)} c="liq" />
      <R label="Mouvement contraire toléré" value={entry ? `${((Math.abs(liq - entry) / entry) * 100).toFixed(2)} %` : '—'} c="down" />
      <table className="tbl mini-tbl">
        <thead><tr><th>Levier</th><th>Mouvement toléré</th></tr></thead>
        <tbody>{[2, 5, 10, 20, 50, 100].map((l) => <tr key={l}><td>x{l}</td><td className="mono">{((1 / l - 0.005) * 100).toFixed(2)} %</td></tr>)}</tbody>
      </table>
    </Card>
  );
}

function Recovery() {
  const [loss, lossP] = useNum(30);
  const need = loss < 100 ? (1 / (1 - loss / 100) - 1) * 100 : Infinity;
  return (
    <Card icon="📉" title="Récupérer une perte" desc="Pourquoi protéger son capital est essentiel : les pertes sont asymétriques.">
      <F label="Perte subie (%)" {...lossP} />
      <R label="Gain nécessaire pour revenir à zéro" value={isFinite(need) ? `+${need.toFixed(1)} %` : '∞'} c="down" />
      <table className="tbl mini-tbl">
        <thead><tr><th>Perte</th><th>Gain nécessaire</th></tr></thead>
        <tbody>{[10, 20, 30, 50, 75, 90].map((l) => <tr key={l}><td className="down">-{l} %</td><td className="mono">+{((1 / (1 - l / 100) - 1) * 100).toFixed(0)} %</td></tr>)}</tbody>
      </table>
    </Card>
  );
}

function Compound() {
  const [cap, capP] = useNum(1000);
  const [rate, rateP] = useNum(1);
  const [periods, perP] = useNum(30);
  const final = cap * (1 + rate / 100) ** periods;
  return (
    <Card icon="📈" title="Intérêts composés" desc="L'effet boule de neige d'un petit gain régulier réinvesti.">
      <div className="fields-3"><F label="Capital ($)" {...capP} /><F label="Gain par période (%)" {...rateP} /><F label="Nombre de périodes" {...perP} /></div>
      <R label="Capital final" value={fmtUsd(final)} c="up" />
      <R label="Gain total" value={fmtPct((final / cap - 1) * 100, 1)} c="up" />
      <p className="small muted">Ex : 1 % par jour pendant 365 jours = ×{(1.01 ** 365).toFixed(0)}. Personne ne tient ce rythme : méfie-toi des promesses de gains réguliers.</p>
    </Card>
  );
}

function Expectancy() {
  const [wr, wrP] = useNum(45);
  const [aw, awP] = useNum(200);
  const [al, alP] = useNum(100);
  const e = (wr / 100) * aw - (1 - wr / 100) * al;
  return (
    <Card icon="🎲" title="Espérance de gain" desc="Combien tu gagnes en moyenne par trade avec ta stratégie.">
      <div className="fields-3"><F label="Taux de réussite (%)" {...wrP} /><F label="Gain moyen ($)" {...awP} /><F label="Perte moyenne ($)" {...alP} /></div>
      <R label="Espérance par trade" value={`${e >= 0 ? '+' : ''}${e.toFixed(2)} $`} c={e >= 0 ? 'up' : 'down'} />
      <R label="Sur 100 trades" value={`${e >= 0 ? '+' : ''}${(e * 100).toFixed(0)} $`} c={e >= 0 ? 'up' : 'down'} />
      <p className="small muted">{e > 0 ? '✅ Stratégie rentable sur le long terme si tu la suis avec discipline.' : '❌ Stratégie perdante : améliore ton ratio ou ton taux de réussite.'}</p>
    </Card>
  );
}

function Fibonacci() {
  const [hi, hiP] = useNum(120);
  const [lo, loP] = useNum(100);
  const [dir, setDir] = useState('up');
  const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618];
  return (
    <Card icon="🌀" title="Retracements de Fibonacci" desc="Niveaux de correction probables après un mouvement.">
      <div className="seg full"><button className={cls(dir === 'up' && 'on')} onClick={() => setDir('up')}>Après une hausse</button><button className={cls(dir === 'down' && 'on')} onClick={() => setDir('down')}>Après une baisse</button></div>
      <div className="fields-2"><F label="Plus haut" {...hiP} /><F label="Plus bas" {...loP} /></div>
      <table className="tbl mini-tbl">
        <tbody>{levels.map((l) => {
          const p = dir === 'up' ? hi - (hi - lo) * l : lo + (hi - lo) * l;
          return <tr key={l} className={l === 0.618 ? 'hl' : ''}><td>{(l * 100).toFixed(1)} %{l === 0.618 && ' ⭐'}{l > 1 && ' (extension)'}</td><td className="mono">{fmtPrice(p)}</td></tr>;
        })}</tbody>
      </table>
    </Card>
  );
}

function Pivots() {
  const sym = useStore((s) => s.sym);
  const t = useStore((s) => s.tickers[s.sym]);
  const [h, hP, setH] = useNum(110);
  const [l, lP, setL] = useNum(90);
  const [c, cP, setC] = useNum(100);
  const fill = () => { if (t) { setH(String(t.high24)); setL(String(t.low24)); setC(String(t.price)); } };
  const P = (h + l + c) / 3;
  const rows = [['R3', h + 2 * (P - l)], ['R2', P + (h - l)], ['R1', 2 * P - l], ['Pivot', P], ['S1', 2 * P - h], ['S2', P - (h - l)], ['S3', l - 2 * (h - P)]];
  return (
    <Card icon="📍" title="Points pivots" desc="Supports et résistances classiques calculés à partir du haut, bas et clôture.">
      <button className="ghost small" onClick={fill}>Remplir avec {sym} (24h)</button>
      <div className="fields-3"><F label="Haut" {...hP} /><F label="Bas" {...lP} /><F label="Clôture" {...cP} /></div>
      <table className="tbl mini-tbl">
        <tbody>{rows.map(([k, v]) => <tr key={k}><td className={k.startsWith('R') ? 'down' : k.startsWith('S') ? 'up' : ''}>{k}</td><td className="mono">{fmtPrice(v)}</td></tr>)}</tbody>
      </table>
    </Card>
  );
}

function AveragePrice() {
  const [rows, setRows] = useState([{ p: '100', q: '1' }, { p: '90', q: '1' }]);
  const tot = rows.reduce((s, r) => s + (Number(r.q) || 0), 0);
  const cost = rows.reduce((s, r) => s + (Number(r.q) || 0) * (Number(r.p) || 0), 0);
  const upd = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <Card icon="🧮" title="Prix moyen d'achat" desc="Calcule ton prix moyen après plusieurs achats.">
      {rows.map((r, i) => (
        <div key={i} className="fields-2 compact">
          <F label={`Prix achat ${i + 1}`} type="number" value={r.p} onChange={(e) => upd(i, 'p', e.target.value)} />
          <F label="Quantité" type="number" value={r.q} onChange={(e) => upd(i, 'q', e.target.value)} />
        </div>
      ))}
      <div className="row-btns">
        <button className="ghost small" onClick={() => setRows([...rows, { p: '', q: '' }])}>+ Ajouter un achat</button>
        {rows.length > 1 && <button className="ghost small" onClick={() => setRows(rows.slice(0, -1))}>− Retirer</button>}
      </div>
      <R label="Quantité totale" value={fmtQty(tot)} />
      <R label="Coût total" value={fmtUsd(cost)} />
      <R label="Prix moyen" value={tot ? fmtPrice(cost / tot) : '—'} c="up" />
    </Card>
  );
}

function DcaSim() {
  const coins = useStore((s) => s.coins);
  const [sym, setSym] = useState('NOVA');
  const [amt, amtP] = useNum(100);
  const [weeks, weeksP] = useNum(52);
  const [res, setRes] = useState(null);
  const run = async () => {
    const { candles } = await api('GET', `/api/candles?sym=${sym}&tf=1w&limit=${Math.max(2, weeks + 1)}`);
    const list = candles.slice(-weeks);
    let qty = 0, spent = 0;
    for (const c of list) { qty += amt / c[1]; spent += amt; }
    const last = candles[candles.length - 1][4];
    const lump = (spent / list[0][1]) * last;
    setRes({ qty, spent, value: qty * last, avg: spent / qty, lump, n: list.length, first: list[0][1] });
  };
  return (
    <Card icon="🗓️" title="Simulateur DCA" desc="Et si tu avais acheté un montant fixe chaque semaine ? (sur l'historique réel du simulateur)">
      <div className="fields-3">
        <label className="field"><span>Monnaie</span><select value={sym} onChange={(e) => setSym(e.target.value)}>{coins.map((c) => <option key={c.sym}>{c.sym}</option>)}</select></label>
        <F label="$ par semaine" {...amtP} /><F label="Nombre de semaines" {...weeksP} />
      </div>
      <button className="primary small" onClick={run}>Lancer la simulation</button>
      {res && (
        <>
          <R label="Total investi" value={fmtUsd(res.spent)} />
          <R label="Valeur aujourd'hui" value={fmtUsd(res.value)} c={res.value >= res.spent ? 'up' : 'down'} />
          <R label="Performance DCA" value={fmtPct((res.value / res.spent - 1) * 100)} c={res.value >= res.spent ? 'up' : 'down'} />
          <R label="Prix moyen obtenu" value={fmtPrice(res.avg)} />
          <R label="Si tout investi au début" value={`${fmtUsd(res.lump)} (${fmtPct((res.lump / res.spent - 1) * 100)})`} c={res.lump >= res.spent ? 'up' : 'down'} />
        </>
      )}
    </Card>
  );
}

export default function Tools() {
  return (
    <div className="page">
      <div className="page-head">
        <h1>Boîte à outils du trader</h1>
        <p className="muted">Calcule avant de cliquer. Les meilleurs traders passent plus de temps à planifier qu'à trader.</p>
      </div>
      <div className="tools-grid">
        <PositionSize /><RiskReward /><Liquidation /><Expectancy /><Fibonacci /><Pivots /><DcaSim /><AveragePrice /><Recovery /><Compound />
      </div>
    </div>
  );
}
