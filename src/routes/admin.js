'use strict';
// Yönetim paneli: çiftler, fotoğraf yükleme, favoriler, iş aşamaları, portfolyo, hesap.
const crypto = require('node:crypto');
const fs = require('node:fs');
const backup = require('../backup');
const db = require('../db');
const auth = require('../auth');
const media = require('../media');
const config = require('../config');
const { getContent } = require('../content');
const { html, json, redirect, readForm, readJson, readBody, HttpError, clientIp } = require('../http');
const panelViews = require('../views/panel');
const views = require('../views/admin');
const { portfolioItems, heroUrl } = require('./public');
const appViews = require('../views/app');
const { requireAdmin, checkCsrf, setFlash, takeFlash, slugify, toId, uniqueAccessCode } = require('./guards');
const demo = require('../demo');
const { addDays, today } = require('../jobs');
const appt = require('../appointments');
const wa = require('../whatsapp');
const events = require('../events');
const contract = require('../contract');
const contractViews = require('../views/contract');

// Excel formül enjeksiyonuna karşı korumalı CSV hücresi
function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

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

const pfUploads = new Map(); // portfolyo yüklemesi: aynı dosya ikinci kez eklenmesin
function register(router) {
  // ── Giriş ──
  router.get('/admin/giris', (req, res) => {
    if (req.session?.kind === 'admin') return redirect(res, '/admin');
    if (auth.isApp(req)) return redirect(res, '/uygulama');
    html(res, panelViews.adminLogin(getContent(), { noAdmin: db.countAdmins() === 0 }));
  });

  router.post('/admin/giris', async (req, res) => {
    const c = getContent();
    const form = await readForm(req);
    const username = cleanText(form.username, 60);
    const view = (opts) => (form.app === '1'
      ? appViews.appLogin(c, { heroUrl: heroUrl(c), ...opts })
      : panelViews.adminLogin(c, opts));
    if (auth.isRateLimited(req)) {
      return html(res, view({ error: 'Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin.', values: { code: username } }), 429);
    }
    // Büyük/küçük harf fark etmez (iPad ilk harfi büyük yazabiliyor)
    const admin = username ? db.findAdminLogin(username) : null;
    const ok = auth.verifyPassword(form.password || '', admin ? admin.password_hash : auth.DUMMY_HASH);
    if (!admin || !ok) {
      auth.recordFailure(req);
      return html(res, view({ error: 'Kullanıcı adı veya şifre hatalı.', values: { code: username } }), 401);
    }
    auth.clearFailures(req);
    auth.startSession(res, 'admin', admin.id);
    redirect(res, '/admin');
  });

  // ── Bugün: yapılacaklar, program, bu ay, çiftler ──
  router.get('/admin', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const t = today();
    const ym = t.slice(0, 7);
    const c = getContent();
    const last = (c.stages || []).length - 1;
    const couplesAll = db.listCouples();
    // Seçimini bitirmiş, albüm tasarımı henüz gönderilmemiş çiftler
    const selections = couplesAll.filter((k) => k.album_locked && k.fav_count > 0 && !k.album_design_state && k.stage < last)
      .map((k) => ({ k, names: appt.selectionNames(db.listFavoritePhotos(k.id)) }));
    const outbox = wa.autoSend() ? [] : require('../outbox').list();
    const quotes = db.listQuotes().filter((q) => q.status === 'kabul' && !q.couple_id);
    const newLeads = db.listLeads().filter((l) => l.status === 'yeni').length;
    html(res, views.dashboard(c, { outbox, selections, quotes, newLeads, reminders: db.openReminders(), prebookings: db.openPrebookings(), couples: couplesAll, monthEvents: db.eventsBetween(`${ym}-01`, `${ym}-31`), upcoming: db.eventsBetween(t, addDays(t, 30)), ym, csrf: req.session.csrf, flash: takeFlash(req), demoAdmin: demo.isDemoAdmin(req) }));
  });

  // Elle gönderilen WhatsApp mesajı "gönderildi" (veya "atla") olarak işaretlenir; listeden düşer
  router.post('/admin/mesajlar/gonderildi', async (req, res) => {
    if (req.session?.kind !== 'admin') throw new HttpError(401, 'Oturum gerekli');
    checkCsrf(req);
    const { keys } = await readJson(req);
    const { KEY_RE } = require('../outbox');
    const valid = (Array.isArray(keys) ? keys : []).map(String).filter((k) => KEY_RE.test(k)).slice(0, 20);
    for (const k of valid) db.markNotified(k);
    json(res, { ok: true, marked: valid.length });
  });

  // Yeni kişi kartı formu (takvimden tarih, talepten bilgiler gelebilir)
  router.get('/admin/randevu/yeni', (req, res, { query }) => {
    if (!requireAdmin(req, res)) return;
    const values = { waOptin: 1, albumLimit: 35, ev0_date: appt.cleanDate(query.get('tarih')) || '', depositDate: today() };
    let talepId = null;
    const lead = query.get('talep') ? db.getLead(Number(query.get('talep')) || 0) : null;
    if (lead && !lead.couple_id) {
      talepId = lead.id;
      Object.assign(values, {
        fullName: lead.name, phone: lead.phone ? wa.displayPhone(lead.phone) : '', ev0_date: lead.event_date || values.ev0_date,
        ev0_venue: lead.place, source: { whatsapp: 'WhatsApp', dugun: 'Düğün.com' }[lead.source] || 'Site formu',
        ev0_type: (getContent().appointments?.eventTypes || []).find((t) => lead.service && lead.service.includes(t)) || '',
        notes: lead.message,
        hediye: lead.gift_code || '',
      });
      if (lead.gift_code) values.source = 'Tavsiye';
    }
    // Kabul edilen (ya da hazırlanan) tekliften: paketler, tutar ve kapora forma gelir
    const quote = query.get('teklif') ? db.getQuote(Number(query.get('teklif')) || 0) : null;
    let teklifId = null;
    if (quote && !quote.couple_id) {
      teklifId = quote.id;
      const qi = require('../views/quotes');
      const items = qi.items(quote);
      const pkgNames = new Set(db.listPackages().map((p) => p.name));
      const ql = quote.lead_id ? db.getLead(quote.lead_id) : null;
      if (ql && !ql.couple_id) talepId = ql.id;
      Object.assign(values, {
        fullName: quote.accepted_name || quote.name, phone: wa.displayPhone(quote.accepted_phone || quote.phone || '') || '',
        ev0_type: quote.event_type || values.ev0_type || '', ev0_date: quote.event_date || values.ev0_date, ev0_venue: quote.place || values.ev0_venue || '',
        ev0_pkgs: items.filter((x) => pkgNames.has(x.name)).map((x) => x.name),
        ev0_package: items.filter((x) => !pkgNames.has(x.name)).map((x) => x.name).join(' + '),
        ev0_price: (qi.total(quote) + (quote.discount || 0)) || '', discount: quote.discount ? String(quote.discount) : '', ev0_detail: items.map((x) => x.detail).filter(Boolean).join('\n'),
        deposit: quote.deposit || '', notes: [values.notes, quote.note].filter(Boolean).join('\n'),
        source: ql?.source === 'dugun' ? 'Düğün.com' : values.source || '',
        hediye: ql?.gift_code || '',
      });
      if (ql?.gift_code) values.source = 'Tavsiye';
    }
    // Ön randevudan: bilgiler gelir, tarihi siz girersiniz
    const pre = query.get('on') ? db.getPrebooking(Number(query.get('on')) || 0) : null;
    if (pre && !pre.couple_id) {
      Object.assign(values, {
        on: pre.id, fullName: pre.name, phone: pre.phone ? wa.displayPhone(pre.phone) : '', ev0_type: pre.event_type || '',
        ev0_price: pre.price || '', deposit: pre.deposit || '', notes: [pre.note, pre.est_text ? `Tahmini tarih: ${pre.est_text}` : ''].filter(Boolean).join('\n'),
      });
    }
    html(res, views.appointmentPage(getContent(), { values, action: '/admin/ciftler', title: 'Yeni randevu', submitLabel: 'Randevuyu oluştur', csrf: req.session.csrf, talepId, teklifId, back: talepId ? '/admin/talepler' : '/admin', demoAdmin: demo.isDemoAdmin(req), isNew: true, team: db.listTeam(), packages: db.listPackages().filter((x) => x.active) }));
  });

  // Etkinlikleri kaydet: gönderilenleri güncelle/ekle, formdan kaldırılanları sil
  // Ekibine yeni eklenen kişilere görev mesajı gider
  function saveEvents(coupleId, list) {
    const existing = new Map(db.listEvents(coupleId).map((e) => [e.id, e]));
    const kept = new Set();
    let notified = 0;
    for (const e of list) {
      let id;
      if (e.id && existing.has(e.id)) { db.updateEvent(e.id, e); id = e.id; kept.add(id); } else id = db.addEvent(coupleId, e);
      const added = db.setEventTeam(id, e.teamIds);
      if (added.length) { events.teamAssigned(id, added); notified += added.length; }
    }
    for (const id of existing.keys()) if (!kept.has(id)) db.deleteEvent(id);
    db.syncCoupleDate(coupleId);
    return notified;
  }

  // Aynı gün başka çekim var mı?
  function conflictText(coupleId, list) {
    const out = [];
    for (const e of list) {
      if (!e.eventDate) continue;
      for (const o of db.eventsOn(e.eventDate, coupleId)) out.push(`${appt.shortDate(e.eventDate)}: ${o.couple_name} (${o.event_type || 'etkinlik'}${o.start_time ? ' ' + o.start_time : ''})`);
    }
    return out.length ? `Dikkat, aynı gün başka çekim var: ${[...new Set(out)].join(' · ')}` : '';
  }

  router.post('/admin/ciftler', async (req, res) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const c = getContent();
    const { a, events: list, errors } = appt.readForm(form, c);
    if (errors.length) {
      return html(res, views.appointmentPage(c, { values: form, action: '/admin/ciftler', title: 'Yeni randevu', submitLabel: 'Randevuyu oluştur', csrf: req.session.csrf, errors, talepId: form.talep, back: '/admin', demoAdmin: demo.isDemoAdmin(req), isNew: true, team: db.listTeam(), packages: db.listPackages().filter((x) => x.active) }), 400);
    }
    // Çiftin panel girişi: kod ve şifre otomatik
    const base = slugify(a.name) || 'cift';
    const firstDate = list.map((e) => e.eventDate).filter(Boolean).sort()[0];
    const code = uniqueAccessCode(a.name, (firstDate || today()).slice(0, 4), (x) => db.getCoupleByCode(x) || db.findAdminLogin(x));
    const password = auth.memorablePassword();
    const hash = auth.hashPassword(password);
    const id = db.createCouple({ name: a.name, accessCode: code, hash, eventDate: null });
    a.dueDate = null; // teslim tarihi çekimden sonra sayılır (son çekim + varsayılan süre)
    db.updateCard(id, a);
    db.setDiscount(id, a.discount);
    const assigned = saveEvents(id, list);
    if (a.deposit > 0) db.addPayment(id, { amount: a.deposit, paidOn: a.depositDate || today(), note: 'Kapora' });
    const first = list.map((e) => e.eventDate).filter(Boolean).sort()[0];
    db.setRefNo(id, db.nextRefNo((first || today()).slice(0, 4)));
    const lead = form.talep ? db.getLead(Number(form.talep) || 0) : null;
    if (lead && !lead.couple_id) db.setLeadStatus(lead.id, 'rezervasyon', id);
    if (form.on) { const pb = db.getPrebooking(Number(form.on) || 0); if (pb && !pb.couple_id) { db.setPrebookingCouple(pb.id, id); require('./prebook').closeReminder(pb); } }
    if (form.teklif) { const qt = db.getQuote(Number(form.teklif) || 0); if (qt && !qt.couple_id) db.setQuoteCouple(qt.id, id); }
    // Hediye kuponu: geçerliyse kullanıldı sayılır; tavsiye eden çifte teşekkür hediyesi hatırlatması başlar
    let giftNote = '';
    if (form.hediye) {
      const gc = require('../gifts').check(form.hediye);
      if (gc.ok) { db.useGiftCode(gc.g.id, lead?.id, id); giftNote = ` Hediye kuponu ${gc.g.code} kullanıldı (${gc.g.owner} tavsiyesi).`; }
      else giftNote = ` Hediye kuponu uygulanmadı: ${gc.reason}`;
    }
    const warn = conflictText(id, list);
    const link = auth.loginLink(id, hash);
    const sent = events.appointmentCreated(id, { link, code, password });
    setFlash(req, {
      message: `${a.name} için randevu oluşturuldu.${giftNote}${sent ? ' Randevu ve giriş bilgileri çifte WhatsApp\'tan gönderildi.' : ''}${assigned ? ` ${assigned} ekip görevi verildi${wa.autoSend() ? ' ve WhatsApp mesajı gönderildi' : ' (mesajı Panel › Gönderilecek mesajlar listesinden gönderebilirsiniz)'}.` : ''}${warn ? ' ' + warn : ''}`,
      type: warn ? 'error' : 'success',
      credentials: { url: `${config.siteUrl}/uygulama`, link, sent, text: wa.templateText('randevu', events.appointmentVars(db.getCouple(id), { link, code, password })), code, password, phone: a.phone, name: a.name },
    });
    redirect(res, `/admin/ciftler/${id}`);
  });

  // Kişi kartını ve etkinliklerini düzenle
  router.get('/admin/ciftler/:id/duzenle', (req, res, { params }) => {
    if (!requireAdmin(req, res)) return;
    const couple = getCoupleOr404(params.id);
    html(res, views.appointmentPage(getContent(), { values: appt.formValues(couple, db.listEvents(couple.id), db.eventMemberIds), action: `/admin/ciftler/${couple.id}/bilgi`, title: `${couple.name} · düzenle`, submitLabel: 'Kaydet', csrf: req.session.csrf, back: `/admin/ciftler/${couple.id}`, demoAdmin: demo.isDemoAdmin(req), team: db.listTeam(), packages: db.listPackages().filter((x) => x.active) }));
  });

  router.post('/admin/ciftler/:id/bilgi', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const couple = getCoupleOr404(params.id);
    const c = getContent();
    const { a, events: list, errors } = appt.readForm(form, c);
    const paidSoFar = db.listPayments(couple.id).reduce((s, p) => s + p.amount, 0);
    const total = Math.max(list.reduce((s, e) => s + e.price, 0) - (a.discount || 0), 0);
    if (total > 0 && paidSoFar > total) errors.push(`Alınan ödemeler (${appt.tl(paidSoFar)}) indirimli toplamı (${appt.tl(total)}) aşıyor.`);
    if (errors.length) {
      return html(res, views.appointmentPage(c, { values: form, action: `/admin/ciftler/${couple.id}/bilgi`, title: `${couple.name} · düzenle`, submitLabel: 'Kaydet', csrf: req.session.csrf, errors, back: `/admin/ciftler/${couple.id}`, demoAdmin: demo.isDemoAdmin(req), team: db.listTeam(), packages: db.listPackages().filter((x) => x.active) }), 400);
    }
    a.dueDate = a.dueDate || null; // boşsa son çekimden itibaren otomatik hesaplanır
    db.updateCard(couple.id, a);
    db.setDiscount(couple.id, a.discount);
    const assigned = saveEvents(couple.id, list);
    if (!couple.ref_no) db.setRefNo(couple.id, db.nextRefNo(today().slice(0, 4)));
    const warn = conflictText(couple.id, list);
    setFlash(req, { message: `Kaydedildi.${assigned ? ` ${assigned} yeni ekip görevi${wa.autoSend() ? ', WhatsApp mesajı gönderildi' : ' (mesajı Panel › Gönderilecek mesajlar listesinden gönderebilirsiniz)'}.` : ''}${warn ? ' ' + warn : ''}`, type: warn ? 'error' : 'success' });
    redirect(res, `/admin/ciftler/${couple.id}`);
  });

  // Formda tarih seçilince anlık çakışma kontrolü
  router.get('/admin/cakisma', (req, res, { query }) => {
    if (req.session?.kind !== 'admin') throw new HttpError(401, 'Oturum gerekli');
    const date = appt.cleanDate(query.get('tarih'));
    const list = date ? db.eventsOn(date, Number(query.get('haric')) || 0) : [];
    json(res, { ok: true, items: list.map((e) => ({ name: e.couple_name, type: e.event_type, time: e.start_time })) });
  });

  // ── Ekip ──
  function readMember(form) {
    const roles = getContent().appointments?.teamRoles || [];
    const phoneRaw = cleanText(form.phone, 20);
    return {
      name: cleanText(form.name, 60), role: roles.includes(form.role) ? form.role : '', phoneRaw, phone: wa.normalizePhone(phoneRaw),
      notes: String(form.notes || '').trim().slice(0, 1000), active: form.active === '1', waOptin: form.waOptin === '1',
    };
  }

  router.get('/admin/ekip', (req, res, { query }) => {
    if (!requireAdmin(req, res)) return;
    const editId = Number(query.get('duzenle')) || null;
    const member = editId ? db.getMember(editId) : null;
    html(res, views.teamPage(getContent(), { team: db.listTeam(), member, memberEvents: member ? db.memberEvents(member.id) : [], csrf: req.session.csrf, flash: takeFlash(req), demoAdmin: demo.isDemoAdmin(req) }));
  });

  router.post('/admin/ekip', async (req, res) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const m = readMember(form);
    if (!m.name) setFlash(req, { message: 'İsim yazın.', type: 'error' });
    else if (m.phoneRaw && !m.phone) setFlash(req, { message: 'Telefon numarası geçersiz (örn. 0532 123 45 67).', type: 'error' });
    else { db.addMember(m); setFlash(req, { message: `${m.name} ekibe eklendi.`, type: 'success' }); }
    redirect(res, '/admin/ekip');
  });

  router.post('/admin/ekip/:id', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const member = db.getMember(toId(params.id));
    if (!member) throw new HttpError(404, 'Bulunamadı');
    const m = readMember(form);
    if (!m.name) { setFlash(req, { message: 'İsim yazın.', type: 'error' }); return redirect(res, `/admin/ekip?duzenle=${member.id}`); }
    if (m.phoneRaw && !m.phone) { setFlash(req, { message: 'Telefon numarası geçersiz (örn. 0532 123 45 67).', type: 'error' }); return redirect(res, `/admin/ekip?duzenle=${member.id}`); }
    db.updateMember(member.id, m);
    setFlash(req, { message: `${m.name} güncellendi.`, type: 'success' });
    redirect(res, '/admin/ekip');
  });

  router.post('/admin/ekip/:id/sil', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const member = db.getMember(toId(params.id));
    if (!member) throw new HttpError(404, 'Bulunamadı');
    db.deleteMember(member.id);
    setFlash(req, { message: `${member.name} ekipten silindi.`, type: 'success' });
    redirect(res, '/admin/ekip');
  });

  // ── Site ayarları (site.json'un üzerine yazılır) ──
  const siteOver = () => { try { return JSON.parse(db.getSetting('site_overrides') || '{}') || {}; } catch { return {}; } };
  const saveOver = (o) => db.setSetting('site_overrides', JSON.stringify(o));

  router.get('/admin/site', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { ACCENTS } = require('../theme');
    html(res, views.sitePage(getContent(), { accents: ACCENTS, heroUrl: heroUrl(getContent()), csrf: req.session.csrf, flash: takeFlash(req), demoAdmin: demo.isDemoAdmin(req) }));
  });

  router.post('/admin/site', async (req, res) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const { ACCENTS } = require('../theme');
    const t = (k, n) => cleanText(form[k], n);
    const area = (k, n) => String(form[k] || '').replace(/\r\n/g, '\n').trim().slice(0, n);
    const o = siteOver();
    const phone = wa.normalizePhone(form.phone);
    const wapp = wa.normalizePhone(form.whatsapp);
    const errors = [];
    if (String(form.phone || '').trim() && !phone) errors.push('Telefon numarası geçersiz.');
    if (String(form.whatsapp || '').trim() && !wapp) errors.push('WhatsApp numarası geçersiz.');
    const link = String(form.bannerLink || '').trim();
    if (link && !/^(https:\/\/|\/)[^\s"'<>]*$/.test(link)) errors.push('Duyuru bağlantısı "/" veya "https://" ile başlamalı.');
    if (errors.length) { setFlash(req, { message: errors.join(' '), type: 'error' }); return redirect(res, '/admin/site'); }
    // İş akışı: aşamalar, etkinlik türleri, kaynaklar, ekip görevleri
    const lines = (k, max, n) => String(form[k] || '').split(/\r?\n/).map((x) => x.replace(/\s+/g, ' ').trim().slice(0, n)).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, max);
    const stages = lines('stages', 10, 40);
    const eventTypes = lines('eventTypes', 15, 30);
    if (stages.length < 3) { setFlash(req, { message: 'En az 3 iş aşaması yazın (her satıra bir aşama).', type: 'error' }); return redirect(res, '/admin/site'); }
    if (!eventTypes.length) { setFlash(req, { message: 'En az bir etkinlik türü yazın.', type: 'error' }); return redirect(res, '/admin/site'); }
    const prevStages = getContent().stages.length;
    const services = [];
    for (let i = 0; i < 6; i++) {
      const title = t(`svc${i}_title`, 60);
      if (title) services.push({ title, text: t(`svc${i}_text`, 240) });
    }
    Object.assign(o, {
      brand: { ...(o.brand || {}), name: t('brandName', 60) || 'HM4 Studio', tagline: t('tagline', 80), logoPosition: form.logoPosition === 'center' ? 'center' : 'left' },
      theme: { accent: ACCENTS[form.accent] ? form.accent : 'kina' },
      banner: { on: form.bannerOn === '1', text: t('bannerText', 160), link, linkText: t('bannerLinkText', 30) },
      hero: { title: t('heroTitle', 90), text: t('heroText', 300) },
      intro: { title: t('introTitle', 90), text: area('introText', 600) },
      services,
      about: { ...(o.about || {}), lead: t('aboutLead', 240), paragraphs: area('aboutText', 3000).split(/\n\s*\n/).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 8) },
      contact: {
        text: t('contactText', 300), phone: phone ? `+${phone}` : '', phoneDisplay: phone ? wa.displayPhone(phone) : '',
        whatsapp: wapp || '', whatsappMessage: t('whatsappMessage', 200), email: t('email', 120), instagram: t('instagram', 60).replace(/^@/, ''),
        regions: area('regions', 600).split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 8), hours: t('hours', 120),
      },
    });
    o.stages = stages;
    o.appointments = {
      ...(o.appointments || {}),
      eventTypes, teamRoles: lines('teamRoles', 15, 30),
      videoStages: lines('videoStages', 8, 30).length ? lines('videoStages', 8, 30) : (getContent().appointments?.videoStages || []),
      defaultDeliveryDays: Math.min(Math.max(Number.parseInt(form.deliveryDays, 10) || 45, 1), 365),
      dailyCapacity: Math.min(Math.max(Number.parseInt(form.dailyCapacity, 10) || 2, 1), 20),
    };
    o.couplePanel = { showPayments: form.showPayments === '1' };
    saveOver(o);
    if (stages.length < prevStages) db.clampStages(stages.length);
    setFlash(req, { message: 'Site güncellendi.', type: 'success' });
    redirect(res, '/admin/site');
  });

  // Logo veya hakkımızda fotoğrafı (tarayıcıda küçültülür; logo şeffaflığı korunsun diye orijinali saklanır)
  router.post('/admin/site/gorsel', async (req, res) => {
    apiGuard(req);
    const slot = String(req.headers['x-category'] || '');
    if (!['logo', 'about'].includes(slot)) throw new HttpError(400, 'Geçersiz alan.');
    const body = await readBody(req, config.maxUploadBytes);
    const parts = media.splitParts(req, body);
    const useOriginal = slot === 'logo' && parts.original && ['png', 'webp', 'jpg'].includes(parts.originalExt);
    if (slot === 'logo' && parts.original && parts.original.length > 2 * 1024 * 1024) throw new HttpError(413, 'Logo dosyası 2 MB\'tan küçük olmalı.');
    const url = media.saveSiteImage(newKey(), useOriginal ? parts.original : parts.display, useOriginal ? parts.originalExt : 'jpg');
    const o = siteOver();
    if (slot === 'logo') { media.removeSiteImage(o.brand?.logo); o.brand = { ...(o.brand || {}), logo: url }; }
    else { media.removeSiteImage(o.about?.image); o.about = { ...(o.about || {}), image: url }; }
    saveOver(o);
    json(res, { ok: true, url });
  });

  router.post('/admin/site/gorsel-kaldir', async (req, res) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const o = siteOver();
    if (form.slot === 'logo') { media.removeSiteImage(o.brand?.logo); o.brand = { ...(o.brand || {}), logo: '' }; }
    if (form.slot === 'about') { media.removeSiteImage(o.about?.image); o.about = { ...(o.about || {}), image: '' }; }
    saveOver(o);
    setFlash(req, { message: 'Görsel kaldırıldı.', type: 'success' });
    redirect(res, '/admin/site');
  });

  // ── Paketler ──
  function readPackage(form) {
    const types = getContent().appointments?.eventTypes || [];
    return { name: cleanText(form.name, 80), price: appt.money(form.price), detail: String(form.detail || '').replace(/\r\n/g, '\n').trim().slice(0, 1500), eventType: types.includes(form.eventType) ? form.eventType : '', active: form.active === '1' };
  }
  router.get('/admin/paketler', (req, res, { query }) => {
    if (!requireAdmin(req, res)) return;
    const pkg = Number(query.get('duzenle')) ? db.getPackage(Number(query.get('duzenle'))) : null;
    html(res, views.packagesPage(getContent(), { packages: db.listPackages(), pkg, csrf: req.session.csrf, flash: takeFlash(req), demoAdmin: demo.isDemoAdmin(req) }));
  });
  router.post('/admin/paketler', async (req, res) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const x = readPackage(form);
    if (!x.name) setFlash(req, { message: 'Paket adını yazın.', type: 'error' });
    else { db.addPackage(x); setFlash(req, { message: `${x.name} eklendi.`, type: 'success' }); }
    redirect(res, '/admin/paketler');
  });
  router.post('/admin/paketler/:id', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const pkg = db.getPackage(toId(params.id));
    if (!pkg) throw new HttpError(404, 'Bulunamadı');
    const x = readPackage(form);
    if (!x.name) { setFlash(req, { message: 'Paket adını yazın.', type: 'error' }); return redirect(res, `/admin/paketler?duzenle=${pkg.id}`); }
    db.updatePackage(pkg.id, x);
    setFlash(req, { message: `${x.name} güncellendi. Mevcut randevulardaki tutarlar değişmez.`, type: 'success' });
    redirect(res, '/admin/paketler');
  });
  router.post('/admin/paketler/:id/sil', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const pkg = db.getPackage(toId(params.id));
    if (!pkg) throw new HttpError(404, 'Bulunamadı');
    db.deletePackage(pkg.id);
    setFlash(req, { message: `${pkg.name} silindi. Bu paketle yapılmış randevular etkilenmez.`, type: 'success' });
    redirect(res, '/admin/paketler');
  });

  // ── Ödemeler ──
  router.post('/admin/ciftler/:id/odeme', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const couple = getCoupleOr404(params.id);
    const amount = appt.money(form.amount);
    const card = db.getCoupleCard(couple.id);
    const left = Math.max((card.total || 0) - (card.paid || 0), 0);
    if (!amount) setFlash(req, { message: 'Ödeme tutarını yazın.', type: 'error' });
    else if (card.total && amount > left) setFlash(req, { message: `Tutar kalan bakiyeden (${appt.tl(left)}) büyük olamaz.`, type: 'error' });
    else {
      db.addPayment(couple.id, { amount, paidOn: appt.cleanDate(form.paidOn) || today(), method: cleanText(form.method, 30), note: cleanText(form.note, 120) });
      setFlash(req, { message: `${appt.tl(amount)} ödeme kaydedildi.`, type: 'success' });
    }
    redirect(res, `/admin/ciftler/${couple.id}#odemeler`);
  });

  router.post('/admin/ciftler/:id/odeme/:pid/sil', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const couple = getCoupleOr404(params.id);
    const p = db.getPayment(toId(params.pid));
    if (!p || p.couple_id !== couple.id) throw new HttpError(404, 'Bulunamadı');
    db.deletePayment(p.id);
    setFlash(req, { message: 'Ödeme kaydı silindi.', type: 'success' });
    redirect(res, `/admin/ciftler/${couple.id}#odemeler`);
  });

  // ── Randevu belgesi (yazdır / PDF olarak kaydet) ──
  router.get('/admin/ciftler/:id/belge', (req, res, { params }) => {
    if (!requireAdmin(req, res)) return;
    const couple = getCoupleOr404(params.id);
    html(res, views.appointmentDoc(getContent(), { card: db.getCoupleCard(couple.id), events: db.listEvents(couple.id), payments: db.listPayments(couple.id), back: `/admin/ciftler/${couple.id}` }));
  });

  // ── Google ve şehir sayfaları ──
  router.get('/admin/sehirler', (req, res) => {
    if (!requireAdmin(req, res)) return;
    html(res, views.citiesPage(getContent(), { csrf: req.session.csrf, flash: takeFlash(req), demoAdmin: demo.isDemoAdmin(req), siteUrl: config.siteUrl }));
  });
  // Müşteri kaynakları (randevu formundaki "Müşteri kaynağı" seçenekleri)
  router.get('/admin/kaynaklar', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const counts = {};
    for (const k of db.listCouples()) { const s = k.source || 'Belirtilmedi'; counts[s] = (counts[s] || 0) + 1; }
    html(res, views.sourcesPage(getContent(), { counts, csrf: req.session.csrf, flash: takeFlash(req), demoAdmin: demo.isDemoAdmin(req) }));
  });
  router.post('/admin/kaynaklar', async (req, res) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const list = [...new Set(String(form.sources || '').split(/\r?\n/).map((x) => cleanText(x, 30)).filter(Boolean))].slice(0, 20);
    if (!list.length) { setFlash(req, { message: 'En az bir kaynak yazın.', type: 'error' }); return redirect(res, '/admin/kaynaklar'); }
    const o = siteOver();
    o.appointments = { ...(o.appointments || {}), sources: list };
    saveOver(o);
    setFlash(req, { message: 'Müşteri kaynakları kaydedildi.', type: 'success' });
    redirect(res, '/admin/kaynaklar');
  });

  // Sayfa başlıkları (Google'da görünen başlık ve açıklama)
  router.get('/admin/sayfa-basliklari', (req, res) => {
    if (!requireAdmin(req, res)) return;
    html(res, views.seoTitlesPage(getContent(), { csrf: req.session.csrf, flash: takeFlash(req), demoAdmin: demo.isDemoAdmin(req) }));
  });
  router.post('/admin/sayfa-basliklari', async (req, res) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const c = getContent();
    const base = require('../content').baseContent();
    const o = siteOver();
    const t = (v, n) => cleanText(String(v || ''), n);
    const pageSeo = {};
    for (const p of views.seoPages(c)) {
      const title = t(form[`t_${p.key}`], 90); const description = t(form[`d_${p.key}`], 220);
      if (p.key === 'home') o.seo = { title: title || base.seo?.title, description: description || base.seo?.description };
      else if (title || description) pageSeo[p.key] = { ...(title ? { title } : {}), ...(description ? { description } : {}) };
    }
    o.pageSeo = pageSeo;
    saveOver(o);
    setFlash(req, { message: 'Sayfa başlıkları kaydedildi.', type: 'success' });
    redirect(res, '/admin/sayfa-basliklari');
  });

  // Teslim ayarları: tutanak kalemleri, metni, dosyaların saklanma süresi
  router.get('/admin/teslim-ayarlari', (req, res) => {
    if (!requireAdmin(req, res)) return;
    html(res, views.deliverySettingsPage(getContent(), { csrf: req.session.csrf, flash: takeFlash(req), demoAdmin: demo.isDemoAdmin(req) }));
  });
  router.post('/admin/teslim-ayarlari', async (req, res) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const c = getContent();
    const items = String(form.items || '').split(/\r?\n/).map((x) => x.replace(/\s+/g, ' ').trim().slice(0, 80)).filter(Boolean).slice(0, 12);
    const statement = String(form.statement || '').replace(/\r/g, '').trim().slice(0, 1500);
    const o = siteOver();
    o.delivery = { ...(c.delivery || {}), items: items.length ? items : c.delivery?.items || [], statement: statement || c.delivery?.statement || '', keepDays: Math.min(Math.max(Number.parseInt(form.keepDays, 10) || 90, 7), 730) };
    saveOver(o);
    setFlash(req, { message: 'Teslim ayarları kaydedildi.', type: 'success' });
    redirect(res, '/admin/teslim-ayarlari');
  });

  router.post('/admin/sehirler', async (req, res) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const c = getContent();
    const t = (k, n) => cleanText(String(form[k] || ''), n);
    const list = (k, n) => String(form[k] || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 30).map((x) => x.slice(0, n));
    const blocks = (k) => String(form[k] || '').replace(/\r/g, '').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
    const o = siteOver();
    o.business = { ...(c.business || {}), locality: t('locality', 60), region: t('region', 60), areas: list('areas', 40), dugunProfil: /^https:\/\//.test(String(form.dugunProfil || '')) ? String(form.dugunProfil).trim().slice(0, 300) : '' };
    o.cities = (c.cities || []).map((x, i) => ({
      ...x,
      title: t(`c${i}_title`, 70) || x.title,
      description: t(`c${i}_description`, 200) || x.description,
      lead: t(`c${i}_lead`, 200),
      paragraphs: blocks(`c${i}_paragraphs`).map((p) => p.replace(/\s+/g, ' ').slice(0, 1200)).slice(0, 8),
      areas: list(`c${i}_areas`, 60),
      faq: blocks(`c${i}_faq`).map((b) => { const [q, ...a] = b.split('\n'); return { q: q.trim().slice(0, 200), a: a.join(' ').replace(/\s+/g, ' ').trim().slice(0, 800) }; }).filter((x) => x.q && x.a).slice(0, 15),
    }));
    saveOver(o);
    setFlash(req, { message: 'Kaydedildi. Google değişiklikleri birkaç gün içinde görür.', type: 'success' });
    redirect(res, '/admin/sehirler');
  });

  // ── Mesaj metinleri (Ayarlar › Mesajlar) ──
  router.get('/admin/mesajlar', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { getWhatsapp, baseWhatsapp } = require('../content');
    html(res, views.messagesPage(getContent(), { wa: getWhatsapp(), base: baseWhatsapp(), csrf: req.session.csrf, flash: takeFlash(req), demoAdmin: demo.isDemoAdmin(req) }));
  });
  router.post('/admin/mesajlar', async (req, res) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const { baseWhatsapp } = require('../content');
    const base = baseWhatsapp();
    const metinler = {};
    const missing = [];
    for (const [key, title, , vars] of views.MESSAGE_INFO) {
      const text = String(form[`m_${key}`] || '').replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim().slice(0, 1000);
      if (form[`reset_${key}`] === '1' || !text || text === base.sablonlar[key]?.metin) continue;
      metinler[key] = text;
      const lost = vars.filter((v) => ['ad', 'link', 'kod', 'sifre'].includes(v) && !text.includes(`{${v}}`));
      if (lost.length) missing.push(`${title}: ${lost.map((v) => `{${v}}`).join(', ')}`);
    }
    const link = String(form.yorumLinki || '').trim();
    if (link && !/^https:\/\/\S+$/.test(link)) missing.push('Google yorum bağlantısı "https://" ile başlamalı');
    const gun = (k, lo, hi, d) => Math.min(Math.max(Number.parseInt(form[k], 10) || d, lo), hi);
    const kurallar = { hatirlatmaGunOnce: gun('hatirlatmaGunOnce', 1, 30, 3), yorumIstemeGunSonra: gun('yorumIstemeGunSonra', 1, 60, 7), yildonumuGunSonra: gun('yildonumuGunSonra', 0, 60, 7) };
    db.setSetting('wa_overrides', JSON.stringify({ metinler, kurallar, yorumLinki: /^https:\/\/\S+$/.test(link) ? link : '' }));
    setFlash(req, missing.length
      ? { message: `Kaydedildi. Dikkat, şu mesajlarda önemli alan eksik: ${missing.join(' · ')}`, type: 'error' }
      : { message: 'Mesajlar kaydedildi.', type: 'success' });
    redirect(res, '/admin/mesajlar');
  });

  // ── Sözleşme ──
  router.get('/admin/sozlesme', (req, res) => {
    if (!requireAdmin(req, res)) return;
    html(res, contractViews.settingsPage(getContent(), { adminNav: views.adminNav, adminTabs: views.adminTabs, flashBlock: views.flashBlock, csrf: req.session.csrf, flash: takeFlash(req), demoAdmin: demo.isDemoAdmin(req) }));
  });
  router.post('/admin/sozlesme', async (req, res) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const o = siteOver();
    const t = (k, n) => cleanText(form[k], n);
    const company = {};
    for (const k of ['unvan', 'sorumlu', 'telefon', 'adres', 'vergiDairesi', 'vergiNo', 'mahkeme']) company[k] = t(k, 160);
    const template = String(form.template || '').replace(/\r\n/g, '\n').trim().slice(0, 40000);
    o.contract = { title: t('title', 120), company };
    if (form.reset !== '1' && template && template !== contract.DEFAULT_TEMPLATE) o.contract.template = template;
    const kv = String(form.kvkk || '').replace(/\r\n/g, '\n').trim().slice(0, 30000);
    o.kvkk = form.kvkkReset !== '1' && kv && kv !== require('../kvkk').DEFAULT_TEXT ? { text: kv } : {};
    saveOver(o);
    setFlash(req, { message: form.reset === '1' ? 'Sözleşme metni ilk hâline döndü.' : 'Sözleşme kaydedildi.', type: 'success' });
    redirect(res, '/admin/sozlesme');
  });
  router.post('/admin/sozlesme/imza', async (req, res) => {
    const form = await formGuard(req, res);
    if (!form) return;
    if (form.sil === '1') { db.setSetting('contract_signature', ''); setFlash(req, { message: 'Kayıtlı imza silindi.', type: 'success' }); return redirect(res, '/admin/sozlesme#imza'); }
    const imza = String(form.imza || '');
    if (!contract.validSignature(imza)) { setFlash(req, { message: 'Lütfen imzanızı çizin.', type: 'error' }); return redirect(res, '/admin/sozlesme#imza'); }
    db.setSetting('contract_signature', imza);
    setFlash(req, { message: 'İmzanız kaydedildi. Gönderilen sözleşmelerde görünecek.', type: 'success' });
    redirect(res, '/admin/sozlesme#imza');
  });
  const contractData = (couple) => contract.snapshotData(getContent(), db.getCoupleCard(couple.id), db.listEvents(couple.id), db.listPayments(couple.id));
  router.get('/admin/ciftler/:id/sozlesme', (req, res, { params, query }) => {
    if (!requireAdmin(req, res)) return;
    const couple = getCoupleOr404(params.id);
    const k = query.get('onizleme') ? null : db.activeContract(couple.id);
    html(res, contractViews.contractDoc(getContent(), { k, data: k ? JSON.parse(k.snapshot) : contractData(couple), back: `/admin/ciftler/${couple.id}#sozlesme` }));
  });
  router.post('/admin/ciftler/:id/sozlesme', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const couple = getCoupleOr404(params.id);
    if (!db.listEvents(couple.id).length) {
      setFlash(req, { message: 'Önce kişi kartına en az bir etkinlik girin.', type: 'error' });
      return redirect(res, `/admin/ciftler/${couple.id}#sozlesme`);
    }
    const contractId = db.createContract(couple.id, JSON.stringify(contractData(couple)));
    events.contractSent(couple.id, contractId);
    setFlash(req, { message: 'Sözleşme çiftin paneline gönderildi. WhatsApp ile haber verebilirsiniz.', type: 'success' });
    redirect(res, `/admin/ciftler/${couple.id}#sozlesme`);
  });
  router.post('/admin/ciftler/:id/sozlesme/iptal', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const couple = getCoupleOr404(params.id);
    const k = db.activeContract(couple.id);
    if (k && !k.signed_at) db.cancelContract(k.id);
    setFlash(req, { message: 'Sözleşme geri çekildi.', type: 'success' });
    redirect(res, `/admin/ciftler/${couple.id}#sozlesme`);
  });

  // ── Aylık rapor ──
  router.get('/admin/rapor', (req, res, { query }) => {
    if (!requireAdmin(req, res)) return;
    const y = Number(query.get('yil')) || Number(today().slice(0, 4));
    html(res, views.report(getContent(), { year: y, events: db.allEvents(), payments: db.allPayments(), couples: db.listCouples(), csrf: req.session.csrf, demoAdmin: demo.isDemoAdmin(req) }));
  });

  // Etkinlik satırları → Excel'de açılan CSV (her etkinlik bir satır)
  function eventsCsv(evs) {
    const stages = getContent().stages;
    const cards = new Map(db.listCouples().map((k) => [k.id, k]));
    const d = appt.shortDate;
    const cols = [
      ['Randevu No', (k) => k.ref_no], ['Ad Soyad', (k) => k.full_name], ['Eş Adı', (k) => k.partner_name],
      ['Telefon', (k) => (k.phone ? wa.displayPhone(k.phone) : '')], ['Etkinlik Türü', (k, e) => e.event_type],
      ['Etkinlik Tarihi', (k, e) => d(e.event_date)], ['Başlangıç Saati', (k, e) => e.start_time],
      ['Şehir', (k, e) => e.city], ['Mekân', (k, e) => e.venue], ['Paket', (k, e) => e.package], ['Paket Detayı', (k, e) => e.package_detail],
      ['Etkinlik Tutarı', (k, e) => e.price], ['Ekip', (k, e) => e.team],
      ['Kart Toplamı', (k) => k.total], ['Alınan Ödeme', (k) => k.paid], ['Kalan Bakiye', (k) => appt.payment(k)[2]],
      ['Ödeme Durumu', (k) => appt.payment(k)[1]], ['Aşama', (k) => stages[k.stage] || ''],
      ['Fotoğraf Hazır', (k) => (k.photo_ready ? 'Evet' : 'Hayır')], ['Video Hazır', (k) => (k.video_ready ? 'Evet' : 'Hayır')],
      ['Albüm Hazır', (k) => (k.album_ready ? 'Evet' : 'Hayır')], ['Teslim Tarihi', (k) => d(k.due_date)],
      ['Müşteri Kaynağı', (k) => k.source], ['Notlar', (k) => k.notes],
    ];
    const rows = evs.map((e) => [cards.get(e.couple_id), e]).filter(([k]) => k);
    return '﻿' + [cols.map((x) => x[0]).join(';'), ...rows.map(([k, e]) => cols.map((x) => csvCell(x[1](k, e))).join(';'))].join('\r\n');
  }
  function paymentsCsv(couples) {
    const lines = ['Randevu No;Çift;Tarih;Tutar;Yöntem;Not'];
    for (const k of couples) for (const p of db.listPayments(k.id)) lines.push([k.ref_no, k.name, appt.shortDate(p.paid_on), p.amount, p.method, p.note].map(csvCell).join(';'));
    return '﻿' + lines.join('\r\n');
  }

  router.get('/admin/randevular.csv', (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="hm4-randevular-${today()}.csv"`,
      'Cache-Control': 'no-store',
    });
    res.end(eventsCsv(db.allEvents()));
  });

  // ── Video teslimi: parça parça yükleme (8 MB'lık parçalar), bağlantı ekleme, silme ──
  const uploads = new Map(); // uploadId → { coupleId, next, bytes, at }
  const MAX_VIDEO = (Number(process.env.MAX_VIDEO_GB) || 10) * 1024 ** 3;
  const VIDEO_KINDS = ['Klip', 'Düğün filmi', 'Reels', 'Teaser', 'Diğer'];
  router.post('/admin/ciftler/:id/video/parca', async (req, res, { params }) => {
    apiGuard(req);
    const couple = getCoupleOr404(params.id);
    const uploadId = String(req.headers['x-upload-id'] || '');
    const index = Number(req.headers['x-index']);
    const total = Number(req.headers['x-total']);
    if (!/^[a-f0-9]{32}$/.test(uploadId) || !Number.isInteger(index) || !Number.isInteger(total) || index < 0 || total < 1 || index >= total || total > 2000) throw new HttpError(400, 'Geçersiz yükleme.');
    for (const [k, u] of uploads) if (Date.now() - u.at > 6 * 3600 * 1000) { uploads.delete(k); media.discardVideoUpload(k); }
    let u = uploads.get(uploadId);
    if (index === 0) { u = { coupleId: couple.id, next: 0, bytes: 0, at: Date.now() }; uploads.set(uploadId, u); }
    if (!u || u.coupleId !== couple.id || u.next !== index) throw new HttpError(409, 'Yükleme sırası bozuldu, baştan deneyin.');
    const chunk = await readBody(req, 17 * 1024 * 1024);
    if (!chunk.length) throw new HttpError(400, 'Boş parça.');
    media.markUploadActivity();
    u.bytes = media.appendVideoChunk(uploadId, chunk, index === 0);
    u.next++; u.at = Date.now();
    if (u.bytes > MAX_VIDEO) { uploads.delete(uploadId); media.discardVideoUpload(uploadId); throw new HttpError(413, 'Video çok büyük.'); }
    if (index < total - 1) return json(res, { ok: true, next: u.next });
    uploads.delete(uploadId);
    const fileKey = newKey();
    const done = media.finishVideo(uploadId, couple.id, fileKey);
    if (!done) throw new HttpError(415, 'Desteklenmeyen video biçimi. MP4 veya MOV yükleyin.');
    const kind = VIDEO_KINDS.includes(decodeURIComponent(String(req.headers['x-kind'] || ''))) ? decodeURIComponent(String(req.headers['x-kind'])) : 'Klip';
    const title = cleanText(decodeURIComponent(String(req.headers['x-title'] || '')), 120);
    const id = db.addVideo({ coupleId: couple.id, title, kind, fileKey, ext: done.ext, size: done.size });
    events.videoAdded(couple.id, title);
    json(res, { ok: true, id });
  });

  router.post('/admin/ciftler/:id/video/baglanti', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const couple = getCoupleOr404(params.id);
    const link = String(form.link || '').trim();
    if (!/^https:\/\/[^\s"'<>]{4,500}$/.test(link)) { setFlash(req, { message: 'Bağlantı https:// ile başlamalı.', type: 'error' }); return redirect(res, `/admin/ciftler/${couple.id}#video`); }
    db.addVideo({ coupleId: couple.id, title: cleanText(form.title, 120), kind: VIDEO_KINDS.includes(form.kind) ? form.kind : 'Klip', link });
    events.videoAdded(couple.id, cleanText(form.title, 120));
    setFlash(req, { message: 'Video bağlantısı eklendi.', type: 'success' });
    redirect(res, `/admin/ciftler/${couple.id}#video`);
  });

  router.post('/admin/ciftler/:id/video/:vid/sil', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const couple = getCoupleOr404(params.id);
    const v = db.getVideo(toId(params.vid));
    if (!v || v.couple_id !== couple.id) throw new HttpError(404, 'Bulunamadı');
    db.deleteVideo(v.id);
    if (v.file_key) media.removeVideo(couple.id, v.file_key, v.ext);
    setFlash(req, { message: 'Video silindi.', type: 'success' });
    redirect(res, `/admin/ciftler/${couple.id}#video`);
  });

  // Çiftin fotoğrafları tek ZIP (yönetici)
  router.get('/admin/ciftler/:id/indir', async (req, res, { params, query }) => {
    if (!requireAdmin(req, res)) return;
    const couple = getCoupleOr404(params.id);
    const g = query.get('g');
    const onlyFav = g === 'fav';
    const entries = media.couplePhotoEntries(couple.id, onlyFav ? db.listFavoritePhotos(couple.id) : db.listPhotos(couple.id, g === 'duzenli' ? 'duzenli' : 'secim'));
    if (!entries.length) throw new HttpError(404, 'İndirilecek fotoğraf yok');
    const name = `${couple.ref_no ? couple.ref_no + ' ' : ''}${couple.name}${onlyFav ? ' - Albüm seçimi' : g === 'duzenli' ? ' - Düzenlenmiş' : ' - Seçim'}.zip`.replace(/[\\/:*?"<>|]+/g, '-');
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="fotograflar.zip"; filename*=UTF-8''${encodeURIComponent(name)}`, 'Cache-Control': 'no-store' });
    await require('../zip').streamZip(res, entries).catch(() => res.destroy());
  });

  // ── Albüm seçim listeleri (seri numaraları: RAW orijinalleri işlemek için) ──
  router.get('/admin/ciftler/:id/secim.txt', (req, res, { params }) => {
    if (!requireAdmin(req, res)) return;
    const couple = getCoupleOr404(params.id);
    const favs = db.listFavoritePhotos(couple.id);
    const names = favs.length ? appt.selectionNames(favs) : (couple.archived_selection ? couple.archived_selection.split('\n').filter(Boolean) : []);
    const file = `${couple.ref_no ? couple.ref_no + ' ' : ''}${couple.name} - secim.txt`.replace(/[\\/:*?"<>|]+/g, '-');
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="secim.txt"; filename*=UTF-8''${encodeURIComponent(file)}`,
      'Cache-Control': 'no-store',
    });
    res.end(names.join('\r\n') + (names.length ? '\r\n' : ''));
  });

  // Seçimini tamamlamış tüm çiftler tek tabloda: Randevu No; Çift; Seri No
  router.get('/admin/secimler.csv', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const lines = ['Randevu No;Çift;Kare;Seri No'];
    for (const k of db.listCouples().filter((x) => x.album_locked)) {
      const names = appt.selectionNames(db.listFavoritePhotos(k.id));
      names.forEach((n, i) => lines.push([k.ref_no, k.name, i + 1, n].map(csvCell).join(';')));
    }
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="hm4-album-secimleri-${today()}.csv"`,
      'Cache-Control': 'no-store',
    });
    res.end('\uFEFF' + lines.join('\r\n'));
  });

  // ── Sunucu alanı: teslim edilen çiftlerin dosyalarını sil (kart, randevu, ödeme ve seçim listesi kalır) ──
  // onlySelection: seçim fotoğrafları silinir, düzenlenmiş (teslim) fotoğraflar çiftte kalır. Dönüş: açılan alan (bayt)
  function clearFiles(couple, withVideos, onlySelection) {
    const favs = db.listFavoritePhotos(couple.id);
    const prev = couple.archived_selection ? couple.archived_selection.split('\n').filter(Boolean) : [];
    const selection = [...prev, ...appt.selectionNames(favs)].join('\n');
    const u = media.coupleUsage(couple.id);
    let freed;
    if (onlySelection) {
      const sel = db.listPhotos(couple.id, 'secim');
      freed = media.photosSize(couple.id, sel);
      media.removePhotoDirs(couple.id, sel);
      if (withVideos) { freed += u.videos; media.removeCoupleVideos(couple.id); }
      db.archiveCoupleFiles(couple.id, { selection, photoCount: sel.length, withVideos, onlySelection: true });
    } else {
      freed = u.photos + (withVideos ? u.videos : 0);
      media.clearCoupleFiles(couple.id, withVideos);
      db.archiveCoupleFiles(couple.id, { selection, photoCount: db.listPhotos(couple.id).length, withVideos });
    }
    return freed;
  }
  const gb = (n) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1).replace('.', ',')} GB` : `${Math.max(1, Math.round(n / 1024 ** 2))} MB`);

  router.post('/admin/ciftler/:id/dosyalari-sil', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const couple = getCoupleOr404(params.id);
    const withVideos = form.videolar === '1';
    const freed = clearFiles(couple, withVideos, form.ne === 'secim');
    setFlash(req, { message: freed ? `${couple.name}: ${gb(freed)} yer açıldı. Kart, randevular, ödemeler ve seçim listesi duruyor.` : `${couple.name}: silinecek dosya yoktu.`, type: 'success' });
    redirect(res, `/admin/ciftler/${couple.id}`);
  });

  router.post('/admin/veriler/temizle', async (req, res) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const ids = [].concat(form.cift || []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    const withVideos = form.videolar === '1';
    let freed = 0, n = 0;
    for (const id of ids) {
      const couple = db.getCouple(id);
      if (!couple) continue;
      freed += clearFiles(couple, withVideos, form.ne === 'secim'); n++;
    }
    setFlash(req, { message: n ? `${n} çiftin dosyaları silindi, ${gb(freed)} yer açıldı.` : 'Çift seçmediniz.', type: n ? 'success' : 'error' });
    redirect(res, '/admin/veriler#alan');
  });

  // ── Veriler: yedekler ve sezon arşivleri ──
  router.get('/admin/veriler', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const last = getContent().stages.length - 1;
    const storage = db.listCouples().map((k) => ({ k, u: media.coupleUsage(k.id), done: k.stage >= last })).filter((x) => x.u.photos + x.u.videos > 0)
      .sort((a, b) => (b.done - a.done) || ((b.u.photos + b.u.videos) - (a.u.photos + a.u.videos)));
    let disk = null;
    try { const st = fs.statfsSync(config.dataDir); disk = { total: st.blocks * st.bsize, free: st.bavail * st.bsize }; } catch { /* desteklenmiyorsa gösterme */ }
    html(res, views.dataPage(getContent(), { disk, storage, diskTotal: media.dirSize(config.privateDir) + media.dirSize(config.publicMediaDir), backups: backup.listBackups(), seasons: backup.seasonSummary(), csrf: req.session.csrf, flash: takeFlash(req), demoAdmin: demo.isDemoAdmin(req) }));
  });

  router.post('/admin/veriler/yedek', async (req, res) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const name = backup.manual();
    setFlash(req, { message: `Yedek alındı: ${name}`, type: 'success' });
    redirect(res, '/admin/veriler');
  });

  router.get('/admin/veriler/yedek/:name', (req, res, { params }) => {
    if (!requireAdmin(req, res)) return;
    const file = backup.backupPath(params.name);
    if (!file || !fs.existsSync(file)) throw new HttpError(404, 'Bulunamadı');
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${params.name}"`, 'Content-Length': fs.statSync(file).size, 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });

  router.get('/admin/veriler/sezon/:year', async (req, res, { params }) => {
    if (!requireAdmin(req, res)) return;
    const year = Number(params.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new HttpError(404, 'Bulunamadı');
    await backup.streamSeason(res, year, { csvEvents: eventsCsv, csvPayments: paymentsCsv });
  });

  router.get('/admin/ciftler/:id', (req, res, { params, query }) => {
    if (!requireAdmin(req, res)) return;
    const couple = getCoupleOr404(params.id);
    const all = db.listPhotos(couple.id, 'secim');
    const edited = db.listPhotos(couple.id, 'duzenli');
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
      loginUrl: `${config.siteUrl}/uygulama`,
      card: db.getCoupleCard(couple.id),
      selection: appt.selectionNames(favs),
      videos: db.listVideos(couple.id),
      edited,
      events: db.listEvents(couple.id).map((e) => ({ ...e, members: db.eventMembers(e.id) })),
      payments: db.listPayments(couple.id),
      contract: db.activeContract(couple.id),
      albumPages: db.listAlbumPages(couple.id),
      deliveries: db.listDeliveries(couple.id),
      gift: (() => { const gifts = require('../gifts'); return { codes: db.giftCodesFor(couple.id), settings: gifts.settings(), cameWith: db.giftUsedBy(couple.id), today: today() }; })(),
      demoAdmin: demo.isDemoAdmin(req),
    }));
  });

  // ── Teslim tutanağı (ofiste, çift stüdyonun cihazında imzalar) ──
  const deliveryViews = require('../views/delivery');
  const deliveryForm = (req, res, couple, extra = {}) => {
    const card = db.getCoupleCard(couple.id);
    html(res, deliveryViews.formPage(getContent(), {
      couple: { ...couple, full_name: card?.full_name && card?.partner_name ? `${card.full_name}` : card?.full_name || '' },
      items: getContent().delivery?.items || [], existing: db.listDeliveries(couple.id),
      balance: card?.total ? Math.max(card.total - card.paid, 0) : 0, csrf: req.session.csrf, demoAdmin: demo.isDemoAdmin(req), ...extra,
    }), extra.errors ? 400 : 200);
  };
  router.get('/admin/ciftler/:id/teslim', (req, res, { params }) => {
    if (!requireAdmin(req, res)) return;
    deliveryForm(req, res, getCoupleOr404(params.id));
  });
  router.post('/admin/ciftler/:id/teslim', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const couple = getCoupleOr404(params.id);
    const picked = new Set([].concat(form.item || []).map(String));
    const items = [];
    for (let i = 0; i < 20; i++) {
      const name = cleanText(form[`name_${i}`], 80);
      if (!name) continue;
      const isDefault = i < (getContent().delivery?.items || []).length;
      if (isDefault && !picked.has(String(i))) continue;
      items.push({ name, detail: cleanText(form[`detail_${i}`], 120) });
    }
    const ad = cleanText(form.ad, 80);
    const errors = [];
    if (!items.length) errors.push('Teslim edilen en az bir şeyi işaretleyin.');
    if (ad.length < 3) errors.push('Teslim alanın adını soyadını yazın.');
    if (!contract.validSignature(String(form.imza || ''))) errors.push('Lütfen imzanızı çizin.');
    if (form.kabul !== '1') errors.push('“Eksiksiz teslim aldım” kutusunu işaretleyin.');
    if (errors.length) return deliveryForm(req, res, couple, { values: form, errors });
    const c = getContent();
    const co = contract.settings(c).company;
    const card = db.getCoupleCard(couple.id);
    const now = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', year: 'numeric' });
    const snapshot = {
      couple: couple.name, refNo: card?.ref_no || '', items, note: String(form.note || '').trim().slice(0, 500),
      statement: String(c.delivery?.statement || '').replace(/\{ad\}/g, ad).replace(/\{tarih\}/g, now).replace(/\{firma\}/g, co.unvan || c.brand.name).replace(/\{gun\}/g, String(c.delivery?.keepDays || 90)),
      company: { unvan: co.unvan, sorumlu: co.sorumlu, imza: contract.studioSignature() },
    };
    const hash = require('node:crypto').createHash('sha256').update(JSON.stringify({ snapshot, ad, imza: form.imza })).digest('hex');
    const did = db.addDelivery({ coupleId: couple.id, snapshot, signerName: ad, signature: form.imza, ip: clientIp(req), userAgent: String(req.headers['user-agent'] || '').slice(0, 300), hash });
    const last = c.stages.length - 1;
    if (couple.stage < last) { db.setCoupleStage(couple.id, last, couple.stage_note || ''); events.stageChanged(couple, last); }
    setFlash(req, { message: `Teslim tutanağı imzalandı; iş “${c.stages[last]}” aşamasında.`, type: 'success' });
    redirect(res, `/admin/ciftler/${couple.id}/teslim/${did}`);
  });
  router.get('/admin/ciftler/:id/teslim/:did', (req, res, { params }) => {
    if (!requireAdmin(req, res)) return;
    const couple = getCoupleOr404(params.id);
    const d = db.getDelivery(toId(params.did));
    if (!d || d.couple_id !== couple.id) throw new HttpError(404, 'Tutanak bulunamadı');
    html(res, deliveryViews.doc(getContent(), { d, back: `/admin/ciftler/${couple.id}` }));
  });

  // ── Hediye kuponları ──
  router.post('/admin/ciftler/:id/hediye-olustur', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const couple = getCoupleOr404(params.id);
    require('../gifts').ensureCodes(couple);
    redirect(res, `/admin/ciftler/${couple.id}#hediye`);
  });
  router.post('/admin/ciftler/:id/hediye/:gid/verildi', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const couple = getCoupleOr404(params.id);
    const g = db.giftCodesFor(couple.id).find((x) => x.id === toId(params.gid));
    if (g) db.giveGiftReward(g.id);
    redirect(res, `/admin/ciftler/${couple.id}#hediye`);
  });
  router.get('/admin/ciftler/:id/hediye-kartlari', (req, res, { params }) => {
    if (!requireAdmin(req, res)) return;
    const couple = getCoupleOr404(params.id);
    const gifts = require('../gifts');
    html(res, views.giftCards(getContent(), { couple, codes: db.giftCodesFor(couple.id), settings: gifts.settings(), qr: (t) => require('../qr').svg(t, { size: 132 }), url: gifts.giftUrl }));
  });
  router.get('/admin/hediye', (req, res) => {
    if (!requireAdmin(req, res)) return;
    html(res, views.giftSettingsPage(getContent(), { gs: require('../gifts').settings(), stats: db.giftStats(), csrf: req.session.csrf, flash: takeFlash(req), demoAdmin: demo.isDemoAdmin(req) }));
  });
  router.post('/admin/hediye', async (req, res) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const o = siteOver();
    const num = (v, a, b, d) => Math.min(Math.max(Number(v) || d, a), b);
    o.gifts = {
      ...(getContent().gifts || {}),
      active: form.active === '1',
      gift: cleanText(form.gift, 120), reward: cleanText(form.reward, 120), rules: cleanText(form.rules, 400),
      perCouple: num(form.perCouple, 1, 10, 3), validDays: num(form.validDays, 30, 1095, 365),
    };
    saveOver(o);
    setFlash(req, { message: o.gifts.active ? 'Kaydedildi. Program açık: teslim alan çiftler kuponlarını panelde görür.' : 'Kaydedildi. Program kapalı.', type: 'success' });
    redirect(res, '/admin/hediye');
  });

  // ── Albüm tasarımı: sayfa yükle (aynı adlı sayfa varsa yerine geçer), sil, çifte gönder ──
  router.post('/admin/ciftler/:id/album-sayfa', async (req, res, { params }) => {
    apiGuard(req);
    const couple = getCoupleOr404(params.id);
    media.markUploadActivity();
    const name = cleanText(decodeURIComponent(String(req.headers['x-filename'] || '')), 160) || 'sayfa.jpg';
    const body = await readBody(req, config.maxUploadBytes);
    const parts = media.splitParts(req, body);
    const fileKey = newKey();
    media.saveCouplePhoto(couple.id, fileKey, { thumb: parts.thumb, display: parts.display });
    const old = db.albumPageByName(couple.id, name);
    if (old) { db.replaceAlbumPage(old.id, fileKey); media.removeCouplePhoto(couple.id, old.file_key); }
    const id = old ? old.id : db.addAlbumPage(couple.id, fileKey, name);
    json(res, { ok: true, id, replaced: Boolean(old) });
  });

  router.post('/admin/ciftler/:id/album-sayfa/:pid/sil', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const couple = getCoupleOr404(params.id);
    const page = db.getAlbumPage(toId(params.pid));
    if (page && page.couple_id === couple.id) { db.deleteAlbumPage(page.id); media.removeCouplePhoto(couple.id, page.file_key); }
    redirect(res, `/admin/ciftler/${couple.id}#album`);
  });

  router.post('/admin/ciftler/:id/album-gonder', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const couple = getCoupleOr404(params.id);
    if (!db.listAlbumPages(couple.id).length) throw new HttpError(400, 'Önce albüm sayfalarını yükleyin.');
    db.setAlbumDesign(couple.id, 'hazir', true);
    events.albumDesignReady(couple.id);
    setFlash(req, { message: `Albüm tasarımı ${couple.name} çiftine gönderildi.${wa.autoSend() ? '' : ' WhatsApp mesajı Panel › Gönderilecek mesajlar listesinde.'}`, type: 'success' });
    redirect(res, `/admin/ciftler/${couple.id}#album`);
  });

  router.post('/admin/ciftler/:id/asama', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const couple = getCoupleOr404(params.id);
    const stages = getContent().stages;
    const stage = Math.min(Math.max(Number.parseInt(form.stage, 10) || 0, 0), stages.length - 1);
    db.setCoupleStage(couple.id, stage, String(form.note || '').trim().slice(0, 500));
    const vlist = getContent().appointments?.videoStages || [];
    const vstat = vlist.includes(form.videoStatus) ? form.videoStatus : '';
    db.setVideoStatus(couple.id, vstat);
    if (stage !== couple.stage) events.stageChanged(couple, stage);
    if (vstat !== (couple.video_status || '')) events.videoStatusChanged(couple.id, vstat);
    setFlash(req, { message: `Aşama güncellendi: ${stages[stage]}`, type: 'success' });
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
  router.get('/admin/takvim', (req, res, { query }) => {
    if (!requireAdmin(req, res)) return;
    const ay = query.get('ay');
    const ym = /^\d{4}-(0[1-9]|1[0-2])$/.test(ay || '') ? ay : today().slice(0, 7);
    html(res, views.calendar(getContent(), { couples: db.listCouples(), monthEvents: db.eventsBetween(`${ym}-01`, `${ym}-31`), ym, csrf: req.session.csrf, demoAdmin: demo.isDemoAdmin(req) }));
  });

  router.post('/admin/ciftler/:id/sifre', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const couple = getCoupleOr404(params.id);
    const password = auth.memorablePassword();
    const hash = auth.hashPassword(password);
    db.setCouplePassword(couple.id, hash);
    db.deleteSessionsFor('couple', couple.id); // açık oturumları kapat
    setFlash(req, {
      message: 'Yeni şifre oluşturuldu. Eski şifre artık çalışmaz.',
      type: 'success',
      credentials: { url: `${config.siteUrl}/uygulama`, link: auth.loginLink(couple.id, hash), code: couple.access_code, password, phone: couple.phone, name: couple.name },
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
    media.markUploadActivity();
    // Tekrar denemede aynı dosya ikinci kez eklenmesin (ilk deneme kaydedilmiş ama cevap yolda kaybolmuş olabilir)
    const uploadKey = /^[a-f0-9]{32}$/.test(String(req.headers['x-upload-key'] || '')) ? String(req.headers['x-upload-key']) : null;
    const seen = uploadKey && db.photoByUploadKey(couple.id, uploadKey);
    if (seen) { req.resume(); return json(res, { ok: true, id: seen.id, again: true }); }
    const body = await readBody(req, config.maxUploadBytes);
    const parts = media.splitParts(req, body);
    const fileKey = newKey();
    const originalName = cleanText(decodeURIComponent(String(req.headers['x-filename'] || '')), 160);
    media.saveCouplePhoto(couple.id, fileKey, parts);
    const kind = decodeURIComponent(String(req.headers['x-category'] || '')) === 'duzenli' ? 'duzenli' : 'secim';
    const dim = media.jpegSize(parts.thumb) || {};
    const id = db.addPhoto({ coupleId: couple.id, fileKey, originalName, originalExt: parts.originalExt, kind, uploadKey, w: dim.w || null, h: dim.h || null });
    events.photosUploaded(couple.id, kind);
    json(res, { ok: true, id });
  });

  // Çiftin Fotoğraflar sayfasındaki tam ekran kapak (aynı fotoğrafa tekrar basınca kaldırılır)
  router.post('/admin/ciftler/:id/kapak/:pid', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const couple = getCoupleOr404(params.id);
    const photo = db.getPhoto(toId(params.pid));
    if (!photo || photo.couple_id !== couple.id) throw new HttpError(404, 'Bulunamadı');
    const off = couple.cover_photo_id === photo.id;
    db.setCoverPhoto(couple.id, off ? null : photo.id);
    setFlash(req, { message: off ? 'Kapak kaldırıldı; sistem otomatik seçecek.' : 'Kapak fotoğrafı seçildi. Çift, Fotoğraflar sayfasını bu fotoğrafla açılmış görecek.', type: 'success' });
    redirect(res, `/admin/ciftler/${couple.id}${photo.kind === 'duzenli' ? '#duzenli' : '#foto'}`);
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
    if (!photo || photo.couple_id !== couple.id || photo.kind === 'duzenli') throw new HttpError(404, 'Bulunamadı');
    db.setFavorite(couple.id, photo.id, Boolean(on));
    json(res, { ok: true, on: Boolean(on), count: db.listFavoritePhotos(couple.id).length });
  });

  // ── Portfolyo ──
  // Portfolyo etiketleri (Ayarlar): ekle, yeniden adlandır, sırala, sil — fotoğraflardaki etiketler de güncellenir
  router.get('/admin/portfolyo-etiketleri', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const counts = {};
    for (const p of portfolioItems()) for (const t of p.tags) counts[t] = (counts[t] || 0) + 1;
    html(res, views.portfolioTagsPage(getContent(), { counts, csrf: req.session.csrf, flash: takeFlash(req), demoAdmin: demo.isDemoAdmin(req) }));
  });
  router.post('/admin/portfolyo-etiketleri', async (req, res) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const rows = Object.keys(form).filter((k) => /^name_\d+$/.test(k)).map((k) => {
      const i = k.slice(5);
      return { name: cleanText(form[k], 40), old: cleanText(form[`old_${i}`], 40) };
    });
    const list = [];
    const rename = new Map();
    for (const r of rows) {
      if (!r.name || list.some((x) => x.toLocaleLowerCase('tr-TR') === r.name.toLocaleLowerCase('tr-TR'))) continue;
      list.push(r.name);
      if (r.old && r.old !== r.name) rename.set(r.old, r.name);
    }
    if (list.length > 40) list.length = 40;
    const keep = new Set(list);
    for (const p of portfolioItems()) {
      const next = [...new Set(p.tags.map((t) => rename.get(t) || t).filter((t) => keep.has(t)))];
      if (JSON.stringify(next) !== JSON.stringify(p.tags)) db.setPortfolioTags(p.id, next);
    }
    const o = siteOver();
    o.portfolio = { ...(o.portfolio || {}), categories: list };
    saveOver(o);
    setFlash(req, { message: 'Portfolyo etiketleri kaydedildi.', type: 'success' });
    redirect(res, '/admin/portfolyo-etiketleri');
  });

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
    media.markUploadActivity();
    // Tekrar denemede aynı dosya ikinci kez eklenmesin (ilk deneme kaydedilmiş ama cevap yolda kaybolmuş olabilir)
    const uploadKey = /^[a-f0-9]{32}$/.test(String(req.headers['x-upload-key'] || '')) ? String(req.headers['x-upload-key']) : null;
    const seenId = uploadKey && pfUploads.get(uploadKey);
    if (seenId) { req.resume(); return json(res, { ok: true, id: seenId, again: true }); }
    const body = await readBody(req, config.maxUploadBytes);
    const parts = media.splitParts(req, body);
    const fileKey = newKey();
    const cats = getContent().portfolio.categories;
    const category = decodeURIComponent(String(req.headers['x-category'] || ''));
    media.savePortfolioPhoto(fileKey, parts);
    const id = db.addPortfolioItem({ fileKey, tags: cats.includes(category) ? [category] : [], alt: '' });
    if (uploadKey) { pfUploads.set(uploadKey, id); if (pfUploads.size > 500) pfUploads.delete(pfUploads.keys().next().value); }
    json(res, { ok: true, id });
  });

  router.post('/admin/portfolyo/:id', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const item = db.getPortfolioItem(toId(params.id));
    if (!item) throw new HttpError(404, 'Bulunamadı');
    const cats = getContent().portfolio.categories;
    db.updatePortfolioItem(item.id, { tags: cats.filter((t) => (form.tags || []).includes(t)), alt: cleanText(form.alt, 160) });
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
