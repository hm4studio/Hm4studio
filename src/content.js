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

module.exports = { getContent };
