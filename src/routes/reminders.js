'use strict';
// Hatırlatıcılar: stüdyo kendi girer (ör. "Yarın 14:00 Ayşe ile görüşme"); saatinde telefona ve Telegram'a bildirim gelir.
const db = require('../db');
const wa = require('../whatsapp');
const demo = require('../demo');
const { getContent } = require('../content');
const { html, redirect, readForm, HttpError } = require('../http');
const { requireAdmin, checkCsrf, setFlash } = require('./guards');
const views = require('../views/admin');
const { today, addDays } = require('../jobs');

const clean = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const okDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
const okTime = (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? String(v) : '');

function fromForm(f) {
  return {
    title: clean(f.title, 120), dueDate: okDate(f.dueDate), dueTime: okTime(f.dueTime),
    person: clean(f.person, 80), phone: wa.normalizePhone(f.phone || '') || '', note: String(f.note || '').replace(/\r/g, '').trim().slice(0, 600),
    coupleId: Number(f.couple) || null, leadId: Number(f.lead) || null,
  };
}
const back = (f) => (/^\/admin(\/[\w\-/?=&#]*)?$/.test(String(f.back || '')) ? String(f.back) : '/admin');

function register(router) {
  const page = (req, res, extra) => html(res, views.reminderForm(getContent(), { csrf: req.session.csrf, demoAdmin: demo.isDemoAdmin(req), today: today(), ...extra }));

  router.get('/admin/hatirlatma/yeni', (req, res, { query }) => {
    if (!requireAdmin(req, res)) return;
    const couple = query.get('cift') ? db.getCouple(Number(query.get('cift')) || 0) : null;
    const lead = query.get('talep') ? db.getLead(Number(query.get('talep')) || 0) : null;
    const values = {
      dueDate: addDays(today(), 1), title: lead ? `${lead.name || 'Talep'} ile görüşme` : couple ? `${couple.name}: ` : '',
      person: lead?.name || couple?.full_name || '', phone: lead?.phone ? wa.displayPhone(lead.phone) : couple?.phone ? wa.displayPhone(couple.phone) : '',
      couple: couple?.id || '', lead: lead?.id || '', back: couple ? `/admin/ciftler/${couple.id}` : lead ? '/admin/talepler' : '/admin',
    };
    page(req, res, { values, action: '/admin/hatirlatma', title: 'Yeni hatırlatma' });
  });

  router.post('/admin/hatirlatma', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const form = await readForm(req);
    checkCsrf(req, form.csrf);
    const r = fromForm(form);
    if (!r.title || !r.dueDate) return page(req, res, { values: form, action: '/admin/hatirlatma', title: 'Yeni hatırlatma', errors: ['Ne yapılacağını ve tarihi yazın.'] });
    db.addReminder(r);
    setFlash(req, { message: `Hatırlatma kaydedildi. ${r.dueTime ? `Saat ${r.dueTime} olunca` : 'O gün sabah 9’da'} telefonunuza ve Telegram’a bildirim gelecek.`, type: 'success' });
    redirect(res, back(form));
  });

  router.get('/admin/hatirlatma/:id', (req, res, { params }) => {
    if (!requireAdmin(req, res)) return;
    const x = db.getReminder(Number(params.id) || 0);
    if (!x) throw new HttpError(404, 'Hatırlatma bulunamadı');
    page(req, res, { id: x.id, values: { title: x.title, dueDate: x.due_date, dueTime: x.due_time || '', person: x.person || '', phone: x.phone ? wa.displayPhone(x.phone) : '', note: x.note || '', back: '/admin' }, action: `/admin/hatirlatma/${x.id}`, title: 'Hatırlatmayı düzenle' });
  });

  router.post('/admin/hatirlatma/:id', async (req, res, { params }) => {
    if (!requireAdmin(req, res)) return;
    const x = db.getReminder(Number(params.id) || 0);
    if (!x) throw new HttpError(404, 'Hatırlatma bulunamadı');
    const form = await readForm(req);
    checkCsrf(req, form.csrf);
    const r = fromForm(form);
    if (!r.title || !r.dueDate) return page(req, res, { id: x.id, values: form, action: `/admin/hatirlatma/${x.id}`, title: 'Hatırlatmayı düzenle', errors: ['Ne yapılacağını ve tarihi yazın.'] });
    db.updateReminder(x.id, r);
    setFlash(req, { message: 'Hatırlatma güncellendi.', type: 'success' });
    redirect(res, back(form));
  });

  for (const [path, fn, msg] of [['tamam', 'doneReminder', 'Hatırlatma tamamlandı.'], ['sil', 'deleteReminder', 'Hatırlatma silindi.']]) {
    router.post(`/admin/hatirlatma/:id/${path}`, async (req, res, { params }) => {
      if (!requireAdmin(req, res)) return;
      const form = await readForm(req);
      checkCsrf(req, form.csrf);
      db[fn](Number(params.id) || 0);
      setFlash(req, { message: msg, type: 'success' });
      redirect(res, back(form));
    });
  }
  // Ertele: yarına (aynı saat)
  router.post('/admin/hatirlatma/:id/ertele', async (req, res, { params }) => {
    if (!requireAdmin(req, res)) return;
    const form = await readForm(req);
    checkCsrf(req, form.csrf);
    const x = db.getReminder(Number(params.id) || 0);
    if (x) db.updateReminder(x.id, { title: x.title, dueDate: addDays(x.due_date > today() ? x.due_date : today(), 1), dueTime: x.due_time, person: x.person, phone: x.phone, note: x.note });
    setFlash(req, { message: 'Hatırlatma yarına ertelendi.', type: 'success' });
    redirect(res, back(form));
  });
}

module.exports = { register };
