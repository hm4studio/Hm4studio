'use strict';
// Demo modu: örnek çiftleri, fotoğrafları ve portfolyoyu oluşturur; belirli aralıklarla sıfırlar.
// Örnek fotoğraflar demo/photos/ klasöründen, sıraları ve kategorileri demo/photos/fotograflar.json'dan alınır.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('./config');
const db = require('./db');
const auth = require('./auth');
const media = require('./media');
const { getContent } = require('./content');
const { today, addDays, daysBetween } = require('./jobs');

const PHOTO_DIR = path.join(config.ROOT, 'demo', 'photos');
const DEMO_ADMIN = 'demo';

let nextResetAt = 0;

function readPhoto(file) {
  try {
    const buf = fs.readFileSync(path.join(PHOTO_DIR, path.basename(file)));
    return media.detectType(buf) === 'jpg' ? { name: path.basename(file), buf } : null;
  } catch {
    return null;
  }
}

// demo/photos/fotograflar.json varsa sıra, kategori ve çift galerileri oradan; yoksa klasördeki tüm JPG'ler
function demoManifest() {
  try {
    return JSON.parse(fs.readFileSync(path.join(PHOTO_DIR, 'fotograflar.json'), 'utf8'));
  } catch {
    let files = [];
    try { files = fs.readdirSync(PHOTO_DIR).filter((f) => /\.jpe?g$/i.test(f)).sort(); } catch { /* klasör yok */ }
    return { portfolio: files.map((file) => ({ file, category: '' })), couples: { demo: files, 'demo-2': files.slice(0, 5) } };
  }
}

function demoAdminId() {
  let admin = db.getAdminByUsername(DEMO_ADMIN);
  if (!admin) {
    // Bu hesabın şifresi kimseye verilmez; yalnızca "Stüdyo olarak dene" butonuyla girilir.
    db.upsertAdmin(DEMO_ADMIN, auth.hashPassword(crypto.randomBytes(24).toString('hex')));
    admin = db.getAdminByUsername(DEMO_ADMIN);
  }
  return admin.id;
}

function seed() {
  db.resetDemoData();
  fs.rmSync(path.join(config.privateDir, 'couples'), { recursive: true, force: true });
  fs.rmSync(path.join(config.publicMediaDir, 'portfolio'), { recursive: true, force: true });
  demoAdminId();

  const c = getContent();
  const last = c.stages.length - 1;
  const manifest = demoManifest();
  const unused = auth.hashPassword(crypto.randomBytes(24).toString('hex'));
  const t = today();
  const d = (n) => addDays(t, n);
  const daysFrom = (iso) => daysBetween(t, iso);

  const couples = [
    { name: 'Elif & Burak', code: 'demo', video: 'Kurguda', appt: { fullName: 'Elif Yılmaz', partnerName: 'Burak Kaya', eventType: 'Düğün', startTime: '13:00', city: 'Antalya', venue: '[Düğün salonu]', package: 'Fotoğraf + Video + Albüm', total: 45000, deposit: 15000, source: 'Instagram', photoReady: true, team: 'Hasan, Mert', detail: 'Gelin hazırlığından başlanacak. Klip için drone isteniyor.', extra: [{ offset: -4, eventType: 'Dış Çekim', startTime: '17:30', venue: 'Göl kıyısı', package: 'Dış çekim', price: 8000, team: 'Hasan' }, { offset: -1, eventType: 'Kına', startTime: '20:00', venue: '[Kına salonu]', package: 'Fotoğraf + Video', price: 12000, team: 'Hasan, Mert' }] }, date: d(-51), due: d(5), stage: Math.min(2, last), limit: 5, locked: false, favs: [2, 3, 5],
      note: 'Fotoğraflarınızın düzenlenmesi sürüyor; video kurgusuna gelecek hafta başlıyoruz.',
      plan: { prep: 'Gelin evi · [adres]', venue: '[Düğün salonu adı ve adresi]', outdoor: 'Göl kıyısı ve çam ormanı, gün batımı', song: 'Klip için yavaş, akustik bir şarkı', flow: '13:00  Gelin hazırlığı\n15:30  Dış çekim\n19:00  Salon girişi\n21:30  Pasta', people: 'Gelinin annesi ve babaannesi, sağdıç Mert', notes: '', saved: d(-58) } },
    { name: 'Selin & Emre', code: 'demo-2', video: 'Teslim edildi', appt: { fullName: 'Selin Aydın', partnerName: 'Emre Demir', eventType: 'Düğün', startTime: '16:00', city: 'Antalya', venue: '[Mekân adı]', package: 'Fotoğraf + Video', total: 35000, deposit: 10000, paidFull: true, source: 'Tavsiye', photoReady: true, videoReady: true, albumReady: true }, date: d(-70), due: d(-10), stage: last, limit: 4, locked: true, favs: [0, 1, 4],
      note: 'Tüm fotoğraflarınız ve düğün filminiz teslim edildi. Mutluluklar!',
      plan: { venue: '[Mekân adı]', outdoor: 'Göl kıyısı', flow: '16:00  Dış çekim\n20:00  Düğün', saved: d(-75) } },
    { name: 'Zeynep & Can', code: 'demo-3', appt: { fullName: 'Zeynep Arslan', partnerName: 'Can Öztürk', eventType: 'Nişan', startTime: '18:30', city: 'Muğla', venue: '[Bahçe]', package: 'Fotoğraf', total: 18000, deposit: 6000, source: 'Google', photoReady: true }, date: d(-40), due: d(-3), stage: Math.min(3, last), limit: 60, note: 'Video kurgusu sürüyor.' },
    { name: 'Ayşe & Mehmet', code: 'demo-4', appt: { fullName: 'Ayşe Çelik', partnerName: 'Mehmet Şahin', eventType: 'Kına', startTime: '19:00', city: 'Antalya', venue: '[Kına salonu]', package: 'Fotoğraf + Video', total: 30000, deposit: 10000, source: 'WhatsApp' }, date: d(12), due: d(42), stage: 0, limit: 60, plan: { venue: 'Kına gecesi · [mekân]', saved: d(-2) } },
    { name: 'Merve & Onur', code: 'demo-5', appt: { fullName: 'Merve Koç', partnerName: 'Onur Yıldız', eventType: 'Dış Çekim', startTime: '17:00', city: 'Antalya', venue: 'Konyaaltı sahili', package: 'Fotoğraf', total: 12000, deposit: 0, source: 'Instagram' }, date: d(25), due: d(55), stage: 0, limit: 60 },
    { name: 'Deniz & Kaan', code: 'demo-6', appt: { fullName: 'Deniz Acar', partnerName: 'Kaan Polat', eventType: 'Nişan', startTime: '20:00', city: 'Antalya', venue: '[Otel bahçesi]', package: 'Fotoğraf + Video', total: 22000, deposit: 7000, source: 'Instagram', team: 'Mert', detail: 'Yüzük takma anı mutlaka çekilsin.' }, date: d(1), due: d(33), stage: 0, limit: 60 },
    { name: 'Gizem & Arda', code: 'demo-7', appt: { fullName: 'Gizem Tunç', partnerName: 'Arda Erdem', eventType: 'Düğün', startTime: '14:00', city: 'Burdur', venue: '[Düğün salonu]', package: 'Fotoğraf + Video + Albüm', total: 50000, deposit: 20000, source: 'Tavsiye', team: 'Hasan, Mert', extra: [{ offset: -4, eventType: 'Dış Çekim', startTime: '16:00', venue: 'Salda Gölü', package: 'Dış çekim', price: 10000, team: 'Hasan' }, { offset: -1, eventType: 'Kına', startTime: '19:30', venue: '[Kına evi]', package: 'Fotoğraf', price: 9000 }] }, date: d(8), due: d(53), stage: 0, limit: 80 },
  ];

  // Örnek ekip (telefonlar boş: demoda kimseye mesaj gitmez)
  const crew = {
    Hasan: db.addMember({ name: 'Hasan Yıldırım', role: 'Fotoğrafçı', phone: null, notes: 'Canon R5, 2 flaş. Hafta içi akşamları uygun.', active: true, waOptin: true }),
    Mert: db.addMember({ name: 'Mert Aksoy', role: 'Videocu', phone: null, notes: 'Sony FX3, gimbal. Drone lisansı var.', active: true, waOptin: true }),
    Ece: db.addMember({ name: 'Ece Kara', role: 'Asistan', phone: null, notes: 'Işık ve gelin hazırlığı yardımı.', active: true, waOptin: true }),
  };
  const crewIds = (names) => String(names || '').split(',').map((n) => crew[n.trim()]).filter(Boolean);

  let photoCount = 0;
  for (const k of couples) {
    const id = db.createCouple({ name: k.name, accessCode: k.code, hash: unused, eventDate: k.date });
    db.setCoupleStage(id, k.stage, k.note || '');
    const x = k.appt;
    db.updateCard(id, { name: k.name, fullName: x.fullName, partnerName: x.partnerName, phone: null, source: x.source, dueDate: k.due,
      photoReady: x.photoReady, videoReady: x.videoReady, albumReady: x.albumReady, albumLimit: k.limit, waOptin: false, notes: '' });
    // Ana etkinlik + varsa önceki günlerdeki ek etkinlikler (dış çekim, kına…)
    const evs = [...(x.extra || []).map((e) => ({ ...e, eventDate: d(e.offset + (k.date === t ? 0 : daysFrom(k.date))) })),
      { eventType: x.eventType, eventDate: k.date, startTime: x.startTime, city: x.city, venue: x.venue, package: x.package, packageDetail: x.detail || '', price: x.total, team: x.team || '' }];
    for (const e of evs) {
      const evId = db.addEvent(id, { eventType: '', startTime: '', city: x.city, venue: '', package: '', packageDetail: '', price: 0, ...e, team: '' });
      db.setEventTeam(evId, crewIds(e.team));
    }
    db.syncCoupleDate(id);
    if (x.deposit) db.addPayment(id, { amount: x.deposit, paidOn: addDays(k.date, -60), method: 'IBAN', note: 'Kapora' });
    if (x.paidFull) db.addPayment(id, { amount: evs.reduce((s2, e) => s2 + (e.price || 0), 0) - x.deposit, paidOn: addDays(k.date, 20), method: 'IBAN', note: 'Kalan bakiye' });
    db.setRefNo(id, db.nextRefNo(k.date.slice(0, 4)));
    if (k.video) db.setVideoStatus(id, k.video);
    db.setAlbum(id, { limit: k.limit, locked: false });
    if (k.plan) db.setPlan(id, k.plan);
    const files = (manifest.couples && manifest.couples[k.code]) || [];
    const ids = files.map(readPhoto).filter(Boolean).map((p) => {
      const fileKey = crypto.randomBytes(16).toString('hex');
      media.saveCouplePhoto(id, fileKey, { thumb: p.buf, display: p.buf });
      photoCount++;
      return db.addPhoto({ coupleId: id, fileKey, originalName: p.name, originalExt: null });
    });
    for (const i of k.favs || []) if (ids[i]) db.setFavorite(id, ids[i], true);
    if (k.locked && ids.length) db.setAlbumLocked(id, true);
  }

  // Portfolyo en yeniden eskiye listelenir: listedeki ilk fotoğraf en son eklenir, böylece en üstte ve kapakta olur.
  let heroId = null;
  for (const item of [...(manifest.portfolio || [])].reverse()) {
    const p = readPhoto(item.file);
    if (!p) continue;
    const fileKey = crypto.randomBytes(16).toString('hex');
    media.savePortfolioPhoto(fileKey, { thumb: p.buf, display: p.buf });
    heroId = db.addPortfolioItem({ fileKey, category: c.portfolio.categories.includes(item.category) ? item.category : '', alt: item.alt || '' });
  }
  if (heroId) db.setSetting('hero_portfolio_id', String(heroId));

  nextResetAt = Date.now() + config.demoResetHours * 3600 * 1000;
  console.log(`Demo verileri hazırlandı (${photoCount} çift fotoğrafı, ${(manifest.portfolio || []).length} portfolyo). Sonraki sıfırlama: ${new Date(nextResetAt).toLocaleString('tr-TR')}`);
}

function start() {
  if (!config.demoMode) return;
  seed();
  setInterval(seed, config.demoResetHours * 3600 * 1000).unref();
}

const isDemoAdmin = (req) => config.demoMode && req.session?.kind === 'admin' && db.getAdmin(req.session.userId)?.username === DEMO_ADMIN;

module.exports = {
  start,
  demoAdminId,
  isDemoAdmin,
  demoCoupleId: () => db.getCoupleByCode('demo')?.id ?? null,
  nextResetAt: () => nextResetAt,
};
