import crypto from 'node:crypto';

const COOKIE = 'ts_auth';
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

export function createAuth(password) {
  if (!password) return { enabled: false, middleware: (_req, _res, next) => next(), checkUpgrade: () => true };

  const secret = crypto.randomBytes(32);
  const token = crypto.createHmac('sha256', secret).update(password).digest('hex');
  const attempts = new Map();

  const readCookie = (header = '') => {
    for (const part of header.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === COOKIE) return v.join('=');
    }
    return null;
  };
  const isValid = (header) => {
    const c = readCookie(header);
    return !!c && c.length === token.length && crypto.timingSafeEqual(Buffer.from(c), Buffer.from(token));
  };

  const page = (error = '') => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TradeSim — Connexion</title><style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0d13;color:#e6e9ef;font-family:Inter,system-ui,sans-serif}
form{background:#10141d;border:1px solid #1d2431;border-radius:14px;padding:28px;width:min(360px,90vw);display:flex;flex-direction:column;gap:14px}
h1{margin:0;font-size:22px}h1 span{color:#16c784}p{margin:0;color:#8a94a6;font-size:14px}
input{font:inherit;color:#e6e9ef;background:#151a25;border:1px solid #273041;border-radius:8px;padding:11px}
button{font:inherit;font-weight:700;background:#16c784;color:#04150e;border:0;border-radius:8px;padding:11px;cursor:pointer}
.err{color:#ea3943;font-size:13px}</style></head><body>
<form method="post" action="/login"><h1>Trade<span>Sim</span></h1><p>Simulateur de trading — accès privé</p>
<input type="password" name="password" placeholder="Mot de passe" autofocus required>
${error ? `<div class="err">${error}</div>` : ''}<button>Entrer</button></form></body></html>`;

  const middleware = (req, res, next) => {
    if (req.path === '/login') {
      if (req.method === 'GET') return res.type('html').send(page());
      if (req.method === 'POST') {
        const ip = req.headers['cf-connecting-ip'] || req.ip;
        const now = Date.now();
        const a = attempts.get(ip) || { n: 0, since: now };
        if (now - a.since > WINDOW_MS) { a.n = 0; a.since = now; }
        if (a.n >= MAX_ATTEMPTS) return res.status(429).type('html').send(page('Trop de tentatives, réessaie dans 15 minutes.'));
        const given = String(req.body?.password || '');
        const ok = given.length === password.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(password));
        if (!ok) {
          a.n++;
          attempts.set(ip, a);
          return res.status(401).type('html').send(page('Mot de passe incorrect.'));
        }
        attempts.delete(ip);
        const secure = req.headers['x-forwarded-proto'] === 'https' || req.secure;
        res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}${secure ? '; Secure' : ''}`);
        return res.redirect('/');
      }
    }
    if (isValid(req.headers.cookie)) return next();
    if (req.path.startsWith('/api')) return res.status(401).json({ error: 'Non connecté' });
    return res.redirect('/login');
  };

  return { enabled: true, middleware, checkUpgrade: (req) => isValid(req.headers.cookie) };
}
