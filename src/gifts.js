'use strict';
// Hediye kuponu programı: teslim alan çift sevdiklerine kupon gönderir; kuponla gelen çift rezervasyon yapınca
// kupon kullanılmış sayılır ve tavsiye eden çifte teşekkür hediyesi borçlanılır (panelde hatırlatılır).
const crypto = require('node:crypto');
const db = require('./db');
const config = require('./config');
const { getContent } = require('./content');
const { today, addDays } = require('./jobs');

const settings = () => ({ active: false, perCouple: 3, validDays: 365, gift: '', reward: '', rules: '', ...(getContent().gifts || {}) });
const ALPHA = 'ACDEFGHJKLMNPQRTUVWXY3479'; // karışmayan harfler/rakamlar

// "Elif & Burak" → "ELIF-BURAK"
function prefix(name) {
  const words = String(name || '').toLocaleUpperCase('tr-TR').replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G').replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C').replace(/Â/g, 'A')
    .replace(/[^A-Z]+/g, ' ').trim().split(' ').filter((w) => w && !['VE', 'ILE', 'AND'].includes(w));
  return (words.slice(0, 2).join('-') || 'HM4').slice(0, 16);
}
function newCode(name) {
  for (let i = 0; i < 20; i++) {
    const tail = [...crypto.randomBytes(3)].map((b) => ALPHA[b % ALPHA.length]).join('');
    const code = `${prefix(name)}-${tail}`;
    if (!db.giftByCode(code)) return code;
  }
  throw new Error('Kupon kodu üretilemedi');
}

// Çiftin kuponları yoksa oluşturur (program açıkken teslimde ya da admin isteyince)
function ensureCodes(couple) {
  const have = db.giftCodesFor(couple.id);
  const s = settings();
  for (let i = have.length; i < s.perCouple; i++) db.addGiftCode(couple.id, newCode(couple.name), addDays(today(), s.validDays));
  return db.giftCodesFor(couple.id);
}

// Kupon geçerli mi? (kod, sahibi, durum)
function check(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!/^[A-Z0-9-]{5,40}$/.test(c)) return { ok: false, reason: 'Kupon kodu geçersiz.' };
  const g = db.giftByCode(c);
  if (!g) return { ok: false, reason: 'Bu kupon bulunamadı.' };
  if (g.used_couple_id) return { ok: false, reason: 'Bu kupon daha önce kullanılmış.', g };
  if (g.expires_on < today()) return { ok: false, reason: 'Bu kuponun süresi dolmuş.', g };
  return { ok: true, g };
}

const giftUrl = (code) => `${config.siteUrl}/hediye/${code}`;
function shareText(couple, code) {
  const s = settings();
  return `Merhaba! Size HM4 Studio'dan bir hediyem var: ${s.gift}. Düğün ya da nişan fotoğraflarınız için geçerli. Detaylar ve kuponunuz burada: ${giftUrl(code)}`;
}

module.exports = { settings, ensureCodes, check, giftUrl, shareText, prefix };
