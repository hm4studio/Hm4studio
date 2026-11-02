'use strict';
// Şifreleme, oturum ve güvenlik yardımcıları.
const crypto = require('node:crypto');
const config = require('./config');
const db = require('./db');

const COOKIE = 'hm4_sid';

// ── Şifreler: scrypt + tuz, sabit zamanlı karşılaştırma ──
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, saltHex, keyHex] = stored.split('$');
  const expected = Buffer.from(keyHex, 'hex');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, actual);
}

// Sahte hash: kullanıcı yoksa da aynı sürede yanıt vermek için
const DUMMY_HASH = hashPassword(crypto.randomBytes(8).toString('hex'));

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

// Okunması kolay rastgele şifre (çiftlere vermek için): karışabilen karakterler çıkarıldı
function friendlyPassword(len = 10) {
  const chars = 'abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

// Çerezdeki oturum anahtarı veritabanına doğrudan yazılmaz; HMAC'i saklanır.
function hashSid(sid) {
  return crypto.createHmac('sha256', config.sessionSecret).update(sid).digest('hex');
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookieHeader(value, maxAgeSec) {
  const parts = [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (config.isProd) parts.push('Secure');
  return parts.join('; ');
}

function startSession(res, kind, userId) {
  const sid = randomToken();
  const csrf = randomToken(24);
  const maxAge = config.sessionDays * 24 * 3600;
  db.createSession(hashSid(sid), kind, userId, csrf, Date.now() + maxAge * 1000);
  res.setHeader('Set-Cookie', cookieHeader(sid, maxAge));
}

function endSession(req, res) {
  const sid = parseCookies(req)[COOKIE];
  if (sid) db.deleteSession(hashSid(sid));
  res.setHeader('Set-Cookie', cookieHeader('', 0));
}

// Uygulamadan (ana ekrana eklenen) açılıp açılmadığı: /uygulama ziyaretinde işaretlenir
function isApp(req) {
  return parseCookies(req).hm4_app === '1';
}

// İsteğe bağlı oturumu yükler: req.session = { kind, userId, csrf } veya null
function loadSession(req) {
  const sid = parseCookies(req)[COOKIE];
  req.session = null;
  if (!sid) return;
  const row = db.getSession(hashSid(sid));
  if (row) req.session = { kind: row.kind, userId: row.user_id, csrf: row.csrf };
}

function csrfValid(req, token) {
  if (!req.session || !token) return false;
  const a = Buffer.from(String(token));
  const b = Buffer.from(req.session.csrf);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ── Basit giriş denemesi sınırlayıcı (IP başına 15 dakikada 10 hatalı deneme) ──
const attempts = new Map();
const WINDOW = 15 * 60 * 1000;
const LIMIT = 10;

function clientIp(req) {
  // Bir ters vekil (proxy) arkasındaysanız X-Forwarded-For'u yalnızca güvendiğiniz proxy ayarlar.
  return req.socket.remoteAddress || 'unknown';
}

function isRateLimited(req) {
  const rec = attempts.get(clientIp(req));
  return !!rec && rec.count >= LIMIT && Date.now() - rec.first < WINDOW;
}

function recordFailure(req) {
  const ip = clientIp(req);
  const rec = attempts.get(ip);
  if (!rec || Date.now() - rec.first > WINDOW) attempts.set(ip, { count: 1, first: Date.now() });
  else rec.count++;
}

function clearFailures(req) {
  attempts.delete(clientIp(req));
}

setInterval(() => {
  db.purgeSessions();
  const now = Date.now();
  for (const [ip, rec] of attempts) if (now - rec.first > WINDOW) attempts.delete(ip);
}, 60 * 60 * 1000).unref();

module.exports = {
  hashPassword, verifyPassword, DUMMY_HASH, randomToken, friendlyPassword,
  startSession, endSession, loadSession, csrfValid, parseCookies, isApp,
  isRateLimited, recordFailure, clearFailures,
};
