import { useEffect, useState } from 'react';
import { useStore, api, toast } from '../lib/store.js';
import { fmtPrice, fmtUsd, fmtQty, cls, decimalsFor } from '../lib/format.js';

const LEVS = [1, 2, 3, 5, 10, 20, 50, 100];
const roundP = (p) => Number(p.toFixed(decimalsFor(p)));

export default function OrderForm() {
  const sym = useStore((s) => s.sym);
  const t = useStore((s) => s.tickers[s.sym]);
  const account = useStore((s) => s.account);
  const picked = useStore((s) => s.pickedPrice);
  const analysis = useStore((s) => s.analysis);
  const [mode, setMode] = useState(() => localStorage.getItem('ts.mode') || 'spot');
  const [side, setSide] = useState('buy');
  const [type, setType] = useState('market');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('usd');
  const [lev, setLev] = useState(5);
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [riskPct, setRiskPct] = useState(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setPrice(''); setAmount(''); setSl(''); setTp(''); }, [sym]);
  useEffect(() => { localStorage.setItem('ts.mode', mode); setSide(mode === 'spot' ? 'buy' : 'long'); }, [mode]);
  useEffect(() => {
    if (!picked) return;
    setPrice(String(picked.p));
    if (type === 'market') setType('limit');
  }, [picked]);

  if (!account || !t) return <div className="panel order-form" />;
  const last = t.price;
  const isBuy = side === 'buy' || side === 'long';
  const execPrice = type === 'market' ? last : Number(price) || last;
  const cash = account.cash;
  const holding = account.holdings[sym]?.qty || 0;
  const equity = account.equityNow;

  const setPct = (pct) => {
    if (mode === 'spot') {
      if (side === 'buy') { setUnit('usd'); setAmount(((cash * pct) / 100 / 1.001).toFixed(2)); }
      else { setUnit('qty'); setAmount(String((holding * pct) / 100)); }
    } else setAmount(((cash * pct) / 100 / (1 + lev * 0.0006)).toFixed(2));
  };

  const amt = Number(amount) || 0;
  let qty = 0, notional = 0;
  if (mode === 'spot') {
    if (unit === 'usd') { notional = amt; qty = amt / execPrice; } else { qty = amt; notional = amt * execPrice; }
  } else { notional = amt * lev; qty = notional / execPrice; }
  const fee = notional * (mode === 'spot' ? (type === 'limit' ? 0.0005 : 0.001) : type === 'limit' ? 0.0002 : 0.0006);

  const slN = Number(sl) || null, tpN = Number(tp) || null;
  const dir = isBuy ? 1 : -1;
  const liq = mode === 'futures' ? (side === 'long' ? execPrice * (1 - 1 / lev + 0.005) : execPrice * (1 + 1 / lev - 0.005)) : null;
  const riskUsd = slN ? Math.abs(execPrice - slN) * qty + fee * 2 : null;
  const gainUsd = tpN ? Math.abs(tpN - execPrice) * qty - fee * 2 : null;
  const rr = slN && tpN ? Math.abs(tpN - execPrice) / Math.abs(execPrice - slN) : null;
  const warnings = [];
  if (mode === 'futures') {
    if (!slN) warnings.push('Aucun stop loss : ta perte max est toute ta marge.');
    if (slN && liq && ((side === 'long' && slN <= liq) || (side === 'short' && slN >= liq))) warnings.push('Ton stop loss est au-delà du prix de liquidation : tu seras liquidé avant !');
    if (lev >= 25) warnings.push(`Levier x${lev} : une variation de ${(100 / lev).toFixed(1)} % suffit à te liquider.`);
  }
  if (riskUsd && equity && riskUsd / equity > 0.02) warnings.push(`Tu risques ${((riskUsd / equity) * 100).toFixed(1)} % de ton capital (conseillé : 1 à 2 %).`);
  if (rr && rr < 1.5) warnings.push(`Ratio risque/rendement faible (1:${rr.toFixed(2)}). Vise au moins 1:2.`);
  if (slN && ((isBuy && slN >= execPrice) || (!isBuy && slN <= execPrice))) warnings.push('Le stop loss est du mauvais côté du prix.');

  const pctPrice = (pct, kind) => {
    const p = execPrice * (1 + (dir * pct) / 100);
    const v = String(roundP(p));
    kind === 'sl' ? setSl(v) : kind === 'tp' ? setTp(v) : setPrice(v);
  };

  const applyPlan = () => {
    if (!analysis || analysis.sym !== sym) return toast('error', "L'analyse n'est pas encore prête");
    const plan = isBuy ? analysis.longPlan : analysis.shortPlan;
    const d = execPrice - last;
    setSl(String(roundP(plan.sl + d)));
    setTp(String(roundP(plan.tp + d)));
  };

  const sizeByRisk = () => {
    if (!slN) return toast('error', "Définis d'abord ton stop loss");
    const dist = Math.abs(execPrice - slN) / execPrice;
    const riskBudget = (equity * riskPct) / 100;
    const n = riskBudget / dist;
    if (mode === 'spot') { setUnit('usd'); setAmount(Math.min(n, cash / 1.001).toFixed(2)); }
    else setAmount(Math.min(n / lev, cash * 0.98).toFixed(2));
  };

  const submit = async () => {
    if (!amt) return toast('error', 'Indique un montant');
    setBusy(true);
    try {
      if (mode === 'spot') {
        const body = { sym, side, type };
        if (type !== 'market') body.price = Number(price);
        if (side === 'buy' && unit === 'usd' && type === 'market') body.quote = amt * 1.001;
        else body.qty = qty;
        const res = await api('POST', '/api/spot', body);
        const bought = (res.account.holdings[sym]?.qty || 0) - holding;
        if (slN && side === 'buy' && type === 'market' && bought > 0) {
          await api('POST', '/api/spot', { sym, side: 'sell', type: 'stop', price: slN, qty: bought * 0.9999 });
        }
      } else {
        await api('POST', '/api/futures', { sym, side, type, price: type === 'limit' ? Number(price) : undefined, margin: amt, leverage: lev, sl: slN, tp: tpN });
      }
      setAmount('');
    } catch { /* toast déjà affiché */ }
    setBusy(false);
  };

  const spotTypes = [['market', 'Marché'], ['limit', 'Limite'], ['stop', 'Stop']];
  const futTypes = [['market', 'Marché'], ['limit', 'Limite']];

  return (
    <div className="panel order-form">
      <div className="tabs2">
        <button className={cls(mode === 'spot' && 'on')} onClick={() => setMode('spot')}>Spot</button>
        <button className={cls(mode === 'futures' && 'on')} onClick={() => setMode('futures')}>Levier (Futures)</button>
      </div>
      <div className="side-toggle">
        {mode === 'spot' ? (
          <>
            <button className={cls('buy', side === 'buy' && 'on')} onClick={() => setSide('buy')}>Acheter</button>
            <button className={cls('sell', side === 'sell' && 'on')} onClick={() => setSide('sell')}>Vendre</button>
          </>
        ) : (
          <>
            <button className={cls('buy', side === 'long' && 'on')} onClick={() => setSide('long')}>Long ▲</button>
            <button className={cls('sell', side === 'short' && 'on')} onClick={() => setSide('short')}>Short ▼</button>
          </>
        )}
      </div>
      <div className="seg full">
        {(mode === 'spot' ? spotTypes : futTypes).map(([k, l]) => <button key={k} className={cls(type === k && 'on')} onClick={() => { setType(k); if (k !== 'market' && !price) setPrice(String(roundP(last))); }}>{l}</button>)}
      </div>
      <div className="avail">
        <span>Disponible</span>
        <b className="mono">{mode === 'spot' && side === 'sell' ? `${fmtQty(holding)} ${sym}` : fmtUsd(cash)}</b>
      </div>

      {type !== 'market' && (
        <label className="field">
          <span>{type === 'stop' ? 'Prix de déclenchement' : 'Prix limite'}</span>
          <div className="input-wrap">
            <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} step="any" />
            <em>$</em>
          </div>
          <div className="quick">
            {(type === 'stop' ? [0.5, 1, 2, 5] : [-0.5, -1, -2, -5]).map((p) => (
              <button key={p} onClick={() => pctPrice(isBuy ? p : -p)}>{(isBuy ? p : -p) > 0 ? '+' : ''}{isBuy ? p : -p}%</button>
            ))}
            <button onClick={() => setPrice(String(roundP(last)))}>Dernier</button>
          </div>
        </label>
      )}

      <label className="field">
        <span>{mode === 'futures' ? 'Marge (mise)' : unit === 'usd' ? 'Montant' : 'Quantité'}</span>
        <div className="input-wrap">
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" step="any" />
          {mode === 'spot' ? (
            <button className="unit" onClick={() => { setUnit(unit === 'usd' ? 'qty' : 'usd'); setAmount(''); }}>{unit === 'usd' ? '$' : sym} ⇄</button>
          ) : <em>$</em>}
        </div>
        <div className="quick">
          {[10, 25, 50, 75, 100].map((p) => <button key={p} onClick={() => setPct(p)}>{p}%</button>)}
        </div>
      </label>

      {mode === 'futures' && (
        <div className="field">
          <span>Levier : <b className={lev >= 20 ? 'down' : lev >= 10 ? 'warn' : 'up'}>x{lev}</b></span>
          <input type="range" min="1" max="100" value={lev} onChange={(e) => setLev(Number(e.target.value))} className="lev-range" />
          <div className="quick">{LEVS.map((l) => <button key={l} className={cls(lev === l && 'on')} onClick={() => setLev(l)}>x{l}</button>)}</div>
        </div>
      )}

      {(mode === 'futures' || side === 'buy') && (
        <div className="sltp">
          <label className="field">
            <span>Stop loss {mode === 'spot' && <i className="muted" title="Un ordre stop de vente est placé automatiquement après un achat au marché">(auto)</i>}</span>
            <input type="number" value={sl} onChange={(e) => setSl(e.target.value)} placeholder="Prix" step="any" />
            <div className="quick">{[1, 2, 5].map((p) => <button key={p} onClick={() => pctPrice(-p, 'sl')}>-{p}%</button>)}</div>
          </label>
          <label className="field">
            <span>Take profit {mode === 'spot' && <i className="muted">(calcul)</i>}</span>
            <input type="number" value={tp} onChange={(e) => setTp(e.target.value)} placeholder="Prix" step="any" />
            <div className="quick">{[2, 5, 10].map((p) => <button key={p} onClick={() => pctPrice(p, 'tp')}>+{p}%</button>)}</div>
          </label>
        </div>
      )}
      {(mode === 'futures' || side === 'buy') && (
        <div className="helpers">
          <button className="ghost small" onClick={applyPlan} title="Stop à 1,5 ATR et objectif à 3 ATR">🎯 Plan ATR</button>
          <button className="ghost small" onClick={sizeByRisk} title="Calcule la taille pour ne risquer que X % du capital">
            ⚖️ Risquer
          </button>
          <select value={riskPct} onChange={(e) => setRiskPct(Number(e.target.value))} className="small-select">
            {[0.5, 1, 2, 3, 5].map((r) => <option key={r} value={r}>{r} %</option>)}
          </select>
        </div>
      )}

      <div className="summary">
        <div><span>Prix d'exécution {type === 'market' && '≈'}</span><b className="mono">{fmtPrice(execPrice)} $</b></div>
        <div><span>Quantité</span><b className="mono">{fmtQty(qty)} {sym}</b></div>
        {mode === 'futures' && <div><span>Taille de position</span><b className="mono">{fmtUsd(notional)}</b></div>}
        <div><span>Frais estimés</span><b className="mono">{fmtUsd(fee)}</b></div>
        {liq && <div><span>Prix de liquidation</span><b className="mono liq">{fmtPrice(liq)} $ <small>({((Math.abs(liq - execPrice) / execPrice) * 100).toFixed(1)} %)</small></b></div>}
        {riskUsd != null && <div><span>Perte si SL touché</span><b className="mono down">-{fmtUsd(riskUsd)} <small>({((riskUsd / equity) * 100).toFixed(2)} %)</small></b></div>}
        {gainUsd != null && <div><span>Gain si TP touché</span><b className="mono up">+{fmtUsd(gainUsd)}</b></div>}
        {rr != null && <div><span>Ratio risque/rendement</span><b className={cls('mono', rr >= 2 ? 'up' : rr >= 1.5 ? 'warn' : 'down')}>1 : {rr.toFixed(2)}</b></div>}
      </div>
      {warnings.length > 0 && <div className="warnings">{warnings.map((w) => <div key={w}>⚠️ {w}</div>)}</div>}
      <button className={cls('submit', isBuy ? 'buy' : 'sell')} disabled={busy} onClick={submit}>
        {mode === 'spot' ? (side === 'buy' ? `Acheter ${sym}` : `Vendre ${sym}`) : side === 'long' ? `Ouvrir LONG x${lev}` : `Ouvrir SHORT x${lev}`}
      </button>
    </div>
  );
}
