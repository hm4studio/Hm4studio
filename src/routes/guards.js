'use strict';
// Erişim kontrolleri ve tek seferlik bildirimler (flash).
const auth = require('../auth');
const { HttpError, redirect } = require('../http');

function requireAdmin(req, res) {
  if (req.session?.kind === 'admin') return true;
  redirect(res, '/admin/giris');
  return false;
}

// Panele giriş takibi (yönetici çift gibi bakınca sayılmaz); veritabanına en fazla 5 dakikada bir yazılır
const seen = new Map();
function markSeen(id) {
  const now = Date.now();
  if (!id || now - (seen.get(id) || 0) < 5 * 60 * 1000) return;
  seen.set(id, now);
  try { require('../db').touchCouple(id); } catch (err) { console.error('Giriş kaydı:', err.message); }
}
function requireCouple(req, res) {
  if (req.session?.kind === 'couple') { markSeen(req.session.userId); return true; }
  redirect(res, '/giris');
  return false;
}

// Formlar "csrf" alanıyla, fetch istekleri "X-CSRF-Token" başlığıyla doğrulanır
function checkCsrf(req, token) {
  if (!auth.csrfValid(req, token ?? req.headers['x-csrf-token'])) {
    throw new HttpError(403, 'Oturum doğrulanamadı. Sayfayı yenileyip tekrar deneyin.');
  }
}

// Bir sonraki sayfa görüntülemesinde bir kez gösterilecek mesajlar
const flashes = new Map();
function setFlash(req, data) {
  if (req.session) flashes.set(req.session.csrf, { ...data, at: Date.now() });
}
function takeFlash(req) {
  if (!req.session) return null;
  const f = flashes.get(req.session.csrf);
  flashes.delete(req.session.csrf);
  return f && Date.now() - f.at < 10 * 60 * 1000 ? f : null;
}

// Türkçe karakterleri sadeleştirerek URL dostu kod üretir
function slugify(str) {
  const map = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
  return String(str)
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıiöşüâîû]/g, (ch) => map[ch] || ch)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

// Kısa ve akılda kalıcı erişim kodu: çiftin adları (ör. busra-oguz). Doluysa yıl, sonra sayı eklenir.
function uniqueAccessCode(name, year, taken) {
  const base = slugify(name) || 'cift';
  const tries = [base, `${base}-${year}`, ...Array.from({ length: 50 }, (_, i) => `${base}-${i + 2}`)];
  for (const c of tries) if (c.length >= 3 && !taken(c)) return c;
  return `${base}-${Date.now().toString(36)}`;
}

function toId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(404, 'Bulunamadı');
  return n;
}

module.exports = { uniqueAccessCode, requireAdmin, requireCouple, checkCsrf, setFlash, takeFlash, slugify, toId };
