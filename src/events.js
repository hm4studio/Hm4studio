'use strict';
// Sitede olan önemli olayları n8n'e bildirir (aşama değişti, fotoğraflar yüklendi, yeni talep...).
// N8N_WEBHOOK_URL tanımlı değilse hiçbir şey yapmaz. Gönderim arka planda yapılır; hata siteyi durdurmaz.
const config = require('./config');
const db = require('./db');
const wa = require('./whatsapp');
const { getContent, getWhatsapp } = require('./content');
const push = require('./push');

// Telefon bildirimi hatası hiçbir işlemi durdurmasın
const safePush = (fn) => { try { const p = fn(); if (p?.catch) p.catch(() => {}); } catch (err) { console.error('Bildirim:', err.message); } };

async function post(payload) {
  if (!config.n8nWebhookUrl) return { skipped: true };
  try {
    const res = await fetch(config.n8nWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.n8nApiKey}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error(`n8n bildirimi başarısız (${payload.event}): HTTP ${res.status}`);
    return { ok: res.ok };
  } catch (err) {
    console.error(`n8n'e ulaşılamadı (${payload.event}):`, err.message);
    return { ok: false };
  }
}

function coupleInfo(c) {
  return { id: c.id, name: c.name, phone: c.phone || null, phoneDisplay: wa.displayPhone(c.phone), eventDate: c.event_date };
}

// Çifte WhatsApp mesajı gidebilir mi? (telefon var, izin verilmiş)
const canMessage = (c) => Boolean(c && c.phone && c.wa_optin);

function stageChanged(couple, stageIndex) {
  const stages = getContent().stages;
  const last = stageIndex >= stages.length - 1;
  const note = db.getCouple(couple.id)?.stage_note || '';
  safePush(() => push.toCouple(couple.id, { title: last ? 'Çalışmanız tamamlandı' : 'Çalışmanızın durumu güncellendi', body: last ? `Tüm teslimatlarınız panelinizde hazır.${note ? ` ${note}` : ''}` : `Çalışmanız “${stages[stageIndex] || ''}” aşamasına geçti.${note ? ` ${note}` : ''}`, url: '/panel', tag: 'asama' }));
  if (!config.n8nWebhookUrl) return;
  const c = db.getCouple(couple.id);
  const payload = { event: 'asama_degisti', at: new Date().toISOString(), couple: coupleInfo(c), stage: stageIndex, stageName: stages[stageIndex] || '', note: c.stage_note || '' };
  // WhatsApp yalnızca "Teslim" aşamasında, bir kez: video da varsa "fotoğraflarınız ve videonuz", yoksa "fotoğraflarınız"
  const key = `teslim:${c.id}`;
  if (last && canMessage(c) && !db.wasNotified(key)) {
    db.markNotified(key);
    payload.whatsapp = wa.templateMessage(c.phone, db.videoCount(c.id) > 0 ? 'teslimVideo' : 'teslim', { ad: c.name, link: wa.panelLink() });
  }
  post(payload);
}

// Fotoğraflar tek tek yüklenir; çifte tek mesaj gitsin diye son yüklemeden sonra bir süre beklenir
const photoTimers = new Map();
function photosUploaded(coupleId, kind = 'secim') {
  const waitMin = Number(getWhatsapp().kurallar?.fotografBildirimiBekleme) || 15;
  const waitMs = Number(process.env.HM4_PHOTO_NOTIFY_WAIT_MS) || waitMin * 60 * 1000; // testler için kısaltılabilir
  const tkey = `${coupleId}:${kind}`;
  clearTimeout(photoTimers.get(tkey));
  photoTimers.set(tkey, setTimeout(() => {
    photoTimers.delete(tkey);
    const c = db.getCouple(coupleId);
    if (!c) return;
    const edited = kind === 'duzenli' ? db.listPhotos(c.id, 'duzenli').length : 0;
    const pkey = `push-foto:${c.id}:${kind}:${new Date().toISOString().slice(0, 10)}`;
    if (!db.wasNotified(pkey)) {
      db.markNotified(pkey);
      safePush(() => push.toCouple(c.id, edited
        ? { title: 'Fotoğraflarınız teslim edildi', body: `Düzenlenmiş ${edited} fotoğrafınız panelinizde. Dilediğiniz zaman görüntüleyip indirebilirsiniz.`, url: '/panel/fotograflar?g=duzenli', tag: 'foto' }
        : { title: 'Fotoğraflarınız seçime hazır', body: 'Albümünüz için fotoğraf seçimine panelinizden başlayabilirsiniz.', url: '/panel/fotograflar', tag: 'foto' }));
    }
    if (!config.n8nWebhookUrl) return;
    const count = db.listPhotos(c.id).length;
    const payload = { event: 'fotograflar_yuklendi', at: new Date().toISOString(), couple: coupleInfo(c), photoCount: count, kind };
    // WhatsApp: yalnızca seçim fotoğrafları için ve bir kez. Düzenlenmiş fotoğraflar "Teslim" mesajıyla duyurulur.
    const key = `fotograflar:${c.id}`;
    if (kind === 'secim' && canMessage(c) && !db.wasNotified(key)) {
      payload.whatsapp = wa.templateMessage(c.phone, 'fotograflar', { ad: c.name, link: wa.panelLink() });
      db.markAlbumInfoSent(c.id);
      db.markNotified(key);
    }
    post(payload);
  }, waitMs).unref());
}

// Yeni randevu: "randevunuz oluşturuldu" + panel giriş bilgileri tek mesajda (bir kez). Gönderildiyse true döner.
function appointmentVars(c, { link, code, password }) {
  const first = db.listEvents(c.id).filter((e) => e.event_date).sort((x, y) => x.event_date.localeCompare(y.event_date))[0];
  const tarih = first
    ? `${first.event_type || 'Çekim'} · ${new Date(`${first.event_date}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' })}${first.start_time ? `, ${first.start_time}` : ''}`
    : 'Tarih belirlenecek';
  return { ad: c.name, no: c.ref_no || '-', tarih, link, kod: code, sifre: password };
}
function appointmentCreated(coupleId, creds) {
  const c = db.getCouple(coupleId);
  const key = `randevu:${coupleId}`;
  if (!config.n8nWebhookUrl || !canMessage(c) || db.wasNotified(key)) return false;
  db.markNotified(key);
  post({ event: 'randevu_olusturuldu', at: new Date().toISOString(), couple: coupleInfo(c), whatsapp: wa.templateMessage(c.phone, 'randevu', appointmentVars(c, creds)) });
  return true;
}

// Ekipten birine etkinlik görevi verildi: o kişiye WhatsApp mesajı (aynı görev için tarih değişmedikçe bir kez)
function teamAssigned(eventId, memberIds) {
  if (!config.n8nWebhookUrl || !memberIds.length) return;
  const ev = db.getEvent(eventId);
  if (!ev) return;
  const couple = db.getCouple(ev.couple_id);
  for (const id of memberIds) {
    const m = db.getMember(id);
    if (!m || !m.phone || !m.active || !m.wa_optin) continue;
    const key = `gorev:${ev.id}:${m.id}:${ev.event_date || ''}`;
    if (db.wasNotified(key)) continue;
    db.markNotified(key);
    post({
      event: 'ekip_gorev', at: new Date().toISOString(), member: { id: m.id, name: m.name, phone: m.phone },
      couple: couple ? coupleInfo(couple) : null, eventInfo: { id: ev.id, type: ev.event_type, date: ev.event_date, time: ev.start_time },
      whatsapp: wa.templateMessage(m.phone, 'gorev', wa.taskVars(m, ev, couple?.name)),
    });
  }
}

function albumLocked(couple) {
  const c = db.getCouple(couple.id);
  safePush(() => push.toAdmin({ title: 'Albüm seçimi tamamlandı', body: `${c.name} albüm seçimini tamamladı (${db.favoriteCount(c.id)} fotoğraf).`, url: `/admin/ciftler/${c.id}`, tag: `album-${c.id}` }));
  if (!config.n8nWebhookUrl) return;
  post({ event: 'album_tamamlandi', at: new Date().toISOString(), couple: coupleInfo(c), selected: db.favoriteCount(c.id), limit: c.album_limit });
}

function planSaved(couple) {
  const c = db.getCouple(couple.id);
  safePush(() => push.toAdmin({ title: 'Çekim günü planı iletildi', body: `${c.name} çekim günü planını gönderdi.`, url: `/admin/ciftler/${c.id}`, tag: `plan-${c.id}` }));
  if (!config.n8nWebhookUrl) return;
  post({ event: 'plan_kaydedildi', at: new Date().toISOString(), couple: coupleInfo(c) });
}

function newLead(lead) {
  safePush(() => push.toAdmin({ title: 'Yeni talep', body: [lead.name, lead.eventDate ? lead.eventDate.split('-').reverse().join('.') : '', lead.service, lead.message ? String(lead.message).slice(0, 80) : ''].filter(Boolean).join(' · '), url: '/admin/talepler', tag: `talep-${lead.id}` }));
  if (!config.n8nWebhookUrl) return;
  post({ event: 'yeni_talep', at: new Date().toISOString(), lead, adminUrl: `${config.siteUrl}/admin/talepler` });
}

// Testler için: bekleyen fotoğraf bildirimini hemen gönder
function flushPhotoTimers() {
  for (const [id, t] of photoTimers) { clearTimeout(t); photoTimers.delete(id); }
}

// Çift sözleşmeyi onayladı (n8n üzerinden size bildirim gönderilebilir)
function contractSigned(couple, signerName) {
  safePush(() => push.toAdmin({ title: 'Sözleşme onaylandı', body: `${couple.name} sözleşmeyi onayladı (imzalayan: ${signerName}).`, url: `/admin/ciftler/${couple.id}#sozlesme`, tag: `soz-${couple.id}` }));
  if (!config.n8nWebhookUrl) return;
  post({ event: 'sozlesme_onaylandi', at: new Date().toISOString(), couple: coupleInfo(couple), signerName });
}

// Çifte: sözleşme gönderildi (WhatsApp + bildirim); video eklendi ve video durumu değişti (yalnızca telefon bildirimi)
function contractSent(coupleId, contractId) {
  const c = db.getCouple(coupleId);
  const key = `sozlesme:${coupleId}:${contractId}`;
  if (config.n8nWebhookUrl && canMessage(c) && !db.wasNotified(key)) {
    db.markNotified(key);
    post({ event: 'sozlesme_gonderildi', at: new Date().toISOString(), couple: coupleInfo(c), whatsapp: wa.templateMessage(c.phone, 'sozlesme', { ad: c.name, link: wa.panelLink() }) });
  }
  safePush(() => push.toCouple(coupleId, { title: 'Sözleşmeniz onayınıza sunuldu', body: 'Hizmet sözleşmenizi panelinizden inceleyip onaylayabilirsiniz.', url: '/panel/sozlesme', tag: 'sozlesme' }));
}
function videoAdded(coupleId, title) {
  safePush(() => push.toCouple(coupleId, { title: 'Videonuz teslim edildi', body: title ? `“${title}” panelinize eklendi. İzleyebilir ve indirebilirsiniz.` : 'Yeni videonuz panelinize eklendi. İzleyebilir ve indirebilirsiniz.', url: '/panel/video', tag: 'video' }));
}
function videoStatusChanged(coupleId, status) {
  if (!status) return;
  safePush(() => push.toCouple(coupleId, { title: 'Video çalışmanız güncellendi', body: `Güncel durum: ${status}.`, url: '/panel/video', tag: 'video-durum' }));
}

module.exports = { appointmentVars, appointmentCreated, contractSent, videoAdded, videoStatusChanged, contractSigned, teamAssigned, post, stageChanged, photosUploaded, albumLocked, planSaved, newLead, canMessage, flushPhotoTimers };
