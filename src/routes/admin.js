'use strict';
// Yönetim paneli: çiftler, fotoğraf yükleme, favoriler, iş aşamaları, portfolyo, hesap.
const crypto = require('node:crypto');
const db = require('../db');
const auth = require('../auth');
const media = require('../media');
const config = require('../config');
const { getContent } = require('../content');
const { html, json, redirect, readForm, readJson, readBody, HttpError } = require('../http');
const panelViews = require('../views/panel');
const views = require('../views/admin');
const { portfolioItems } = require('./public');
const { requireAdmin, checkCsrf, setFlash, takeFlash, slugify, toId } = require('./guards');
const demo = require('../demo');
const { addDays } = require('../jobs');

const newKey = () => crypto.randomBytes(16).toString('hex');

function getCoupleOr404(id) {
  const couple = db.getCouple(toId(id));
  if (!couple) throw new HttpError(404, 'Bulunamadı');
  return couple;
}

function cleanText(v, max) {
  return String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanDate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null;
}

// Fetch ile yapılan admin isteklerinde oturum ve CSRF kontrolü
function apiGuard(req) {
  if (req.session?.kind !== 'admin') throw new HttpError(401, 'Oturum gerekli');
  checkCsrf(req);
}

async function formGuard(req, res) {
  if (!requireAdmin(req, res)) return null;
  const form = await readForm(req);
  checkCsrf(req, form.csrf);
  return form;
}

function register(router) {
  // ── Giriş ──
  router.get('/admin/giris', (req, res) => {
    if (req.session?.kind === 'admin') return redirect(res, '/admin');
    html(res, panelViews.adminLogin(getContent(), { noAdmin: db.countAdmins() === 0 }));
  });

  router.post('/admin/giris', async (req, res) => {
    const c = getContent();
    const form = await readForm(req);
    const username = cleanText(form.username, 60);
    if (auth.isRateLimited(req)) {
      return html(res, panelViews.adminLogin(c, { error: 'Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin.', values: { code: username } }), 429);
    }
    const admin = db.getAdminByUsername(username);
    const ok = auth.verifyPassword(form.password || '', admin ? admin.password_hash : auth.DUMMY_HASH);
    if (!admin || !ok) {
      auth.recordFailure(req);
      return html(res, panelViews.adminLogin(c, { error: 'Kullanıcı adı veya şifre hatalı.', values: { code: username } }), 401);
    }
    auth.clearFailures(req);
    auth.startSession(res, 'admin', admin.id);
    redirect(res, '/admin');
  });

  // ── Çiftler ──
  router.get('/admin', (req, res) => {
    if (!requireAdmin(req, res)) return;
    html(res, views.dashboard(getContent(), { couples: db.listCouples(), csrf: req.session.csrf, flash: takeFlash(req), demoAdmin: demo.isDemoAdmin(req) }));
  });

  router.post('/admin/ciftler', async (req, res) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const name = cleanText(form.name, 120);
    if (!name) {
      setFlash(req, { message: 'Çiftin adını yazın.', type: 'error' });
      return redirect(res, '/admin');
    }
    let code = slugify(form.code || '');
    if (code && code.length < 3) code = '';
    if (!code) code = `${slugify(name) || 'cift'}-${crypto.randomInt(1000, 9999)}`;
    if (db.getCoupleByCode(code)) {
      setFlash(req, { message: `"${code}" erişim kodu zaten kullanılıyor. Başka bir kod deneyin.`, type: 'error' });
      return redirect(res, '/admin');
    }
    const password = String(form.password || '').trim().length >= 8 ? String(form.password).trim() : auth.friendlyPassword(10);
    const eventDate = cleanDate(form.eventDate);
    const id = db.createCouple({ name, accessCode: code, hash: auth.hashPassword(password), eventDate });
    if (eventDate) db.setCoupleDue(id, addDays(eventDate, 45)); // varsayılan teslim: çekimden 45 gün sonra
    setFlash(req, {
      message: `${name} eklendi.`,
      type: 'success',
      credentials: { url: `${config.siteUrl}/giris`, code, password },
    });
    redirect(res, `/admin/ciftler/${id}`);
  });

  router.get('/admin/ciftler/:id', (req, res, { params, query }) => {
    if (!requireAdmin(req, res)) return;
    const couple = getCoupleOr404(params.id);
    const all = db.listPhotos(couple.id);
    const favs = all.filter((p) => p.is_fav);
    const view = query.get('g') === 'fav' ? 'fav' : 'all';
    html(res, views.coupleDetail(getContent(), {
      couple,
      photos: view === 'fav' ? favs : all,
      totalCount: all.length,
      favCount: favs.length,
      view,
      csrf: req.session.csrf,
      flash: takeFlash(req),
      loginUrl: `${config.siteUrl}/giris`,
      demoAdmin: demo.isDemoAdmin(req),
    }));
  });

  router.post('/admin/ciftler/:id/asama', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const couple = getCoupleOr404(params.id);
    const stages = getContent().stages;
    const stage = Math.min(Math.max(Number.parseInt(form.stage, 10) || 0, 0), stages.length - 1);
    db.setCoupleStage(couple.id, stage, String(form.note || '').trim().slice(0, 500));
    setFlash(req, { message: `Aşama güncellendi: ${stages[stage]}`, type: 'success' });
    redirect(res, `/admin/ciftler/${couple.id}`);
  });

  router.post('/admin/ciftler/:id/bilgi', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const couple = getCoupleOr404(params.id);
    const name = cleanText(form.name, 120) || couple.name;
    const albumLimit = Math.min(Math.max(Number.parseInt(form.albumLimit, 10) || couple.album_limit, 1), 1000);
    db.updateCouple(couple.id, { name, eventDate: cleanDate(form.eventDate), dueDate: cleanDate(form.dueDate), albumLimit });
    setFlash(req, { message: 'Bilgiler güncellendi.', type: 'success' });
    redirect(res, `/admin/ciftler/${couple.id}`);
  });

  // Albüm seçimi kilidini aç / kapat
  router.post('/admin/ciftler/:id/album-kilit', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const couple = getCoupleOr404(params.id);
    const locked = form.locked === '1';
    db.setAlbumLocked(couple.id, locked);
    setFlash(req, { message: locked ? 'Albüm seçimi kilitlendi.' : 'Kilit açıldı; çift yeniden seçim yapabilir.', type: 'success' });
    redirect(res, `/admin/ciftler/${couple.id}`);
  });

  // İş takvimi
  router.get('/admin/takvim', (req, res) => {
    if (!requireAdmin(req, res)) return;
    html(res, views.calendar(getContent(), { couples: db.listCouples(), csrf: req.session.csrf, demoAdmin: demo.isDemoAdmin(req) }));
  });

  router.post('/admin/ciftler/:id/sifre', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const couple = getCoupleOr404(params.id);
    const password = auth.friendlyPassword(10);
    db.setCouplePassword(couple.id, auth.hashPassword(password));
    db.deleteSessionsFor('couple', couple.id); // açık oturumları kapat
    setFlash(req, {
      message: 'Yeni şifre oluşturuldu. Eski şifre artık çalışmaz.',
      type: 'success',
      credentials: { url: `${config.siteUrl}/giris`, code: couple.access_code, password },
    });
    redirect(res, `/admin/ciftler/${couple.id}`);
  });

  router.post('/admin/ciftler/:id/sil', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const couple = getCoupleOr404(params.id);
    db.deleteSessionsFor('couple', couple.id);
    db.deleteCouple(couple.id);
    media.removeCoupleFolder(couple.id);
    setFlash(req, { message: `${couple.name} silindi.`, type: 'success' });
    redirect(res, '/admin');
  });

  // Fotoğraf yükleme (admin.js tarayıcıda küçültüp gönderir)
  router.post('/admin/ciftler/:id/fotograflar', async (req, res, { params }) => {
    apiGuard(req);
    const couple = getCoupleOr404(params.id);
    if (config.demoMode && db.listPhotos(couple.id).length >= config.demoMaxPhotos) {
      throw new HttpError(400, `Demoda bir çifte en fazla ${config.demoMaxPhotos} fotoğraf yüklenebilir.`);
    }
    const body = await readBody(req, config.maxUploadBytes);
    const parts = media.splitParts(req, body);
    const fileKey = newKey();
    const originalName = cleanText(decodeURIComponent(String(req.headers['x-filename'] || '')), 160);
    media.saveCouplePhoto(couple.id, fileKey, parts);
    const id = db.addPhoto({ coupleId: couple.id, fileKey, originalName, originalExt: parts.originalExt });
    json(res, { ok: true, id });
  });

  router.post('/admin/ciftler/:id/fotograflar/:pid/sil', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const couple = getCoupleOr404(params.id);
    const photo = db.getPhoto(toId(params.pid));
    if (!photo || photo.couple_id !== couple.id) throw new HttpError(404, 'Bulunamadı');
    db.deletePhoto(photo.id);
    media.removeCouplePhoto(couple.id, photo.file_key);
    setFlash(req, { message: 'Fotoğraf silindi.', type: 'success' });
    redirect(res, `/admin/ciftler/${couple.id}`);
  });

  router.post('/admin/ciftler/:id/favori', async (req, res, { params }) => {
    apiGuard(req);
    const couple = getCoupleOr404(params.id);
    const { photoId, on } = await readJson(req);
    const photo = db.getPhoto(toId(photoId));
    if (!photo || photo.couple_id !== couple.id) throw new HttpError(404, 'Bulunamadı');
    db.setFavorite(couple.id, photo.id, Boolean(on));
    json(res, { ok: true, on: Boolean(on), count: db.listFavoritePhotos(couple.id).length });
  });

  // ── Portfolyo ──
  router.get('/admin/portfolyo', (req, res) => {
    if (!requireAdmin(req, res)) return;
    html(res, views.portfolioAdmin(getContent(), {
      items: portfolioItems(),
      heroId: Number(db.getSetting('hero_portfolio_id')) || null,
      csrf: req.session.csrf,
      flash: takeFlash(req),
      demoAdmin: demo.isDemoAdmin(req),
    }));
  });

  router.post('/admin/portfolyo', async (req, res) => {
    apiGuard(req);
    if (config.demoMode && db.listPortfolio().length >= config.demoMaxPhotos) {
      throw new HttpError(400, `Demoda portfolyoya en fazla ${config.demoMaxPhotos} fotoğraf yüklenebilir.`);
    }
    const body = await readBody(req, config.maxUploadBytes);
    const parts = media.splitParts(req, body);
    const fileKey = newKey();
    const cats = getContent().portfolio.categories;
    const category = decodeURIComponent(String(req.headers['x-category'] || ''));
    media.savePortfolioPhoto(fileKey, parts);
    const id = db.addPortfolioItem({ fileKey, category: cats.includes(category) ? category : '', alt: '' });
    json(res, { ok: true, id });
  });

  router.post('/admin/portfolyo/:id', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const item = db.getPortfolioItem(toId(params.id));
    if (!item) throw new HttpError(404, 'Bulunamadı');
    const cats = getContent().portfolio.categories;
    db.updatePortfolioItem(item.id, { category: cats.includes(form.category) ? form.category : '', alt: cleanText(form.alt, 160) });
    setFlash(req, { message: 'Kaydedildi.', type: 'success' });
    redirect(res, '/admin/portfolyo');
  });

  router.post('/admin/portfolyo/:id/kapak', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const item = db.getPortfolioItem(toId(params.id));
    if (!item) throw new HttpError(404, 'Bulunamadı');
    db.setSetting('hero_portfolio_id', String(item.id));
    setFlash(req, { message: 'Anasayfa kapak fotoğrafı güncellendi.', type: 'success' });
    redirect(res, '/admin/portfolyo');
  });

  router.post('/admin/portfolyo/:id/sil', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const item = db.getPortfolioItem(toId(params.id));
    if (!item) throw new HttpError(404, 'Bulunamadı');
    db.deletePortfolioItem(item.id);
    media.removePortfolioPhoto(item.file_key);
    if (Number(db.getSetting('hero_portfolio_id')) === item.id) db.setSetting('hero_portfolio_id', '');
    setFlash(req, { message: 'Fotoğraf portfolyodan silindi.', type: 'success' });
    redirect(res, '/admin/portfolyo');
  });

  // ── Hesap ──
  router.get('/admin/hesap', (req, res) => {
    if (!requireAdmin(req, res)) return;
    html(res, views.account(getContent(), { admin: db.getAdmin(req.session.userId), csrf: req.session.csrf, flash: takeFlash(req), demoAdmin: demo.isDemoAdmin(req) }));
  });

  router.post('/admin/hesap', async (req, res) => {
    const form = await formGuard(req, res);
    if (!form) return;
    if (demo.isDemoAdmin(req)) {
      setFlash(req, { message: 'Demo hesabında şifre değiştirilemez.', type: 'error' });
      return redirect(res, '/admin/hesap');
    }
    const admin = db.getAdminByUsername(db.getAdmin(req.session.userId).username);
    if (!auth.verifyPassword(form.current || '', admin.password_hash)) {
      setFlash(req, { message: 'Mevcut şifre hatalı.', type: 'error' });
    } else if (String(form.next || '').length < 10) {
      setFlash(req, { message: 'Yeni şifre en az 10 karakter olmalı.', type: 'error' });
    } else {
      db.setAdminPassword(admin.id, auth.hashPassword(form.next));
      setFlash(req, { message: 'Şifreniz değiştirildi.', type: 'success' });
    }
    redirect(res, '/admin/hesap');
  });
}

module.exports = { register };
