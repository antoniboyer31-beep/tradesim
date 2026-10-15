import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Market, TIMEFRAMES } from './market.js';
import { UserError } from './account.js';
import { COINS } from './coins.js';
import { chatMessage, randomUser } from './social.js';
import { createAuth } from './auth.js';
import { createStore } from './persist.js';
import { MemeMarket, SUPPLY, celebWindow } from './memes.js';
import { Users, AVATARS, START_BALANCE, encryptJson, decryptJson } from './users.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const TICK_MS = Number(process.env.TICK_MS || 250);
const SECRET = process.env.SESSION_SECRET || process.env.DATA_KEY || 'tradesim-dev-secret';
const DATA_KEY = process.env.DATA_KEY || SECRET;
const ADMIN_NAME = process.env.ADMIN_NAME || 'Nawven';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const store = createStore({ dataDir: DATA_DIR });
const market = new Market();
const memes = new MemeMarket();
const users = new Users(market, memes);
const nowSec = () => Date.now() / 1000;
const FILES = ['market.json.gz', 'memes.json.gz', 'accounts.enc', 'account.json'];

if (store.kind === 'github' && !process.env.DATA_KEY) console.warn('⚠️  DATA_KEY non défini : les comptes sont chiffrés avec une clé par défaut.');

async function boot() {
  const t0 = Date.now();
  let loaded = false;
  let legacy = null;
  try {
    const data = await store.load(FILES);
    if (data['market.json.gz']) {
      market.load(data['market.json.gz']);
      if (data['accounts.enc']) users.load(decryptJson(data['accounts.enc'], DATA_KEY));
      else legacy = data['account.json'] || null;
      market.onStep = (...a) => users.onStep(...a);
      const gap = nowSec() - market.time;
      console.log(`Reprise de la simulation (${store.kind}) : rattrapage de ${(gap / 60).toFixed(1)} minutes de marché...`);
      market.simulate(nowSec());
      console.log(`Marché à jour en ${Date.now() - t0} ms`);
      loaded = true;
    }
    if (loaded && data['memes.json.gz']) {
      memes.load(data['memes.json.gz']);
      memes.simulate(nowSec(), users.heldMemes());
      console.log(`Meme coins à jour (${memes.tokens.length} tokens)`);
    }
  } catch (e) {
    console.error('Sauvegarde illisible, nouvelle simulation :', e.message);
    if (loaded) throw e;
  }
  if (!loaded) {
    console.log("Génération de 3 ans d'historique de marché (une seule fois)...");
    market.initFresh(nowSec());
    market.onStep = (...a) => users.onStep(...a);
    console.log(`Historique généré en ${Date.now() - t0} ms`);
  }
  if (ADMIN_PASSWORD) users.ensureAdmin(ADMIN_NAME, ADMIN_PASSWORD, legacy);
  else console.warn('⚠️  ADMIN_PASSWORD non défini : aucun compte admin.');
  if (!memes.tokens.length) {
    memes.initFresh(nowSec());
    console.log(`Meme coins générés (${memes.tokens.length} tokens)`);
  }
  console.log(`${users.byId.size} joueur(s) enregistré(s)`);
  if (!loaded || legacy) await save(true);
}

const MARKET_SAVE_MS = store.kind === 'github' ? 30 * 60_000 : 60_000;
const MEME_SAVE_MS = store.kind === 'github' ? 10 * 60_000 : 60_000;
let saving = false;
let lastMarketSave = 0;
let lastMemeSave = 0;
let lastUsersJson = '';
async function save(force = false) {
  if (saving) return;
  const data = users.serialize();
  const usersJson = JSON.stringify(data);
  const withMarket = force || Date.now() - lastMarketSave >= MARKET_SAVE_MS;
  const withMemes = force || Date.now() - lastMemeSave >= MEME_SAVE_MS;
  if (!withMarket && !withMemes && usersJson === lastUsersJson) return;
  saving = true;
  try {
    await store.save({
      'market.json.gz': withMarket ? market.serializeChunks() : null,
      'memes.json.gz': withMemes ? memes.serializeChunks() : null,
      'accounts.enc': usersJson === lastUsersJson && !force ? null : encryptJson(data, DATA_KEY),
    });
    lastUsersJson = usersJson;
    if (withMarket) lastMarketSave = Date.now();
    if (withMemes) lastMemeSave = Date.now();
  } catch (e) {
    console.error('Erreur de sauvegarde', e.message);
  } finally {
    saving = false;
  }
}

await boot();

// ---------- Communauté ----------
const chat = [];
function pushChat(msg) {
  chat.push(msg);
  if (chat.length > 120) chat.splice(0, chat.length - 100);
  broadcast({ type: 'chat', msg });
}
function onlineCount() {
  const h = new Date().getHours();
  const base = 1800 + 900 * Math.sin(((h - 8) / 24) * 2 * Math.PI);
  return Math.round(base + Math.sin(Date.now() / 60000) * 120 + Math.random() * 40);
}
for (let i = 0; i < 25; i++) chat.push({ t: Date.now() - (25 - i) * 20000, user: randomUser(), text: chatMessage(market.tickers()) });

// ---------- HTTP ----------
const app = express();
app.set('trust proxy', 'loopback');
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.get('/healthz', (_req, res) => res.send('ok'));
const auth = createAuth(users, SECRET);
app.use(auth.middleware);

const wrap = (fn) => (req, res) => {
  try {
    const out = fn(req, req.user.acc, res);
    res.json(out ?? { ok: true, account: req.user.acc.snapshot() });
  } catch (e) {
    if (e instanceof UserError) res.status(400).json({ error: e.message });
    else { console.error(e); res.status(500).json({ error: 'Erreur interne' }); }
  }
};
const adminOnly = (fn) => wrap((req, acc, res) => {
  if (!req.user.admin) throw new UserError('Réservé à l\'admin');
  return fn(req, acc, res);
});

app.get('/api/me', wrap((req) => ({ me: users.public(req.user), avatars: AVATARS })));
app.post('/api/me/avatar', wrap((req) => { users.setAvatar(req.user, req.body?.avatar); return { me: users.public(req.user) }; }));
app.post('/api/me/password', wrap((req) => {
  if (!users.verify(req.user.name, String(req.body?.old || ''))) throw new UserError('Ancien mot de passe incorrect');
  users.setPassword(req.user, req.body?.password);
  return { ok: true, relogin: true };
}));
app.get('/api/leaderboard', wrap(() => ({ players: users.leaderboard(onlineIds()) })));

app.get('/api/coins', wrap(() => ({ coins: COINS, tickers: market.tickers(), timeframes: Object.keys(TIMEFRAMES) })));
app.get('/api/candles', wrap((req) => {
  const { sym, tf } = req.query;
  const limit = Math.min(5000, Math.max(10, Number(req.query.limit) || 1500));
  const candles = market.candles(sym, tf, limit);
  if (!candles) throw new UserError('Paramètres invalides');
  return { sym, tf, candles };
}));
app.get('/api/sparks', wrap(() => Object.fromEntries(Object.entries(market.stats).map(([k, v]) => [k, v.spark]))));
app.get('/api/account', wrap((_req, acc) => ({ account: acc.snapshot() })));
app.get('/api/news', wrap(() => ({ news: market.news.slice(-100).reverse() })));
app.get('/api/chat', wrap(() => ({ chat })));

app.post('/api/spot', wrap((req, acc) => { acc.placeSpot(req.body); }));
app.post('/api/futures', wrap((req, acc) => { acc.placeFutures(req.body); }));
app.delete('/api/orders/:id', wrap((req, acc) => { acc.cancelOrder(req.params.id); }));
app.post('/api/positions/:id/close', wrap((req, acc) => { acc.closePosition(req.params.id, req.body?.pct ?? 100); }));
app.patch('/api/positions/:id', wrap((req, acc) => { acc.updatePosition(req.params.id, req.body || {}); }));
app.post('/api/positions/:id/margin', wrap((req, acc) => { acc.addMargin(req.params.id, req.body?.amount); }));
app.post('/api/positions/close-all', wrap((_req, acc) => { for (const p of [...acc.s.positions]) acc.closePosition(p.id); }));
app.post('/api/account/deposit', adminOnly((req, acc) => { acc.deposit(req.body?.amount); }));
app.post('/api/account/withdraw', adminOnly((req, acc) => { acc.withdraw(req.body?.amount); }));
app.post('/api/account/reset', wrap((req, acc) => { acc.reset(req.user.admin ? req.body?.balance ?? START_BALANCE : START_BALANCE); }));
app.post('/api/alerts', wrap((req, acc) => { acc.addAlert(req.body || {}); }));
app.delete('/api/alerts/:id', wrap((req, acc) => { acc.removeAlert(req.params.id); }));
app.post('/api/journal', wrap((req, acc) => { acc.addJournal(req.body || {}); }));
app.delete('/api/journal/:id', wrap((req, acc) => { acc.removeJournal(req.params.id); }));
app.post('/api/notifications/clear', wrap((_req, acc) => { acc.clearNotifications(); }));

app.get('/api/memes', wrap(() => ({ tokens: memes.list(), feed: memes.feed.slice(-60).reverse() })));
app.get('/api/memes/celebs', wrap(() => memes.celebReport(nowSec())));
app.get('/api/memes/:id', wrap((req) => {
  const d = memes.detail(req.params.id);
  if (!d) throw new UserError('Token introuvable');
  const players = users.memeHolders(d.id).map((p) => ({ ...p, value: p.qty * d.price, entryMcap: (p.cost / p.qty) * SUPPLY }));
  return { token: { ...d, players, playerTrades: (memes.playerTrades[d.id] || []).slice(-150) } };
}));
app.get('/api/memes/:id/candles', wrap((req) => {
  const c = memes.candles(req.params.id, req.query.tf);
  if (!c) throw new UserError('Paramètres invalides');
  return { candles: c };
}));
function playerMemeTrade(req, acc) {
  const tr = acc.s.trades[acc.s.trades.length - 1];
  const tk = memes.find(tr.memeId);
  const p = { t: Date.now(), uid: req.user.id, name: req.user.name, avatar: req.user.avatar, side: tr.side, usd: tr.qty * tr.price, price: tr.price, mcap: tr.price * SUPPLY };
  memes.recordPlayer(tr.memeId, p);
  broadcast({ type: 'memePlayer', id: tr.memeId, ticker: tk?.ticker, emoji: tk?.emoji, trade: p });
}
app.post('/api/memes/:id/buy', wrap((req, acc) => { acc.memeBuy(req.params.id, req.body?.usd, req.body?.slippage ?? 15); playerMemeTrade(req, acc); }));
app.post('/api/memes/:id/sell', wrap((req, acc) => { acc.memeSell(req.params.id, req.body?.pct ?? 100, req.body?.slippage ?? 15); playerMemeTrade(req, acc); }));
app.post('/api/chat', wrap((req) => {
  const text = String(req.body?.text || '').trim().slice(0, 280);
  if (!text) throw new UserError('Message vide');
  pushChat({ t: Date.now(), user: req.user.name, avatar: req.user.avatar, uid: req.user.id, player: true, text });
  return { ok: true };
}));

// ---------- Admin ----------
const target = (req) => users.get(req.params.id) || (() => { throw new UserError('Joueur introuvable'); })();
app.get('/api/admin/users', adminOnly(() => ({ nextCeleb: memes.celebFired === memes.celebWin ? celebWindow(nowSec()).end * 1000 : memes.celebAt * 1000, celebDone: memes.celebFired === memes.celebWin, players: users.leaderboard(onlineIds()).map((p) => ({ ...p, cash: users.get(p.id).acc.s.cash })) })));
app.post('/api/admin/users/:id/money', adminOnly((req) => {
  const u = target(req);
  const a = Number(req.body?.amount);
  if (!Number.isFinite(a) || a === 0) throw new UserError('Montant invalide');
  if (a > 0) u.acc.deposit(a); else u.acc.withdraw(-a);
  return { ok: true };
}));
app.post('/api/admin/users/:id/reset', adminOnly((req) => { target(req).acc.reset(START_BALANCE); return { ok: true }; }));
app.post('/api/admin/users/:id/password', adminOnly((req) => { users.setPassword(target(req), req.body?.password); return { ok: true }; }));
app.delete('/api/admin/users/:id', adminOnly((req) => {
  const u = target(req);
  users.remove(u.id);
  for (const ws of wss.clients) if (ws.user === u) ws.close();
  return { ok: true };
}));
app.post('/api/admin/celeb', adminOnly(() => { memes.spawnCeleb(nowSec()); return { ok: true }; }));
app.post('/api/admin/announce', adminOnly((req) => {
  const text = String(req.body?.text || '').trim().slice(0, 300);
  if (!text) throw new UserError('Message vide');
  broadcast({ type: 'announce', text, from: req.user.name });
  return { ok: true };
}));

const dist = path.join(ROOT, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api|ws).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', verifyClient: ({ req }) => !!auth.userFrom(req.headers.cookie) });

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}
function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of wss.clients) if (ws.readyState === 1) ws.send(data);
}
function sendToUser(u, msg) {
  const data = JSON.stringify(msg);
  for (const ws of wss.clients) if (ws.user === u && ws.readyState === 1) ws.send(data);
}
function onlineIds() {
  const s = new Set();
  for (const ws of wss.clients) if (ws.user) s.add(ws.user.id);
  return s;
}

wss.on('connection', (ws, req) => {
  ws.user = auth.userFrom(req.headers.cookie);
  if (!ws.user) return ws.close();
  ws.sub = { sym: 'NOVA', tf: '1m' };
  ws.lastTradeT = 0;
  send(ws, { type: 'hello', tickers: market.tickers(), account: ws.user.acc.snapshot(), online: onlineCount(), players: onlineIds().size });
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'sub' && market.coins[msg.sym] && TIMEFRAMES[msg.tf]) {
        ws.sub = { sym: msg.sym, tf: msg.tf };
        ws.lastTradeT = 0;
        const trades = market.trades[msg.sym] || [];
        send(ws, { type: 'trades', sym: msg.sym, trades: trades.slice(-30), reset: true });
        if (trades.length) ws.lastTradeT = trades[trades.length - 1].t;
        send(ws, { type: 'book', ...market.orderBook(msg.sym) });
      }
      if (msg.type === 'memeOn') ws.memeOn = !!msg.on;
      if (msg.type === 'memeSub') {
        ws.meme = msg.id ? { id: Number(msg.id), tf: msg.tf || '5s' } : null;
        ws.memeTradeT = 0;
      }
    } catch { /* message ignoré */ }
  });
});

users.onAccountEvent = (u, ev) => sendToUser(u, { type: 'event', event: ev });
market.onNews = (item) => {
  if (Math.abs(nowSec() - item.t) < 10) broadcast({ type: 'news', item });
};

let tickCount = 0;
let lastT = nowSec();
setInterval(() => {
  const t = nowSec();
  const dt = t - lastT;
  if (dt > 5) market.simulate(t);
  else if (dt > 0) market.step(dt, t, true);
  lastT = t;
  tickCount++;

  if (tickCount % 4 === 0) market.computeStats();
  if (tickCount % 240 === 0) market.trim(t);

  const tickers = market.tickers();
  const tickMsg = JSON.stringify({ type: 'tick', t: Date.now(), tickers });
  const book = tickCount % 2 === 0;
  const periodic = tickCount % 8 === 0;
  const snaps = new Map();
  for (const ws of wss.clients) {
    if (ws.readyState !== 1 || !ws.user) continue;
    ws.send(tickMsg);
    const { sym, tf } = ws.sub;
    send(ws, { type: 'candle', sym, tf, candle: market.lastCandle(sym, tf) });
    const trades = market.trades[sym] || [];
    const fresh = trades.filter((x) => x.t > ws.lastTradeT);
    if (fresh.length) {
      ws.lastTradeT = fresh[fresh.length - 1].t;
      send(ws, { type: 'trades', sym, trades: fresh });
    }
    if (book) send(ws, { type: 'book', ...market.orderBook(sym) });
    const u = ws.user;
    if (u.acc.dirty || periodic) {
      if (!snaps.has(u)) snaps.set(u, JSON.stringify({ type: 'account', account: u.acc.snapshot() }));
      ws.send(snaps.get(u));
    }
  }
  for (const u of snaps.keys()) u.acc.dirty = false;
  if (tickCount % 20 === 0) broadcast({ type: 'online', online: onlineCount(), players: onlineIds().size });
  if (Math.random() < TICK_MS / 4500) pushChat({ t: Date.now(), user: randomUser(), text: chatMessage(tickers) });
}, TICK_MS);

memes.onEvent = (ev) => {
  if (Math.abs(nowSec() - ev.t) < 10) broadcast({ type: 'memeEvent', event: ev });
  if (ev.kind === 'celeb' && ev.scheduled) { lastMemeSave = 0; save(); }
  if (ev.kind !== 'rug' && ev.kind !== 'devsell' && ev.kind !== 'graduate') return;
  for (const u of users.byId.values()) {
    const h = u.acc.s.memes?.[ev.id];
    if (h) u.acc.notify(ev.kind === 'graduate' ? 'tp' : 'liquidation', ev.text, { sym: '$' + h.ticker });
  }
};
let memeLast = nowSec();
let memeCount = 0;
setInterval(() => {
  const t = nowSec();
  if (t - memeLast > 10) memes.simulate(t, users.heldMemes());
  else memes.step(t - memeLast, t, true);
  memeLast = t;
  if (++memeCount % 300 === 0) memes.cleanup(t, users.heldMemes());
  let listMsg = null;
  for (const ws of wss.clients) {
    if (ws.readyState !== 1 || !ws.memeOn) continue;
    if (memeCount % 2 === 0) send(ws, { type: 'memes', tokens: (listMsg ||= memes.list()) });
    if (!ws.meme) continue;
    const tk = memes.find(ws.meme.id);
    if (!tk) continue;
    const c = memes.candles(tk.id, ws.meme.tf);
    const trades = (memes.trades[tk.id] || []).filter((x) => x.t > ws.memeTradeT);
    if (trades.length) ws.memeTradeT = trades[trades.length - 1].t;
    send(ws, { type: 'memeTick', id: tk.id, tf: ws.meme.tf, candle: c[c.length - 1], stats: memes.stats(tk), trades });
  }
}, 1000);

setInterval(() => save(), 60_000);
let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    if (stopping) return;
    stopping = true;
    console.log('\nSauvegarde du marché avant arrêt...');
    await save(true);
    process.exit(0);
  });
}

// L'offre gratuite de Render endort le service après 15 min sans requête entrante.
if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(() => fetch(process.env.RENDER_EXTERNAL_URL + '/healthz').catch(() => {}), 10 * 60_000);
}

server.listen(PORT, HOST, () => {
  console.log(`\n  TradeSim est lancé : http://localhost:${PORT} (${users.byId.size} joueurs)\n`);
});
