'use strict';
// Kişi kartı ve etkinlikleri: form okuma, ödeme hesabı, ortak yardımcılar.
// Bir kişi kartında birden çok etkinlik olabilir (ör. 13 Temmuz dış çekim, 16 Temmuz kına, 17 Temmuz düğün);
// her etkinliğin kendi paketi, fiyatı, ekibi ve istekleri vardır.
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

const EVENT_FIELDS = ['id', 'type', 'date', 'time', 'city', 'venue', 'package', 'pkgs', 'detail', 'price', 'team'];

// Formdaki etkinlik blokları: ev0_type, ev0_date … ev5_type
function readEvents(form, content) {
  const o = content.appointments || {};
  const idx = [...new Set(Object.keys(form).map((k) => /^ev(\d{1,2})_/.exec(k)?.[1]).filter(Boolean))].map(Number).sort((a, b) => a - b);
  const list = [];
  for (const i of idx.slice(0, 20)) {
    const f = (name) => form[`ev${i}_${name}`];
    const e = {
      id: Number(f('id')) || null,
      eventType: (o.eventTypes || []).includes(f('type')) ? f('type') : '',
      eventDate: cleanDate(f('date')),
      startTime: cleanTime(f('time')),
      city: clean(f('city'), 60),
      venue: clean(f('venue'), 160),
      // Seçilen paketler + "Diğer hizmet" → "Fotoğraf + Video + Gelin alma"
      package: [...new Set([...[].concat(f('pkgs') || []).map((x) => clean(x, 80)), clean(f('package'), 120)].filter(Boolean))].join(' + ').slice(0, 240),
      packageDetail: cleanArea(f('detail'), 1500),
      price: money(f('price')),
      team: '',
      teamIds: [].concat(f('team') || []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 20),
    };
    const empty = !e.eventType && !e.eventDate && !e.venue && !e.package && !e.price && !e.packageDetail;
    if (!empty) list.push(e);
  }
  return list;
}

// Kişi kartı alanları + etkinlikler; hatalar Türkçe mesaj listesi
function readForm(form, content) {
  const o = content.appointments || {};
  const a = {
    fullName: clean(form.fullName, 80),
    partnerName: clean(form.partnerName, 80),
    phoneRaw: clean(form.phone, 20),
    source: (o.sources || []).includes(form.source) ? form.source : '',
    dueDate: cleanDate(form.dueDate),
    photoReady: form.photoReady === '1',
    videoReady: form.videoReady === '1',
    albumReady: form.albumReady === '1',
    albumLimit: Math.min(Math.max(Number.parseInt(form.albumLimit, 10) || 35, 1), 1000),
    waOptin: form.waOptin === '1',
    notes: cleanArea(form.notes, 3000),
    discountRaw: String(form.discount ?? '').trim().slice(0, 20),
    deposit: money(form.deposit),
    depositDate: cleanDate(form.depositDate),
    depositLater: form.depositLater === '1',
  };
  a.phone = wa.normalizePhone(a.phoneRaw);
  a.name = displayName(a.fullName, a.partnerName);
  const events = readEvents(form, content);
  const errors = [];
  if (!a.fullName) errors.push('Ad soyad yazın.');
  if (a.phoneRaw && !a.phone) errors.push('Telefon numarası geçersiz (örn. 0532 123 45 67).');
  if (!events.length) errors.push('En az bir etkinlik ekleyin (tür veya tarih).');
  events.forEach((e, n) => { if (!e.eventDate) errors.push(`${n + 1}. etkinliğin tarihini seçin.`); });
  const gross = events.reduce((s, e) => s + e.price, 0);
  // İndirim: tutar (₺) ya da yüzde ("%10" / "10%")
  const pct = /%/.test(a.discountRaw);
  const n = Number(a.discountRaw.replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
  a.discount = Math.round(pct ? (gross * Math.min(n, 100)) / 100 : n);
  if (a.discount > gross) errors.push('İndirim toplam tutardan büyük olamaz.');
  const total = Math.max(gross - a.discount, 0);
  if (a.deposit > total && total > 0) errors.push('Kapora indirimli toplamdan büyük olamaz.');
  return { a, events, errors };
}

// Ödeme durumu: [anahtar, etiket, kalan]. k.total = etkinlik fiyatları toplamı, k.paid = alınan ödemeler
function payment(k) {
  const total = k.total || 0;
  const paid = k.paid || 0;
  const remaining = Math.max(total - paid, 0);
  if (!total) return ['none', 'Tutar girilmedi', 0];
  if (remaining === 0) return ['paid', 'Ödendi', 0];
  if (paid > 0) return ['deposit', 'Kapora alındı', remaining];
  return ['unpaid', 'Ödeme bekleniyor', remaining];
}

const tl = (n) => `${Number(n || 0).toLocaleString('tr-TR')} ₺`;

// Kayıttaki değerleri forma geri doldurmak için
function formValues(k, events = [], teamOf = () => []) {
  if (!k) return {};
  const v = {
    fullName: k.full_name || k.name, partnerName: k.partner_name, phone: k.phone ? wa.displayPhone(k.phone) : '',
    source: k.source, dueDate: k.due_manual || '', photoReady: k.photo_ready, videoReady: k.video_ready,
    albumReady: k.album_ready, albumLimit: k.album_limit, waOptin: k.wa_optin, notes: k.notes,
    discount: k.discount ? String(k.discount) : '',
  };
  events.forEach((e, i) => Object.assign(v, {
    [`ev${i}_id`]: e.id, [`ev${i}_type`]: e.event_type, [`ev${i}_date`]: e.event_date || '', [`ev${i}_time`]: e.start_time,
    [`ev${i}_city`]: e.city, [`ev${i}_venue`]: e.venue, [`ev${i}_package`]: e.package, [`ev${i}_detail`]: e.package_detail,
    [`ev${i}_price`]: e.price || '', [`ev${i}_team`]: teamOf(e.id),
  }));
  return v;
}

// Formda kaç etkinlik bloğu var (yeniden gösterimde)
function eventIndexes(values) {
  const idx = [...new Set(Object.keys(values).map((k) => /^ev(\d{1,2})_/.exec(k)?.[1]).filter(Boolean))].map(Number).sort((a, b) => a - b);
  return idx.length ? idx : [0];
}

const shortDate = (iso) => (iso ? iso.split('-').reverse().join('.') : '');

// Albüm seçimi: fotoğrafların seri numaraları (dosya adı, uzantısız), sıralı.
// Örn. "DSC01234.jpg" → "DSC01234"; RAW (ARW) orijinaller bu adla eşleştirilir.
function selectionNames(favPhotos) {
  const names = favPhotos.map((p, i) => String(p.original_name || '').replace(/\.[a-z0-9]{2,5}$/i, '').trim() || `foto-${String(i + 1).padStart(4, '0')}`);
  // Aynı adla iki dosya varsa ikisi de listede kalır (hiçbir kare sessizce düşmesin)
  return names.sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }));
}

module.exports = { selectionNames, readForm, payment, tl, displayName, formValues, eventIndexes, money, shortDate, EVENT_FIELDS, cleanDate };
