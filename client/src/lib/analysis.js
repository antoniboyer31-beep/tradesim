import { ema, rsi, macd, bollinger, atr, supportResistance, stochastic } from './indicators.js';
import { fmtPrice } from './format.js';

export function analyze(candles) {
  if (!candles || candles.length < 60) return null;
  const closes = candles.map((c) => c.close);
  const n = closes.length - 1;
  const last = closes[n];
  const items = [];
  let score = 0;

  const e20 = ema(closes, 20), e50 = ema(closes, 50), e200 = closes.length > 220 ? ema(closes, 200) : null;
  const slope = (e20[n] - e20[n - 10]) / e20[n - 10] * 100;
  if (e20[n] > e50[n] && last > e20[n]) {
    score += 25;
    items.push({ level: 'bull', title: 'Tendance haussière', text: `Le prix est au-dessus de l'EMA 20, elle-même au-dessus de l'EMA 50. Privilégie les achats sur repli plutôt que de vendre à découvert.` });
  } else if (e20[n] < e50[n] && last < e20[n]) {
    score -= 25;
    items.push({ level: 'bear', title: 'Tendance baissière', text: `Le prix est sous l'EMA 20, elle-même sous l'EMA 50. Évite d'acheter « pas cher » : en tendance baissière, le prix peut toujours descendre plus bas.` });
  } else {
    items.push({ level: 'neutral', title: 'Pas de tendance claire', text: `Les moyennes mobiles sont emmêlées : le marché hésite ou est en range. Les stratégies de range (acheter le support, vendre la résistance) fonctionnent mieux ici.` });
  }
  if (e200 && e200[n]) {
    const above = last > e200[n];
    score += above ? 10 : -10;
    items.push({ level: above ? 'bull' : 'bear', title: above ? 'Au-dessus de la EMA 200' : 'Sous la EMA 200', text: above ? 'Le contexte de fond est haussier sur cette unité de temps.' : 'Le contexte de fond est baissier sur cette unité de temps.' });
  }
  const crossUp = e20[n] > e50[n] && e20[n - 3] <= e50[n - 3];
  const crossDn = e20[n] < e50[n] && e20[n - 3] >= e50[n - 3];
  if (crossUp) { score += 10; items.push({ level: 'bull', title: 'Croisement haussier EMA 20/50', text: "L'EMA 20 vient de passer au-dessus de l'EMA 50 : signal de début de tendance, à confirmer avec le volume." }); }
  if (crossDn) { score -= 10; items.push({ level: 'bear', title: 'Croisement baissier EMA 20/50', text: "L'EMA 20 vient de passer sous l'EMA 50 : signal de faiblesse." }); }

  const r = rsi(closes, 14);
  const rv = r[n];
  if (rv != null) {
    if (rv > 70) { score -= 12; items.push({ level: 'bear', title: `RSI en surachat (${rv.toFixed(0)})`, text: "Le prix a beaucoup monté rapidement. Risque de correction, mais en forte tendance le RSI peut rester longtemps au-dessus de 70 : ce n'est pas un signal de vente à lui seul." }); }
    else if (rv < 30) { score += 12; items.push({ level: 'bull', title: `RSI en survente (${rv.toFixed(0)})`, text: "Le prix a beaucoup baissé rapidement. Un rebond est possible, mais attends une confirmation (bougie de retournement) avant d'acheter." }); }
    else items.push({ level: 'neutral', title: `RSI neutre (${rv.toFixed(0)})`, text: rv > 50 ? 'Les acheteurs ont un léger avantage.' : 'Les vendeurs ont un léger avantage.' });
    const w = 30;
    let ph = -Infinity, phi = -1, rh = -Infinity;
    for (let i = n - w; i < n - 5; i++) if (closes[i] > ph) { ph = closes[i]; phi = i; }
    if (phi > 0) rh = r[phi];
    if (last > ph && rv < rh - 3 && rv > 55) { score -= 10; items.push({ level: 'bear', title: 'Divergence baissière RSI', text: 'Le prix fait un plus haut mais le RSI non : la force acheteuse s\'essouffle.' }); }
    let pl = Infinity, pli = -1;
    for (let i = n - w; i < n - 5; i++) if (closes[i] < pl) { pl = closes[i]; pli = i; }
    if (pli > 0 && last < pl && rv > r[pli] + 3 && rv < 45) { score += 10; items.push({ level: 'bull', title: 'Divergence haussière RSI', text: 'Le prix fait un plus bas mais le RSI non : la pression vendeuse faiblit.' }); }
  }

  const m = macd(closes);
  if (m.hist[n] != null && m.hist[n - 1] != null) {
    if (m.hist[n] > 0 && m.hist[n - 2] <= 0) { score += 8; items.push({ level: 'bull', title: 'MACD croise à la hausse', text: 'La ligne MACD passe au-dessus de son signal : le momentum devient haussier.' }); }
    else if (m.hist[n] < 0 && m.hist[n - 2] >= 0) { score -= 8; items.push({ level: 'bear', title: 'MACD croise à la baisse', text: 'La ligne MACD passe sous son signal : le momentum devient baissier.' }); }
    else score += m.hist[n] > 0 ? 4 : -4;
  }

  const st = stochastic(candles);
  if (st.k[n] != null) {
    if (st.k[n] > 80 && st.k[n] < st.d[n]) { score -= 5; items.push({ level: 'bear', title: 'Stochastique se retourne en zone haute', text: 'Signal de court terme : possible petite baisse.' }); }
    if (st.k[n] < 20 && st.k[n] > st.d[n]) { score += 5; items.push({ level: 'bull', title: 'Stochastique se retourne en zone basse', text: 'Signal de court terme : possible petit rebond.' }); }
  }

  const bb = bollinger(closes);
  const width = (bb.upper[n] - bb.lower[n]) / bb.mid[n];
  let minW = Infinity;
  for (let i = Math.max(20, n - 120); i <= n; i++) minW = Math.min(minW, (bb.upper[i] - bb.lower[i]) / bb.mid[i]);
  if (width <= minW * 1.1) items.push({ level: 'info', title: 'Compression de Bollinger (squeeze)', text: 'La volatilité est au plus bas : un mouvement violent se prépare souvent. Attends la cassure et sa direction avant de te positionner.' });
  if (last > bb.upper[n]) items.push({ level: 'info', title: 'Prix au-dessus de la bande haute', text: 'Signe de force, mais aussi d\'excès. En range, c\'est une zone de vente ; en tendance, une confirmation.' });
  if (last < bb.lower[n]) items.push({ level: 'info', title: 'Prix sous la bande basse', text: 'Signe de faiblesse ou d\'excès vendeur. En range, zone d\'achat ; en tendance baissière, une confirmation.' });

  let volAvg = 0;
  for (let i = n - 20; i < n; i++) volAvg += candles[i].volume;
  volAvg /= 20;
  if (candles[n].volume > volAvg * 2.2 || candles[n - 1].volume > volAvg * 2.2) {
    const dir = candles[n].close >= candles[n].open;
    items.push({ level: dir ? 'bull' : 'bear', title: 'Pic de volume', text: `Volume plus de 2× supérieur à la moyenne : des gros acteurs interviennent ${dir ? 'à l\'achat' : 'à la vente'}. Les mouvements avec volume sont plus fiables.` });
    score += dir ? 6 : -6;
  }

  const a = atr(candles)[n];
  const atrPct = a / last * 100;

  const pat = candlePattern(candles);
  if (pat) { items.push(pat); score += pat.level === 'bull' ? 6 : pat.level === 'bear' ? -6 : 0; }

  const zones = supportResistance(candles);
  const supports = zones.filter((z) => z.price < last).sort((x, y) => y.price - x.price).slice(0, 3);
  const resistances = zones.filter((z) => z.price > last).sort((x, y) => x.price - y.price).slice(0, 3);
  if (supports[0] && (last - supports[0].price) / last < 0.006) items.push({ level: 'info', title: 'Proche d\'un support', text: `Le prix teste un support vers ${fmtPrice(supports[0].price)}. S'il tient, rebond probable ; s'il casse, accélération baissière.` });
  if (resistances[0] && (resistances[0].price - last) / last < 0.006) items.push({ level: 'info', title: 'Proche d\'une résistance', text: `Le prix teste une résistance vers ${fmtPrice(resistances[0].price)}. Une cassure avec volume peut lancer un nouveau mouvement.` });

  score = Math.max(-100, Math.min(100, score));
  const bias = score > 30 ? 'Achat fort' : score > 10 ? 'Plutôt haussier' : score < -30 ? 'Vente forte' : score < -10 ? 'Plutôt baissier' : 'Neutre';
  return {
    score, bias, items, atr: a, atrPct, rsi: rv, slope, last,
    supports, resistances,
    longPlan: { sl: last - 1.5 * a, tp: last + 3 * a },
    shortPlan: { sl: last + 1.5 * a, tp: last - 3 * a },
  };
}

function candlePattern(c) {
  const n = c.length - 2;
  const k = c[n], p = c[n - 1];
  const body = Math.abs(k.close - k.open), range = k.high - k.low || 1e-12;
  const upper = k.high - Math.max(k.open, k.close), lower = Math.min(k.open, k.close) - k.low;
  if (body / range < 0.1) return { level: 'neutral', title: 'Doji', text: 'Bougie d\'indécision : acheteurs et vendeurs s\'équilibrent. Souvent avant un retournement si elle apparaît après une longue tendance.' };
  if (lower > body * 2 && upper < body * 0.6) return { level: 'bull', title: 'Marteau (hammer)', text: 'Longue mèche basse : les vendeurs ont poussé mais les acheteurs ont repris le contrôle. Signal haussier, surtout sur un support.' };
  if (upper > body * 2 && lower < body * 0.6) return { level: 'bear', title: 'Étoile filante', text: 'Longue mèche haute : les acheteurs ont été rejetés. Signal baissier, surtout sur une résistance.' };
  const pBody = Math.abs(p.close - p.open);
  if (k.close > k.open && p.close < p.open && k.close > p.open && k.open < p.close && body > pBody) return { level: 'bull', title: 'Avalement haussier', text: 'Une grosse bougie verte englobe la rouge précédente : retournement haussier possible.' };
  if (k.close < k.open && p.close > p.open && k.close < p.open && k.open > p.close && body > pBody) return { level: 'bear', title: 'Avalement baissier', text: 'Une grosse bougie rouge englobe la verte précédente : retournement baissier possible.' };
  return null;
}
