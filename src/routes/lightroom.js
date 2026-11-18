'use strict';
// Lightroom Classic eklentisi: yayın hizmeti (seçim / düzenlenmiş fotoğrafları siteye yükleme),
// çiftin seçimini Lightroom'a çekme ve eklenti paketinin indirilmesi.
// Kimlik: Photoshop eklentisiyle aynı bağlantı kodu (Bearer). Yanıtlar sade metin (sekmeyle ayrılmış satırlar):
// Lightroom'un Lua ortamında JSON çözücü olmadığından bu biçim hem sağlam hem kolay.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('../db');
const media = require('../media');
const ps = require('../photoshop');
const appt = require('../appointments');
const events = require('../events');
const config = require('../config');
const { readBody, HttpError } = require('../http');
const { requireAdmin, toId } = require('./guards');

const PLUGIN_DIR = path.join(__dirname, '..', '..', 'lightroom-plugin', 'HM4Studio.lrplugin');
const newKey = () => crypto.randomBytes(16).toString('hex');
const clean = (s) => String(s ?? '').replace(/[\t\r\n]+/g, ' ').trim();

function text(res, lines, status = 200) {
  const body = Buffer.from(`${lines.join('\n')}\n`, 'utf8');
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
  res.end(body);
}
// Hata da metin olarak döner: "ERR\t<mesaj>" (eklenti kullanıcıya gösterir)
function fail(res, status, msg) { text(res, [`ERR\t${clean(msg)}`], status); }

function register(router) {
  const guard = (req, res) => {
    if (ps.checkToken(req)) return true;
    fail(res, 401, 'Bağlantı kodu geçersiz. Panelde Photoshop/Lightroom bağlantısı sayfasından yeni kod oluşturup eklentiye yapıştırın.');
    return false;
  };
  const coupleOf = (res, id) => { const c = db.getCouple(toId(id)); if (!c) fail(res, 404, 'Çift bulunamadı (silinmiş olabilir).'); return c; };

  router.get('/api/lr/durum', (req, res) => { if (guard(req, res)) text(res, ['OK\tHM4 Studio']); });

  // Çiftler: id, ad, ilk çekim tarihi, seçim durumu (none/doing/done), seçilen, seçim galerisi, düzenlenmiş sayısı
  router.get('/api/lr/ciftler', (req, res) => {
    if (!guard(req, res)) return;
    const yearAgo = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
    const rows = db.listCouples().filter((c) => !c.archived_at && (!c.event_date || c.event_date >= yearAgo || c.next_date));
    text(res, ['OK', ...rows.map((c) => {
      const counts = { secim: 0, duzenli: 0 };
      for (const p of db.listPhotos(c.id)) counts[p.kind === 'duzenli' ? 'duzenli' : 'secim']++;
      const sel = c.album_locked ? 'done' : c.fav_count > 0 ? 'doing' : 'none';
      return [c.id, clean(c.name), c.event_date || '', sel, c.fav_count || 0, counts.secim, counts.duzenli].join('\t');
    })]);
  });

  // Çiftin seçimi: site fotoğraf no, seri numarası, yüklenen dosya adı
  router.get('/api/lr/ciftler/:id/secim', (req, res, { params }) => {
    if (!guard(req, res)) return;
    const c = coupleOf(res, params.id); if (!c) return;
    const favs = db.listFavoritePhotos(c.id);
    const names = appt.selectionNames(favs);
    text(res, [`OK\t${c.album_locked ? 'done' : 'doing'}\t${clean(c.name)}`, ...favs.map((p, i) => [p.id, names[i], clean(p.original_name)].join('\t'))]);
  });

  // Yeni fotoğraf (gövde: thumb + display JPEG art arda; X-Parts uzunlukları verir)
  router.post('/api/lr/ciftler/:id/foto', async (req, res, { params, query }) => {
    if (!guard(req, res)) { req.resume(); return; }
    const c = coupleOf(res, params.id); if (!c) { req.resume(); return; }
    const kind = query.get('tur');
    if (kind !== 'secim' && kind !== 'duzenli') { req.resume(); return fail(res, 400, 'Klasör türü bilinmiyor (secim / duzenli).'); }
    // Tekrar denemede aynı fotoğraf iki kez eklenmesin
    const uploadKey = /^[a-f0-9]{32}$/.test(String(req.headers['x-upload-key'] || '')) ? String(req.headers['x-upload-key']) : null;
    const seen = uploadKey && db.photoByUploadKey(c.id, uploadKey);
    if (seen) { req.resume(); return text(res, [`OK\t${seen.id}`]); }
    media.markUploadActivity();
    const body = await readBody(req, config.maxUploadBytes);
    let parts;
    try { parts = media.splitParts(req, body); } catch (err) { return fail(res, err.status || 400, err.message); }
    const fileKey = newKey();
    media.saveCouplePhoto(c.id, fileKey, parts);
    const dim = media.jpegSize(parts.thumb) || {};
    const name = clean(decodeURIComponent(String(req.headers['x-filename'] || ''))).slice(0, 160);
    const id = db.addPhoto({ coupleId: c.id, fileKey, originalName: name, kind, uploadKey, w: dim.w || null, h: dim.h || null, galleryId: kind === 'secim' ? db.defaultGallery(c.id) : null });
    events.photosUploaded(c.id, kind);
    text(res, [`OK\t${id}`]);
  });

  // Yeniden yayın: aynı fotoğrafın dosyaları değişir (çiftin seçimi/favorisi korunur)
  router.post('/api/lr/foto/:pid/guncelle', async (req, res, { params }) => {
    if (!guard(req, res)) { req.resume(); return; }
    const p = db.getPhoto(toId(params.pid));
    if (!p) { req.resume(); return fail(res, 404, 'Fotoğraf sitede yok'); }
    media.markUploadActivity();
    const body = await readBody(req, config.maxUploadBytes);
    let parts;
    try { parts = media.splitParts(req, body); } catch (err) { return fail(res, err.status || 400, err.message); }
    const fileKey = newKey();
    media.saveCouplePhoto(p.couple_id, fileKey, parts);
    const dim = media.jpegSize(parts.thumb) || {};
    db.replacePhotoFiles(p.id, { fileKey, w: dim.w || null, h: dim.h || null });
    media.removeCouplePhoto(p.couple_id, p.file_key);
    if (p.kind === 'duzenli') events.photosUploaded(p.couple_id, 'duzenli');
    text(res, [`OK\t${p.id}`]);
  });

  // Lightroom'da yayından kaldırılan fotoğraf: çiftin seçimindeyse sitede bırakılır (KEEP)
  router.post('/api/lr/foto/:pid/sil', (req, res, { params }) => {
    if (!guard(req, res)) return;
    const p = db.getPhoto(toId(params.pid));
    if (!p) return text(res, ['OK\tyok']);
    if (db.isFavorite(p.id)) return text(res, ['KEEP\tçiftin seçiminde']);
    db.deletePhoto(p.id);
    media.removeCouplePhoto(p.couple_id, p.file_key);
    text(res, ['OK\tsilindi']);
  });

  // Eklenti paketi: HM4Studio.lrplugin klasörü (site adresi Config.lua'ya yazılır)
  router.get('/admin/lightroom/HM4Studio.lrplugin.zip', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const entries = fs.readdirSync(PLUGIN_DIR).filter((f) => !f.startsWith('.') && f !== 'Config.lua')
      .map((f) => ({ name: `HM4Studio.lrplugin/${f}`, file: path.join(PLUGIN_DIR, f) }));
    const tmp = path.join(config.privateDir, 'tmp-lr');
    fs.mkdirSync(tmp, { recursive: true });
    const cfg = path.join(tmp, 'Config.lua');
    fs.writeFileSync(cfg, `-- Siteden indirilirken yazıldı\nreturn { site = ${JSON.stringify(config.siteUrl.replace(/\/+$/, ''))} }\n`);
    entries.push({ name: 'HM4Studio.lrplugin/Config.lua', file: cfg });
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="HM4Studio.lrplugin.zip"', 'Cache-Control': 'no-store' });
    await require('../zip').streamZip(res, entries).catch(() => res.destroy());
  });
}

module.exports = { register };
