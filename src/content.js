'use strict';
// content/site.json dosyasını okur. Dosya değişince yeniden okunur (sunucuyu yeniden başlatmak gerekmez).
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');

const FILE = path.join(config.ROOT, 'content', 'site.json');
let cache = null;
let cacheMtime = 0;

// Panelden yapılan "Site" ayarları veritabanında durur ve site.json'un üzerine yazılır
let db = null;
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function merge(base, over) {
  if (!isObj(over)) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = isObj(v) && isObj(base[k]) ? merge(base[k], v) : v;
  return out;
}
let mergedKey = null;
let merged = null;

function getContent() {
  const base = baseContent();
  let raw = '';
  try { db ||= require('./db'); raw = db.getSetting('site_overrides') || ''; } catch { /* veritabanı yoksa yalnızca dosya */ }
  const key = `${cacheMtime}|${raw}`;
  if (merged && key === mergedKey) return merged;
  let over = null;
  try { over = raw ? JSON.parse(raw) : null; } catch { over = null; }
  mergedKey = key;
  merged = merge(base, over);
  return merged;
}

// Panel ayarlarını içermeyen dosya içeriği (Site ayarları sayfasında "varsayılan" olarak)
function baseContent() {
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

module.exports = { getContent, baseContent, getWhatsapp };
