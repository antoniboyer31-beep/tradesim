export function decimalsFor(p) {
  if (!p || !isFinite(p)) return 2;
  if (p >= 1000) return 2;
  if (p >= 10) return 3;
  if (p >= 1) return 4;
  if (p >= 0.01) return 5;
  if (p >= 0.0001) return 7;
  return 9;
}

export function fmtPrice(p) {
  if (p == null || !isFinite(p)) return '—';
  const d = decimalsFor(p);
  return p.toLocaleString('fr-FR', { minimumFractionDigits: Math.min(d, 2), maximumFractionDigits: d });
}

export function fmtUsd(v, digits = 2) {
  if (v == null || !isFinite(v)) return '—';
  return v.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + ' $';
}

export function fmtSigned(v, digits = 2) {
  if (v == null || !isFinite(v)) return '—';
  return (v >= 0 ? '+' : '') + v.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + ' $';
}

export function fmtPct(v, digits = 2) {
  if (v == null || !isFinite(v)) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(digits).replace('.', ',') + ' %';
}

export function fmtQty(q) {
  if (q == null || !isFinite(q)) return '—';
  if (q >= 1e6) return q.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
  if (q >= 1) return q.toLocaleString('fr-FR', { maximumFractionDigits: 4 });
  return q.toLocaleString('fr-FR', { maximumSignificantDigits: 5 });
}

export function fmtCompact(v) {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e12) return (v / 1e12).toFixed(2).replace('.', ',') + ' T';
  if (a >= 1e9) return (v / 1e9).toFixed(2).replace('.', ',') + ' Md';
  if (a >= 1e6) return (v / 1e6).toFixed(2).replace('.', ',') + ' M';
  if (a >= 1e3) return (v / 1e3).toFixed(1).replace('.', ',') + ' k';
  return v.toFixed(2).replace('.', ',');
}

export function fmtTime(ms, withSec = true) {
  return new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: withSec ? '2-digit' : undefined });
}

export function fmtDateTime(ms) {
  return new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function fmtDuration(sec) {
  sec = Math.max(0, Math.floor(sec));
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (d) return `${d}j ${h}h`;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const cls = (...a) => a.filter(Boolean).join(' ');
export const pnlClass = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : '');
