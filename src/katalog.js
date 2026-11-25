'use strict';
// Albüm kataloğu: tedarikçi kataloğundan gelen modeller (src/data/album-katalog.json) + stüdyonun ayarları
// (aktif/pasif, fiyat farkı, kapatılan renk/ebatlar, not). Ayarlar settings tablosunda "album_katalog" anahtarında durur.
const db = require('./db');
const BASE = require('./data/album-katalog.json');
const KEY = 'album_katalog';

const IMG = '/images/katalog/';
// Katalogdaki ebatlar albümün açık hâlidir: 30x60 → 30×30 albüm
const kapali = (e) => { const [a, b] = String(e).split('x').map(Number); return `${a}×${Math.round(b / 2)}`; };

function overrides() {
  try { return JSON.parse(db.getSetting(KEY) || '{}') || {}; } catch { return {}; }
}

function merge(m, o = {}) {
  const offR = new Set(o.kapaliRenk || []);
  const offE = new Set(o.kapaliEbat || []);
  return {
    no: m.no,
    ad: m.ad,
    malzeme: m.malzeme,
    foto: IMG + m.foto,
    kaynakNot: m.not || '',
    not: o.not || '',
    aktif: o.aktif !== false,
    fark: Number(o.fark) || 0,
    renkler: m.renkler.map((r) => ({ ad: r.ad, hex: r.hex, doku: IMG + r.doku, aktif: !offR.has(r.ad) })),
    ebatlar: m.ebatlar.map((e) => ({ kod: e, ad: kapali(e), aktif: !offE.has(e) })),
  };
}

function list() {
  const o = overrides();
  return BASE.modeller.map((m) => merge(m, o[m.no]));
}
function get(no) {
  const m = BASE.modeller.find((x) => x.no === Number(no));
  return m ? merge(m, overrides()[m.no]) : null;
}
function save(no, { aktif, fark, not, renkler = [], ebatlar = [] }) {
  const m = BASE.modeller.find((x) => x.no === Number(no));
  if (!m) return false;
  const all = overrides();
  all[m.no] = {
    aktif: Boolean(aktif),
    fark: Math.max(-1e6, Math.min(1e6, Math.round(Number(String(fark || '0').replace(/[^\d-]/g, '')) || 0))),
    not: String(not || '').slice(0, 300),
    kapaliRenk: m.renkler.map((r) => r.ad).filter((ad) => !renkler.includes(ad)),
    kapaliEbat: m.ebatlar.filter((e) => !ebatlar.includes(e)),
  };
  db.setSetting(KEY, JSON.stringify(all));
  return true;
}
function setActive(no, aktif) {
  const all = overrides();
  if (!BASE.modeller.some((x) => x.no === Number(no))) return false;
  all[no] = { ...(all[no] || {}), aktif: Boolean(aktif) };
  db.setSetting(KEY, JSON.stringify(all));
  return true;
}
const MALZEMELER = [...new Set(BASE.modeller.flatMap((m) => m.malzeme))];

module.exports = { list, get, save, setActive, kapali, MALZEMELER, kaynak: BASE.kaynak };
