'use strict';
// Photoshop bağlantısı: albüm panelinden gönderilen fotoğraf, Photoshop'taki "HM4 Albüm" eklentisinde açılır;
// kaydedilince yeni hali buraya yüklenir. Düzenlenmiş fotoğraf varsa onun yerine geçer (eskisi sürüm olarak saklanır),
// yoksa aynı adla yeni bir düzenlenmiş fotoğraf oluşur (çiftin "Düzenlenmiş" listesinde de görünür).
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { db } = require('./db');
const dbx = require('./db');
const media = require('./media');

const q = (sql) => db.prepare(sql);
const newKey = () => crypto.randomBytes(16).toString('hex');
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// ── Eklenti anahtarı (tek anahtar; yenisi oluşturulunca eskisi geçersiz olur) ──
function createToken() {
  const token = `hm4ps_${crypto.randomBytes(24).toString('hex')}`;
  dbx.setSetting('ps_token_hash', sha(token));
  dbx.setSetting('ps_token_at', new Date().toISOString());
  return token;
}
function tokenInfo() { return { has: Boolean(dbx.getSetting('ps_token_hash')), at: dbx.getSetting('ps_token_at') || '' }; }
function revokeToken() { dbx.setSetting('ps_token_hash', ''); }
function checkToken(req) {
  const m = /^Bearer\s+(\S+)$/.exec(String(req.headers.authorization || ''));
  const want = dbx.getSetting('ps_token_hash');
  if (!m || !want) return false;
  const a = Buffer.from(sha(m[1])), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ── İşler ──
const STALE = "datetime('now', '-12 hours')";
function createJob(coupleId, photoId, filePhotoId) {
  q(`UPDATE ps_jobs SET status = 'iptal', updated_at = datetime('now') WHERE couple_id = ? AND photo_id = ? AND status IN ('bekliyor', 'acik')`).run(coupleId, photoId);
  return Number(q('INSERT INTO ps_jobs(couple_id, photo_id, file_photo_id) VALUES(?, ?, ?)').run(coupleId, photoId, filePhotoId).lastInsertRowid);
}
const getJob = (id) => q('SELECT * FROM ps_jobs WHERE id = ?').get(id);
const setStatus = (id, st, resultId = null) => q("UPDATE ps_jobs SET status = ?, result_photo_id = COALESCE(?, result_photo_id), updated_at = datetime('now') WHERE id = ?").run(st, resultId, id);
// Eklentinin bekleyen işleri (eski, yarım kalanlar düşer)
function openJobs() {
  q(`UPDATE ps_jobs SET status = 'iptal' WHERE status IN ('bekliyor', 'acik') AND created_at < ${STALE}`).run();
  return q(`SELECT j.*, c.name AS couple_name, p.original_name, p.original_ext FROM ps_jobs j
    JOIN couples c ON c.id = j.couple_id JOIN photos p ON p.id = j.file_photo_id
    WHERE j.status IN ('bekliyor', 'acik') ORDER BY j.id`).all();
}
const coupleJobs = (coupleId) => q(`SELECT id, photo_id, file_photo_id, status, result_photo_id, updated_at FROM ps_jobs
  WHERE couple_id = ? AND (status IN ('bekliyor', 'acik') OR updated_at > datetime('now', '-10 minutes')) ORDER BY id`).all(coupleId);

// İşin dosyası: varsa orijinal, yoksa büyük boy
function jobFile(job) {
  const p = dbx.getPhoto(job.file_photo_id);
  if (!p) return null;
  const dir = media.coupleDir(p.couple_id, p.file_key);
  const orig = p.original_ext ? path.join(dir, `original.${p.original_ext}`) : null;
  if (orig && fs.existsSync(orig)) return { dir, file: `original.${p.original_ext}`, name: p.original_name || `foto-${p.id}.${p.original_ext}` };
  return fs.existsSync(path.join(dir, 'display.jpg')) ? { dir, file: 'display.jpg', name: (p.original_name || `foto-${p.id}`).replace(/\.[^.]+$/, '') + '.jpg' } : null;
}

// Yeni hali kaydet: düzenlenmiş fotoğrafın yerine geçer ya da yeni düzenlenmiş fotoğraf oluşturur
function applyUpload(job, parts) {
  const src = dbx.getPhoto(job.result_photo_id || job.file_photo_id); // ikinci kayıtta oluşan düzenlenmiş fotoğrafın üstüne yazar
  if (!src) throw new Error('Fotoğraf bulunamadı');
  const key = newKey();
  media.saveCouplePhoto(src.couple_id, key, parts);
  const dim = media.jpegSize(parts.original && parts.originalExt === 'jpg' ? parts.original : parts.display) || {};
  let resultId;
  if (src.kind === 'duzenli') {
    q('INSERT INTO photo_versions(photo_id, file_key, original_ext, w, h, note) VALUES(?, ?, ?, ?, ?, ?)').run(src.id, src.file_key, src.original_ext || null, src.w || null, src.h || null, 'önceki');
    q('UPDATE photos SET file_key = ?, original_ext = ?, w = ?, h = ?, rev = rev + 1 WHERE id = ?').run(key, parts.originalExt || null, dim.w || null, dim.h || null, src.id);
    resultId = src.id;
  } else {
    resultId = dbx.addPhoto({ coupleId: src.couple_id, fileKey: key, originalName: src.original_name || `foto-${src.id}.jpg`, originalExt: parts.originalExt || null, kind: 'duzenli', w: dim.w || null, h: dim.h || null });
    // Geri dönüş: düzenlenmiş hali hiç yoktu (bu sürüme dönmek, düzenlenmiş fotoğrafı kaldırır)
    q("INSERT INTO photo_versions(photo_id, file_key, note) VALUES(?, NULL, 'seçimdeki hali')").run(resultId);
  }
  setStatus(job.id, 'yuklendi', resultId);
  return resultId;
}

// ── Sürümler ──
const versions = (photoId) => q('SELECT id, photo_id, file_key IS NOT NULL AS has_file, note, created_at FROM photo_versions WHERE photo_id = ? ORDER BY id DESC').all(photoId);
const getVersion = (id) => q('SELECT * FROM photo_versions WHERE id = ?').get(id);
// Seçilen sürüme dön: şimdiki hal de sürüm olarak saklanır (geri alınabilir)
function restore(v) {
  const p = dbx.getPhoto(v.photo_id);
  if (!p) return null;
  if (!v.file_key) {
    // düzenlenmiş hali kaldır: fotoğraf ve dosyaları silinir, albüm seçimdeki haline döner
    q('SELECT file_key FROM photo_versions WHERE photo_id = ? AND file_key IS NOT NULL').all(p.id).forEach((x) => media.removeCouplePhoto(p.couple_id, x.file_key));
    media.removeCouplePhoto(p.couple_id, p.file_key);
    dbx.deletePhoto(p.id);
    return { removed: true };
  }
  q('INSERT INTO photo_versions(photo_id, file_key, original_ext, w, h, note) VALUES(?, ?, ?, ?, ?, ?)').run(p.id, p.file_key, p.original_ext || null, p.w || null, p.h || null, 'geri alınan');
  q('UPDATE photos SET file_key = ?, original_ext = ?, w = ?, h = ?, rev = rev + 1 WHERE id = ?').run(v.file_key, v.original_ext || null, v.w || null, v.h || null, p.id);
  q('DELETE FROM photo_versions WHERE id = ?').run(v.id);
  return { removed: false };
}

module.exports = { createToken, tokenInfo, revokeToken, checkToken, createJob, getJob, setStatus, openJobs, coupleJobs, jobFile, applyUpload, versions, getVersion, restore };
