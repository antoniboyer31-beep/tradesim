import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { Account, UserError } from './account.js';

export const START_BALANCE = 10000;
export const AVATARS = ['🦊', '🐸', '🐼', '🦁', '🐯', '🐵', '🦄', '🐲', '🦈', '🐙', '👽', '🤖', '👻', '💀', '🤡', '😎', '🥷', '🧙', '👑', '💎', '🚀', '🔥', '⚡', '🌙', '🍕', '🐶', '🐱', '🐧', '🦉', '🐺', '🐻', '🐨', '🦖', '🐝', '🍀', '🎯'];
const NAME_RE = /^[A-Za-z0-9_.-]{3,16}$/;
const fail = (m) => { throw new UserError(m); };

const hashPassword = (password, salt) => crypto.scryptSync(String(password), salt, 32).toString('hex');

// Les comptes sont stockés dans un dépôt public : on les chiffre avant de les écrire.
function cipherKey(secret) { return crypto.createHash('sha256').update('tradesim-data:' + secret).digest(); }
export function encryptJson(obj, secret) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', cipherKey(secret), iv);
  const body = Buffer.concat([c.update(zlib.gzipSync(JSON.stringify(obj))), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
}
export function decryptJson(str, secret) {
  const buf = Buffer.from(str, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', cipherKey(secret), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(buf.subarray(28)), d.final()])).toString('utf8'));
}

export class Users {
  constructor(market, memes) {
    this.m = market;
    this.mm = memes;
    this.byId = new Map();
    this.nextId = 1;
    this.onAccountEvent = null;
  }

  attach(u, state) {
    u.acc = new Account(this.m, state);
    u.acc.mm = this.mm;
    u.acc.onEvent = (ev) => this.onAccountEvent?.(u, ev);
    this.byId.set(u.id, u);
    return u;
  }

  findByName(name) {
    const k = String(name || '').toLowerCase();
    for (const u of this.byId.values()) if (u.name.toLowerCase() === k) return u;
    return null;
  }

  get(id) { return this.byId.get(Number(id)) || null; }

  create(name, password, avatar, { admin = false } = {}) {
    name = String(name || '').trim();
    if (!NAME_RE.test(name)) fail('Pseudo invalide : 3 à 16 caractères (lettres, chiffres, _ . -)');
    if (this.findByName(name)) fail('Ce pseudo est déjà pris');
    if (String(password || '').length < 4) fail('Mot de passe trop court (4 caractères minimum)');
    if (!AVATARS.includes(avatar)) avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
    const salt = crypto.randomBytes(16).toString('hex');
    const u = { id: this.nextId++, name, avatar, admin, salt, hash: hashPassword(password, salt), createdAt: Date.now(), lastSeen: Date.now(), ver: 1 };
    return this.attach(u, null);
  }

  verify(name, password) {
    const u = this.findByName(name);
    if (!u) return null;
    const h = hashPassword(password, u.salt);
    return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(u.hash, 'hex')) ? u : null;
  }

  setPassword(u, password) {
    if (String(password || '').length < 4) fail('Mot de passe trop court (4 caractères minimum)');
    u.salt = crypto.randomBytes(16).toString('hex');
    u.hash = hashPassword(password, u.salt);
    u.ver = (u.ver || 1) + 1;
  }

  setAvatar(u, avatar) {
    if (!AVATARS.includes(avatar)) fail('Avatar inconnu');
    u.avatar = avatar;
  }

  remove(id) {
    const u = this.get(id);
    if (!u) fail('Joueur introuvable');
    if (u.admin) fail("Impossible de supprimer le compte admin");
    this.byId.delete(u.id);
  }

  ensureAdmin(name, password, legacyState) {
    let u = [...this.byId.values()].find((x) => x.admin) || this.findByName(name);
    if (!u) {
      u = this.create(name, password, '👑', { admin: true });
      if (legacyState) u.acc.s = legacyState;
    } else {
      u.admin = true;
      if (u.name !== name && !this.findByName(name)) u.name = name;
      if (!this.verify(u.name, password)) this.setPassword(u, password);
    }
    for (const x of this.byId.values()) if (x !== u) x.admin = false;
    return u;
  }

  public(u) { return { id: u.id, name: u.name, avatar: u.avatar, admin: !!u.admin }; }

  onStep(...a) { for (const u of this.byId.values()) u.acc.onStep(...a); }

  heldMemes() {
    const s = new Set();
    for (const u of this.byId.values()) for (const id of Object.keys(u.acc.s.memes || {})) s.add(Number(id));
    return s;
  }

  leaderboard(onlineIds = new Set()) {
    return [...this.byId.values()].map((u) => {
      const s = u.acc.s;
      const equity = u.acc.equity();
      const net = s.deposits - s.withdrawals;
      const closed = s.trades.filter((t) => t.pnl != null);
      return {
        ...this.public(u), equity, pnl: equity - net, pnlPct: net > 0 ? ((equity - net) / net) * 100 : 0,
        memeValue: u.acc.memeValue(), trades: s.trades.length, winRate: closed.length ? (closed.filter((t) => t.pnl > 0).length / closed.length) * 100 : null,
        createdAt: u.createdAt, lastSeen: u.lastSeen, online: onlineIds.has(u.id),
      };
    }).sort((a, b) => b.pnl - a.pnl);
  }

  memeHolders(memeId) {
    const out = [];
    for (const u of this.byId.values()) {
      const h = u.acc.s.memes?.[memeId];
      if (h && h.qty > 0) out.push({ ...this.public(u), qty: h.qty, cost: h.cost });
    }
    return out;
  }

  serialize() {
    return {
      nextId: this.nextId,
      users: [...this.byId.values()].map(({ acc, ...u }) => ({ ...u, state: acc.s })),
    };
  }

  load(data) {
    this.nextId = data.nextId;
    for (const { state, ...u } of data.users) this.attach(u, state);
  }
}
