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

const portfolioUrl = (fileKey, variant) => `/media/portfolio/${fileKey}-${variant}.jpg`;

module.exports = {
  detectType, splitParts,
  coupleDir, saveCouplePhoto, removeCouplePhoto, removeCoupleFolder,
  savePortfolioPhoto, removePortfolioPhoto, portfolioUrl,
};
