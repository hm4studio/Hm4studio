'use strict';
// Küçük HTTP yardımcıları: yönlendirici, gövde okuma, yanıt gönderme, statik dosya.
const fs = require('node:fs');
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ── Yönlendirici: '/admin/couples/:id' gibi kalıplar ──
function createRouter() {
  const routes = [];
  const add = (method) => (pattern, ...handlers) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/\/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
    routes.push({ method, re, keys, handlers });
  };
  return {
    get: add('GET'),
    post: add('POST'),
    match(method, pathname) {
      for (const r of routes) {
        if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) continue;
        const m = r.re.exec(pathname);
        if (!m) continue;
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        return { handlers: r.handlers, params };
      }
      return null;
    },
  };
}

// ── İstek gövdesi ──
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > limit) { reject(new HttpError(413, 'Dosya çok büyük.')); req.resume(); return; }
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'Dosya çok büyük.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readForm(req) {
  const buf = await readBody(req, 1024 * 1024);
  const params = new URLSearchParams(buf.toString('utf8'));
  const out = {};
  for (const [k, v] of params) out[k] = v;
  return out;
}

async function readJson(req) {
  const buf = await readBody(req, 256 * 1024);
  try { return JSON.parse(buf.toString('utf8') || '{}'); }
  catch { throw new HttpError(400, 'Geçersiz istek.'); }
}

// ── Yanıtlar ──
function send(res, status, body, type = 'text/html; charset=utf-8', extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': type, ...extraHeaders });
  res.end(body);
}
const html = (res, body, status = 200) => send(res, status, body, 'text/html; charset=utf-8', { 'Cache-Control': 'no-store' });
const json = (res, data, status = 200) => send(res, status, JSON.stringify(data), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
function redirect(res, location, status = 303) {
  res.writeHead(status, { Location: location });
  res.end();
}

// Klasör dışına çıkmayı engelleyerek dosya gönderir
function sendFile(req, res, baseDir, relPath, { cache = 'public, max-age=86400', download } = {}) {
  const base = path.resolve(baseDir);
  const full = path.resolve(base, '.' + path.sep + relPath);
  if (!full.startsWith(base + path.sep)) return false;
  let stat;
  try { stat = fs.statSync(full); } catch { return false; }
  if (!stat.isFile()) return false;
  const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const headers = {
    'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': cache,
    ETag: etag,
  };
  if (download) headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(download)}`;
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag, 'Cache-Control': cache }); res.end(); return true; }
  res.writeHead(200, headers);
  if (req.method === 'HEAD') { res.end(); return true; }
  fs.createReadStream(full).pipe(res);
  return true;
}

module.exports = { MIME, HttpError, createRouter, readBody, readForm, readJson, send, html, json, redirect, sendFile };
