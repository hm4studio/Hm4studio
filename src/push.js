'use strict';
// Telefon bildirimleri (Web Push). Dışarıdan bir hizmet ya da paket kullanılmaz:
// - VAPID anahtarı ilk çalışmada üretilir ve veritabanında saklanır (kaynak kodda değil).
// - Mesaj içeriği RFC 8291'e göre (aes128gcm) cihazın anahtarıyla şifrelenir; Apple/Google içeriği göremez.
// - Gönderim arka planda yapılır; hata siteyi durdurmaz. Geçersizleşen abonelikler kendiliğinden silinir.
const crypto = require('node:crypto');
const config = require('./config');
const db = require('./db');

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s || ''), 'base64url');

function vapidKeys() {
  let stored = null;
  try { stored = JSON.parse(db.getSetting('vapid_keys') || 'null'); } catch { stored = null; }
  if (!stored?.d) {
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    stored = privateKey.export({ format: 'jwk' });
    db.setSetting('vapid_keys', JSON.stringify(stored));
  }
  const privateKey = crypto.createPrivateKey({ key: stored, format: 'jwk' });
  const publicRaw = Buffer.concat([Buffer.from([4]), fromB64u(stored.x), fromB64u(stored.y)]);
  return { privateKey, publicKey: b64u(publicRaw) };
}
let keysCache = null;
const keys = () => (keysCache ||= vapidKeys());
const publicKey = () => keys().publicKey;

function vapidHeader(endpoint) {
  const { privateKey, publicKey: pub } = keys();
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const sub = /^https:/.test(config.siteUrl || '') ? config.siteUrl : 'mailto:hm4studio@gmail.com';
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub }));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${pub}`;
}

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

// RFC 8291: içeriği aboneliğin anahtarıyla şifrele
function encrypt(sub, payload) {
  const uaPublic = fromB64u(sub.p256dh);
  const authSecret = fromB64u(sub.auth);
  const ecdh = crypto.createECDH('prime256v1');
  const asPublic = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPublic);
  const prkKey = hmac(authSecret, shared);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
  const salt = crypto.randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header[20] = asPublic.length;
  return Buffer.concat([header, asPublic, body]);
}

async function sendOne(sub, message) {
  try {
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: { TTL: String(4 * 24 * 3600), Urgency: 'normal', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', Authorization: vapidHeader(sub.endpoint) },
      body: encrypt(sub, JSON.stringify(message)),
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 404 || res.status === 410) db.deletePushSub(sub.endpoint);
    else if (!res.ok) console.error(`Bildirim gönderilemedi: HTTP ${res.status}`);
    return res.status;
  } catch (err) {
    console.error('Bildirim gönderilemedi:', err.message);
    return 0;
  }
}

// kind: 'couple' (userId = çift) veya 'admin' (tüm yöneticiler)
function notify(kind, userId, { title, body, url = kind === 'admin' ? '/admin' : '/panel', tag }) {
  const subs = kind === 'admin' ? db.listPushSubs('admin') : db.listPushSubs('couple', userId);
  if (!subs.length) return Promise.resolve([]);
  return Promise.all(subs.map((s) => sendOne(s, { title, body, url, tag })));
}

// Kısayollar
const toCouple = (coupleId, msg) => notify('couple', coupleId, msg);
const toAdmin = (msg) => notify('admin', null, msg);

module.exports = { publicKey, notify, toCouple, toAdmin, encrypt, vapidHeader };
