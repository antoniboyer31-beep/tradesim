import { randn } from './market.js';
import { randomUser } from './social.js';

export const SUPPLY = 1e9;
export const GRAD_MCAP = 69000;
export const MEME_FEE = 0.01;
const S5_KEEP = 2 * 3600;
const M1_KEEP = 48 * 3600;
const MAX_TOKENS = 70;
const SPAWN_EVERY = 150;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const round = (x) => Number(x.toPrecision(7));

const BASE_EMOJI = { Pepe: '🐸', Doge: '🐶', Shiba: '🐕', Frog: '🐸', Cat: '🐱', Moon: '🌕', Rocket: '🚀', Banana: '🍌', Chad: '💪', Wojak: '😐', Bonk: '🔨', Giga: '🗿', Turbo: '⚡', Mog: '😼', Hamster: '🐹', Pengu: '🐧', Goat: '🐐', Snek: '🐍', Kebab: '🥙', Baguette: '🥖', Croissant: '🥐', Fromage: '🧀', Pétanque: '🎯', Raclette: '🫕', Escargot: '🐌', Panda: '🐼', Otter: '🦦', Capy: '🦫', Duck: '🦆', Wizard: '🧙', Ninja: '🥷', Pizza: '🍕', Taco: '🌮', Sushi: '🍣', Boba: '🧋', Llama: '🦙', Koala: '🐨', Gorilla: '🦍', Shark: '🦈', Dragon: '🐉', Unicorn: '🦄', Alien: '👽', Robot: '🤖', Ghost: '👻', Zombie: '🧟', Clown: '🤡', Nugget: '🍗', Potato: '🥔' };
const BASES = Object.keys(BASE_EMOJI);
const SUFFIX = ['Inu', 'Coin', 'AI', 'Wif Hat', '2.0', 'Classic', 'Mania', 'King', 'Army', 'Rizz', 'Gang', 'Club', 'Moon', 'Cash', 'Baby', 'Mega', 'Supreme', 'Bros', 'Elite', 'DAO'];
const STORIES = [
  "Le meme le plus drôle de l'année, la communauté va tout casser.",
  'Aucune équipe, aucun plan, que des vibes.',
  "Lancé pour rigoler, mais on ne sait jamais…",
  'Le prochain x1000, faites-moi confiance.',
  'Communauté 100 % organique, pas de jetons réservés à l\'équipe.',
  "Inspiré d'une vidéo virale vue 20 millions de fois.",
  'Le roi des memes est de retour.',
  'Liquidité verrouillée, dev doxxé (paraît-il).',
];
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const wallet = () => { let s = ''; for (let i = 0; i < 4; i++) s += pick(B58); s += '…'; for (let i = 0; i < 4; i++) s += pick(B58); return s; };

// Probabilités inspirées des statistiques des plateformes de lancement : l'immense majorité meurt.
const ARCHETYPES = [['dead', 0.45], ['rug', 0.2], ['pumpdump', 0.22], ['runner', 0.11], ['moon', 0.02]];
function pickArchetype() {
  let r = Math.random();
  for (const [a, w] of ARCHETYPES) { r -= w; if (r <= 0) return a; }
  return 'dead';
}

// g = croissance de la réserve $ par minute (le prix évolue ≈ 2 × g), s = volatilité par √minute, act = activité.
const CELEBS = [
  ['Elon Tusk', '@eloNtusk', '231 M'], ['Snoopy Dogg', '@SnoopyDogg', '84 M'], ['MrFeast', '@MrFeast', '67 M'], ['Kim Kardashiane', '@KimKardashiane', '75 M'],
  ['Taylor Shift', '@taylorshift13', '95 M'], ['Cristiano Ronaldinho', '@CR7inho', '112 M'], ['Vitalik Butterin', '@VitalikButterin', '5,8 M'], ['CZ Binancé', '@cz_binance_fr', '9,4 M'],
  ['Squeezie Jr', '@SqueezieJr', '8,9 M'], ['Kanyé Est', '@kanyeest', '32 M'],
];
const TWEETS = [
  'je viens d\'acheter un peu de ${t} 👀', '${t} to the moon 🚀🚀🚀', 'mon chien adore ${t} 🐕', 'qui connaît ${t} ? 😂', '${t} > tout le reste',
  'je pense que ${t} va être énorme', 'gm ${t} gang ☀️', 'mon nouveau meme préféré : ${t}',
];

function phasesFor(arch) {
  const P = [];
  if (arch === 'celeb') {
    P.push({ d: rand(15, 35), g: rand(1.2, 2.2), s: 0.1, act: 6 });
    P.push({ d: rand(50, 130), g: rand(0.35, 0.8), s: 0.18, act: 5 });
    P.push({ d: rand(60, 180), g: rand(-0.12, 0.08), s: 0.22, act: 4 });
    if (Math.random() < 0.2) P.push({ d: 1, g: 0, s: 0, act: 1, event: 'rug' });
    P.push({ d: rand(180, 480), g: rand(-0.5, -0.22), s: 0.18, act: 3 });
    if (Math.random() < 0.35) {
      P.push({ d: rand(120, 400), g: rand(0.05, 0.2), s: 0.12, act: 2 });
      P.push({ d: rand(600, 1800), g: rand(-0.06, -0.02), s: 0.06, act: 1.5 });
    }
    P.push({ d: rand(1800, 5400), g: rand(-0.01, -0.004), s: 0.03, act: 0.6 });
  } else if (arch === 'dead') {
    P.push({ d: rand(60, 400), g: rand(0, 0.02), s: 0.03, act: 1 });
    P.push({ d: rand(600, 3000), g: rand(-0.012, -0.004), s: 0.025, act: 0.5 });
  } else if (arch === 'rug') {
    P.push({ d: rand(120, 600), g: rand(0.003, 0.015), s: 0.03, act: 1 });
    P.push({ d: rand(300, 1500), g: rand(0.012, 0.03), s: 0.04, act: 1.6 });
    P.push({ d: 1, g: 0, s: 0, act: 1, event: 'rug' });
  } else if (arch === 'pumpdump') {
    P.push({ d: rand(120, 600), g: rand(0.003, 0.015), s: 0.03, act: 1 });
    P.push({ d: rand(600, 2400), g: rand(0.01, 0.022), s: 0.045, act: 2 });
    P.push({ d: rand(300, 1500), g: rand(-0.004, 0.002), s: 0.04, act: 1.4, event: 'devsell' });
    P.push({ d: rand(300, 1200), g: rand(-0.06, -0.025), s: 0.05, act: 1.8 });
  } else {
    const waves = arch === 'moon' ? 7 + Math.floor(Math.random() * 5) : 3 + Math.floor(Math.random() * 3);
    P.push({ d: rand(120, 600), g: rand(0.008, 0.02), s: 0.035, act: 1.2 });
    for (let i = 0; i < waves; i++) {
      P.push({ d: rand(600, 2400), g: rand(0.01, arch === 'moon' ? 0.03 : 0.02), s: 0.045, act: 2 });
      P.push({ d: rand(900, 5400), g: rand(-0.012, 0.001), s: 0.035, act: 1.2 });
    }
    P.push({ d: rand(1800, 7200), g: rand(-0.02, -0.008), s: 0.04, act: 1.2 });
  }
  P.push({ d: Infinity, g: -0.0008, s: 0.02, act: 0.12 });
  return P;
}

function makeName() {
  const base = pick(BASES);
  const name = Math.random() < 0.6 ? `${base} ${pick(SUFFIX)}` : base;
  const letters = name.normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase();
  const ticker = (Math.random() < 0.5 ? letters.slice(0, 4) : letters.slice(0, 3) + pick('XYZQ')) + (Math.random() < 0.2 ? Math.floor(Math.random() * 9) : '');
  return { name, ticker, emoji: BASE_EMOJI[base] };
}

function addTick(series, bucket, price, vol) {
  const last = series[series.length - 1];
  if (last && last[0] === bucket) {
    if (price > last[2]) last[2] = price;
    if (price < last[3]) last[3] = price;
    last[4] = price;
    last[5] += vol;
  } else {
    const open = last ? last[4] : price;
    series.push([bucket, open, Math.max(open, price), Math.min(open, price), price, vol]);
  }
}

const COMMENTS = {
  up: ['LFG 🚀🚀', 'next 100x', 'on est encore tôt', 'je viens de prendre un bag', 'mcap ridicule là', 'pump it', 'qui vend à ce prix ?? 😂', 'WAGMI', 'ça va migrer ce soir', 'je prends mes x2 et je laisse le reste'],
  down: ['rug ?', 'le dev a vendu ??', 'ça dump fort', 'je suis -60% 😭', 'pourquoi je suis rentré au top', 'dead coin', 'achetez le dip lol', "c'était un scam", 'stop loss mental activé', 'les snipers ont tout vendu'],
  flat: ['quelqu\'un est encore là ?', 'gm', 'en attente du prochain pump', 'accumulation ?', 'chart propre', 'patience', 'dev actif sur telegram ?'],
};

export class MemeMarket {
  constructor() {
    this.tokens = [];
    this.nextId = 1;
    this.time = 0;
    this.lastSpawn = 0;
    this.feed = [];
    this.onEvent = null;
    this.trades = {};
    this.playerTrades = {};
    this.nextCeleb = 0;
  }

  recordPlayer(id, tr) {
    const l = this.playerTrades[id] || (this.playerTrades[id] = []);
    l.push(tr);
    if (l.length > 300) l.splice(0, l.length - 250);
  }

  spawnCeleb(t) {
    const tk = this.spawn(t, 'celeb');
    const [name, handle, followers] = pick(CELEBS);
    const tweet = pick(TWEETS).replace('${t}', '$' + tk.ticker);
    tk.celeb = { name, handle, followers, tweet };
    tk.socials = { x: true, tg: true, web: Math.random() < 0.5 };
    tk.story = `Mentionné par ${name} (${followers} abonnés) sur X.`;
    this.emit({ t, kind: 'celeb', id: tk.id, text: `🚨 ${name} (${handle}) vient de tweeter : « ${tweet} »`, celeb: tk.celeb, ticker: tk.ticker, emoji: tk.emoji, name: tk.name });
    return tk;
  }

  spawn(t, forced) {
    const arch = forced || pickArchetype();
    const { name, ticker, emoji } = makeName();
    const shady = arch === 'rug' || (arch === 'pumpdump' && Math.random() < 0.6);
    const looksClean = Math.random() < 0.25;
    const bad = shady && !looksClean;
    const good = arch === 'runner' || arch === 'moon' || arch === 'celeb';
    const R0 = rand(4200, 6000);
    const T0 = SUPPLY;
    const top10 = bad ? rand(35, 65) : good ? rand(14, 30) : rand(20, 45);
    const devPct = bad ? rand(6, 22) : rand(0, 5);
    const tk = {
      id: this.nextId++, name, ticker, emoji, arch, createdAt: t, creator: wallet(),
      story: pick(STORIES), R: R0, T: T0, k: R0 * T0, R0,
      phases: phasesFor(arch), phase: 0, phaseEnd: 0,
      graduated: false, rugged: false, devSold: devPct < 0.5,
      devPct, top10, snipers: bad ? Math.floor(rand(5, 22)) : Math.floor(rand(0, 8)), bundled: bad ? rand(10, 45) : rand(0, 12),
      socials: { x: good ? Math.random() < 0.95 : Math.random() < 0.5, tg: good ? Math.random() < 0.9 : Math.random() < 0.4, web: good ? Math.random() < 0.7 : Math.random() < 0.2 },
      holders: 1 + Math.floor(rand(3, 15)), athMcap: 0, s5: [], m1: [], buys: 0, sells: 0, lastActivity: t,
    };
    tk.phaseEnd = t + tk.phases[0].d;
    tk.athMcap = this.mcap(tk);
    this.tokens.push(tk);
    if (!forced) this.emit({ t, kind: 'launch', id: tk.id, text: `${emoji} ${name} ($${ticker}) vient d'être lancé` });
    return tk;
  }

  price(tk) { return tk.R / tk.T; }
  mcap(tk) { return this.price(tk) * SUPPLY; }

  emit(ev) {
    this.feed.push(ev);
    if (this.feed.length > 200) this.feed.splice(0, this.feed.length - 150);
    this.onEvent?.(ev);
  }

  // Échange sur la courbe x·y = k : `usd` > 0 achat, < 0 vente d'une valeur équivalente.
  swapFlow(tk, usd) {
    const floor = tk.R0 * 0.12;
    tk.R = Math.max(floor, tk.R + usd);
    tk.T = tk.k / tk.R;
  }

  step(dt, t, live) {
    if (t - this.lastSpawn > 0 && Math.random() < dt / SPAWN_EVERY) { this.lastSpawn = t; this.spawn(t); }
    if (live) {
      if (!this.nextCeleb) this.nextCeleb = t + rand(4, 12) * 60;
      if (t >= this.nextCeleb) { this.nextCeleb = t + rand(25, 50) * 60; this.spawnCeleb(t); }
    }
    const keepS5 = live || t >= this.s5From;
    for (const tk of this.tokens) {
      while (t >= tk.phaseEnd && tk.phase < tk.phases.length - 1) {
        tk.phase++;
        const ph = tk.phases[tk.phase];
        tk.phaseEnd = tk.phaseEnd + ph.d;
        if (ph.event === 'rug') this.rug(tk, t);
        if (ph.event === 'devsell' && !tk.devSold && tk.devPct > 0.5) {
          tk.devSold = true;
          this.swapFlow(tk, -tk.R * Math.min(0.35, tk.devPct / 60));
          tk.devPct = 0;
          this.emit({ t, kind: 'devsell', id: tk.id, text: `⚠️ Le créateur de $${tk.ticker} a vendu tous ses jetons` });
        }
      }
      const ph = tk.phases[tk.phase];
      const m = dt / 60;
      const z = randn();
      const flow = tk.R * (ph.g * m + ph.s * Math.sqrt(m) * z);
      const before = this.price(tk);
      this.swapFlow(tk, flow);
      const p = this.price(tk);
      const mc = p * SUPPLY;
      if (mc > tk.athMcap) tk.athMcap = mc;
      if (!tk.graduated && mc >= GRAD_MCAP) {
        tk.graduated = true;
        tk.R *= 2.5; tk.T *= 2.5; tk.k = tk.R * tk.T;
        this.emit({ t, kind: 'graduate', id: tk.id, text: `🎓 $${tk.ticker} a atteint ${GRAD_MCAP.toLocaleString('fr-FR')} $ de capitalisation et migre sur le DEX !` });
      }
      const gross = Math.abs(flow) * rand(1.5, 3) + tk.R * 0.002 * ph.act * m * Math.random();
      const nTx = Math.max(0, Math.round((gross / rand(40, 120)) * 0.7));
      const buyShare = flow > 0 ? rand(0.55, 0.75) : rand(0.25, 0.45);
      const nb = Math.round(nTx * buyShare);
      tk.buys += nb;
      tk.sells += nTx - nb;
      tk.holders = Math.max(1, tk.holders + Math.round(nb * rand(0.3, 0.7) - (nTx - nb) * rand(0.2, 0.5)));
      if (gross > 1) tk.lastActivity = t;
      const price = round(p);
      if (keepS5) addTick(tk.s5, Math.floor(t / 5) * 5, price, gross);
      addTick(tk.m1, Math.floor(t / 60) * 60, price, gross);
      if (live) this.genTrades(tk, t, nTx, buyShare, gross, before, p);
    }
    this.time = t;
  }

  rug(tk, t) {
    tk.rugged = true;
    tk.devSold = true;
    tk.devPct = 0;
    tk.R = Math.max(tk.R0 * 0.12, tk.R * rand(0.04, 0.12));
    tk.T = tk.k / tk.R;
    this.emit({ t, kind: 'rug', id: tk.id, text: `💀 RUG PULL sur $${tk.ticker} : le créateur a tout vendu, le prix s'effondre` });
  }

  genTrades(tk, t, nTx, buyShare, gross, before, p) {
    const list = this.trades[tk.id] || (this.trades[tk.id] = []);
    const n = Math.min(4, nTx);
    for (let i = 0; i < n; i++) {
      const buy = Math.random() < buyShare;
      const usd = (gross / Math.max(1, nTx)) * Math.exp(randn() * 0.8);
      const tag = usd > 1500 ? 'baleine' : Math.random() < 0.04 ? 'sniper' : null;
      list.push({ t: t * 1000 + i, side: buy ? 'buy' : 'sell', usd, price: p, user: Math.random() < 0.3 ? randomUser() : wallet(), tag });
    }
    if (list.length > 60) list.splice(0, list.length - 40);
    if (Math.random() < 0.012) {
      const ch = p / before - 1;
      const mood = ch > 0.002 ? 'up' : ch < -0.002 ? 'down' : 'flat';
      const c = tk.comments || (tk.comments = []);
      c.push({ t: t * 1000, user: randomUser(), text: pick(COMMENTS[mood]) });
      if (c.length > 40) c.splice(0, c.length - 30);
    }
  }

  cleanup(t, heldIds) {
    for (const tk of this.tokens) {
      const i5 = tk.s5.findIndex((c) => c[0] >= t - S5_KEEP);
      if (i5 > 0) tk.s5.splice(0, i5);
      const i1 = tk.m1.findIndex((c) => c[0] >= t - M1_KEEP);
      if (i1 > 0) tk.m1.splice(0, i1);
    }
    this.tokens = this.tokens.filter((tk) => {
      if (heldIds.has(tk.id)) return true;
      const age = t - tk.createdAt;
      const mc = this.mcap(tk);
      if (age > 3 * 3600 && mc < 4500) return false;
      if (age > 48 * 3600) return false;
      return true;
    });
    if (this.tokens.length > MAX_TOKENS) {
      const removable = this.tokens.filter((tk) => !heldIds.has(tk.id)).sort((a, b) => this.mcap(a) - this.mcap(b));
      const drop = new Set(removable.slice(0, this.tokens.length - MAX_TOKENS).map((x) => x.id));
      this.tokens = this.tokens.filter((tk) => !drop.has(tk.id));
    }
  }

  simulate(to, heldIds = new Set()) {
    this.s5From = to - S5_KEEP;
    let t = this.time;
    if (to - t > 48 * 3600) t = to - 48 * 3600;
    let n = 0;
    while (t < to) {
      const dt = to - t > 6 * 3600 ? 60 : 5;
      const nt = Math.min(to, t + dt);
      this.step(nt - t, nt, false);
      t = nt;
      if (++n % 2000 === 0) this.cleanup(t, heldIds);
    }
    this.time = to;
    this.cleanup(to, heldIds);
  }

  initFresh(now) {
    this.time = now - 6 * 3600;
    this.lastSpawn = this.time;
    for (let i = 0; i < 6; i++) this.spawn(this.time - i * 60);
    this.simulate(now);
  }

  find(id) {
    return this.tokens.find((x) => x.id === Number(id));
  }

  stats(tk) {
    const now = this.time;
    const s = tk.m1;
    let v5 = 0, v1h = 0, v24 = 0, o5 = null, o1h = null;
    for (let i = s.length - 1; i >= 0; i--) {
      const c = s[i];
      const age = now - c[0];
      if (age > 86400) break;
      v24 += c[5];
      if (age <= 3600) { v1h += c[5]; o1h = c[1]; }
      if (age <= 300) { v5 += c[5]; o5 = c[1]; }
    }
    const p = this.price(tk);
    return {
      id: tk.id, name: tk.name, ticker: tk.ticker, emoji: tk.emoji, createdAt: tk.createdAt * 1000, creator: tk.creator, story: tk.story,
      price: p, mcap: p * SUPPLY, liquidity: tk.R * 2, athMcap: tk.athMcap,
      ch5m: o5 ? (p / o5 - 1) * 100 : 0, ch1h: o1h ? (p / o1h - 1) * 100 : 0,
      vol5m: v5, vol1h: v1h, vol24: v24, holders: tk.holders, buys: tk.buys, sells: tk.sells,
      graduated: tk.graduated, rugged: tk.rugged, progress: tk.graduated ? 100 : Math.min(100, ((p * SUPPLY) / GRAD_MCAP) * 100),
      devPct: tk.devPct, devSold: tk.devSold, top10: tk.top10, snipers: tk.snipers, bundled: tk.bundled, socials: tk.socials,
      lastActivity: tk.lastActivity * 1000, celeb: tk.celeb || null,
    };
  }

  list() {
    return this.tokens.map((tk) => this.stats(tk));
  }

  detail(id) {
    const tk = this.find(id);
    if (!tk) return null;
    const st = this.stats(tk);
    const holders = [];
    let rest = tk.top10;
    if (tk.devPct > 0.5) { holders.push({ who: 'Créateur (dev)', pct: tk.devPct, dev: true }); rest -= tk.devPct; }
    const n = 10 - holders.length;
    let w = 0;
    const weights = Array.from({ length: n }, (_, i) => 1 / (i + 1.3));
    weights.forEach((x) => (w += x));
    weights.forEach((x, i) => holders.push({ who: wallet(), pct: Math.max(0.2, (rest * x) / w), sniper: i < tk.snipers / 4 }));
    return { ...st, holdersList: holders, comments: (tk.comments || []).slice(-25), trades: (this.trades[tk.id] || []).slice(-30) };
  }

  candles(id, tf) {
    const tk = this.find(id);
    if (!tk) return null;
    const sec = { '5s': 5, '15s': 15, '1m': 60, '5m': 300, '15m': 900, '1h': 3600 }[tf];
    if (!sec) return null;
    const src = sec < 60 ? tk.s5 : tk.m1;
    const out = [];
    for (const c of src) {
      const b = Math.floor(c[0] / sec) * sec;
      const last = out[out.length - 1];
      if (last && last[0] === b) { last[2] = Math.max(last[2], c[2]); last[3] = Math.min(last[3], c[3]); last[4] = c[4]; last[5] += c[5]; }
      else out.push([b, c[1], c[2], c[3], c[4], c[5]]);
    }
    return out.slice(-1500);
  }

  quoteBuy(tk, usd) {
    const net = usd * (1 - MEME_FEE);
    const R2 = tk.R + net;
    const tokens = tk.T - tk.k / R2;
    const newPrice = R2 / (tk.k / R2);
    return { tokens, impact: newPrice / this.price(tk) - 1, fee: usd * MEME_FEE };
  }

  quoteSell(tk, tokens) {
    const T2 = tk.T + tokens;
    const R2 = tk.k / T2;
    const gross = tk.R - R2;
    return { usd: gross * (1 - MEME_FEE), fee: gross * MEME_FEE, impact: R2 / T2 / this.price(tk) - 1 };
  }

  applyBuy(tk, net) {
    tk.R += net;
    tk.T = tk.k / tk.R;
    tk.buys++;
    tk.holders++;
  }

  applySell(tk, tokens) {
    tk.T += tokens;
    tk.R = tk.k / tk.T;
    tk.sells++;
  }

  *serializeChunks() {
    const pack = (arr) => arr.map((c) => [c[0], +c[1].toPrecision(6), +c[2].toPrecision(6), +c[3].toPrecision(6), +c[4].toPrecision(6), +c[5].toPrecision(3)]);
    const ids = new Set(this.tokens.map((x) => x.id));
    const pt = Object.fromEntries(Object.entries(this.playerTrades).filter(([id]) => ids.has(Number(id))));
    yield `{"time":${this.time},"nextId":${this.nextId},"lastSpawn":${this.lastSpawn},"playerTrades":${JSON.stringify(pt)},"feed":${JSON.stringify(this.feed.slice(-100))},"tokens":[`;
    let first = true;
    for (const tk of this.tokens) {
      const phases = tk.phases.map((p) => ({ ...p, d: isFinite(p.d) ? p.d : -1 }));
      yield (first ? '' : ',') + JSON.stringify({ ...tk, phases, phaseEnd: isFinite(tk.phaseEnd) ? tk.phaseEnd : -1, s5: pack(tk.s5), m1: pack(tk.m1) });
      first = false;
    }
    yield ']}';
  }

  load(data) {
    this.time = data.time;
    this.nextId = data.nextId;
    this.lastSpawn = data.lastSpawn;
    this.feed = data.feed || [];
    this.playerTrades = data.playerTrades || {};
    this.tokens = data.tokens.map((tk) => ({ ...tk, phaseEnd: tk.phaseEnd < 0 ? Infinity : tk.phaseEnd, phases: tk.phases.map((p) => ({ ...p, d: p.d < 0 ? Infinity : p.d })) }));
  }
}
