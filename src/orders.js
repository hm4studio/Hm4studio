'use strict';
// Albüm siparişi: seçenek listeleri (Ayarlar › Albüm seçenekleri), form okuma ve durumlar.
const { getContent } = require('./content');

const FIELDS = [
  ['paket', 'Paket'],
  ['boyut', 'Boyut'],
  ['sayfa', 'Sayfa'],
  ['model', 'Albüm modeli'],
  ['renk', 'Albüm rengi'],
];
const DEFAULTS = {
  paket: ['Klasik albüm', 'Premium albüm', 'Lüks albüm'],
  boyut: ['25×35', '30×30', '30×40', '35×35'],
  sayfa: ['20', '26', '30', '36', '40'],
  model: ['Fotoğraf kapaklı', 'Deri kapaklı', 'Kumaş kapaklı', 'Kutulu'],
  renk: ['Siyah', 'Beyaz', 'Krem', 'Lacivert', 'Bordo', 'Kahve'],
};

function options() {
  const o = getContent().albumOptions || {};
  return Object.fromEntries(FIELDS.map(([k]) => [k, Array.isArray(o[k]) && o[k].length ? o[k] : DEFAULTS[k]]));
}

const clean = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const area = (v, n) => String(v ?? '').replace(/\r/g, '').trim().slice(0, n);

// Formdan (randevu formunda "al_" önekiyle) seçilen değerler; listede olmayan değer kabul edilmez
function read(form, prefix = '') {
  const opts = options();
  const x = {};
  for (const [k] of FIELDS) {
    const v = clean(form[prefix + k], 60);
    x[k] = opts[k].includes(v) ? v : '';
  }
  return x;
}

const filled = (o) => FIELDS.filter(([k]) => o && o[k]).length;
const complete = (o) => filled(o) === FIELDS.length;

// "30×30 · 34 sayfa · Lacivert"
function summary(o) {
  if (!o) return '';
  return [o.paket, o.boyut, o.sayfa ? `${o.sayfa} sayfa` : '', [o.model, o.renk].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
}

const STATE = {
  '': { label: 'Planlandı', tone: 'n' },
  taslak: { label: 'Taslak', tone: 'n' },
  onay: { label: 'Çiftin onayında', tone: 'w' },
  degisiklik: { label: 'Çift değişiklik istedi', tone: 'late' },
  onaylandi: { label: 'Onaylandı', tone: 'o' },
};
// Siparişin bugünkü adımı (liste ve kartlardaki etiket)
function stage(o, couple) {
  if (o && o.state === 'onaylandi') return o.arrived_at ? { key: 'geldi', label: 'Albüm geldi', tone: 'o' } : o.lab_at ? { key: 'lab', label: 'Labda', tone: 'n' } : { key: 'lab-bekliyor', label: 'Onaylandı · laba gönderin', tone: 'o' };
  if (o && ['onay', 'degisiklik'].includes(o.state)) return { key: o.state, ...STATE[o.state] };
  if (couple && couple.album_design_state === 'onaylandi') return { key: 'tamamla', label: 'Siparişi tamamlayın', tone: 'late' };
  return { key: 'plan', label: o && filled(o) ? 'Randevuda not alındı' : 'Henüz yok', tone: 'n' };
}

const orderNo = (o) => `S-${String(o.created_at || '').slice(0, 4)}-${String(o.id).padStart(4, '0')}`;

module.exports = { FIELDS, DEFAULTS, options, read, clean, area, filled, complete, summary, stage, STATE, orderNo };
