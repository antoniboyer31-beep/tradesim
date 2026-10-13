import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Market, TIMEFRAMES } from './market.js';
import { Account, UserError } from './account.js';
import { COINS } from './coins.js';
import { chatMessage, randomUser } from './social.js';
import { createAuth } from './auth.js';
import { createStore } from './persist.js';
import { MemeMarket } from './memes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const TICK_MS = Number(process.env.TICK_MS || 250);

const store = createStore({ dataDir: DATA_DIR });
const market = new Market();
let account;
const nowSec = () => Date.now() / 1000;

const memes = new MemeMarket();
const FILES = ['market.json.gz', 'account.json', 'memes.json.gz'];
const heldMemes = () => new Set(Object.keys(account?.s.memes || {}).map(Number));

async function boot() {
  const t0 = Date.now();
  let loaded = false;
  try {
    const data = await store.load(FILES);
    if (data['market.json.gz'] && data['account.json']) {
      market.load(data['market.json.gz']);
      account = new Account(market, data['account.json']);
      market.onStep = (...a) => account.onStep(...a);
      const gap = nowSec() - market.time;
      console.log(`Reprise de la simulation (${store.kind}) : rattrapage de ${(gap / 60).toFixed(1)} minutes de marché...`);
      market.simulate(nowSec());
      console.log(`Marché à jour en ${Date.now() - t0} ms`);
      loaded = true;
    }
    if (loaded && data['memes.json.gz']) {
      memes.load(data['memes.json.gz']);
      memes.simulate(nowSec(), heldMemes());
      console.log(`Meme coins à jour (${memes.tokens.length} tokens)`);
    }
  } catch (e) {
    console.error('Sauvegarde illisible, nouvelle simulation :', e.message);
    loaded = false;
  }
  if (!loaded) {
    console.log("Génération de 3 ans d'historique de marché (une seule fois)...");
    account = new Account(market, null);
    market.initFresh(nowSec());
    market.onStep = (...a) => account.onStep(...a);
    console.log(`Historique généré en ${Date.now() - t0} ms`);
  }
  account.mm = memes;
  if (!memes.tokens.length) {
    memes.initFresh(nowSec());
    console.log(`Meme coins générés (${memes.tokens.length} tokens)`);
  }
  if (!loaded) await save(true);
}

const MARKET_SAVE_MS = store.kind === 'github' ? 30 * 60_000 : 60_000;
const MEME_SAVE_MS = store.kind === 'github' ? 10 * 60_000 : 60_000;
let saving = false;
let lastMarketSave = 0;
let lastMemeSave = 0;
let lastAccountJson = '';
async function save(force = false) {
  if (saving) return;
  const accountJson = JSON.stringify(account.s);
  const withMarket = force || Date.now() - lastMarketSave >= MARKET_SAVE_MS;
  const withMemes = force || Date.now() - lastMemeSave >= MEME_SAVE_MS;
  if (!withMarket && !withMemes && accountJson === lastAccountJson) return;
  saving = true;
  try {
    await store.save({
      'market.json.gz': withMarket ? market.serializeChunks() : null,
      'memes.json.gz': withMemes ? memes.serializeChunks() : null,
      'account.json': accountJson,
    });
    lastAccountJson = accountJson;
    if (withMarket) lastMarketSave = Date.now();
    if (withMemes) lastMemeSave = Date.now();
  } catch (e) {
    console.error('Erreur de sauvegarde', e.message);
  } finally {
    saving = false;
  }
}

await boot();

// ---------- Communauté simulée ----------
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
const auth = createAuth(process.env.APP_PASSWORD);
app.use(auth.middleware);

const wrap = (fn) => (req, res) => {
  try {
    const out = fn(req, res);
    res.json(out ?? { ok: true, account: account.snapshot() });
  } catch (e) {
    if (e instanceof UserError) res.status(400).json({ error: e.message });
    else { console.error(e); res.status(500).json({ error: 'Erreur interne' }); }
  }
};

app.get('/api/coins', wrap(() => ({ coins: COINS, tickers: market.tickers(), timeframes: Object.keys(TIMEFRAMES) })));
app.get('/api/candles', wrap((req) => {
  const { sym, tf } = req.query;
  const limit = Math.min(5000, Math.max(10, Number(req.query.limit) || 1500));
  const candles = market.candles(sym, tf, limit);
  if (!candles) throw new UserError('Paramètres invalides');
  return { sym, tf, candles };
}));
app.get('/api/sparks', wrap(() => Object.fromEntries(Object.entries(market.stats).map(([k, v]) => [k, v.spark]))));
app.get('/api/account', wrap(() => ({ account: account.snapshot() })));
app.get('/api/news', wrap(() => ({ news: market.news.slice(-100).reverse() })));
app.get('/api/chat', wrap(() => ({ chat })));

app.post('/api/spot', wrap((req) => { account.placeSpot(req.body); }));
app.post('/api/futures', wrap((req) => { account.placeFutures(req.body); }));
app.delete('/api/orders/:id', wrap((req) => { account.cancelOrder(req.params.id); }));
app.post('/api/positions/:id/close', wrap((req) => { account.closePosition(req.params.id, req.body?.pct ?? 100); }));
app.patch('/api/positions/:id', wrap((req) => { account.updatePosition(req.params.id, req.body || {}); }));
app.post('/api/positions/:id/margin', wrap((req) => { account.addMargin(req.params.id, req.body?.amount); }));
app.post('/api/positions/close-all', wrap(() => { for (const p of [...account.s.positions]) account.closePosition(p.id); }));
app.post('/api/account/deposit', wrap((req) => { account.deposit(req.body?.amount); }));
app.post('/api/account/withdraw', wrap((req) => { account.withdraw(req.body?.amount); }));
app.post('/api/account/reset', wrap((req) => { account.reset(req.body?.balance ?? 10000); }));
app.post('/api/alerts', wrap((req) => { account.addAlert(req.body || {}); }));
app.delete('/api/alerts/:id', wrap((req) => { account.removeAlert(req.params.id); }));
app.post('/api/journal', wrap((req) => { account.addJournal(req.body || {}); }));
app.delete('/api/journal/:id', wrap((req) => { account.removeJournal(req.params.id); }));
app.post('/api/notifications/clear', wrap(() => { account.clearNotifications(); }));
app.get('/api/memes', wrap(() => ({ tokens: memes.list(), feed: memes.feed.slice(-60).reverse() })));
app.get('/api/memes/:id', wrap((req) => {
  const d = memes.detail(req.params.id);
  if (!d) throw new UserError('Token introuvable');
  return { token: d };
}));
app.get('/api/memes/:id/candles', wrap((req) => {
  const c = memes.candles(req.params.id, req.query.tf);
  if (!c) throw new UserError('Paramètres invalides');
  return { candles: c };
}));
app.post('/api/memes/:id/buy', wrap((req) => { account.memeBuy(req.params.id, req.body?.usd, req.body?.slippage ?? 15); }));
app.post('/api/memes/:id/sell', wrap((req) => { account.memeSell(req.params.id, req.body?.pct ?? 100, req.body?.slippage ?? 15); }));
app.post('/api/chat', wrap((req) => {
  const text = String(req.body?.text || '').trim().slice(0, 280);
  if (!text) throw new UserError('Message vide');
  pushChat({ t: Date.now(), user: 'vous', text, me: true });
  return { ok: true };
}));

const dist = path.join(ROOT, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api|ws).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', verifyClient: ({ req }) => auth.checkUpgrade(req) });

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}
function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of wss.clients) if (ws.readyState === 1) ws.send(data);
}

wss.on('connection', (ws) => {
  ws.sub = { sym: 'NOVA', tf: '1m' };
  ws.lastTradeT = 0;
  send(ws, { type: 'hello', tickers: market.tickers(), account: account.snapshot(), online: onlineCount() });
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

account.onEvent = (ev) => broadcast({ type: 'event', event: ev });
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
  for (const ws of wss.clients) {
    if (ws.readyState !== 1) continue;
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
  }
  if (account.dirty || tickCount % 8 === 0) {
    account.dirty = false;
    broadcast({ type: 'account', account: account.snapshot() });
  }
  if (tickCount % 20 === 0) broadcast({ type: 'online', online: onlineCount() });
  if (Math.random() < TICK_MS / 4500) pushChat({ t: Date.now(), user: randomUser(), text: chatMessage(tickers) });
}, TICK_MS);

memes.onEvent = (ev) => {
  if (Math.abs(nowSec() - ev.t) < 10) broadcast({ type: 'memeEvent', event: ev });
  const h = account.s.memes?.[ev.id];
  if (h && (ev.kind === 'rug' || ev.kind === 'devsell' || ev.kind === 'graduate')) account.notify(ev.kind === 'graduate' ? 'tp' : 'liquidation', ev.text, { sym: '$' + h.ticker });
};
let memeLast = nowSec();
let memeCount = 0;
setInterval(() => {
  const t = nowSec();
  if (t - memeLast > 10) memes.simulate(t, heldMemes());
  else memes.step(t - memeLast, t, true);
  memeLast = t;
  if (++memeCount % 300 === 0) memes.cleanup(t, heldMemes());
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
  console.log(`\n  TradeSim est lancé : http://localhost:${PORT}${auth.enabled ? ' (protégé par mot de passe)' : ''}\n`);
});
