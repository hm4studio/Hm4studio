'use strict';
// Randevu kartı: form okuma, ödeme hesabı ve ortak yardımcılar.
const wa = require('./whatsapp');

const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanArea = (v, max) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
const cleanDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);
const cleanTime = (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? v : '');

// "25.000", "25 000 ₺", "25000,50" → 25000
function money(v) {
  const s = String(v ?? '').split(',')[0].replace(/\D/g, '');
  return Math.min(Number(s) || 0, 100_000_000);
}

const firstWord = (s) => String(s || '').trim().split(/\s+/)[0] || '';

// Panelde ve mesajlarda görünen ad: "Elif & Burak"
function displayName(fullName, partnerName) {
  const a = firstWord(fullName);
  const b = firstWord(partnerName);
  return a && b ? `${a} & ${b}` : (fullName || partnerName || '').trim();
}

// Formdan randevu alanları; hatalar Türkçe mesaj listesi olarak döner
function readForm(form, content) {
  const o = content.appointments || {};
  const pick = (v, list) => (list && list.includes(v) ? v : '');
  const a = {
    fullName: clean(form.fullName, 80),
    partnerName: clean(form.partnerName, 80),
    phoneRaw: clean(form.phone, 20),
    source: pick(form.source, o.sources),
    eventType: pick(form.eventType, o.eventTypes),
    eventDate: cleanDate(form.eventDate),
    startTime: cleanTime(form.startTime),
    city: clean(form.city, 60),
    venue: clean(form.venue, 160),
    dueDate: cleanDate(form.dueDate),
    package: clean(form.package, 80),
    packageDetail: cleanArea(form.packageDetail, 1000),
    total: money(form.total),
    deposit: money(form.deposit),
    paidFull: form.paidFull === '1',
    photoReady: form.photoReady === '1',
    videoReady: form.videoReady === '1',
    albumReady: form.albumReady === '1',
    albumLimit: Math.min(Math.max(Number.parseInt(form.albumLimit, 10) || 60, 1), 1000),
    waOptin: form.waOptin === '1',
    notes: cleanArea(form.notes, 3000),
  };
  a.phone = wa.normalizePhone(a.phoneRaw);
  a.name = displayName(a.fullName, a.partnerName);
  const errors = [];
  if (!a.fullName) errors.push('Ad soyad yazın.');
  if (a.phoneRaw && !a.phone) errors.push('Telefon numarası geçersiz (örn. 0532 123 45 67).');
  if (a.deposit > a.total && a.total > 0) errors.push('Kapora toplam tutardan büyük olamaz.');
  return { a, errors };
}

// Ödeme durumu kendiliğinden: [anahtar, etiket, kalan]
function payment(k) {
  const total = k.total_amount || 0;
  const paid = k.paid_full ? total : Math.min(k.deposit || 0, total || k.deposit || 0);
  const remaining = Math.max(total - paid, 0);
  if (!total) return ['none', 'Tutar girilmedi', 0];
  if (remaining === 0) return ['paid', 'Ödendi', 0];
  if (paid > 0) return ['deposit', 'Kapora alındı', remaining];
  return ['unpaid', 'Ödeme bekleniyor', remaining];
}

const tl = (n) => `${Number(n || 0).toLocaleString('tr-TR')} ₺`;

// Kayıttaki değerleri forma geri doldurmak için
function formValues(k) {
  if (!k) return {};
  return {
    fullName: k.full_name || k.name, partnerName: k.partner_name, phone: k.phone ? wa.displayPhone(k.phone) : '',
    source: k.source, eventType: k.event_type, eventDate: k.event_date || '', startTime: k.start_time, city: k.city,
    venue: k.venue, dueDate: k.due_date || '', package: k.package, packageDetail: k.package_detail,
    total: k.total_amount || '', deposit: k.deposit || '', paidFull: k.paid_full, photoReady: k.photo_ready,
    videoReady: k.video_ready, albumReady: k.album_ready, albumLimit: k.album_limit, waOptin: k.wa_optin, notes: k.notes,
  };
}

module.exports = { readForm, payment, tl, displayName, formValues, money };
