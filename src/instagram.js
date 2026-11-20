'use strict';
// Instagram bağlantısı (resmî "Instagram API with Instagram Login").
// - Profesyonel (İşletme/İçerik Üreticisi) hesap + Meta uygulaması gerekir: .env içinde INSTAGRAM_APP_ID ve INSTAGRAM_APP_SECRET.
// - Panelde "Instagram'ı bağla" ile alınan uzun ömürlü anahtar (60 gün) veritabanında saklanır ve kendiliğinden yenilenir.
// - Eski yöntem: .env içinde INSTAGRAM_ACCESS_TOKEN tanımlıysa o da kullanılır.
// Kullanım: sitedeki Instagram akışı ve panelde "Instagram'dan al" (gönderileri portfolyoya kopyalama).
const crypto = require('node:crypto');
const config = require('./config');
const db = require('./db');

const GRAPH = 'https://graph.instagram.com';
const KEY = 'instagram_auth';
const DAY = 24 * 3600 * 1000;

const appReady = () => Boolean(config.instagramAppId && config.instagramAppSecret);
const redirectUri = () => `${config.siteUrl}/admin/instagram/donus`;

function stored() {
  try { return JSON.parse(db.getSetting(KEY) || 'null'); } catch { return null; }
}
function save(a) { db.setSetting(KEY, a ? JSON.stringify(a) : ''); cache = { at: 0, items: [] }; }
function token() { return stored()?.token || config.instagramToken || ''; }

/** Panel için bağlantı durumu */
function status() {
  const a = stored();
  if (a?.token) return { connected: true, username: a.username || '', expires: a.expires || 0, viaEnv: false, appReady: appReady() };
  if (config.instagramToken) return { connected: true, username: '', expires: 0, viaEnv: true, appReady: appReady() };
  return { connected: false, appReady: appReady() };
}

async function getJson(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error || data.error_message) {
    const msg = data.error?.message || data.error_message || `Instagram ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.expired = data.error?.code === 190 || /session|token/i.test(msg);
    throw err;
  }
  return data;
}

// ── Bağlama (OAuth) ──
function authorizeUrl(state) {
  const u = new URL('https://www.instagram.com/oauth/authorize');
  u.searchParams.set('client_id', config.instagramAppId);
  u.searchParams.set('redirect_uri', redirectUri());
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', 'instagram_business_basic');
  u.searchParams.set('state', state);
  return u.toString();
}
const newState = () => crypto.randomBytes(16).toString('hex');

async function finishConnect(code) {
  const body = new URLSearchParams({
    client_id: config.instagramAppId, client_secret: config.instagramAppSecret,
    grant_type: 'authorization_code', redirect_uri: redirectUri(), code: String(code).replace(/#_$/, ''),
  });
  const short = await getJson('https://api.instagram.com/oauth/access_token', { method: 'POST', body });
  const u = new URL(`${GRAPH}/access_token`);
  u.searchParams.set('grant_type', 'ig_exchange_token');
  u.searchParams.set('client_secret', config.instagramAppSecret);
  u.searchParams.set('access_token', short.access_token);
  const long = await getJson(u);
  const me = await getJson(`${GRAPH}/me?fields=user_id,username&access_token=${encodeURIComponent(long.access_token)}`);
  save({ token: long.access_token, expires: Date.now() + (Number(long.expires_in) || 60 * 24 * 3600) * 1000, refreshed: Date.now(), username: me.username || '' });
  return me.username || '';
}

function disconnect() { save(null); }

/** Uzun ömürlü anahtarı süresi dolmadan yeniler (günde en çok bir kez; anahtar en az 1 günlük olmalı) */
async function refreshIfNeeded() {
  const a = stored();
  if (!a?.token) return;
  if (Date.now() - (a.refreshed || 0) < 7 * DAY && a.expires - Date.now() > 20 * DAY) return;
  try {
    const d = await getJson(`${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(a.token)}`);
    save({ ...a, token: d.access_token, expires: Date.now() + (Number(d.expires_in) || 60 * 24 * 3600) * 1000, refreshed: Date.now() });
  } catch (err) {
    console.error('Instagram anahtarı yenilenemedi:', err.message);
    if (a.expires < Date.now()) {
      try { require('./activity').notify('sistem', { title: 'Instagram bağlantısının süresi doldu', text: 'Portfolyo › Instagram\'dan al bölümünden yeniden bağlayın.', url: '/admin/portfolyo#instagram', tag: 'ig-expired' }); } catch { /* önemsiz */ }
    }
  }
}

// ── Gönderiler ──
const FIELDS = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{id,media_type,media_url,thumbnail_url}';
const urls = new Map(); // medya kimliği → Instagram CDN adresi (vekil indirme için; yalnızca listelenenler)

function remember(id, url) {
  if (!url) return;
  urls.set(String(id), url);
  if (urls.size > 2000) urls.delete(urls.keys().next().value);
}

/** Panel seçicisi için gönderi listesi. Videolar atlanır (yalnızca fotoğraflar portfolyoya girer). */
async function listMedia(after = '') {
  const t = token();
  if (!t) throw new Error('Instagram bağlı değil.');
  const u = new URL(`${GRAPH}/me/media`);
  u.searchParams.set('fields', FIELDS);
  u.searchParams.set('limit', '30');
  if (after) u.searchParams.set('after', after);
  u.searchParams.set('access_token', t);
  const data = await getJson(u);
  const items = [];
  for (const p of data.data || []) {
    let photos;
    if (p.media_type === 'CAROUSEL_ALBUM') photos = (p.children?.data || []).filter((c) => c.media_type === 'IMAGE').map((c) => ({ id: c.id, url: c.media_url }));
    else if (p.media_type === 'IMAGE') photos = [{ id: p.id, url: p.media_url }];
    else continue;
    if (!photos.length) continue;
    for (const ph of photos) remember(ph.id, ph.url);
    remember(`t${p.id}`, p.media_type === 'CAROUSEL_ALBUM' ? photos[0].url : p.media_url);
    items.push({ id: p.id, caption: (p.caption || '').slice(0, 300), permalink: p.permalink || '', date: p.timestamp || '', photos: photos.map((ph) => ph.id) });
  }
  return { items, next: data.paging?.next ? data.paging?.cursors?.after || '' : '' };
}

const CDN = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;
/** Listelenmiş bir fotoğrafı (ya da kapak küçük resmini: "t<id>") indirir. Yalnızca Instagram CDN'ine gidilir. */
async function fetchPhoto(id) {
  const url = urls.get(String(id));
  if (!url) { const e = new Error('Fotoğraf bulunamadı; listeyi yenileyin.'); e.status = 404; throw e; }
  let target = new URL(url);
  for (let hop = 0; hop < 3; hop++) {
    if (target.protocol !== 'https:' || !CDN.test(target.hostname)) { const e = new Error('Geçersiz adres'); e.status = 400; throw e; }
    const res = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { target = new URL(res.headers.get('location'), target); continue; }
    if (!res.ok) { const e = new Error(`İndirilemedi (${res.status}); listeyi yenileyin.`); e.status = 502; throw e; }
    const type = res.headers.get('content-type') || '';
    if (!/^image\/(jpeg|png|webp)/.test(type)) { const e = new Error('Desteklenmeyen biçim'); e.status = 415; throw e; }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 30 * 1024 * 1024) { const e = new Error('Dosya çok büyük'); e.status = 413; throw e; }
    return { buf, type };
  }
  const e = new Error('Çok fazla yönlendirme'); e.status = 502; throw e;
}

// ── Sitedeki Instagram akışı (portfolyo sayfasının altı) ──
let cache = { at: 0, items: [] };
const TTL = 60 * 60 * 1000; // 1 saat

async function getInstagramPosts(limit = 12) {
  const t = token();
  if (!t) return [];
  if (Date.now() - cache.at < TTL) return cache.items.slice(0, limit);
  try {
    const url = new URL(`${GRAPH}/me/media`);
    url.searchParams.set('fields', 'id,caption,media_type,media_url,thumbnail_url,permalink');
    url.searchParams.set('limit', '24');
    url.searchParams.set('access_token', t);
    const data = await getJson(url);
    const items = (data.data || [])
      .filter((p) => p.media_type === 'IMAGE' || p.media_type === 'CAROUSEL_ALBUM' || p.media_type === 'VIDEO')
      .map((p) => ({
        image: p.media_type === 'VIDEO' ? p.thumbnail_url : p.media_url,
        link: p.permalink,
        caption: (p.caption || '').slice(0, 140),
      }))
      .filter((p) => p.image && p.link);
    cache = { at: Date.now(), items };
  } catch (err) {
    console.error('Instagram akışı alınamadı:', err.message);
    cache.at = Date.now() - TTL + 5 * 60 * 1000; // 5 dakika sonra tekrar dene
  }
  return cache.items.slice(0, limit);
}

function start() {
  setTimeout(() => refreshIfNeeded().catch(() => {}), 60 * 1000).unref();
  setInterval(() => refreshIfNeeded().catch(() => {}), DAY).unref();
}

module.exports = { getInstagramPosts, status, appReady, authorizeUrl, newState, finishConnect, disconnect, refreshIfNeeded, listMedia, fetchPhoto, redirectUri, start };
