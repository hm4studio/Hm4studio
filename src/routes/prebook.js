'use strict';
// Ön randevular: tarihi henüz belli olmayan çekimler (ör. dış çekim "Nisan gibi").
// Tahmini tarihten 2 hafta önce "tarihi netleştirin" hatırlatması kurulur; kesinleşince gerçek randevuya çevrilir.
const db = require('../db');
const wa = require('../whatsapp');
const demo = require('../demo');
const { getContent } = require('../content');
const { html, redirect, readForm, HttpError } = require('../http');
const { requireAdmin, checkCsrf, setFlash, takeFlash } = require('./guards');
const { formatDate } = require('../views/panel');
const views = require('../views/admin');
const { money } = require('../appointments');
const { today, addDays } = require('../jobs');

const clean = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const okDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
const MONTHS = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];
const SEASONS = [['sonbahar', 9], ['ilkbahar', 3], ['bahar', 3], ['yaz', 6], ['kış', 12]];

// "Nisan 2027", "10–25 Mayıs", "Bahar" → en erken tarih (YYYY-AA-GG). Anlaşılmazsa boş.
function guessDate(text, t = today()) {
  const s = String(text || '').toLocaleLowerCase('tr-TR');
  let month = MONTHS.findIndex((m) => s.includes(m)) + 1;
  let day = 1;
  if (month) {
    const d = /(\d{1,2})\s*(?:[-–—/]\s*\d{1,2}\s*)?[a-zçğıöşü]*\s*(?:ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)/.exec(s);
    if (d && Number(d[1]) >= 1 && Number(d[1]) <= 31) day = Number(d[1]);
  } else {
    const se = SEASONS.find(([w]) => s.includes(w));
    if (!se) return '';
    month = se[1];
  }
  const y = /\b(20\d\d)\b/.exec(s);
  let year = y ? Number(y[1]) : Number(t.slice(0, 4));
  const iso = (yy) => `${yy}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (!y && iso(year) < t.slice(0, 7) + '-01') year += 1; // geçmiş ay → gelecek yıl
  return iso(year);
}

function fromForm(f) {
  const estText = clean(f.estText, 80);
  return {
    name: clean(f.name, 120), phone: wa.normalizePhone(f.phone || '') || '', eventType: clean(f.eventType, 60),
    estText, estDate: okDate(f.estDate) || guessDate(estText),
    price: money(f.price), deposit: money(f.deposit), note: String(f.note || '').replace(/\r/g, '').trim().slice(0, 600),
  };
}

// Hatırlatma: tahmini tarihten 14 gün önce (geçmişse yarın)
function syncReminder(id, p) {
  const old = p.reminder_id ? db.getReminder(p.reminder_id) : null;
  if (!p.est_date) { if (old && !old.done_at) db.doneReminder(old.id); return; }
  const due = [addDays(p.est_date, -14), addDays(today(), 1)].sort().pop();
  const r = { title: `${p.name}: ${(p.event_type || 'çekim').toLocaleLowerCase('tr-TR')} tarihini netleştirin`, dueDate: due, person: p.name, phone: p.phone || '', note: `Ön randevu · tahmini ${p.est_text || p.est_date}` };
  if (old && !old.done_at) db.updateReminder(old.id, r);
  else db.setPrebookingReminder(id, db.addReminder(r));
}
function closeReminder(p) { if (p?.reminder_id) db.doneReminder(p.reminder_id); }

function register(router) {
  const c = () => getContent();
  const formPage = (req, res, extra, status = 200) => html(res, views.prebookForm(c(), { csrf: req.session.csrf, demoAdmin: demo.isDemoAdmin(req), ...extra }), status);

  router.get('/admin/on-randevu', (req, res) => {
    if (!requireAdmin(req, res)) return;
    html(res, views.prebookList(c(), { list: db.openPrebookings(), csrf: req.session.csrf, demoAdmin: demo.isDemoAdmin(req), flash: takeFlash(req) }));
  });

  router.get('/admin/on-randevu/yeni', (req, res) => {
    if (!requireAdmin(req, res)) return;
    formPage(req, res, { values: { eventType: 'Dış çekim' }, action: '/admin/on-randevu', title: 'Yeni ön randevu' });
  });

  router.post('/admin/on-randevu', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const form = await readForm(req);
    checkCsrf(req, form.csrf);
    const x = fromForm(form);
    if (!x.name) return formPage(req, res, { values: form, action: '/admin/on-randevu', title: 'Yeni ön randevu', errors: ['Çiftin adını yazın.'] }, 400);
    const id = db.addPrebooking(x);
    syncReminder(id, db.getPrebooking(id));
    const due = db.getReminder(db.getPrebooking(id).reminder_id || 0)?.due_date;
    setFlash(req, { message: due ? `Ön randevu kaydedildi. ${formatDate(due)} günü “tarihi netleştirin” hatırlatması gelecek.` : 'Ön randevu kaydedildi. Tahmini tarih anlaşılamadı; hatırlatma için tarih seçebilirsiniz.', type: 'success' });
    redirect(res, '/admin/on-randevu');
  });

  router.get('/admin/on-randevu/:id', (req, res, { params }) => {
    if (!requireAdmin(req, res)) return;
    const p = db.getPrebooking(Number(params.id) || 0);
    if (!p || p.couple_id) throw new HttpError(404, 'Ön randevu bulunamadı');
    formPage(req, res, { id: p.id, values: { name: p.name, phone: p.phone ? wa.displayPhone(p.phone) : '', eventType: p.event_type || '', estText: p.est_text || '', estDate: p.est_date || '', price: p.price || '', deposit: p.deposit || '', note: p.note || '' }, action: `/admin/on-randevu/${p.id}`, title: 'Ön randevuyu düzenle' });
  });

  router.post('/admin/on-randevu/:id', async (req, res, { params }) => {
    if (!requireAdmin(req, res)) return;
    const p = db.getPrebooking(Number(params.id) || 0);
    if (!p || p.couple_id) throw new HttpError(404, 'Ön randevu bulunamadı');
    const form = await readForm(req);
    checkCsrf(req, form.csrf);
    const x = fromForm(form);
    if (!x.name) return formPage(req, res, { id: p.id, values: form, action: `/admin/on-randevu/${p.id}`, title: 'Ön randevuyu düzenle', errors: ['Çiftin adını yazın.'] }, 400);
    db.updatePrebooking(p.id, x);
    syncReminder(p.id, db.getPrebooking(p.id));
    setFlash(req, { message: 'Ön randevu güncellendi.', type: 'success' });
    redirect(res, '/admin/on-randevu');
  });

  router.post('/admin/on-randevu/:id/sil', async (req, res, { params }) => {
    if (!requireAdmin(req, res)) return;
    const form = await readForm(req);
    checkCsrf(req, form.csrf);
    const p = db.getPrebooking(Number(params.id) || 0);
    if (p) { closeReminder(p); db.deletePrebooking(p.id); }
    setFlash(req, { message: 'Ön randevu silindi.', type: 'success' });
    redirect(res, '/admin/on-randevu');
  });
}

module.exports = { register, guessDate, closeReminder };
