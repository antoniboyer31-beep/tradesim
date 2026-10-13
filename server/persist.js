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

function localStore(dataDir) {
  const marketFile = path.join(dataDir, 'market.json.gz');
  const accountFile = path.join(dataDir, 'account.json');
  const legacyFile = path.join(dataDir, 'state.json');
  const writeAtomic = (file, data) => { fs.writeFileSync(file + '.tmp', data); fs.renameSync(file + '.tmp', file); };
  return {
    kind: 'local',
    async load() {
      if (fs.existsSync(marketFile) && fs.existsSync(accountFile)) {
        return { market: JSON.parse(zlib.gunzipSync(fs.readFileSync(marketFile)).toString('utf8')), account: JSON.parse(fs.readFileSync(accountFile, 'utf8')) };
      }
      if (fs.existsSync(legacyFile)) {
        const data = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
        return { market: data.market, account: data.account };
      }
      return null;
    },
    async save({ marketChunks, account }) {
      if (marketChunks) writeAtomic(marketFile, await gzipChunks(marketChunks));
      writeAtomic(accountFile, account);
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
  const blob = async (sha) => {
    const b = await gh(`/git/blobs/${sha}`);
    return Buffer.from(b.content, 'base64');
  };
  let marketSha = null;
  let refExists = false;
  return {
    kind: 'github',
    async load() {
      const ref = await gh(`/git/ref/heads/${branch}`);
      if (!ref) return null;
      refExists = true;
      const commit = await gh(`/git/commits/${ref.object.sha}`);
      const tree = await gh(`/git/trees/${commit.tree.sha}`);
      const m = tree.tree.find((f) => f.path === 'market.json.gz');
      const a = tree.tree.find((f) => f.path === 'account.json');
      if (!m || !a) return null;
      marketSha = m.sha;
      return { market: JSON.parse(zlib.gunzipSync(await blob(m.sha)).toString('utf8')), account: JSON.parse((await blob(a.sha)).toString('utf8')) };
    },
    async save({ marketChunks, account }) {
      if (marketChunks || !marketSha) {
        const gz = await gzipChunks(marketChunks);
        marketSha = (await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: gz.toString('base64'), encoding: 'base64' }) })).sha;
      }
      const accSha = (await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: account, encoding: 'utf-8' }) })).sha;
      const tree = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ tree: [
        { path: 'market.json.gz', mode: '100644', type: 'blob', sha: marketSha },
        { path: 'account.json', mode: '100644', type: 'blob', sha: accSha },
      ] }) });
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
