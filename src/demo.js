'use strict';
// Demo modu: örnek çiftleri, fotoğrafları ve portfolyoyu oluşturur; belirli aralıklarla sıfırlar.
// Örnek fotoğraflar demo/photos/ klasöründen alınır (JPG). Kendi örnek fotoğraflarınızı oraya koyabilirsiniz
// (uzun kenarı ~1600 px olacak şekilde küçültülmüş olmaları yeterli).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('./config');
const db = require('./db');
const auth = require('./auth');
const media = require('./media');
const { getContent } = require('./content');

const PHOTO_DIR = path.join(config.ROOT, 'demo', 'photos');
const DEMO_ADMIN = 'demo';

let nextResetAt = 0;

function samplePhotos() {
  try {
    return fs.readdirSync(PHOTO_DIR)
      .filter((f) => /\.jpe?g$/i.test(f))
      .sort()
      .map((f) => ({ name: f, buf: fs.readFileSync(path.join(PHOTO_DIR, f)) }))
      .filter((p) => media.detectType(p.buf) === 'jpg');
  } catch {
    return [];
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

  const photos = samplePhotos();
  const c = getContent();
  const unused = auth.hashPassword(crypto.randomBytes(24).toString('hex'));

  const couples = [
    { name: 'Elif & Burak', code: 'demo', stage: 2, note: 'Fotoğraflarınızın düzenlenmesi sürüyor; video kurgusuna gelecek hafta başlıyoruz.', favs: [1, 4, 6] },
    { name: 'Selin & Emre', code: 'demo-2', stage: c.stages.length - 1, note: 'Tüm fotoğraflarınız ve düğün filminiz teslim edildi. Mutluluklar!', favs: [0, 2] },
  ];

  for (const k of couples) {
    const id = db.createCouple({ name: k.name, accessCode: k.code, hash: unused, eventDate: '2026-09-12' });
    db.setCoupleStage(id, Math.min(k.stage, c.stages.length - 1), k.note);
    const ids = photos.map((p) => {
      const fileKey = crypto.randomBytes(16).toString('hex');
      media.saveCouplePhoto(id, fileKey, { thumb: p.buf, display: p.buf });
      return db.addPhoto({ coupleId: id, fileKey, originalName: p.name, originalExt: null });
    });
    for (const i of k.favs) if (ids[i]) db.setFavorite(id, ids[i], true);
  }

  const cats = c.portfolio.categories;
  let heroId = null;
  photos.forEach((p, i) => {
    const fileKey = crypto.randomBytes(16).toString('hex');
    media.savePortfolioPhoto(fileKey, { thumb: p.buf, display: p.buf });
    const id = db.addPortfolioItem({ fileKey, category: cats[i % cats.length] || '', alt: '' });
    if (i === 0) heroId = id;
  });
  if (heroId) db.setSetting('hero_portfolio_id', String(heroId));

  nextResetAt = Date.now() + config.demoResetHours * 3600 * 1000;
  console.log(`Demo verileri hazırlandı (${photos.length} örnek fotoğraf). Sonraki sıfırlama: ${new Date(nextResetAt).toLocaleString('tr-TR')}`);
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
