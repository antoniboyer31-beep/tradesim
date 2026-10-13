import { useSyncExternalStore } from 'react';

let state = {
  connected: false,
  coins: [],
  coinMap: {},
  tickers: {},
  account: null,
  online: 0,
  book: null,
  trades: [],
  chat: [],
  news: [],
  sym: localStorage.getItem('ts.sym') || 'NOVA',
  tf: localStorage.getItem('ts.tf') || '1m',
  analysis: null,
  toasts: [],
  pickedPrice: null,
  page: 'trade',
  moneyOpen: false,
  memes: [],
  memeFeed: [],
  memeOn: false,
};

const listeners = new Set();
export const getState = () => state;
export function setState(patch) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  listeners.forEach((l) => l());
}
function subscribe(l) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function useStore(selector) {
  return useSyncExternalStore(subscribe, () => selector(state));
}

const memeListeners = new Set();
export function onMemeTick(fn) {
  memeListeners.add(fn);
  return () => memeListeners.delete(fn);
}
let memeSub = null;
const wsSend = (m) => { if (ws?.readyState === 1) ws.send(JSON.stringify(m)); };
export function setMemeMode(on) {
  setState({ memeOn: on });
  wsSend({ type: 'memeOn', on });
  if (!on) subscribeMeme(null);
}
export function subscribeMeme(id, tf) {
  memeSub = id ? { id, tf } : null;
  wsSend({ type: 'memeSub', id, tf });
}

const candleListeners = new Set();
export function onCandle(fn) {
  candleListeners.add(fn);
  return () => candleListeners.delete(fn);
}

let ws;
let retry = 0;
export function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => {
    retry = 0;
    setState({ connected: true });
    subscribeMarket(state.sym, state.tf);
    if (state.memeOn) wsSend({ type: 'memeOn', on: true });
    if (memeSub) wsSend({ type: 'memeSub', ...memeSub });
  };
  ws.onclose = () => {
    setState({ connected: false });
    setTimeout(connect, Math.min(10000, 500 * 2 ** retry++));
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    switch (msg.type) {
      case 'hello':
        setState({ tickers: toMap(msg.tickers), account: msg.account, online: msg.online });
        break;
      case 'tick':
        setState({ tickers: toMap(msg.tickers) });
        break;
      case 'candle':
        candleListeners.forEach((fn) => fn(msg));
        break;
      case 'book':
        if (msg.sym === state.sym) setState({ book: msg });
        break;
      case 'trades':
        if (msg.sym !== state.sym) break;
        setState((s) => ({ trades: (msg.reset ? msg.trades : [...s.trades, ...msg.trades]).slice(-40) }));
        break;
      case 'account':
        setState({ account: msg.account });
        break;
      case 'online':
        setState({ online: msg.online });
        break;
      case 'chat':
        setState((s) => ({ chat: [...s.chat, msg.msg].slice(-100) }));
        break;
      case 'news':
        setState((s) => ({ news: [msg.item, ...s.news].slice(0, 100) }));
        toast(msg.item.impact === 'up' ? 'news-up' : 'news-down', `📰 ${msg.item.title}`);
        break;
      case 'event':
        handleEvent(msg.event);
        break;
      case 'memes':
        setState({ memes: msg.tokens });
        break;
      case 'memeTick':
        memeListeners.forEach((fn) => fn(msg));
        break;
      case 'memeEvent':
        setState((s) => ({ memeFeed: [msg.event, ...s.memeFeed].slice(0, 80) }));
        break;
    }
  };
}

function toMap(list) {
  const m = {};
  for (const t of list) m[t.sym] = t;
  return m;
}

export function subscribeMarket(sym, tf) {
  localStorage.setItem('ts.sym', sym);
  localStorage.setItem('ts.tf', tf);
  if (sym !== state.sym) setState({ trades: [], book: null });
  setState({ sym, tf });
  if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'sub', sym, tf }));
}

function handleEvent(ev) {
  if (ev.type === 'order') return;
  toast(ev.type, ev.message);
  if ((ev.type === 'alert' || ev.type === 'liquidation' || ev.type === 'tp' || ev.type === 'sl') && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    new Notification('TradeSim', { body: ev.message });
  }
}

let toastId = 1;
export function toast(type, message) {
  const id = toastId++;
  setState((s) => ({ toasts: [...s.toasts, { id, type, message }].slice(-5) }));
  setTimeout(() => setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), type === 'error' ? 5000 : 6500);
}

export async function api(method, url, body) {
  const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401) {
    location.href = '/login';
    throw new Error('Non connecté');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    toast('error', data.error || 'Erreur');
    throw new Error(data.error || 'Erreur');
  }
  if (data.account) setState({ account: data.account });
  return data;
}

export async function loadInitial() {
  const [coins, news, chat] = await Promise.all([api('GET', '/api/coins'), api('GET', '/api/news'), api('GET', '/api/chat')]);
  setState({
    coins: coins.coins, coinMap: Object.fromEntries(coins.coins.map((c) => [c.sym, c])),
    tickers: toMap(coins.tickers), news: news.news, chat: chat.chat,
  });
}
