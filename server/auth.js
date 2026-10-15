import crypto from 'node:crypto';
import { AVATARS } from './users.js';

const COOKIE = 'ts_sess';
const MAX_ATTEMPTS = 15;
const WINDOW_MS = 15 * 60 * 1000;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createAuth(users, secret) {
  const sign = (id, ver) => `${id}.${ver}.${crypto.createHmac('sha256', secret).update(`${id}.${ver}`).digest('base64url')}`;
  const attempts = new Map();

  const readCookie = (header = '') => {
    for (const part of header.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === COOKIE) return v.join('=');
    }
    return null;
  };
  const userFrom = (header) => {
    const c = readCookie(header);
    if (!c) return null;
    const [id, ver] = c.split('.');
    const u = users.get(id);
    if (!u) return null;
    const expected = sign(u.id, u.ver || 1);
    return c.length === expected.length && crypto.timingSafeEqual(Buffer.from(c), Buffer.from(expected)) && Number(ver) === (u.ver || 1) ? u : null;
  };
  const setCookie = (req, res, u) => {
    const secure = req.headers['x-forwarded-proto'] === 'https' || req.secure;
    res.setHeader('Set-Cookie', `${COOKIE}=${sign(u.id, u.ver || 1)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}${secure ? '; Secure' : ''}`);
  };

  const page = ({ error = '', mode = 'login', name = '' } = {}) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TradeSim — Connexion</title><style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 30% 20%,#14203a,#0a0d13 60%);color:#e6e9ef;font-family:Inter,system-ui,sans-serif}
.box{background:#10141d;border:1px solid #1d2431;border-radius:16px;padding:26px;width:min(420px,92vw);display:flex;flex-direction:column;gap:14px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
h1{margin:0;font-size:24px}h1 span{color:#16c784}p{margin:0;color:#8a94a6;font-size:14px}
.tabs{display:flex;background:#151a25;border-radius:10px;padding:4px}.tabs a{flex:1;text-align:center;padding:9px;border-radius:8px;color:#8a94a6;text-decoration:none;font-weight:600}.tabs a.on{background:#1f2a40;color:#fff}
form{display:flex;flex-direction:column;gap:12px}label{font-size:12px;color:#8a94a6;display:flex;flex-direction:column;gap:5px}
input[type=text],input[type=password]{font:inherit;color:#e6e9ef;background:#151a25;border:1px solid #273041;border-radius:8px;padding:11px}
button{font:inherit;font-weight:700;background:#16c784;color:#04150e;border:0;border-radius:8px;padding:12px;cursor:pointer}
.err{color:#ea3943;font-size:13px;background:rgba(234,57,67,.1);padding:8px 10px;border-radius:8px}
.av{display:grid;grid-template-columns:repeat(9,1fr);gap:5px}.av input{display:none}.av span{display:grid;place-items:center;font-size:22px;height:36px;border-radius:9px;background:#151a25;border:2px solid transparent;cursor:pointer}
.av input:checked+span{border-color:#16c784;background:#16302a}.hint{font-size:12px;color:#8a94a6}</style></head><body>
<div class="box"><h1>Trade<span>Sim</span></h1><p>Simulateur de trading multijoueur — tout le monde démarre avec 10 000 $ fictifs.</p>
<div class="tabs"><a href="/login" class="${mode === 'login' ? 'on' : ''}">Connexion</a><a href="/login?mode=register" class="${mode === 'register' ? 'on' : ''}">Créer un compte</a></div>
${error ? `<div class="err">${esc(error)}</div>` : ''}
${mode === 'login' ? `<form method="post" action="/login">
<label>Pseudo<input type="text" name="name" value="${esc(name)}" autocomplete="username" required autofocus></label>
<label>Mot de passe<input type="password" name="password" autocomplete="current-password" required></label>
<button>Se connecter</button></form>` : `<form method="post" action="/register">
<label>Pseudo<input type="text" name="name" value="${esc(name)}" minlength="3" maxlength="16" pattern="[A-Za-z0-9_.\\-]{3,16}" autocomplete="username" required autofocus></label>
<label>Mot de passe<input type="password" name="password" minlength="4" autocomplete="new-password" required></label>
<label>Choisis ta photo de profil<div class="av">${AVATARS.map((a, i) => `<label><input type="radio" name="avatar" value="${a}" ${i === 0 ? 'checked' : ''}><span>${a}</span></label>`).join('')}</div></label>
<div class="hint">Ton pseudo et ta photo seront visibles par les autres joueurs (classement, chat, graphiques des meme coins).</div>
<button>Créer mon compte et recevoir 10 000 $</button></form>`}
</div></body></html>`;

  const limited = (req) => {
    const ip = req.headers['cf-connecting-ip'] || req.ip;
    const now = Date.now();
    const a = attempts.get(ip) || { n: 0, since: now };
    if (now - a.since > WINDOW_MS) { a.n = 0; a.since = now; }
    a.n++;
    attempts.set(ip, a);
    return a.n > MAX_ATTEMPTS;
  };

  const middleware = (req, res, next) => {
    if (req.path === '/login' && req.method === 'GET') return res.type('html').send(page({ mode: req.query.mode === 'register' ? 'register' : 'login' }));
    if (req.path === '/login' && req.method === 'POST') {
      const name = String(req.body?.name || '');
      if (limited(req)) return res.status(429).type('html').send(page({ error: 'Trop de tentatives, réessaie dans 15 minutes.', name }));
      const u = users.verify(name, String(req.body?.password || ''));
      if (!u) return res.status(401).type('html').send(page({ error: 'Pseudo ou mot de passe incorrect.', name }));
      setCookie(req, res, u);
      return res.redirect('/');
    }
    if (req.path === '/register' && req.method === 'POST') {
      const name = String(req.body?.name || '');
      if (limited(req)) return res.status(429).type('html').send(page({ mode: 'register', error: 'Trop de tentatives, réessaie dans 15 minutes.', name }));
      try {
        const u = users.create(name, String(req.body?.password || ''), String(req.body?.avatar || ''));
        users.onCreate?.(u);
        setCookie(req, res, u);
        return res.redirect('/');
      } catch (e) {
        return res.status(400).type('html').send(page({ mode: 'register', error: e.message, name }));
      }
    }
    if (req.path === '/logout') {
      res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
      return res.redirect('/login');
    }
    const u = userFrom(req.headers.cookie);
    if (u) { req.user = u; u.lastSeen = Date.now(); return next(); }
    if (req.path.startsWith('/api')) return res.status(401).json({ error: 'Non connecté' });
    return res.redirect('/login');
  };

  return { middleware, userFrom };
}
