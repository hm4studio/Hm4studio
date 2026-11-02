'use strict';
// İsteğe bağlı Instagram akışı.
// Instagram, gönderilerin bir siteye otomatik çekilmesine yalnızca resmî Instagram API'si ile izin verir:
// Profesyonel (İşletme/İçerik Üreticisi) hesap + Meta geliştirici uygulaması + erişim anahtarı gerekir.
// .env içinde INSTAGRAM_ACCESS_TOKEN tanımlı değilse bu modül hiçbir şey yapmaz.
const config = require('./config');

let cache = { at: 0, items: [] };
const TTL = 60 * 60 * 1000; // 1 saat

async function getInstagramPosts(limit = 12) {
  if (!config.instagramToken) return [];
  if (Date.now() - cache.at < TTL) return cache.items.slice(0, limit);
  try {
    const url = new URL('https://graph.instagram.com/me/media');
    url.searchParams.set('fields', 'id,caption,media_type,media_url,thumbnail_url,permalink');
    url.searchParams.set('limit', '24');
    url.searchParams.set('access_token', config.instagramToken);
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Instagram API ${res.status}`);
    const data = await res.json();
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

module.exports = { getInstagramPosts };
