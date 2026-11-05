'use strict';
// HM4 Studio — sunucu giriş noktası.  Çalıştırmak için:  npm start
const http = require('node:http');
const path = require('node:path');
const config = require('./src/config');
const auth = require('./src/auth');
const { createRouter, sendFile, html, json, HttpError } = require('./src/http');
const { getContent } = require('./src/content');
const publicViews = require('./src/views/public');

const router = createRouter();
require('./src/routes/public').register(router);
require('./src/routes/couple').register(router);
require('./src/routes/admin').register(router);
require('./src/routes/feedback').register(router);
require('./src/routes/leads').register(router);
require('./src/routes/api').register(router);
require('./src/routes/push').register(router);
require('./src/demo').start();
require('./src/backup').start();

// İsteğe bağlı: .env / barındırma panelindeki ADMIN_USERNAME + ADMIN_PASSWORD ile ilk yönetici hesabını oluştur
(function bootstrapAdmin() {
  const db = require('./src/db');
  const u = (process.env.ADMIN_USERNAME || 'hm4studio').trim(), p = (process.env.ADMIN_PASSWORD || '').trim();
  // ADMIN_RESET_PASSWORD=1: şifre unutulduysa, mevcut hesabın şifresi ADMIN_PASSWORD ile değiştirilir
  const reset = process.env.ADMIN_RESET_PASSWORD === '1';
  if (!u || !p || u === 'demo') return;
  const existing = db.findAdminLogin(u);
  if (existing && !reset) return;
  if (p.length < 10) { console.warn('ADMIN_PASSWORD en az 10 karakter olmalı; yönetici oluşturulmadı.'); return; }
  if (existing) db.setAdminPassword(existing.id, auth.hashPassword(p)); else db.upsertAdmin(u, auth.hashPassword(p));
  if (existing) db.deleteSessionsFor('admin', existing.id);
  console.log(existing ? `"${u}" yönetici şifresi sıfırlandı. ADMIN_RESET_PASSWORD ayarını şimdi kaldırın.` : `"${u}" yönetici hesabı oluşturuldu.`);
})();

const PUBLIC_DIR = path.join(config.ROOT, 'public');
const PORTFOLIO_DIR = path.join(config.publicMediaDir, 'portfolio');

// Güvenlik başlıkları
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob: https://*.cdninstagram.com https://*.fbcdn.net",
  "media-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "script-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

function setSecurityHeaders(res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (config.isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const rel = decodeURIComponent(pathname);
  // Uygulama (PWA) dosyaları: servis çalışanı her zaman güncel kontrol edilmeli
  if (rel === '/sw.js' || rel === '/manifest.webmanifest' || rel === '/offline.html') {
    return sendFile(req, res, PUBLIC_DIR, rel.slice(1), { cache: 'no-cache' });
  }
  if (rel === '/css/tema.css') return false; // sitenin renk ayarı: router üretir
  if (rel.startsWith('/css/') || rel.startsWith('/js/') || rel.startsWith('/images/') || rel === '/robots.txt') {
    return sendFile(req, res, PUBLIC_DIR, rel.slice(1), { cache: config.isProd ? 'public, max-age=604800' : 'no-cache' });
  }
  if (rel.startsWith('/media/site/')) {
    return sendFile(req, res, path.join(config.publicMediaDir, 'site'), rel.slice('/media/site/'.length), { cache: 'public, max-age=2592000, immutable' });
  }
  if (rel.startsWith('/media/portfolio/')) {
    return sendFile(req, res, PORTFOLIO_DIR, rel.slice('/media/portfolio/'.length), { cache: 'public, max-age=2592000, immutable' });
  }
  return false;
}

function renderError(req, res, status, message) {
  if (res.headersSent) { res.end(); return; }
  const wantsJson = (req.headers.accept || '').includes('application/json') || req.headers['x-csrf-token'];
  if (wantsJson) return json(res, { ok: false, error: message }, status);
  if (status === 404) return html(res, publicViews.notFound(getContent()), 404);
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(`<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hata</title>
<link rel="stylesheet" href="/css/style.css"><main class="section"><div class="container"><h1 class="page-title">Bir sorun oluştu</h1>
<p class="page-lead">${String(message).replace(/[<>&"]/g, '')}</p><p><a class="btn btn--primary" href="/">Anasayfaya dön</a></p></div></main></html>`);
}

const server = http.createServer(async (req, res) => {
  setSecurityHeaders(res);
  let url;
  try { url = new URL(req.url, 'http://localhost'); }
  catch { res.writeHead(400); res.end(); return; }

  try {
    if (serveStatic(req, res, url.pathname)) return;
    auth.loadSession(req);
    const match = router.match(req.method, url.pathname);
    if (!match) throw new HttpError(404, 'Sayfa bulunamadı');
    for (const handler of match.handlers) {
      await handler(req, res, { params: match.params, query: url.searchParams, url });
      if (res.writableEnded || res.headersSent) break;
    }
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status >= 500) console.error(err);
    renderError(req, res, status, status >= 500 ? 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.' : err.message);
  }
});

server.requestTimeout = 10 * 60 * 1000; // büyük yüklemeler için
server.listen(config.port, () => {
  console.log(`HM4 Studio çalışıyor: ${config.siteUrl}  (port ${config.port})`);
});
