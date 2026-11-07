'use strict';
// Talepler: sitedeki "Uygunluk sorun" formu ve admin tarafı.
const crypto = require('node:crypto');
const config = require('../config');
const db = require('../db');
const auth = require('../auth');
const wa = require('../whatsapp');
const events = require('../events');
const { getContent } = require('../content');
const { html, json, redirect, readForm, HttpError } = require('../http');
const views = require('../views/leads');
const { requireAdmin, checkCsrf, setFlash, takeFlash, slugify, toId } = require('./guards');
const demo = require('../demo');
const { addDays } = require('../jobs');

// Form için IP başına saatte 5 gönderim
const sent = new Map();
function tooMany(req) {
  const ip = require('../http').clientIp(req);
  const now = Date.now();
  const list = (sent.get(ip) || []).filter((t) => now - t < 3600 * 1000);
  if (list.length >= 5) { sent.set(ip, list); return true; }
  list.push(now); sent.set(ip, list);
  return false;
}

const clean = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);

function register(router) {
  router.get('/talep', (req, res, { query }) => {
    const c = getContent();
    const tel = wa.normalizePhone(query.get('tel'));
    const gift = query.get('hediye') ? require('../gifts').check(query.get('hediye')) : null;
    html(res, views.form(c, {
      thanks: query.get('tamam') === '1',
      gift: gift?.ok ? { code: gift.g.code, owner: gift.g.owner, text: require('../gifts').settings().gift } : null,
      values: { ...(tel ? { phone: wa.displayPhone(tel), kaynak: 'whatsapp' } : {}), ...(gift?.ok ? { hediye: gift.g.code } : {}) },
      services: c.services.map((s) => s.title),
    }));
  });

  // Seçilen tarihin doluluğu (isim vermeden yalnızca durum)
  const availHits = new Map();
  router.get('/talep/uygunluk', (req, res, { query }) => {
    const ip = require('../http').clientIp(req);
    const now = Date.now();
    const hits = (availHits.get(ip) || []).filter((t) => now - t < 60000);
    hits.push(now); availHits.set(ip, hits);
    if (availHits.size > 5000) availHits.clear();
    if (hits.length > 40) return json(res, { ok: false }, 429);
    const date = String(query.get('tarih') || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, { ok: false }, 400);
    const { today } = require('../jobs');
    if (date < today()) return json(res, { ok: true, state: 'past' });
    const cap = Math.max(1, Number(getContent().appointments?.dailyCapacity) || 2);
    const n = new Set(db.eventsOn(date, 0).map((e) => e.couple_id)).size;
    json(res, { ok: true, state: n === 0 ? 'free' : n < cap ? 'some' : 'full' });
  });

  router.post('/talep', async (req, res) => {
    const c = getContent();
    const form = await readForm(req);
    const services = c.services.map((s) => s.title);
    if (form.website) return redirect(res, '/talep?tamam=1'); // bot tuzağı
    const phone = wa.normalizePhone(form.phone);
    const values = { ...form };
    const fail = (error, status = 400) => html(res, views.form(c, { values, error, services }), status);
    if (!clean(form.name, 80)) return fail('Lütfen adınızı yazın.');
    if (!phone) return fail('Lütfen geçerli bir telefon numarası yazın (örn. 0532 123 45 67).');
    if (form.kvkk !== '1') return fail('Devam etmek için aydınlatma metnini okuduğunuzu işaretleyin.');
    if (tooMany(req)) return fail('Kısa sürede çok fazla gönderim yapıldı. Biraz sonra tekrar deneyin.', 429);

    const lead = {
      name: clean(form.name, 80),
      phone,
      eventDate: cleanDate(form.eventDate),
      place: clean(form.place, 120),
      service: services.includes(form.service) || form.service === 'Diğer' ? form.service : '',
      message: String(form.message || '').trim().slice(0, 1500),
      source: form.kaynak === 'whatsapp' ? 'whatsapp' : 'site',
      waConsent: form.waConsent === '1',
      kvkk: true,
    };
    // Hediye kuponuyla gelen talep: kupon geçerliyse talebe bağlanır ve mesajın başına yazılır
    const gifts = require('../gifts');
    const gift = form.hediye ? gifts.check(form.hediye) : null;
    if (gift?.ok) lead.message = [`Hediye kuponu: ${gift.g.code} (${gift.g.owner} tavsiyesi, ${gifts.settings().gift})`, lead.message].filter(Boolean).join('\n');
    const open = db.openLeadByPhone(phone);
    let id;
    if (open) {
      db.updateLeadDetails(open.id, lead);
      db.setLeadConsent(open.id, lead.waConsent);
      id = open.id;
    } else {
      id = db.addLead(lead);
    }
    if (gift?.ok) { db.setLeadGift(id, gift.g.code); db.markGiftLead(gift.g.id, id); }
    // n8n'e haber ver; WhatsApp'tan gelen kişiye "bilgileriniz alındı" mesajı (24 saat içinde serbest metin)
    const payload = { id, ...lead, phoneDisplay: wa.displayPhone(phone), updated: Boolean(open) };
    if (config.n8nWebhookUrl) {
      const ev = { event: 'yeni_talep', at: new Date().toISOString(), lead: payload, adminUrl: `${config.siteUrl}/admin/talepler` };
      if (lead.source === 'whatsapp') ev.whatsapp = wa.textMessage(phone, 'talepAlindi', { ad: lead.name.split(' ')[0] });
      events.post(ev);
    }
    if (!open) {
      try {
        require('../push').toAdmin({ title: 'Yeni talep', body: [lead.name, lead.eventDate ? lead.eventDate.split('-').reverse().join('.') : '', lead.service].filter(Boolean).join(' · '), url: '/admin/talepler', tag: `talep-${id}` }).catch(() => {});
      } catch (err) { console.error('Bildirim:', err.message); }
    }
    redirect(res, '/talep?tamam=1');
  });

  // ── Admin ──
  const formGuard = async (req, res) => {
    if (!requireAdmin(req, res)) return null;
    const form = await readForm(req);
    checkCsrf(req, form.csrf);
    return form;
  };

  router.get('/admin/talepler', (req, res, { query }) => {
    if (!requireAdmin(req, res)) return;
    const all = db.listQuotes();
    html(res, views.adminList(getContent(), { leads: db.listLeads(), quotes: db.quotesForLeads(), loose: all.filter((q) => !q.lead_id), total: require('../views/quotes').total, tab: query.get('sekme') || 'yeni', csrf: req.session.csrf, flash: takeFlash(req), demoAdmin: demo.isDemoAdmin(req) }));
  });

  router.post('/admin/talepler/:id/durum', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const lead = db.getLead(toId(params.id));
    if (!lead) throw new HttpError(404, 'Bulunamadı');
    if (!views.STATUS[form.status]) throw new HttpError(400, 'Geçersiz durum');
    db.setLeadStatus(lead.id, form.status, null);
    setFlash(req, { message: 'Talep güncellendi.', type: 'success' });
    redirect(res, `/admin/talepler?sekme=${{ yeni: 'yeni', gorusuldu: 'teklif', rezervasyon: 'kabul', kayip: 'olmadi' }[form.status]}`);
  });

  // Talepten çift oluştur: ad, tarih ve telefon aktarılır, giriş bilgileri bir kez gösterilir
  router.post('/admin/talepler/:id/cift', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const lead = db.getLead(toId(params.id));
    if (!lead) throw new HttpError(404, 'Bulunamadı');
    if (lead.couple_id && db.getCouple(lead.couple_id)) return redirect(res, `/admin/ciftler/${lead.couple_id}`);
    const name = lead.name || 'Yeni çift';
    const code = require('./guards').uniqueAccessCode(name, (lead.event_date || new Date().toISOString()).slice(0, 4), (x) => db.getCoupleByCode(x) || db.findAdminLogin(x));
    const password = auth.memorablePassword();
    const id = db.createCouple({ name, accessCode: code, hash: auth.hashPassword(password), eventDate: lead.event_date });
    if (lead.event_date) db.setCoupleDue(id, addDays(lead.event_date, 45));
    db.setCoupleContact(id, lead.phone, true);
    db.setLeadStatus(lead.id, 'rezervasyon', id);
    setFlash(req, {
      message: `${name} çift olarak eklendi. Adını gerektiği gibi düzeltebilirsiniz (örn. “Ayşe & Mehmet”).`,
      type: 'success',
      credentials: { url: `${config.siteUrl}/uygulama`, code, password },
    });
    redirect(res, `/admin/ciftler/${id}`);
  });

  router.post('/admin/talepler/:id/sil', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    db.deleteLead(toId(params.id));
    setFlash(req, { message: 'Talep silindi.', type: 'success' });
    redirect(res, '/admin/talepler');
  });
}

module.exports = { register };
