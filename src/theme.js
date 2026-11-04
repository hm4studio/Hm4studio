'use strict';
// Sitenin vurgu rengi seçenekleri (Ayarlar › Site). Tüm sitede düğmeler, bağlantılar ve küçük vurgular bu rengi kullanır.
const ACCENTS = {
  kina: { label: 'Kına kırmızısı', color: '#7a3a2e', soft: '#f4e9e5' },
  gul: { label: 'Gül kurusu', color: '#8d5560', soft: '#f3e8ea' },
  zeytin: { label: 'Zeytin', color: '#56603d', soft: '#eceee4' },
  lacivert: { label: 'Gece mavisi', color: '#25364f', soft: '#e6eaf0' },
  antrasit: { label: 'Antrasit', color: '#2f2f2f', soft: '#ececea' },
};
const accentOf = (c) => ACCENTS[c.theme?.accent] || ACCENTS.kina;
const themeCss = (c) => { const a = accentOf(c); return `:root{--accent:${a.color};--accent-soft:${a.soft}}\n`; };
module.exports = { ACCENTS, accentOf, themeCss };
