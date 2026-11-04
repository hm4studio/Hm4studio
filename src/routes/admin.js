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
const { html, json, redirect, readForm, readJson, readBody, HttpError } = require('../http');
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

  // ── Panel: takvim, yaklaşanlar, çift kartları ──
  router.get('/admin', (req, res, { query }) => {
    if (!requireAdmin(req, res)) return;
    const ay = query.get('ay');
    const ym = /^\d{4}-(0[1-9]|1[0-2])$/.test(ay || '') ? ay : today().slice(0, 7);
    const t = today();
    const couplesAll = db.listCouples();
    const selections = couplesAll.filter((k) => k.album_locked && k.fav_count > 0)
      .map((k) => ({ k, names: appt.selectionNames(db.listFavoritePhotos(k.id)) }));
    const dow = (new Date(`${t}T12:00:00Z`).getUTCDay() + 6) % 7; // pazartesi = 0
    const monday = addDays(t, -dow);
    const weekEvents = db.eventsBetween(monday, addDays(monday, 6));
    html(res, views.dashboard(getContent(), { weekEvents, monday, selections, couples: couplesAll, monthEvents: db.eventsBetween(`${ym}-01`, `${ym}-31`), upcoming: db.eventsBetween(t, addDays(t, 30)), ym, csrf: req.session.csrf, flash: takeFlash(req), demoAdmin: demo.isDemoAdmin(req) }));
  });

  // Yeni kişi kartı formu (takvimden tarih, talepten bilgiler gelebilir)
  router.get('/admin/randevu/yeni', (req, res, { query }) => {
    if (!requireAdmin(req, res)) return;
    const values = { waOptin: 1, albumLimit: 60, ev0_date: appt.cleanDate(query.get('tarih')) || '', depositDate: today() };
    let talepId = null;
    const lead = query.get('talep') ? db.getLead(Number(query.get('talep')) || 0) : null;
    if (lead && !lead.couple_id) {
      talepId = lead.id;
      Object.assign(values, {
        fullName: lead.name, phone: lead.phone ? wa.displayPhone(lead.phone) : '', ev0_date: lead.event_date || values.ev0_date,
        ev0_venue: lead.place, source: lead.source === 'whatsapp' ? 'WhatsApp' : 'Site formu',
        ev0_type: (getContent().appointments?.eventTypes || []).find((t) => lead.service && lead.service.includes(t)) || '',
        notes: lead.message,
      });
    }
    html(res, views.appointmentPage(getContent(), { values, action: '/admin/ciftler', title: 'Yeni randevu', submitLabel: 'Randevuyu oluştur', csrf: req.session.csrf, talepId, back: talepId ? '/admin/talepler' : '/admin', demoAdmin: demo.isDemoAdmin(req), isNew: true, team: db.listTeam(), packages: db.listPackages().filter((x) => x.active) }));
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

  function defaultDue(a, list, c) {
    if (a.dueDate) return a.dueDate;
    const last = list.map((e) => e.eventDate).filter(Boolean).sort().pop();
    return last ? addDays(last, Number(c.appointments?.defaultDeliveryDays) || 45) : null;
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
    const id = db.createCouple({ name: a.name, accessCode: code, hash: auth.hashPassword(password), eventDate: null });
    a.dueDate = defaultDue(a, list, c);
    db.updateCard(id, a);
    const assigned = saveEvents(id, list);
    if (a.deposit > 0) db.addPayment(id, { amount: a.deposit, paidOn: a.depositDate || today(), note: 'Kapora' });
    const first = list.map((e) => e.eventDate).filter(Boolean).sort()[0];
    db.setRefNo(id, db.nextRefNo((first || today()).slice(0, 4)));
    const lead = form.talep ? db.getLead(Number(form.talep) || 0) : null;
    if (lead && !lead.couple_id) db.setLeadStatus(lead.id, 'rezervasyon', id);
    const warn = conflictText(id, list);
    setFlash(req, {
      message: `${a.name} için randevu oluşturuldu.${assigned ? ` ${assigned} ekip görevi verildi${config.n8nWebhookUrl ? ' ve WhatsApp mesajı gönderildi' : ''}.` : ''}${warn ? ' ' + warn : ''}`,
      type: warn ? 'error' : 'success',
      credentials: { url: `${config.siteUrl}/uygulama`, code, password, phone: a.phone, name: a.name },
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
    const total = list.reduce((s, e) => s + e.price, 0);
    if (total > 0 && paidSoFar > total) errors.push(`Alınan ödemeler (${appt.tl(paidSoFar)}) toplam tutarı aşıyor.`);
    if (errors.length) {
      return html(res, views.appointmentPage(c, { values: form, action: `/admin/ciftler/${couple.id}/bilgi`, title: `${couple.name} · düzenle`, submitLabel: 'Kaydet', csrf: req.session.csrf, errors, back: `/admin/ciftler/${couple.id}`, demoAdmin: demo.isDemoAdmin(req), team: db.listTeam(), packages: db.listPackages().filter((x) => x.active) }), 400);
    }
    a.dueDate = a.dueDate || couple.due_date || defaultDue(a, list, c);
    db.updateCard(couple.id, a);
    const assigned = saveEvents(couple.id, list);
    if (!couple.ref_no) db.setRefNo(couple.id, db.nextRefNo(today().slice(0, 4)));
    const warn = conflictText(couple.id, list);
    setFlash(req, { message: `Kaydedildi.${assigned ? ` ${assigned} yeni ekip görevi${config.n8nWebhookUrl ? ', WhatsApp mesajı gönderildi' : ''}.` : ''}${warn ? ' ' + warn : ''}`, type: warn ? 'error' : 'success' });
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
      eventTypes, sources: lines('sources', 15, 30), teamRoles: lines('teamRoles', 15, 30),
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
    json(res, { ok: true, id });
  });

  router.post('/admin/ciftler/:id/video/baglanti', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const couple = getCoupleOr404(params.id);
    const link = String(form.link || '').trim();
    if (!/^https:\/\/[^\s"'<>]{4,500}$/.test(link)) { setFlash(req, { message: 'Bağlantı https:// ile başlamalı.', type: 'error' }); return redirect(res, `/admin/ciftler/${couple.id}#video`); }
    db.addVideo({ coupleId: couple.id, title: cleanText(form.title, 120), kind: VIDEO_KINDS.includes(form.kind) ? form.kind : 'Klip', link });
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
    const onlyFav = query.get('g') === 'fav';
    const entries = media.couplePhotoEntries(couple.id, onlyFav ? db.listFavoritePhotos(couple.id) : db.listPhotos(couple.id));
    if (!entries.length) throw new HttpError(404, 'İndirilecek fotoğraf yok');
    const name = `${couple.ref_no ? couple.ref_no + ' ' : ''}${couple.name}${onlyFav ? ' - Albüm seçimi' : ''}.zip`.replace(/[\\/:*?"<>|]+/g, '-');
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
  function clearFiles(couple, withVideos) {
    const favs = db.listFavoritePhotos(couple.id);
    const prev = couple.archived_selection ? couple.archived_selection.split('\n').filter(Boolean) : [];
    const selection = [...prev, ...appt.selectionNames(favs)].join('\n');
    const photoCount = db.listPhotos(couple.id).length;
    media.clearCoupleFiles(couple.id, withVideos);
    db.archiveCoupleFiles(couple.id, { selection, photoCount, withVideos });
  }
  const gb = (n) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1).replace('.', ',')} GB` : `${Math.max(1, Math.round(n / 1024 ** 2))} MB`);

  router.post('/admin/ciftler/:id/dosyalari-sil', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const couple = getCoupleOr404(params.id);
    const before = media.coupleUsage(couple.id);
    const withVideos = form.videolar === '1';
    const freed = before.photos + (withVideos ? before.videos : 0);
    clearFiles(couple, withVideos);
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
      const u = media.coupleUsage(id);
      clearFiles(couple, withVideos);
      freed += u.photos + (withVideos ? u.videos : 0); n++;
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
    html(res, views.dataPage(getContent(), { storage, diskTotal: media.dirSize(config.privateDir) + media.dirSize(config.publicMediaDir), backups: backup.listBackups(), seasons: backup.seasonSummary(), csrf: req.session.csrf, flash: takeFlash(req), demoAdmin: demo.isDemoAdmin(req) }));
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
      loginUrl: `${config.siteUrl}/uygulama`,
      card: db.getCoupleCard(couple.id),
      selection: appt.selectionNames(favs),
      videos: db.listVideos(couple.id),
      events: db.listEvents(couple.id).map((e) => ({ ...e, members: db.eventMembers(e.id) })),
      payments: db.listPayments(couple.id),
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
    const vlist = getContent().appointments?.videoStages || [];
    const vstat = vlist.includes(form.videoStatus) ? form.videoStatus : '';
    db.setVideoStatus(couple.id, vstat);
    if (stage !== couple.stage) events.stageChanged(couple, stage);
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
  router.get('/admin/takvim', (req, res) => {
    if (!requireAdmin(req, res)) return;
    html(res, views.calendar(getContent(), { couples: db.listCouples(), csrf: req.session.csrf, demoAdmin: demo.isDemoAdmin(req) }));
  });

  router.post('/admin/ciftler/:id/sifre', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const couple = getCoupleOr404(params.id);
    const password = auth.memorablePassword();
    db.setCouplePassword(couple.id, auth.hashPassword(password));
    db.deleteSessionsFor('couple', couple.id); // açık oturumları kapat
    setFlash(req, {
      message: 'Yeni şifre oluşturuldu. Eski şifre artık çalışmaz.',
      type: 'success',
      credentials: { url: `${config.siteUrl}/uygulama`, code: couple.access_code, password, phone: couple.phone, name: couple.name },
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
    events.photosUploaded(couple.id);
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
