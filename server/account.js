import { COIN_MAP } from './coins.js';

const TAKER = 0.001;
const MAKER = 0.0005;
const FUT_TAKER = 0.0006;
const FUT_MAKER = 0.0002;
const MMR = 0.005;
const MAX_LEV = 100;

class UserError extends Error {}
const fail = (msg) => { throw new UserError(msg); };
const num = (v, name, { min = 0, allowEmpty = false } = {}) => {
  if (allowEmpty && (v === undefined || v === null || v === '')) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= min) fail(`${name} invalide`);
  return n;
};

export { UserError };

export function freshAccount(balance = 10000) {
  const now = Date.now();
  return {
    cash: balance, startBalance: balance, deposits: balance, withdrawals: 0,
    holdings: {}, orders: [], positions: [], trades: [], equity: [[Math.floor(now / 1000), balance]],
    alerts: [], journal: [], notifications: [], nextId: 1, createdAt: now,
  };
}

export class Account {
  constructor(market, state) {
    this.m = market;
    this.s = state || freshAccount();
    this.dirty = true;
    this.onEvent = null;
    this.lastEquityAt = 0;
  }

  id() { return this.s.nextId++; }
  price(sym) { return this.m.coins[sym].price; }
  coin(sym) { return COIN_MAP[sym] || fail('Monnaie inconnue'); }

  slippage(sym, notional) {
    const coin = this.coin(sym);
    const depth = coin.volume / 2000;
    return Math.min(0.05, (0.01 * notional) / depth) + coin.spread / 2;
  }

  notify(type, message, extra = {}) {
    const ev = { id: this.id(), t: this.m.time * 1000, type, message, ...extra };
    this.s.notifications.push(ev);
    if (this.s.notifications.length > 100) this.s.notifications.splice(0, this.s.notifications.length - 100);
    this.dirty = true;
    this.onEvent?.(ev);
  }

  recordTrade(tr) {
    const t = { id: this.id(), t: this.m.time * 1000, ...tr };
    this.s.trades.push(t);
    if (this.s.trades.length > 2000) this.s.trades.splice(0, this.s.trades.length - 2000);
    this.dirty = true;
    return t;
  }

  // ---------- SPOT ----------
  spotBuy(sym, qty, price, feeRate, type) {
    const cost = qty * price * (1 + feeRate);
    const h = this.s.holdings[sym] || (this.s.holdings[sym] = { qty: 0, avg: 0 });
    h.avg = (h.qty * h.avg + cost) / (h.qty + qty);
    h.qty += qty;
    this.recordTrade({ kind: 'spot', sym, side: 'buy', type, qty, price, fee: qty * price * feeRate, pnl: null });
    return cost;
  }

  spotSell(sym, qty, price, feeRate, type, fromLocked = false) {
    const h = this.s.holdings[sym];
    if (!fromLocked) {
      if (!h || h.qty < qty * 0.999999) fail('Quantité insuffisante');
      h.qty = Math.max(0, h.qty - qty);
    }
    const proceeds = qty * price * (1 - feeRate);
    const avg = h ? h.avg : price;
    const pnl = proceeds - qty * avg;
    this.s.cash += proceeds;
    if (h && h.qty <= 1e-12 && !this.s.orders.some((o) => o.sym === sym && o.kind === 'spot' && o.side === 'sell')) delete this.s.holdings[sym];
    this.recordTrade({ kind: 'spot', sym, side: 'sell', type, qty, price, fee: qty * price * feeRate, pnl, pnlPct: (price * (1 - feeRate) / avg - 1) * 100 });
    return pnl;
  }

  placeSpot({ sym, side, type = 'market', qty, quote, price }) {
    this.coin(sym);
    if (side !== 'buy' && side !== 'sell') fail('Sens invalide');
    const last = this.price(sym);
    if (type === 'market') {
      if (side === 'buy') {
        let notional = quote ? num(quote, 'Montant') / (1 + TAKER) : num(qty, 'Quantité') * last;
        const exec = last * (1 + this.slippage(sym, notional));
        const q = notional / exec;
        if (q * exec * (1 + TAKER) > this.s.cash + 1e-9) fail('Solde insuffisant');
        this.s.cash -= this.spotBuy(sym, q, exec, TAKER, 'market');
        this.notify('fill', `Achat de ${fmtQ(q)} ${sym} à ${fmtP(exec)} $`, { sym });
      } else {
        const q = num(qty, 'Quantité');
        const exec = last * (1 - this.slippage(sym, q * last));
        const pnl = this.spotSell(sym, q, exec, TAKER, 'market');
        this.notify('fill', `Vente de ${fmtQ(q)} ${sym} à ${fmtP(exec)} $ (${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} $)`, { sym });
      }
      return;
    }
    const p = num(price, 'Prix');
    const q = qty ? num(qty, 'Quantité') : num(quote, 'Montant') / p;
    if (type === 'limit') {
      if (side === 'buy' && p >= last) return this.placeSpot({ sym, side, type: 'market', quote: q * p * (1 + TAKER) });
      if (side === 'sell' && p <= last) return this.placeSpot({ sym, side, type: 'market', qty: q });
    } else if (type === 'stop') {
      if (side === 'buy' && p <= last) fail("Un stop d'achat doit être au-dessus du prix actuel");
      if (side === 'sell' && p >= last) fail('Un stop de vente doit être en dessous du prix actuel');
    } else fail("Type d'ordre invalide");
    const order = { id: this.id(), kind: 'spot', sym, side, type, price: p, qty: q, createdAt: this.m.time * 1000 };
    if (side === 'buy') {
      const reserve = q * p * (1 + TAKER) * (type === 'stop' ? 1.03 : 1);
      if (reserve > this.s.cash + 1e-9) fail('Solde insuffisant');
      this.s.cash -= reserve;
      order.reserved = reserve;
    } else {
      const h = this.s.holdings[sym];
      if (!h || h.qty < q * 0.999999) fail('Quantité insuffisante');
      h.qty = Math.max(0, h.qty - q);
      order.lockedAvg = h.avg;
    }
    this.s.orders.push(order);
    this.dirty = true;
    this.notify('order', `Ordre ${type === 'limit' ? 'limite' : 'stop'} ${side === 'buy' ? "d'achat" : 'de vente'} placé : ${fmtQ(q)} ${sym} à ${fmtP(p)} $`, { sym });
  }

  // ---------- FUTURES (positions à effet de levier) ----------
  liqPrice(side, entry, lev) {
    return side === 'long' ? entry * (1 - 1 / lev + MMR) : entry * (1 + 1 / lev - MMR);
  }

  validateSlTp(side, entry, sl, tp) {
    if (sl != null) {
      if (side === 'long' && sl >= entry) fail("Le stop loss d'un long doit être sous le prix d'entrée");
      if (side === 'short' && sl <= entry) fail("Le stop loss d'un short doit être au-dessus du prix d'entrée");
    }
    if (tp != null) {
      if (side === 'long' && tp <= entry) fail("Le take profit d'un long doit être au-dessus du prix d'entrée");
      if (side === 'short' && tp >= entry) fail("Le take profit d'un short doit être sous le prix d'entrée");
    }
  }

  openPosition(sym, side, entry, margin, lev, sl, tp, feeRate) {
    const notional = margin * lev;
    const qty = notional / entry;
    const fee = notional * feeRate;
    const pos = { id: this.id(), sym, side, qty, entry, leverage: lev, margin, sl, tp, liq: this.liqPrice(side, entry, lev), fees: fee, openedAt: this.m.time * 1000 };
    this.s.positions.push(pos);
    this.recordTrade({ kind: 'futures', sym, side: side === 'long' ? 'buy' : 'sell', type: 'open', posSide: side, qty, price: entry, fee, leverage: lev, pnl: null });
    this.notify('fill', `Position ${side.toUpperCase()} x${lev} ouverte sur ${sym} à ${fmtP(entry)} $ (marge ${margin.toFixed(2)} $)`, { sym });
    return pos;
  }

  placeFutures({ sym, side, type = 'market', margin, leverage, price, sl, tp }) {
    this.coin(sym);
    if (side !== 'long' && side !== 'short') fail('Sens invalide');
    const mg = num(margin, 'Marge');
    const lev = Math.round(num(leverage, 'Levier'));
    if (lev < 1 || lev > MAX_LEV) fail(`Levier entre 1 et ${MAX_LEV}`);
    const slv = num(sl, 'Stop loss', { allowEmpty: true });
    const tpv = num(tp, 'Take profit', { allowEmpty: true });
    const last = this.price(sym);
    if (type === 'market') {
      const notional = mg * lev;
      const slip = this.slippage(sym, notional);
      const entry = side === 'long' ? last * (1 + slip) : last * (1 - slip);
      this.validateSlTp(side, entry, slv, tpv);
      const fee = notional * FUT_TAKER;
      if (mg + fee > this.s.cash + 1e-9) fail('Solde insuffisant');
      this.s.cash -= mg + fee;
      this.openPosition(sym, side, entry, mg, lev, slv, tpv, FUT_TAKER);
      return;
    }
    if (type !== 'limit') fail("Type d'ordre invalide");
    const p = num(price, 'Prix');
    if ((side === 'long' && p >= last) || (side === 'short' && p <= last)) {
      return this.placeFutures({ sym, side, type: 'market', margin: mg, leverage: lev, sl: slv, tp: tpv });
    }
    this.validateSlTp(side, p, slv, tpv);
    const reserve = mg + mg * lev * FUT_MAKER;
    if (reserve > this.s.cash + 1e-9) fail('Solde insuffisant');
    this.s.cash -= reserve;
    this.s.orders.push({ id: this.id(), kind: 'futures', sym, side, type: 'limit', price: p, margin: mg, leverage: lev, sl: slv, tp: tpv, reserved: reserve, qty: (mg * lev) / p, createdAt: this.m.time * 1000 });
    this.dirty = true;
    this.notify('order', `Ordre limite ${side.toUpperCase()} x${lev} placé sur ${sym} à ${fmtP(p)} $`, { sym });
  }

  closePosition(id, pct = 100, exitPrice = null, reason = 'manual') {
    const pos = this.s.positions.find((p) => p.id === Number(id));
    if (!pos) fail('Position introuvable');
    const frac = Math.min(1, Math.max(0.01, Number(pct) / 100));
    const last = this.price(pos.sym);
    let exit = exitPrice;
    if (exit == null) {
      const slip = this.slippage(pos.sym, pos.qty * frac * last);
      exit = pos.side === 'long' ? last * (1 - slip) : last * (1 + slip);
    }
    const qty = pos.qty * frac;
    const margin = pos.margin * frac;
    const dir = pos.side === 'long' ? 1 : -1;
    const fee = qty * exit * FUT_TAKER;
    let pnl = (exit - pos.entry) * qty * dir - fee;
    let payout = margin + pnl;
    if (reason === 'liquidation') { pnl = -margin; payout = 0; }
    payout = Math.max(0, payout);
    this.s.cash += payout;
    pos.qty -= qty;
    pos.margin -= margin;
    if (frac >= 0.9999) this.s.positions = this.s.positions.filter((p) => p !== pos);
    const roe = (pnl / margin) * 100;
    this.recordTrade({ kind: 'futures', sym: pos.sym, side: pos.side === 'long' ? 'sell' : 'buy', type: reason, posSide: pos.side, qty, price: exit, entry: pos.entry, fee, leverage: pos.leverage, pnl, pnlPct: roe, openedAt: pos.openedAt });
    const labels = { manual: 'fermée', sl: 'fermée par STOP LOSS', tp: 'fermée par TAKE PROFIT', liquidation: 'LIQUIDÉE' };
    this.notify(reason === 'liquidation' ? 'liquidation' : reason === 'tp' ? 'tp' : reason === 'sl' ? 'sl' : 'fill',
      `Position ${pos.side.toUpperCase()} ${pos.sym} ${labels[reason]} à ${fmtP(exit)} $ : ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} $ (${roe.toFixed(1)} %)`, { sym: pos.sym });
  }

  updatePosition(id, { sl, tp }) {
    const pos = this.s.positions.find((p) => p.id === Number(id));
    if (!pos) fail('Position introuvable');
    const slv = num(sl, 'Stop loss', { allowEmpty: true });
    const tpv = num(tp, 'Take profit', { allowEmpty: true });
    const last = this.price(pos.sym);
    this.validateSlTp(pos.side, last, slv, tpv);
    pos.sl = slv;
    pos.tp = tpv;
    this.dirty = true;
  }

  addMargin(id, amount) {
    const pos = this.s.positions.find((p) => p.id === Number(id));
    if (!pos) fail('Position introuvable');
    const a = num(amount, 'Montant');
    if (a > this.s.cash) fail('Solde insuffisant');
    this.s.cash -= a;
    pos.margin += a;
    const effLev = (pos.qty * pos.entry) / pos.margin;
    pos.liq = this.liqPrice(pos.side, pos.entry, effLev);
    this.dirty = true;
  }

  cancelOrder(id) {
    const o = this.s.orders.find((x) => x.id === Number(id));
    if (!o) fail('Ordre introuvable');
    this.refundOrder(o);
    this.s.orders = this.s.orders.filter((x) => x !== o);
    this.dirty = true;
  }

  refundOrder(o) {
    if (o.reserved) this.s.cash += o.reserved;
    if (o.kind === 'spot' && o.side === 'sell') {
      const h = this.s.holdings[o.sym] || (this.s.holdings[o.sym] = { qty: 0, avg: o.lockedAvg });
      h.avg = h.qty > 0 ? (h.qty * h.avg + o.qty * o.lockedAvg) / (h.qty + o.qty) : o.lockedAvg;
      h.qty += o.qty;
    }
  }

  // ---------- Exécution à chaque pas de simulation ----------
  onStep(sym, lo, hi, last, t) {
    const s = this.s;
    if (s.orders.length) {
      for (const o of [...s.orders]) {
        if (o.sym !== sym) continue;
        let hit = false;
        if (o.kind === 'spot') {
          if (o.type === 'limit') hit = o.side === 'buy' ? lo <= o.price : hi >= o.price;
          else hit = o.side === 'buy' ? hi >= o.price : lo <= o.price;
        } else {
          hit = o.side === 'long' ? lo <= o.price : hi >= o.price;
        }
        if (!hit) continue;
        s.orders = s.orders.filter((x) => x !== o);
        this.fillOrder(o);
      }
    }
    if (s.positions.length) {
      for (const pos of [...s.positions]) {
        if (pos.sym !== sym) continue;
        if (pos.side === 'long') {
          if (pos.sl != null && lo <= pos.sl && pos.sl > pos.liq) this.closePosition(pos.id, 100, pos.sl * (1 - COIN_MAP[sym].spread), 'sl');
          else if (lo <= pos.liq) this.closePosition(pos.id, 100, pos.liq, 'liquidation');
          else if (pos.tp != null && hi >= pos.tp) this.closePosition(pos.id, 100, pos.tp, 'tp');
        } else {
          if (pos.sl != null && hi >= pos.sl && pos.sl < pos.liq) this.closePosition(pos.id, 100, pos.sl * (1 + COIN_MAP[sym].spread), 'sl');
          else if (hi >= pos.liq) this.closePosition(pos.id, 100, pos.liq, 'liquidation');
          else if (pos.tp != null && lo <= pos.tp) this.closePosition(pos.id, 100, pos.tp, 'tp');
        }
      }
    }
    if (s.alerts.length) {
      for (const a of s.alerts) {
        if (a.sym !== sym || a.triggeredAt) continue;
        if ((a.cond === 'above' && hi >= a.price) || (a.cond === 'below' && lo <= a.price)) {
          a.triggeredAt = t * 1000;
          this.notify('alert', `Alerte : ${sym} est ${a.cond === 'above' ? 'passé au-dessus de' : 'passé sous'} ${fmtP(a.price)} $${a.note ? ' — ' + a.note : ''}`, { sym });
        }
      }
    }
    if (t - this.lastEquityAt >= 300) {
      this.lastEquityAt = t;
      s.equity.push([Math.floor(t), this.equity()]);
      if (s.equity.length > 12000) s.equity.splice(0, s.equity.length - 10000);
    }
  }

  fillOrder(o) {
    if (o.kind === 'spot') {
      if (o.side === 'buy') {
        const exec = o.type === 'stop' ? o.price * (1 + this.slippage(o.sym, o.qty * o.price)) : o.price;
        const fee = o.type === 'stop' ? TAKER : MAKER;
        const cost = this.spotBuy(o.sym, o.qty, exec, fee, o.type);
        this.s.cash += o.reserved - cost;
        this.notify('fill', `Ordre ${o.type === 'stop' ? 'stop' : 'limite'} exécuté : achat de ${fmtQ(o.qty)} ${o.sym} à ${fmtP(exec)} $`, { sym: o.sym });
      } else {
        const exec = o.type === 'stop' ? o.price * (1 - this.slippage(o.sym, o.qty * o.price)) : o.price;
        const fee = o.type === 'stop' ? TAKER : MAKER;
        const h = this.s.holdings[o.sym];
        const savedAvg = h ? h.avg : null;
        if (h) h.avg = o.lockedAvg;
        else this.s.holdings[o.sym] = { qty: 0, avg: o.lockedAvg };
        const pnl = this.spotSell(o.sym, o.qty, exec, fee, o.type, true);
        const h2 = this.s.holdings[o.sym];
        if (h2 && savedAvg != null) h2.avg = savedAvg;
        this.notify(o.type === 'stop' ? 'sl' : 'fill', `Ordre ${o.type === 'stop' ? 'stop' : 'limite'} exécuté : vente de ${fmtQ(o.qty)} ${o.sym} à ${fmtP(exec)} $ (${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} $)`, { sym: o.sym });
      }
    } else {
      this.s.cash += o.reserved - o.margin - o.margin * o.leverage * FUT_MAKER;
      this.openPosition(o.sym, o.side, o.price, o.margin, o.leverage, o.sl, o.tp, FUT_MAKER);
    }
    this.dirty = true;
  }

  // ---------- Compte ----------
  equity() {
    const s = this.s;
    let eq = s.cash;
    for (const [sym, h] of Object.entries(s.holdings)) eq += h.qty * this.price(sym);
    for (const o of s.orders) {
      if (o.reserved) eq += o.reserved;
      if (o.kind === 'spot' && o.side === 'sell') eq += o.qty * this.price(o.sym);
    }
    for (const p of s.positions) {
      const dir = p.side === 'long' ? 1 : -1;
      eq += Math.max(0, p.margin + (this.price(p.sym) - p.entry) * p.qty * dir);
    }
    return eq;
  }

  deposit(amount) {
    const a = num(amount, 'Montant');
    if (a > 1e12) fail('Montant trop élevé');
    this.s.cash += a;
    this.s.deposits += a;
    this.notify('money', `Dépôt de ${a.toLocaleString('fr-FR')} $ fictifs`);
  }

  withdraw(amount) {
    const a = num(amount, 'Montant');
    if (a > this.s.cash) fail('Solde disponible insuffisant');
    this.s.cash -= a;
    this.s.withdrawals += a;
    this.notify('money', `Retrait de ${a.toLocaleString('fr-FR')} $ fictifs`);
  }

  reset(balance) {
    const b = num(balance, 'Solde');
    const journal = this.s.journal;
    this.s = freshAccount(b);
    this.s.journal = journal;
    this.dirty = true;
  }

  addAlert({ sym, price, note }) {
    this.coin(sym);
    const p = num(price, 'Prix');
    const cond = p >= this.price(sym) ? 'above' : 'below';
    this.s.alerts.push({ id: this.id(), sym, price: p, cond, note: String(note || '').slice(0, 140), createdAt: Date.now(), triggeredAt: null });
    this.dirty = true;
  }

  removeAlert(id) {
    this.s.alerts = this.s.alerts.filter((a) => a.id !== Number(id));
    this.dirty = true;
  }

  addJournal({ title, text, sym, mood, tags }) {
    this.s.journal.unshift({ id: this.id(), t: Date.now(), title: String(title || '').slice(0, 120), text: String(text || '').slice(0, 5000), sym: sym || null, mood: String(mood || '').slice(0, 20), tags: String(tags || '').slice(0, 200) });
    this.dirty = true;
  }

  removeJournal(id) {
    this.s.journal = this.s.journal.filter((j) => j.id !== Number(id));
    this.dirty = true;
  }

  clearNotifications() {
    this.s.notifications = [];
    this.dirty = true;
  }

  snapshot() {
    return { ...this.s, equityNow: this.equity() };
  }
}

function fmtP(p) {
  if (p >= 1000) return p.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  if (p >= 1) return p.toLocaleString('fr-FR', { maximumFractionDigits: 4 });
  return p.toPrecision(4);
}
function fmtQ(q) {
  if (q >= 1000) return q.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
  if (q >= 1) return q.toLocaleString('fr-FR', { maximumFractionDigits: 4 });
  return q.toPrecision(4);
}
