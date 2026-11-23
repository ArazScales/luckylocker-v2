#!/usr/bin/env node
// Local preview server for dist/ that behaves like Cloudflare Pages closely
// enough to test with: it applies the rules in dist/_headers (so the CSP is
// enforced locally), serves folder/index.html for /folder/, redirects /folder
// to /folder/, and answers unknown paths with 404.html and status 404.
//
//   node scripts/serve.mjs [root=dist] [port=8788]
// Binds to 127.0.0.1 only. Zero dependencies.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist');
const port = Number(process.argv[3] ?? 8788);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

// Parse Cloudflare's _headers format: a path pattern line, then indented "Name: value" lines.
async function loadHeaderRules() {
  let text = '';
  try { text = await readFile(join(root, '_headers'), 'utf8'); } catch { return []; }
  const rules = [];
  let cur = null;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) { cur = { pattern: line.trim(), headers: [] }; rules.push(cur); continue; }
    const i = line.indexOf(':');
    if (cur && i > 0) cur.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
  }
  return rules.map((r) => ({ ...r, re: new RegExp('^' + r.pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$') }));
}

async function file(p) {
  try { const s = await stat(p); return s.isFile() ? p : null; } catch { return null; }
}

createServer(async (req, res) => {
  const rules = await loadHeaderRules();
  const url = new URL(req.url, 'http://x');
  let path = decodeURIComponent(url.pathname);
  const target = normalize(join(root, path));
  if (!target.startsWith(root + sep) && target !== root) { res.writeHead(400).end(); return; }

  let found = await file(target);
  if (!found && path.endsWith('/')) found = await file(join(target, 'index.html'));
  if (!found && !path.endsWith('/') && (await file(join(target, 'index.html')))) {
    res.writeHead(308, { Location: path + '/' + url.search }).end();
    return;
  }
  let status = 200;
  if (!found) { found = await file(join(root, '404.html')); status = 404; }

  for (const r of rules) if (r.re.test(path)) for (const [k, v] of r.headers) res.setHeader(k, v);
  if (!found) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
  res.setHeader('Content-Type', TYPES[extname(found)] ?? 'application/octet-stream');
  res.writeHead(status);
  res.end(req.method === 'HEAD' ? undefined : await readFile(found));
}).on('error', (e) => console.error(e)).listen(port, '127.0.0.1', () => console.log(`serving ${root} at http://127.0.0.1:${port}/`));
