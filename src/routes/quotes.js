'use strict';
// Teklifler: admin hazırlar, çift kendine özel bağlantıdan görür ve kabul eder.
const crypto = require('node:crypto');
const db = require('../db');
const config = require('../config');
const wa = require('../whatsapp');
const push = require('../push');
const demo = require('../demo');
const { getContent } = require('../content');
const { html, redirect, readForm, HttpError } = require('../http');
const { requireAdmin, checkCsrf, setFlash, takeFlash } = require('./guards');
const views = require('../views/quotes');
const { today, addDays } = require('../jobs');

const clean = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const money = (v) => Math.max(0, Math.round(Number(String(v ?? '').replace(/[^\d]/g, '')) || 0));
const cleanDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');

// Formdan teklif bilgisi (seçilen paketlerin o anki fiyatı ve içeriği teklife kopyalanır)
function fromForm(form) {
  const pk = new Set([].concat(form.pk || []).map(String));
  const items = db.listPackages().filter((p) => pk.has(String(p.id))).map((p) => ({ name: p.name, detail: p.detail || '', price: p.price || 0 }));
  for (const i of [1, 2, 3]) {
    const name = clean(form[`x${i}_name`], 80);
    if (name) items.push({ name, detail: '', price: money(form[`x${i}_price`]) });
  }
  const days = Math.min(Math.max(Number(form.validDays) || 7, 1), 90);
  return {
    name: clean(form.name, 80), phone: wa.normalizePhone(form.phone || '') || '', eventType: clean(form.eventType, 40),
    eventDate: cleanDate(form.eventDate), place: clean(form.place, 120), items,
    discount: money(form.discount), deposit: money(form.deposit), note: String(form.note || '').replace(/\r/g, '').trim().slice(0, 1500),
    validUntil: addDays(today(), days), validDays: days,
  };
}
function errorsOf(q) {
  const e = [];
  if (!q.name) e.push('Ad soyad yazın.');
  if (!q.items.length) e.push('En az bir paket seçin ya da bir kalem yazın.');
  return e;
}
// Kayıtlı teklifi forma geri çevirir (düzenleme)
function toForm(q) {
  const items = views.items(q);
  const pk = db.listPackages();
  const values = { name: q.name, phone: q.phone ? wa.displayPhone(q.phone) : '', eventType: q.event_type, eventDate: q.event_date || '', place: q.place, discount: q.discount || '', deposit: q.deposit || '', note: q.note, pk: [] };
  let x = 1;
  for (const it of items) {
    const p = pk.find((k) => k.name === it.name && Number(k.price) === Number(it.price));
    if (p) values.pk.push(String(p.id));
    else if (x <= 3) { values[`x${x}_name`] = it.name; values[`x${x}_price`] = it.price; x++; }
  }
  values.validDays = q.valid_until ? Math.max(1, Math.round((new Date(`${q.valid_until}T12:00:00Z`) - new Date(`${today()}T12:00:00Z`)) / 86400000)) : 7;
  return values;
}

const accepts = new Map(); // ip → zamanlar (kötüye kullanım sınırı)

function register(router) {
  const page = (req, res, extra) => html(res, views.form(getContent(), { packages: db.listPackages().filter((p) => p.active), csrf: req.session.csrf, demoAdmin: demo.isDemoAdmin(req), ...extra }));

  router.get('/admin/teklifler', (req, res) => {
    if (!requireAdmin(req, res)) return;
    html(res, views.list(getContent(), { quotes: db.listQuotes(), csrf: req.session.csrf, today: today(), demoAdmin: demo.isDemoAdmin(req) }));
  });

  router.get('/admin/teklif/yeni', (req, res, { query }) => {
    if (!requireAdmin(req, res)) return;
    const lead = query.get('talep') ? db.getLead(Number(query.get('talep')) || 0) : null;
    const types = getContent().appointments?.eventTypes || [];
    const values = lead ? {
      lead: lead.id, name: lead.name, phone: lead.phone ? wa.displayPhone(lead.phone) : '', eventDate: lead.event_date || '', place: lead.place || '',
      eventType: types.find((t) => lead.service && lead.service.includes(t)) || '',
    } : {};
    page(req, res, { values, action: '/admin/teklif', title: 'Yeni teklif', back: lead ? '/admin/talepler' : '/admin/teklifler' });
  });

  router.post('/admin/teklif', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const form = await readForm(req);
    checkCsrf(req, form.csrf);
    const q = fromForm(form);
    const errors = errorsOf(q);
    if (errors.length) return page(req, res, { values: form, action: '/admin/teklif', title: 'Yeni teklif', back: '/admin/teklifler', errors });
    const lead = form.lead ? db.getLead(Number(form.lead) || 0) : null;
    const id = db.addQuote({ ...q, token: crypto.randomBytes(12).toString('hex'), leadId: lead?.id });
    if (lead && lead.status === 'yeni') db.setLeadStatus(lead.id, 'gorusuldu');
    setFlash(req, { message: 'Teklif hazır. Bağlantıyı çifte gönderin.', type: 'success' });
    redirect(res, `/admin/teklif/${id}`);
  });

  router.get('/admin/teklif/:id', (req, res, { params }) => {
    if (!requireAdmin(req, res)) return;
    const q = db.getQuote(Number(params.id) || 0);
    if (!q) throw new HttpError(404, 'Teklif bulunamadı');
    html(res, views.adminView(getContent(), { q, csrf: req.session.csrf, flash: takeFlash(req), siteUrl: config.siteUrl, today: today(), demoAdmin: demo.isDemoAdmin(req) }));
  });

  router.get('/admin/teklif/:id/duzenle', (req, res, { params }) => {
    if (!requireAdmin(req, res)) return;
    const q = db.getQuote(Number(params.id) || 0);
    if (!q) throw new HttpError(404, 'Teklif bulunamadı');
    page(req, res, { values: toForm(q), action: `/admin/teklif/${q.id}/duzenle`, title: 'Teklifi düzenle', back: `/admin/teklif/${q.id}` });
  });

  router.post('/admin/teklif/:id/duzenle', async (req, res, { params }) => {
    if (!requireAdmin(req, res)) return;
    const old = db.getQuote(Number(params.id) || 0);
    if (!old) throw new HttpError(404, 'Teklif bulunamadı');
    const form = await readForm(req);
    checkCsrf(req, form.csrf);
    const q = fromForm(form);
    const errors = errorsOf(q);
    if (errors.length) return page(req, res, { values: form, action: `/admin/teklif/${old.id}/duzenle`, title: 'Teklifi düzenle', back: `/admin/teklif/${old.id}`, errors });
    db.updateQuote(old.id, q);
    setFlash(req, { message: 'Teklif güncellendi. Bağlantı aynı kaldı.', type: 'success' });
    redirect(res, `/admin/teklif/${old.id}`);
  });

  router.post('/admin/teklif/:id/sil', async (req, res, { params }) => {
    if (!requireAdmin(req, res)) return;
    const form = await readForm(req);
    checkCsrf(req, form.csrf);
    db.deleteQuote(Number(params.id) || 0);
    setFlash(req, { message: 'Teklif silindi.', type: 'success' });
    redirect(res, '/admin/teklifler');
  });

  // ── Çiftin gördüğü sayfa ──
  const byToken = (t) => (/^[a-f0-9]{24}$/.test(String(t)) ? db.quoteByToken(String(t)) : null);

  router.get('/teklif/:token', (req, res, { params, query }) => {
    const q = byToken(params.token);
    if (!q) throw new HttpError(404, 'Teklif bulunamadı');
    // İlk açılış stüdyoya bildirilir (stüdyonun kendi önizlemesi sayılmaz)
    if (req.session?.kind !== 'admin' && !query.get('onizleme') && db.markQuoteViewed(q.id)) {
      push.toAdmin({ title: 'Teklif açıldı', body: `${q.name} teklifinizi görüntüledi.`, url: `/admin/teklif/${q.id}` }).catch(() => {});
    }
    html(res, views.publicPage(getContent(), { q, today: today() }));
  });

  router.post('/teklif/:token', async (req, res, { params }) => {
    const q = byToken(params.token);
    if (!q) throw new HttpError(404, 'Teklif bulunamadı');
    const form = await readForm(req);
    const c = getContent();
    if (form.website) return html(res, views.publicPage(c, { q, today: today(), done: true })); // bot
    const ip = String(req.socket.remoteAddress || '');
    const hits = (accepts.get(ip) || []).filter((t) => Date.now() - t < 3600 * 1000);
    if (hits.length > 10) throw new HttpError(429, 'Kısa sürede çok fazla deneme yapıldı.');
    accepts.set(ip, [...hits, Date.now()]);
    if (q.status === 'kabul') return html(res, views.publicPage(c, { q, today: today(), done: true }));
    if (q.valid_until && q.valid_until < today()) return html(res, views.publicPage(c, { q, today: today() }));
    const name = clean(form.name, 80);
    const phone = wa.normalizePhone(form.phone || '');
    if (!name || !phone || form.kvkk !== '1') return html(res, views.publicPage(c, { q, today: today(), error: 'Adınızı, geçerli bir telefon numarası ve onay kutusunu doldurun.' }), 400);
    if (db.acceptQuote(q.id, name, phone)) {
      if (q.lead_id) db.setLeadStatus(q.lead_id, 'rezervasyon');
      push.toAdmin({ title: 'Teklif kabul edildi', body: `${name} teklifi kabul etti (${views.total(q).toLocaleString('tr-TR')} ₺). Randevuya çevirebilirsiniz.`, url: `/admin/teklif/${q.id}` }).catch(() => {});
    }
    html(res, views.publicPage(c, { q: db.getQuote(q.id), today: today(), done: true }));
  });
}

module.exports = { register };
