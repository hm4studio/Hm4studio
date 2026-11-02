'use strict';
// content/site.json dosyasını okur. Dosya değişince yeniden okunur (sunucuyu yeniden başlatmak gerekmez).
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');

const FILE = path.join(config.ROOT, 'content', 'site.json');
let cache = null;
let cacheMtime = 0;

function getContent() {
  try {
    const mtime = fs.statSync(FILE).mtimeMs;
    if (!cache || mtime !== cacheMtime) {
      cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      cacheMtime = mtime;
    }
  } catch (err) {
    if (!cache) throw new Error(`content/site.json okunamadı: ${err.message}`);
    console.error('content/site.json okunamadı, son geçerli sürüm kullanılıyor:', err.message);
  }
  return cache;
}

// content/whatsapp.json: WhatsApp mesaj metinleri ve kuralları
const WA_FILE = path.join(config.ROOT, 'content', 'whatsapp.json');
let waCache = null;
let waMtime = 0;
function getWhatsapp() {
  try {
    const mtime = fs.statSync(WA_FILE).mtimeMs;
    if (!waCache || mtime !== waMtime) { waCache = JSON.parse(fs.readFileSync(WA_FILE, 'utf8')); waMtime = mtime; }
  } catch (err) {
    if (!waCache) throw new Error(`content/whatsapp.json okunamadı: ${err.message}`);
    console.error('content/whatsapp.json okunamadı, son geçerli sürüm kullanılıyor:', err.message);
  }
  return waCache;
}

module.exports = { getContent, getWhatsapp };
