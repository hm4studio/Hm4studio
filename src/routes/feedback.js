'use strict';
// Demo girişleri ve görüş (geri bildirim) toplama.
const config = require('../config');
const db = require('../db');
const auth = require('../auth');
const demo = require('../demo');
const { getContent } = require('../content');
const { html, redirect, readForm, send, HttpError } = require('../http');
const views = require('../views/feedback');
const { requireAdmin, checkCsrf, setFlash, takeFlash, toId } = require('./guards');

const ROLES = ['Çift (evlenecek / evli)', 'Fotoğrafçı', 'Aile / arkadaş', 'Diğer'];
const AREAS = ['Genel site', 'Portfolyo', 'Çift paneli', 'Stüdyo (admin) paneli', 'Mobil kullanım'];

// Görüş formu için IP başına saatte 6 gönderim
const sent = new Map();
function tooMany(req) {
  const ip = require('../http').clientIp(req);
  const now = Date.now();
  const list = (sent.get(ip) || []).filter((t) => now - t < 3600 * 1000);
  sent.set(ip, list);
  if (list.length >= 6) return true;
  list.push(now);
  return false;
}

function deviceOf(ua = '') {
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return 'Tablet';
  if (/Mobi|iPhone|Android/i.test(ua)) return 'Telefon';
  return 'Bilgisayar';
}

// Gerçek yönetici (demo hesabı değil) — görüşler ziyaretçilerin özel yorumlarıdır
function requireRealAdmin(req, res) {
  if (!requireAdmin(req, res)) return false;
  if (demo.isDemoAdmin(req)) throw new HttpError(403, 'Görüşler yalnızca stüdyo yöneticisine açıktır.');
  return true;
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function register(router) {
  // ── Tek tıkla demo girişleri ──
  router.post('/demo/cift', (req, res) => {
    const id = config.demoMode ? demo.demoCoupleId() : null;
    if (!id) throw new HttpError(404, 'Bulunamadı');
    auth.startSession(res, 'couple', id);
    redirect(res, '/panel');
  });

  router.post('/demo/admin', (req, res) => {
    if (!config.demoMode) throw new HttpError(404, 'Bulunamadı');
    auth.startSession(res, 'admin', demo.demoAdminId());
    redirect(res, '/admin');
  });

  // ── Görüş formu ──
  router.get('/gorus', (req, res, { query }) => {
    html(res, views.form(getContent(), { roles: ROLES, areas: AREAS, thanks: query.get('tesekkurler') === '1', preArea: query.get('alan') || '' }));
  });

  router.post('/gorus', async (req, res) => {
    const c = getContent();
    const form = await readForm(req);
    if (form.website) return redirect(res, '/gorus?tesekkurler=1'); // bot tuzağı
    const message = String(form.message || '').trim().slice(0, 3000);
    const values = { ...form };
    if (message.length < 3) {
      return html(res, views.form(c, { roles: ROLES, areas: AREAS, error: 'Lütfen kısa da olsa görüşünüzü yazın.', values }), 400);
    }
    if (tooMany(req)) {
      return html(res, views.form(c, { roles: ROLES, areas: AREAS, error: 'Kısa sürede çok fazla gönderim yapıldı. Biraz sonra tekrar deneyin.', values }), 429);
    }
    const rating = Number.parseInt(form.rating, 10);
    db.addFeedback({
      name: String(form.name || '').trim().slice(0, 80),
      role: ROLES.includes(form.role) ? form.role : '',
      area: AREAS.includes(form.area) ? form.area : '',
      rating: rating >= 1 && rating <= 5 ? rating : null,
      message,
      device: deviceOf(req.headers['user-agent']),
    });
    redirect(res, '/gorus?tesekkurler=1');
  });

  // ── Admin: görüşleri incele ──
  router.get('/admin/gorusler', (req, res) => {
    if (!requireRealAdmin(req, res)) return;
    html(res, views.adminList(getContent(), { items: db.listFeedback(), areas: AREAS, csrf: req.session.csrf, flash: takeFlash(req) }));
  });

  router.get('/admin/gorusler.csv', (req, res) => {
    if (!requireRealAdmin(req, res)) return;
    const rows = [['Tarih', 'Ad', 'Rol', 'Bölüm', 'Puan', 'Cihaz', 'Görüş']]
      .concat(db.listFeedback().map((f) => [f.created_at, f.name, f.role, f.area, f.rating ?? '', f.device, f.message]));
    // Excel'in Türkçe karakterleri ve ; ayırıcıyı doğru okuması için BOM + noktalı virgül
    const csv = '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
    send(res, 200, csv, 'text/csv; charset=utf-8', { 'Content-Disposition': 'attachment; filename="hm4-gorusler.csv"', 'Cache-Control': 'no-store' });
  });

  router.post('/admin/gorusler/:id/sil', async (req, res, { params }) => {
    if (!requireRealAdmin(req, res)) return;
    const form = await readForm(req);
    checkCsrf(req, form.csrf);
    db.deleteFeedback(toId(params.id));
    setFlash(req, { message: 'Görüş silindi.', type: 'success' });
    redirect(res, '/admin/gorusler');
  });
}

module.exports = { register };
