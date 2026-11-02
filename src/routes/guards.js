'use strict';
// Erişim kontrolleri ve tek seferlik bildirimler (flash).
const auth = require('../auth');
const { HttpError, redirect } = require('../http');

function requireAdmin(req, res) {
  if (req.session?.kind === 'admin') return true;
  redirect(res, '/admin/giris');
  return false;
}

function requireCouple(req, res) {
  if (req.session?.kind === 'couple') return true;
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

function toId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(404, 'Bulunamadı');
  return n;
}

module.exports = { requireAdmin, requireCouple, checkCsrf, setFlash, takeFlash, slugify, toId };
