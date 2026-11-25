'use strict';
// Albüm kataloğu. İlk açılışta tedarikçi kataloğundan (src/data/album-katalog.json) kopyalanır; sonra tamamen
// stüdyonun elindedir: model ekleme/silme, ad, fotoğraf, renk (doku fotoğrafıyla) ve ebat ekleme/çıkarma,
// aktif/pasif, fiyat farkı, not. Hepsi settings tablosunda "album_katalog_v2" anahtarında tek JSON olarak durur.
const crypto = require('node:crypto');
const db = require('./db');
const media = require('./media');
const SEED = require('./data/album-katalog.json');

const KEY = 'album_katalog_v2';
const IMG = '/images/katalog/';
const SIZE_RE = /^(\d{2})x(\d{2,3})$/;

// Katalogdaki ebatlar albümün açık hâlidir: 30x60 → 30×30 albüm
const kapali = (e) => { const m = SIZE_RE.exec(String(e)); return m ? `${m[1]}×${Math.round(Number(m[2]) / 2)}` : String(e); };
const clean = (s, n = 60) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

function seed() {
  let old = {};
  try { old = JSON.parse(db.getSetting('album_katalog') || '{}') || {}; } catch { old = {}; } // ilk sürümün ayarları
  return SEED.modeller.map((m) => {
    const o = old[m.no] || {};
    const offR = new Set(o.kapaliRenk || []); const offE = new Set(o.kapaliEbat || []);
    return {
      no: m.no, ad: m.ad, malzeme: m.malzeme, foto: IMG + m.foto, kaynakNot: m.not || '', not: o.not || '',
      aktif: o.aktif !== false, fark: Number(o.fark) || 0,
      renkler: m.renkler.map((r) => ({ ad: r.ad, hex: r.hex, doku: IMG + r.doku, aktif: !offR.has(r.ad) })),
      ebatlar: m.ebatlar.map((e) => ({ kod: e, aktif: !offE.has(e) })),
    };
  });
}

let cache = null;
function all() {
  if (cache) return cache;
  let list = null;
  try { list = JSON.parse(db.getSetting(KEY) || 'null'); } catch { list = null; }
  if (!Array.isArray(list)) { list = seed(); db.setSetting(KEY, JSON.stringify(list)); }
  cache = list;
  return list;
}
function store(list) { cache = list; db.setSetting(KEY, JSON.stringify(list)); }

const view = (m) => ({ ...m, ebatlar: m.ebatlar.map((e) => ({ ...e, ad: kapali(e.kod) })) });
const list = () => all().map(view);
const get = (no) => { const m = all().find((x) => x.no === Number(no)); return m ? view(m) : null; };
/** Çiftlerin gördüğü: aktif modeller, yalnızca aktif renk ve ebatlarıyla */
const forCouples = () => list().filter((m) => m.aktif).map((m) => ({ ...m, renkler: m.renkler.filter((r) => r.aktif), ebatlar: m.ebatlar.filter((e) => e.aktif) })).filter((m) => m.renkler.length && m.ebatlar.length);
const malzemeler = () => [...new Set(all().flatMap((m) => m.malzeme))];

// Rengin adından malzeme grubu: "Kadife Gül Kurusu" → Kadife, "Vip Kadife Krem" → Vip Kadife
const FAMS = ['Vip Kadife', 'Kadife', 'Liva', 'Monaco', 'Mobus', 'Keten', 'Venedik', 'Ada', 'Cotton'];
const famOf = (ad) => FAMS.find((f) => ad.startsWith(`${f} `)) || ad.split(' ')[0];
const refreshFam = (m) => { m.malzeme = m.renkler.length ? [...new Set(m.renkler.map((r) => famOf(r.ad)))] : (m.malzeme.length ? m.malzeme : ['Diğer']); };

function update(no, fn) {
  const lst = all().map((x) => ({ ...x }));
  const i = lst.findIndex((x) => x.no === Number(no));
  if (i < 0) return null;
  const m = JSON.parse(JSON.stringify(lst[i]));
  const r = fn(m);
  if (r === false) return null;
  refreshFam(m);
  lst[i] = m;
  store(lst);
  return m;
}

function save(no, { ad, aktif, fark, not, renkler = [], ebatlar = [] }) {
  return update(no, (m) => {
    const name = clean(ad, 40);
    if (name) m.ad = name;
    m.aktif = Boolean(aktif);
    m.fark = Math.max(-1e6, Math.min(1e6, Math.round(Number(String(fark || '0').replace(/[^\d-]/g, '')) || 0)));
    m.not = clean(not, 300);
    m.renkler.forEach((r) => { r.aktif = renkler.includes(r.ad); });
    m.ebatlar.forEach((e) => { e.aktif = ebatlar.includes(e.kod); });
  });
}
function setActive(no, aktif) { return update(no, (m) => { m.aktif = Boolean(aktif); }); }

function create(ad) {
  const lst = all().map((x) => ({ ...x }));
  const no = Math.max(0, ...lst.map((x) => x.no)) + 1;
  const m = { no, ad: clean(ad, 40) || 'Yeni model', malzeme: ['Diğer'], foto: '', kaynakNot: '', not: '', aktif: false, fark: 0, renkler: [], ebatlar: [] };
  lst.push(m);
  store(lst);
  return m;
}
function remove(no) {
  const lst = all();
  const m = lst.find((x) => x.no === Number(no));
  if (!m) return false;
  for (const u of [m.foto, ...m.renkler.map((r) => r.doku)]) dropImage(u, lst.filter((x) => x !== m));
  store(lst.filter((x) => x !== m));
  return true;
}

function addSize(no, kod) {
  const k = String(kod || '').toLowerCase().replace(/[×*\s]/g, 'x').replace(/x+/g, 'x');
  if (!SIZE_RE.test(k)) return { error: 'Ebatı katalogdaki gibi açık ölçüyle yazın: ör. 30x60 (30×30 albüm).' };
  const m = update(no, (x) => { if (x.ebatlar.some((e) => e.kod === k)) return false; x.ebatlar.push({ kod: k, aktif: true }); x.ebatlar.sort((a, b) => a.kod.localeCompare(b.kod, 'tr', { numeric: true })); });
  return m ? { ok: true } : { error: 'Bu ebat zaten var.' };
}
function removeSize(no, kod) { return update(no, (x) => { x.ebatlar = x.ebatlar.filter((e) => e.kod !== kod); }); }

function removeColor(no, ad) {
  let gone = null;
  const m = update(no, (x) => { gone = x.renkler.find((r) => r.ad === ad); x.renkler = x.renkler.filter((r) => r.ad !== ad); });
  if (m && gone) dropImage(gone.doku, all());
  return m;
}

// ── Görseller (yüklenenler /media/site/ altında; katalogdan gelenler /images/katalog/ altında kalır) ──
function isJpeg(buf) { return buf.length > 1000 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff; }
function avgHex(buf) {
  // JPEG'in ortalama rengini çözmeden bulamayız; tarayıcı gönderir. Gelmezse nötr gri.
  return '#b7b0a6';
}
function saveImage(buf) {
  if (!isJpeg(buf)) throw new Error('Görsel JPEG olmalı.');
  if (buf.length > 3 * 1024 * 1024) throw new Error('Görsel çok büyük.');
  return media.saveSiteImage(crypto.randomBytes(16).toString('hex'), buf, 'jpg');
}
function dropImage(url, others) {
  if (!String(url).startsWith('/media/site/')) return;
  const used = others.some((m) => m.foto === url || m.renkler.some((r) => r.doku === url));
  if (!used) media.removeSiteImage(url);
}
function setPhoto(no, buf) {
  const url = saveImage(buf);
  let old = '';
  const m = update(no, (x) => { old = x.foto; x.foto = url; });
  if (!m) { media.removeSiteImage(url); return null; }
  if (old) dropImage(old, all());
  return m;
}
function addColor(no, { ad, hex, buf }) {
  const name = clean(ad, 40);
  if (!name) return { error: 'Renk adını yazın (ör. Kadife Bordo).' };
  const cur = all().find((x) => x.no === Number(no));
  if (!cur) return { error: 'Model bulunamadı.' };
  if (cur.renkler.some((r) => r.ad.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'))) return { error: 'Bu renk zaten var.' };
  // Aynı adlı renk başka modelde varsa onun dokusu kullanılabilir (fotoğraf yüklemeden)
  const same = all().flatMap((x) => x.renkler).find((r) => r.ad.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'));
  let doku = same ? same.doku : ''; let h = same ? same.hex : '';
  if (buf && buf.length) { doku = saveImage(buf); h = /^#[0-9a-f]{6}$/i.test(hex || '') ? hex : avgHex(buf); }
  if (!doku) return { error: 'Bu renk için malzeme fotoğrafı ekleyin.' };
  update(no, (x) => { x.renkler.push({ ad: name, hex: h, doku, aktif: true }); });
  return { ok: true };
}
/** Bütün modellerde geçen renk adları (yeni renk eklerken öneri) */
const knownColors = () => {
  const map = new Map();
  for (const m of all()) for (const r of m.renkler) if (!map.has(r.ad)) map.set(r.ad, r);
  return [...map.values()].sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
};

module.exports = { list, get, forCouples, save, setActive, create, remove, addSize, removeSize, addColor, removeColor, setPhoto, malzemeler, knownColors, kapali, kaynak: SEED.kaynak };
