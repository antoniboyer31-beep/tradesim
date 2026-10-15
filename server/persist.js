import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// Écrit les morceaux JSON dans un flux gzip pour éviter de construire une énorme chaîne en mémoire.
function gzipChunks(chunks) {
  return new Promise((resolve, reject) => {
    const gz = zlib.createGzip({ level: 6 });
    const out = [];
    gz.on('data', (b) => out.push(b));
    gz.on('end', () => resolve(Buffer.concat(out)));
    gz.on('error', reject);
    for (const c of chunks) gz.write(c);
    gz.end();
  });
}

const isMarket = (name) => name.endsWith('.gz');
const decode = (name, buf) => (isMarket(name) ? JSON.parse(zlib.gunzipSync(buf).toString('utf8')) : name.endsWith('.enc') ? buf.toString('utf8') : JSON.parse(buf.toString('utf8')));

function localStore(dataDir) {
  const legacyFile = path.join(dataDir, 'state.json');
  const writeAtomic = (file, data) => { fs.writeFileSync(file + '.tmp', data); fs.renameSync(file + '.tmp', file); };
  return {
    kind: 'local',
    async load(names) {
      const out = {};
      for (const n of names) {
        const f = path.join(dataDir, n);
        if (fs.existsSync(f)) out[n] = decode(n, fs.readFileSync(f));
      }
      if (!out['market.json.gz'] && fs.existsSync(legacyFile)) {
        const data = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
        out['market.json.gz'] = data.market;
        out['account.json'] = data.account;
      }
      return out;
    },
    async save(files) {
      for (const [n, v] of Object.entries(files)) {
        if (v == null) continue;
        writeAtomic(path.join(dataDir, n), isMarket(n) ? await gzipChunks(v) : v);
      }
      if (fs.existsSync(legacyFile)) fs.rmSync(legacyFile);
    },
  };
}

// Stockage dans une branche dédiée d'un dépôt GitHub : chaque sauvegarde remplace
// la branche par un commit unique, pour que le dépôt ne grossisse pas.
function githubStore({ token, repo, branch }) {
  const base = `https://api.github.com/repos/${repo}`;
  const gh = async (p, opts = {}) => {
    const res = await fetch(base + p, {
      ...opts,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    if (res.status === 404 || res.status === 409) return null;
    if (!res.ok) throw new Error(`GitHub ${res.status} ${p}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  };
  const blob = async (sha) => Buffer.from((await gh(`/git/blobs/${sha}`)).content, 'base64');
  const shas = {};
  let refExists = false;
  return {
    kind: 'github',
    async load(names) {
      const out = {};
      const ref = await gh(`/git/ref/heads/${branch}`);
      if (!ref) return out;
      refExists = true;
      const commit = await gh(`/git/commits/${ref.object.sha}`);
      const tree = await gh(`/git/trees/${commit.tree.sha}`);
      for (const f of tree.tree) {
        shas[f.path] = f.sha;
        if (!names.includes(f.path)) continue;
        const buf = await blob(f.sha);
        out[f.path] = decode(f.path, buf);
      }
      return out;
    },
    async save(files) {
      for (const [n, v] of Object.entries(files)) {
        if (v == null) continue;
        const body = isMarket(n) ? { content: (await gzipChunks(v)).toString('base64'), encoding: 'base64' } : { content: v, encoding: 'utf-8' };
        shas[n] = (await gh('/git/blobs', { method: 'POST', body: JSON.stringify(body) })).sha;
      }
      const tree = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ tree: Object.entries(shas).map(([p, sha]) => ({ path: p, mode: '100644', type: 'blob', sha })) }) });
      const commit = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message: `Sauvegarde ${new Date().toISOString()}`, tree: tree.sha, parents: [] }) });
      if (refExists) await gh(`/git/refs/heads/${branch}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: true }) });
      else { await gh('/git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }) }); refExists = true; }
    },
  };
}

export function createStore({ dataDir }) {
  const { GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH } = process.env;
  if (GITHUB_TOKEN && GITHUB_REPO) return githubStore({ token: GITHUB_TOKEN, repo: GITHUB_REPO, branch: GITHUB_BRANCH || 'tradesim-data' });
  fs.mkdirSync(dataDir, { recursive: true });
  return localStore(dataDir);
}
