'use strict';
// Yüklenen fotoğrafların diske kaydedilmesi.
// Küçük önizleme (thumb) ve ekran boyutu (display) tarayıcıda hazırlanıp JPEG olarak gelir;
// çift fotoğraflarında isteğe bağlı olarak orijinal dosya da saklanır (indirme için).
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');
const { HttpError } = require('./http');

function detectType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.length > 12 && buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (['heic', 'heix', 'mif1', 'msf1', 'hevc'].includes(brand)) return 'heic';
  }
  return null;
}

// Gövdeyi "X-Parts: thumb:1234,display:5678,original:91011" başlığına göre parçalara ayırır
function splitParts(req, body) {
  const spec = String(req.headers['x-parts'] || '');
  const parts = {};
  let offset = 0;
  for (const item of spec.split(',')) {
    const [name, lenStr] = item.split(':');
    const len = Number(lenStr);
    if (!['thumb', 'display', 'original'].includes(name) || !Number.isInteger(len) || len <= 0) {
      throw new HttpError(400, 'Geçersiz yükleme.');
    }
    parts[name] = body.subarray(offset, offset + len);
    offset += len;
  }
  if (offset !== body.length || !parts.thumb || !parts.display) throw new HttpError(400, 'Geçersiz yükleme.');
  if (detectType(parts.thumb) !== 'jpg' || detectType(parts.display) !== 'jpg') {
    throw new HttpError(415, 'Desteklenmeyen görsel biçimi.');
  }
  if (parts.original) {
    parts.originalExt = detectType(parts.original);
    if (!parts.originalExt) throw new HttpError(415, 'Orijinal dosya JPG, PNG, WEBP veya HEIC olmalı.');
  }
  return parts;
}

// ── Çift fotoğrafları (gizli klasör) ──
function coupleDir(coupleId, fileKey) {
  return path.join(config.privateDir, 'couples', String(coupleId), fileKey);
}

function saveCouplePhoto(coupleId, fileKey, parts) {
  const dir = coupleDir(coupleId, fileKey);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'thumb.jpg'), parts.thumb);
  fs.writeFileSync(path.join(dir, 'display.jpg'), parts.display);
  if (parts.original) fs.writeFileSync(path.join(dir, `original.${parts.originalExt}`), parts.original);
}

function removeCouplePhoto(coupleId, fileKey) {
  fs.rmSync(coupleDir(coupleId, fileKey), { recursive: true, force: true });
}

function removeCoupleFolder(coupleId) {
  fs.rmSync(path.join(config.privateDir, 'couples', String(coupleId)), { recursive: true, force: true });
}

// Klasör boyutu (bayt)
function dirSize(dir) {
  let total = 0;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += dirSize(p);
    else { try { total += fs.statSync(p).size; } catch { /* yok say */ } }
  }
  return total;
}
const coupleRoot = (coupleId) => path.join(config.privateDir, 'couples', String(coupleId));
// Çiftin fotoğraf ve video dosyalarının kapladığı alan
function coupleUsage(coupleId) {
  const root = coupleRoot(coupleId);
  const videos = dirSize(path.join(root, 'videos'));
  return { photos: Math.max(dirSize(root) - videos, 0), videos };
}
// Belirli fotoğrafların klasörlerini sil (ör. yalnızca seçim fotoğrafları)
function removePhotoDirs(coupleId, photos) {
  for (const p of photos) fs.rmSync(coupleDir(coupleId, p.file_key), { recursive: true, force: true });
}
const removeCoupleVideos = (coupleId) => fs.rmSync(path.join(coupleRoot(coupleId), 'videos'), { recursive: true, force: true });
const photosSize = (coupleId, photos) => photos.reduce((t, p) => t + dirSize(coupleDir(coupleId, p.file_key)), 0);

// Yalnızca dosyaları sil (kayıtlar veritabanında ayrıca temizlenir)
function clearCoupleFiles(coupleId, withVideos) {
  const root = coupleRoot(coupleId);
  let entries = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name === 'videos' && !withVideos) continue;
    fs.rmSync(path.join(root, e.name), { recursive: true, force: true });
  }
}

// ── Portfolyo (herkese açık klasör) ──
const portfolioDir = path.join(config.publicMediaDir, 'portfolio');

function savePortfolioPhoto(fileKey, parts) {
  fs.mkdirSync(portfolioDir, { recursive: true });
  fs.writeFileSync(path.join(portfolioDir, `${fileKey}-thumb.jpg`), parts.thumb);
  fs.writeFileSync(path.join(portfolioDir, `${fileKey}-display.jpg`), parts.display);
}

function removePortfolioPhoto(fileKey) {
  for (const v of ['thumb', 'display']) fs.rmSync(path.join(portfolioDir, `${fileKey}-${v}.jpg`), { force: true });
}

// Site görselleri (logo, hakkımızda fotoğrafı): herkese açık /media/site/
const siteDir = path.join(config.publicMediaDir, 'site');
function saveSiteImage(fileKey, buf, ext) {
  fs.mkdirSync(siteDir, { recursive: true });
  const name = `${fileKey}.${ext}`;
  fs.writeFileSync(path.join(siteDir, name), buf);
  return `/media/site/${name}`;
}
function removeSiteImage(url) {
  const m = /^\/media\/site\/([a-f0-9]{32}\.(jpg|png|webp))$/.exec(String(url || ''));
  if (m) fs.rmSync(path.join(siteDir, m[1]), { force: true });
}

const portfolioUrl = (fileKey, variant) => `/media/portfolio/${fileKey}-${variant}.jpg`;

// Çiftin fotoğrafları ZIP için: varsa orijinal, yoksa büyük boy; dosya adı yüklendiği ad
function couplePhotoEntries(coupleId, photos) {
  const used = new Map();
  const out = [];
  photos.forEach((p, i) => {
    const dir = coupleDir(coupleId, p.file_key);
    const orig = p.original_ext ? path.join(dir, `original.${p.original_ext}`) : null;
    const file = orig && fs.existsSync(orig) ? orig : path.join(dir, 'display.jpg');
    if (!fs.existsSync(file)) return;
    const ext = file === orig ? p.original_ext : 'jpg';
    let base = String(p.original_name || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[\\/:*?"<>|]+/g, '-').trim() || `foto-${String(i + 1).padStart(4, '0')}`;
    const n = (used.get(base) || 0) + 1; used.set(base, n);
    if (n > 1) base = `${base} (${n})`;
    out.push({ name: `${base}.${ext}`, file });
  });
  return out;
}

// ── Videolar: parça parça yükleme (büyük dosyalar belleğe alınmaz) ──
const videoDir = (coupleId) => path.join(config.privateDir, 'couples', String(coupleId), 'videos');
const tmpVideo = (uploadId) => path.join(config.privateDir, 'tmp-video', `${uploadId}.part`);
function appendVideoChunk(uploadId, buf, first) {
  fs.mkdirSync(path.dirname(tmpVideo(uploadId)), { recursive: true });
  if (first) fs.writeFileSync(tmpVideo(uploadId), buf); else fs.appendFileSync(tmpVideo(uploadId), buf);
  return fs.statSync(tmpVideo(uploadId)).size;
}
// İlk baytlardan video türü: mp4/mov/m4v ("ftyp"), webm (EBML)
function videoType(file) {
  const fd = fs.openSync(file, 'r');
  const b = Buffer.alloc(12);
  fs.readSync(fd, b, 0, 12, 0);
  fs.closeSync(fd);
  if (b.slice(4, 8).toString('latin1') === 'ftyp') return b.slice(8, 10).toString('latin1') === 'qt' ? 'mov' : 'mp4';
  if (b.readUInt32BE(0) === 0x1a45dfa3) return 'webm';
  return null;
}
function finishVideo(uploadId, coupleId, fileKey) {
  const tmp = tmpVideo(uploadId);
  const ext = videoType(tmp);
  if (!ext) { fs.rmSync(tmp, { force: true }); return null; }
  fs.mkdirSync(videoDir(coupleId), { recursive: true });
  const dest = path.join(videoDir(coupleId), `${fileKey}.${ext}`);
  fs.renameSync(tmp, dest);
  return { ext, size: fs.statSync(dest).size };
}
const discardVideoUpload = (uploadId) => fs.rmSync(tmpVideo(uploadId), { force: true });
const removeVideo = (coupleId, fileKey, ext) => fs.rmSync(path.join(videoDir(coupleId), `${fileKey}.${ext}`), { force: true });

module.exports = {
  dirSize, coupleUsage, clearCoupleFiles, removePhotoDirs, photosSize, removeCoupleVideos,
  videoDir, appendVideoChunk, finishVideo, discardVideoUpload, removeVideo,
  couplePhotoEntries,
  saveSiteImage,
  removeSiteImage,
  detectType, splitParts,
  coupleDir, saveCouplePhoto, removeCouplePhoto, removeCoupleFolder,
  savePortfolioPhoto, removePortfolioPhoto, portfolioUrl,
};
