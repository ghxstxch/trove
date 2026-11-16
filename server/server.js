#!/usr/bin/env node
/*
 * Trove sync server — zero dependencies, Node 18+. MIT License.
 * Serves the web app and a token-protected sync API, storing data in a JSON file.
 *
 * Env vars:
 *   TROVE_TOKEN   (required) shared secret the apps use to sync
 *   PORT          default 8080
 *   DATA_DIR      default ./data
 *   WEB_DIR       default ../web
 *   CORS_ORIGIN   default *  (the Android app needs CORS)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = +process.env.PORT || 8080;
const TOKEN = process.env.TROVE_TOKEN || '';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const WEB_DIR = path.resolve(process.env.WEB_DIR || path.join(__dirname, '..', 'web'));
const CORS = process.env.CORS_ORIGIN || '*';
const DB_FILE = path.join(DATA_DIR, 'trove.json');
const MAX_BODY = 50 * 1024 * 1024; // photos are inline, allow big syncs

if (!TOKEN || TOKEN.length < 12) {
  console.error('Set TROVE_TOKEN to a secret of at least 12 characters (e.g. `openssl rand -hex 24`).');
  process.exit(1);
}

/* ---------- storage ---------- */
fs.mkdirSync(DATA_DIR, { recursive: true });
let state = { seq: 0, items: {} };
try { state = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }

let writing = Promise.resolve();
function persist() {
  const snapshot = JSON.stringify(state);
  writing = writing.then(async () => {
    const tmp = DB_FILE + '.tmp';
    await fs.promises.writeFile(tmp, snapshot);
    await fs.promises.rename(tmp, DB_FILE); // atomic replace
  }).catch(err => console.error('write failed', err));
  return writing;
}

function validItem(it) {
  return it && typeof it === 'object' && typeof it.id === 'string' && it.id.length <= 100 &&
    (it.kind === 'cat' || it.kind === 'entry') && Number.isFinite(it.updatedAt);
}

/* ---------- http helpers ---------- */
function send(res, code, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(code, {
    'Access-Control-Allow-Origin': CORS,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    ...(isJson ? { 'Content-Type': 'application/json' } : {}),
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

function authed(req) {
  const h = req.headers.authorization || '';
  const got = Buffer.from(h.startsWith('Bearer ') ? h.slice(7) : '');
  const want = Buffer.from(TOKEN);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon' };

function serveStatic(req, res, urlPath) {
  let p = decodeURIComponent(urlPath);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(WEB_DIR, path.normalize(p));
  if (!file.startsWith(WEB_DIR + path.sep)) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
    send(res, 200, buf, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': file.endsWith('sw.js') ? 'no-cache' : 'public, max-age=300',
    });
  });
}

/* ---------- sync ---------- */
async function handleSync(req, res) {
  if (!authed(req)) return send(res, 401, { error: 'unauthorized' });
  let body;
  try { body = JSON.parse(await readBody(req)); }
  catch (e) { return send(res, e.code === 413 ? 413 : 400, { error: e.code === 413 ? 'payload too large' : 'bad json' }); }

  const since = Number(body.since) || 0;
  const changes = Array.isArray(body.changes) ? body.changes : [];
  let accepted = 0;
  for (const it of changes) {
    if (!validItem(it)) continue;
    const cur = state.items[it.id];
    if (!cur || it.updatedAt >= cur.updatedAt) {   // last write wins
      state.items[it.id] = { ...it, _seq: ++state.seq };
      accepted++;
    }
  }
  if (accepted) await persist();

  const out = [];
  for (const it of Object.values(state.items)) {
    if (it._seq > since) { const { _seq, ...rest } = it; out.push(rest); }
  }
  send(res, 200, { seq: state.seq, accepted, items: out });
}

/* ---------- Dawarich proxy (browsers can't call Dawarich directly: it sends no CORS headers) ---------- */
async function handleDawarich(req, res) {
  if (!authed(req)) return send(res, 401, { error: 'unauthorized' });
  let body;
  try { body = JSON.parse(await readBody(req)); } catch { return send(res, 400, { error: 'bad json' }); }
  let target;
  try {
    target = new URL('/api/v1/visits', String(body.url));
    if (!/^https?:$/.test(target.protocol)) throw new Error('bad protocol');
  } catch { return send(res, 400, { error: 'bad Dawarich URL' }); }
  for (const k of ['start_at', 'end_at', 'page', 'per_page']) {
    if (body.params && body.params[k] != null) target.searchParams.set(k, String(body.params[k]));
  }
  try {
    const r = await fetch(target, { headers: { Authorization: 'Bearer ' + String(body.apiKey || ''), Accept: 'application/json' },
      signal: AbortSignal.timeout(20000) });
    const text = await r.text();
    send(res, r.status, text, { 'Content-Type': 'application/json' });
  } catch (err) {
    send(res, 502, { error: 'Could not reach Dawarich: ' + (err.cause?.code || err.message) });
  }
}

/* ---------- server ---------- */
const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS') return send(res, 204, '');
    if (pathname === '/api/health') return send(res, 200, { ok: true, app: 'trove' });
    if (pathname === '/api/sync' && req.method === 'POST') return await handleSync(req, res);
    if (pathname === '/api/dawarich/visits' && req.method === 'POST') return await handleDawarich(req, res);
    if (pathname.startsWith('/api/')) return send(res, 404, { error: 'not found' });
    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, pathname);
    send(res, 405, 'Method not allowed');
  } catch (err) {
    console.error(err);
    if (!res.headersSent) send(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, () => console.log(`Trove listening on :${PORT} (data: ${DB_FILE})`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => writing.finally(() => process.exit(0)));
