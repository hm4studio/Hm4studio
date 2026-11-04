/* HM4 Studio — uygulama (PWA) servis çalışanı.
   - Tasarım dosyaları (CSS, JS, ikonlar) ve herkese açık portfolyo görselleri telefonda önbelleğe alınır;
     uygulama hızlı açılır.
   - Sayfalar her zaman sunucudan istenir; internet yoksa sade bir "çevrimdışı" sayfası gösterilir.
   - Çiftlerin özel fotoğrafları (/m/...) ve panel sayfaları ASLA önbelleğe alınmaz:
     paylaşılan bir cihazda başkası göremesin. */
const VERSION = 'hm4-v17';
const STATIC_CACHE = `${VERSION}-static`;
const MEDIA_CACHE = `${VERSION}-media`;
const PRECACHE = [
  '/offline.html',
  '/css/style.css?v=17',
  '/js/site.js?v=5',
  '/js/pwa.js?v=2',
  '/images/icon-192.png',
  '/images/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function staleWhileRevalidate(request, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request).then(async (res) => {
    if (res && res.ok && res.type === 'basic') {
      await cache.put(request, res.clone());
      if (limit) {
        const keys = await cache.keys();
        for (const k of keys.slice(0, Math.max(0, keys.length - limit))) await cache.delete(k);
      }
    }
    return res;
  }).catch(() => cached);
  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Özel fotoğraflar ve indirmeler: hiç dokunma
  if (url.pathname.startsWith('/m/')) return;

  // Sayfalar: önce ağ, bağlantı yoksa çevrimdışı sayfası (sayfa içeriği saklanmaz)
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
    return;
  }

  if (/^\/(css|js|images)\//.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
    return;
  }
  if (url.pathname.startsWith('/media/portfolio/')) {
    event.respondWith(staleWhileRevalidate(req, MEDIA_CACHE, 120));
  }
});
