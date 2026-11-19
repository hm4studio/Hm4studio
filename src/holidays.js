'use strict';
// Türkiye resmi tatilleri, dini bayramlar, Ramazan ayı ve önemli günler (takvimde kendiliğinden gösterilir).
// Sabit günler her yıl hesaplanır; dini günler Diyanet'in yayımladığı takvimden elle girilir (yılda bir eklenir).
// "tahmini: true" olan yılları Diyanet henüz yayımlamadı; yayımlayınca tarihler buradan düzeltilir.

// kind: resmi (resmi tatil) · dini (dini bayram) · arefe (yarım gün) · onemli (önemli gün / kandil)
const FIXED = [
  ['01-01', 'resmi', 'Yılbaşı'],
  ['02-14', 'onemli', 'Sevgililer Günü'],
  ['03-08', 'onemli', 'Dünya Kadınlar Günü'],
  ['03-18', 'onemli', 'Çanakkale Zaferi'],
  ['04-23', 'resmi', '23 Nisan'],
  ['05-01', 'resmi', '1 Mayıs'],
  ['05-19', 'resmi', '19 Mayıs'],
  ['07-15', 'resmi', '15 Temmuz'],
  ['08-30', 'resmi', 'Zafer Bayramı'],
  ['10-28', 'arefe', 'Cumhuriyet B. arefesi'],
  ['10-29', 'resmi', 'Cumhuriyet Bayramı'],
  ['11-10', 'onemli', '10 Kasım'],
  ['11-24', 'onemli', 'Öğretmenler Günü'],
  ['12-31', 'onemli', 'Yılbaşı gecesi'],
];

// Dini günler (Diyanet). ramazan: [ilk oruç, son gün]; ramazanB / kurbanB: bayramın 1. günü
const RELIGIOUS = {
  2026: { ramazan: ['2026-02-19', '2026-03-19'], ramazanB: '2026-03-20', kurbanB: '2026-05-27',
    other: [['2026-01-15', 'Miraç Kandili'], ['2026-02-02', 'Berat Kandili'], ['2026-03-16', 'Kadir Gecesi'], ['2026-08-24', 'Mevlid Kandili'], ['2026-12-10', 'Regaip Kandili']] },
  2027: { ramazan: ['2027-02-08', '2027-03-08'], ramazanB: '2027-03-09', kurbanB: '2027-05-16',
    other: [['2027-01-04', 'Miraç Kandili'], ['2027-01-22', 'Berat Kandili'], ['2027-03-05', 'Kadir Gecesi'], ['2027-08-13', 'Mevlid Kandili'], ['2027-12-02', 'Regaip Kandili'], ['2027-12-24', 'Miraç Kandili']] },
  2028: { tahmini: true, ramazan: ['2028-01-28', '2028-02-26'], ramazanB: '2028-02-27', kurbanB: '2028-05-05', other: [] },
};

const addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
// Ayın n. pazarı (Anneler Günü: mayısın 2., Babalar Günü: haziranın 3. pazarı)
function nthSunday(y, m, n) {
  const first = new Date(Date.UTC(y, m - 1, 1));
  const firstSun = 1 + ((7 - first.getUTCDay()) % 7);
  return `${y}-${String(m).padStart(2, '0')}-${String(firstSun + (n - 1) * 7).padStart(2, '0')}`;
}

const cache = new Map();
/** Yılın özel günleri: Map(tarih → [{ kind, name, short, tahmini }]) ve Ramazan aralığı */
function year(y) {
  if (cache.has(y)) return cache.get(y);
  const days = new Map();
  const add = (date, kind, name, short = name, tahmini = false) => {
    if (!days.has(date)) days.set(date, []);
    days.get(date).push({ kind, name, short, tahmini });
  };
  for (const [md, kind, name] of FIXED) add(`${y}-${md}`, kind, name);
  add(nthSunday(y, 5, 2), 'onemli', 'Anneler Günü');
  add(nthSunday(y, 6, 3), 'onemli', 'Babalar Günü');
  const r = RELIGIOUS[y];
  let ramazan = null;
  if (r) {
    const t = Boolean(r.tahmini);
    const tag = t ? ' (tahmini)' : '';
    ramazan = r.ramazan;
    add(addDays(r.ramazanB, -1), 'arefe', `Ramazan Bayramı arefesi${tag}`, 'Arefe ½', t);
    for (let i = 0; i < 3; i++) add(addDays(r.ramazanB, i), 'dini', `Ramazan Bayramı ${i + 1}. gün${tag}`, `Ramazan B. ${i + 1}`, t);
    add(addDays(r.kurbanB, -1), 'arefe', `Kurban Bayramı arefesi${tag}`, 'Arefe ½', t);
    for (let i = 0; i < 4; i++) add(addDays(r.kurbanB, i), 'dini', `Kurban Bayramı ${i + 1}. gün${tag}`, `Kurban B. ${i + 1}`, t);
    add(r.ramazan[0], 'onemli', `Ramazan başlangıcı${tag}`, 'Ramazan başlıyor', t);
    for (const [d, name] of r.other) add(d, 'onemli', name);
  }
  // Önce resmi/dini olanlar görünsün
  const ORDER = { dini: 0, resmi: 1, arefe: 2, onemli: 3 };
  for (const list of days.values()) list.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
  const out = { days, ramazan };
  cache.set(y, out);
  return out;
}

/** Bir günün özel günleri (boş dizi olabilir) */
function on(iso) {
  return year(Number(iso.slice(0, 4))).days.get(iso) || [];
}

/** Gün Ramazan ayı içinde mi? (bayram arefesi dahil) — önceki yılın Ramazan'ı da kontrol edilir */
function inRamazan(iso) {
  const r = year(Number(iso.slice(0, 4))).ramazan;
  return Boolean(r && iso >= r[0] && iso <= r[1]);
}

/** Ayın özel günleri listesi (ay altı liste için): [{ date, items }] */
function month(ym) {
  const y = Number(ym.slice(0, 4));
  const out = [];
  for (const [date, items] of [...year(y).days.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (date.startsWith(ym)) out.push({ date, items });
  }
  return out;
}

/** Randevu tarihi uyarısı: bayram / resmi tatil / arefe ise kısa metin, değilse '' */
function warning(iso) {
  const list = on(iso).filter((x) => x.kind !== 'onemli');
  if (!list.length) return inRamazan(iso) ? 'Ramazan ayına denk geliyor.' : '';
  return `Bu tarih: ${list.map((x) => x.name).join(', ')}.`;
}

module.exports = { year, on, inRamazan, month, warning };
