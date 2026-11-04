'use strict';
// Yedekleme:
// 1) Her gece otomatik veritabanı yedeği (DATA_DIR/backups/hm4-YYYY-AA-GG.db), son 14 gün saklanır.
// 2) Sezon arşivi: seçilen yılın randevuları, ödemeleri (Excel'de açılan CSV), veritabanı kopyası ve
//    o yıl etkinliği olan çiftlerin tüm fotoğrafları tek bir .tar dosyası olarak indirilir.
//    .tar dosyası Mac'te çift tıklayınca, Windows'ta "Tümünü ayıkla" ile açılır.
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');
const db = require('./db');
const { today } = require('./jobs');

const DIR = path.join(config.dataDir, 'backups');
const KEEP = 14;

function dbSnapshot(target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.rmSync(target, { force: true });
  // Çalışan veritabanının tutarlı kopyası
  db.db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  return target;
}

function listBackups() {
  try {
    return fs.readdirSync(DIR).filter((f) => /^hm4-\d{4}-\d{2}-\d{2}(-elle)?\.db$/.test(f)).sort().reverse()
      .map((f) => ({ name: f, size: fs.statSync(path.join(DIR, f)).size, date: f.slice(4, 14), manual: f.includes('-elle') }));
  } catch { return []; }
}

function prune() {
  const auto = listBackups().filter((b) => !b.manual);
  for (const b of auto.slice(KEEP)) fs.rmSync(path.join(DIR, b.name), { force: true });
  const manual = listBackups().filter((b) => b.manual);
  for (const b of manual.slice(KEEP)) fs.rmSync(path.join(DIR, b.name), { force: true });
}

function nightly() {
  const file = path.join(DIR, `hm4-${today()}.db`);
  if (fs.existsSync(file)) return;
  try { dbSnapshot(file); prune(); console.log(`Gece yedeği alındı: ${path.basename(file)}`); } catch (err) { console.error('Yedek alınamadı:', err.message); }
}

function manual() {
  const file = path.join(DIR, `hm4-${today()}-elle.db`);
  dbSnapshot(file);
  prune();
  return path.basename(file);
}

const backupPath = (name) => (/^hm4-\d{4}-\d{2}-\d{2}(-elle)?\.db$/.test(name) ? path.join(DIR, name) : null);

function start() {
  if (config.demoMode) return; // demo verisi zaten sıfırlanıyor
  setTimeout(nightly, 30 * 1000).unref();
  setInterval(nightly, 60 * 60 * 1000).unref(); // saatte bir bakar, günde bir kez alır
}

// ── Sezon arşivi (.tar, akış hâlinde; büyük arşivlerde bellek şişmez) ──
function tarHeader(name, size, mtime = Date.now()) {
  const buf = Buffer.alloc(512, 0);
  let n = Buffer.from(name, 'utf8');
  let prefix = Buffer.alloc(0);
  if (n.length > 100) {
    // ustar: uzun yollar önek + ad olarak bölünür
    const s = name.lastIndexOf('/', 154);
    prefix = Buffer.from(name.slice(0, s), 'utf8');
    n = Buffer.from(name.slice(s + 1), 'utf8');
  }
  n.copy(buf, 0, 0, Math.min(n.length, 100));
  buf.write('0000644\0', 100);
  buf.write('0000000\0', 108);
  buf.write('0000000\0', 116);
  buf.write(size.toString(8).padStart(11, '0') + '\0', 124);
  buf.write(Math.floor(mtime / 1000).toString(8).padStart(11, '0') + '\0', 136);
  buf.write('        ', 148);
  buf.write('0', 156);
  buf.write('ustar\0', 257);
  buf.write('00', 263);
  prefix.copy(buf, 345, 0, Math.min(prefix.length, 155));
  let sum = 0;
  for (const b of buf) sum += b;
  buf.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return buf;
}

const safe = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80);

async function writeEntry(res, name, data) {
  const write = (chunk) => new Promise((resolve) => (res.write(chunk) ? resolve() : res.once('drain', resolve)));
  await write(tarHeader(name, data.length));
  await write(data);
  const pad = (512 - (data.length % 512)) % 512;
  if (pad) await write(Buffer.alloc(pad));
}

async function writeFileEntry(res, name, file) {
  const st = fs.statSync(file);
  const write = (chunk) => new Promise((resolve) => (res.write(chunk) ? resolve() : res.once('drain', resolve)));
  await write(tarHeader(name, st.size, st.mtimeMs));
  await new Promise((resolve, reject) => {
    const rs = fs.createReadStream(file);
    rs.on('data', (c) => { if (!res.write(c)) { rs.pause(); res.once('drain', () => rs.resume()); } });
    rs.on('end', resolve);
    rs.on('error', reject);
  });
  const pad = (512 - (st.size % 512)) % 512;
  if (pad) await write(Buffer.alloc(pad));
}

function seasonCouples(year) {
  const evs = db.allEvents().filter((e) => e.event_date && e.event_date.startsWith(String(year)));
  const ids = [...new Set(evs.map((e) => e.couple_id))];
  return { evs, couples: ids.map((id) => db.getCoupleCard(id)).filter(Boolean) };
}

function seasonSummary() {
  const years = new Map();
  for (const e of db.allEvents()) {
    if (!e.event_date) continue;
    const y = e.event_date.slice(0, 4);
    const cur = years.get(y) || { year: y, events: 0, couples: new Set() };
    cur.events++; cur.couples.add(e.couple_id);
    years.set(y, cur);
  }
  return [...years.values()].sort((a, b) => b.year.localeCompare(a.year)).map((y) => {
    let photos = 0;
    for (const id of y.couples) photos += db.listPhotos(id).length;
    return { year: y.year, events: y.events, couples: y.couples.size, photos };
  });
}

async function streamSeason(res, year, { csvEvents, csvPayments }) {
  const { evs, couples } = seasonCouples(year);
  const root = `HM4-Sezon-${year}`;
  res.writeHead(200, {
    'Content-Type': 'application/x-tar',
    'Content-Disposition': `attachment; filename="${root}-${today()}.tar"`,
    'Cache-Control': 'no-store',
  });
  await writeEntry(res, `${root}/randevular.csv`, Buffer.from(csvEvents(evs), 'utf8'));
  await writeEntry(res, `${root}/odemeler.csv`, Buffer.from(csvPayments(couples), 'utf8'));
  await writeEntry(res, `${root}/BENIOKU.txt`, Buffer.from(
    `HM4 Studio · ${year} sezonu arşivi (${today()})\n\n`
    + `randevular.csv  Bu sezondaki tüm etkinlikler (Excel ile açın)\n`
    + `odemeler.csv    Bu sezonun çiftlerinden alınan ödemeler\n`
    + `veritabani.db   O anki tüm veritabanının kopyası (geri yükleme için)\n`
    + `fotograflar/    Her çift için bir klasör: duzenlenmis/ (görüntüleme boyutu), orijinal/ (varsa)\n`
    + `                Albüme seçilen kareler dosya adında "-SECILDI" ile işaretlidir.\n`, 'utf8'));
  const snap = path.join(DIR, `.arsiv-${process.pid}-${Date.now()}.db`);
  try {
    dbSnapshot(snap);
    await writeFileEntry(res, `${root}/veritabani.db`, snap);
  } finally { fs.rmSync(snap, { force: true }); }
  for (const k of couples) {
    const first = evs.filter((e) => e.couple_id === k.id).map((e) => e.event_date).sort()[0];
    const folder = `${root}/fotograflar/${safe(`${first} ${k.name} ${k.ref_no || ''}`)}`;
    const photos = db.listPhotos(k.id);
    let n = 0;
    for (const p of photos) {
      n++;
      const dir = path.join(config.privateDir, 'couples', String(k.id), p.file_key);
      const base = safe(p.original_name ? p.original_name.replace(/\.[a-z0-9]+$/i, '') : `foto-${String(n).padStart(4, '0')}`);
      const mark = p.is_fav ? '-SECILDI' : '';
      const display = path.join(dir, 'display.jpg');
      if (fs.existsSync(display)) await writeFileEntry(res, `${folder}/duzenlenmis/${String(n).padStart(4, '0')}-${base}${mark}.jpg`, display);
      if (p.original_ext) {
        const orig = path.join(dir, `original.${p.original_ext}`);
        if (fs.existsSync(orig)) await writeFileEntry(res, `${folder}/orijinal/${String(n).padStart(4, '0')}-${base}${mark}.${p.original_ext}`, orig);
      }
    }
  }
  res.end(Buffer.alloc(1024)); // tar sonu
}

module.exports = { start, nightly, manual, listBackups, backupPath, seasonSummary, streamSeason, seasonCouples };
