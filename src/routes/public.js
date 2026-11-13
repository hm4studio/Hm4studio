'use strict';
// Herkese açık sayfalar ve çift girişi.
const db = require('../db');
const config = require('../config');
const auth = require('../auth');
const media = require('../media');
const { getContent } = require('../content');
const { getInstagramPosts } = require('../instagram');
const { html, redirect, readForm, HttpError } = require('../http');
const views = require('../views/public');
const panelViews = require('../views/panel');
const appViews = require('../views/app');
const { checkCsrf, slugify } = require('./guards');

const parseTags = (p) => { try { const t = JSON.parse(p.tags || '[]'); return Array.isArray(t) ? t : []; } catch { return p.category ? [p.category] : []; } };
function portfolioItems() {
  return db.listPortfolio().map((p) => ({
    ...p,
    tags: parseTags(p),
    thumb: media.portfolioUrl(p.file_key, 'thumb'),
    display: media.portfolioUrl(p.file_key, 'display'),
  }));
}

function heroUrl(c) {
  const id = Number(db.getSetting('hero_portfolio_id'));
  const item = id ? db.getPortfolioItem(id) : null;
  if (item) return media.portfolioUrl(item.file_key, 'display');
  return c.hero.image || null;
}

// Eski Wix sitesinin adresleri (Google'da kayıtlı) → yeni karşılıkları
const OLD_PATHS = {
  'biz-kimiz': '/hakkimizda',
  'bize-ulaşın': '/iletisim', 'bize-ulasin': '/iletisim',
  albums: '/portfolyo', album: '/portfolyo',
};

function register(router) {
  router.get('/', (req, res) => {
    const c = getContent();
    html(res, views.home(c, { portfolio: portfolioItems(), heroUrl: heroUrl(c) }));
  });

  // Şehir sayfaları (/ankara-dugun-fotografcisi …). Adresler content/site.json › cities'ten; metinler panelden düzenlenir.
  const { baseContent } = require('../content');
  for (const slug of (baseContent().cities || []).map((x) => x.slug)) {
    router.get(`/${slug}`, (req, res) => {
      const c = getContent();
      const city = (c.cities || []).find((x) => x.slug === slug);
      if (!city) throw new HttpError(404, 'Sayfa bulunamadı');
      html(res, views.cityPage(c, { city, portfolio: portfolioItems(), heroUrl: heroUrl(c) }));
    });
  }

  // Eski Wix sitesinin adresleri → yeni sayfalar (kalıcı yönlendirme; Google sıralamayı yeni sayfaya aktarır)
  for (const [from, to] of Object.entries(OLD_PATHS)) {
    for (const path of new Set([`/${from}`, `/${encodeURIComponent(from)}`])) {
      router.get(path, (req, res) => { res.writeHead(301, { Location: to, 'Cache-Control': 'public, max-age=86400' }); res.end(); });
    }
  }

  // Hediye kuponu sayfası (tavsiye eden çiftin paylaştığı bağlantı)
  router.get('/hediye/:code', (req, res, { params }) => {
    const gifts = require('../gifts');
    html(res, views.giftPage(getContent(), { result: gifts.check(params.code), settings: gifts.settings(), portfolio: portfolioItems() }));
  });

  // Google için site haritası ve robots.txt
  router.get('/sitemap.xml', (req, res) => {
    const c = getContent();
    const usedTags = new Set(portfolioItems().flatMap((p) => p.tags));
    const tagPaths = (c.portfolio.categories || []).filter((t) => usedTags.has(t)).map((t) => `/portfolyo/${slugify(t)}`);
    const paths = ['/', '/portfolyo', ...tagPaths, '/hakkimizda', '/iletisim', ...(c.cities || []).map((x) => `/${x.slug}`), '/kvkk'];
    const today = new Date().toISOString().slice(0, 10);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((p) => `  <url><loc>${config.siteUrl}${p}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`;
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
    res.end(xml);
  });
  router.get('/robots.txt', (req, res) => {
    const body = config.indexable
      ? `User-agent: *\nDisallow: /admin\nDisallow: /panel\nDisallow: /m/\nDisallow: /g/\nDisallow: /api/\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`
      : 'User-agent: *\nDisallow: /admin\nDisallow: /panel\nDisallow: /m/\n';
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
    res.end(body);
  });

  router.get('/portfolyo', async (req, res) => {
    const c = getContent();
    html(res, views.portfolioPage(c, { portfolio: portfolioItems(), instagram: await getInstagramPosts(12) }));
  });
  // Etiket sayfası: /portfolyo/sinop → yalnızca o etiketin fotoğrafları (çiftlere gönderilecek bağlantı)
  router.get('/portfolyo/:etiket', async (req, res, { params }) => {
    const c = getContent();
    const tag = (c.portfolio.categories || []).find((t) => slugify(t) === params.etiket);
    if (!tag) return redirect(res, '/portfolyo');
    html(res, views.portfolioPage(c, { portfolio: portfolioItems(), instagram: await getInstagramPosts(12), active: tag }));
  });

  // Sitenin renk ayarı (Ayarlar › Site)
  router.get('/css/tema.css', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(require('../theme').themeCss(getContent()));
  });

  router.get('/hakkimizda', (req, res) => html(res, views.aboutPage(getContent())));
  router.get('/kvkk', (req, res) => html(res, views.kvkkPage(getContent())));
  router.get('/iletisim', (req, res) => html(res, views.contactPage(getContent())));

  // ── Telefon uygulaması açılış ekranı: yalnızca çift / stüdyo girişi ──
  router.get('/uygulama', (req, res) => {
    if (req.session?.kind === 'couple') { try { db.markAppOpen(req.session.userId); } catch { /* önemli değil */ } return redirect(res, '/panel'); }
    if (req.session?.kind === 'admin') return redirect(res, '/admin');
    const c = getContent();
    res.setHeader('Set-Cookie', `hm4_app=1; Path=/; Max-Age=31536000; SameSite=Lax${config.isProd ? '; Secure' : ''}`);
    html(res, appViews.appLogin(c, { heroUrl: heroUrl(c) }));
  });

  // ── Giriş: çiftler erişim koduyla, stüdyo yöneticisi kendi kullanıcı adıyla aynı formdan girer ──
  router.get('/giris', (req, res) => {
    if (req.session?.kind === 'couple') return redirect(res, '/panel');
    if (auth.isApp(req)) return redirect(res, '/uygulama');
    html(res, panelViews.coupleLogin(getContent()));
  });

  router.post('/giris', async (req, res) => {
    const c = getContent();
    const form = await readForm(req);
    const typed = String(form.code || '').trim().slice(0, 60);
    const code = slugify(typed);
    const view = (opts) => (form.app === '1'
      ? appViews.appLogin(c, { heroUrl: heroUrl(c), ...opts })
      : panelViews.coupleLogin(c, opts));
    if (auth.isRateLimited(req)) {
      return html(res, view({ error: 'Çok fazla hatalı deneme. Lütfen 15 dakika sonra tekrar deneyin.', values: { code } }), 429);
    }
    // Yönetici mi? (kullanıcı adı çift kodlarıyla çakışamaz)
    const admin = typed ? db.findAdminLogin(typed) : null;
    if (admin) {
      if (!auth.verifyPassword(form.password || '', admin.password_hash)) {
        auth.recordFailure(req);
        return html(res, view({ error: 'Erişim kodu veya şifre hatalı.', values: { code: typed } }), 401);
      }
      auth.clearFailures(req);
      auth.startSession(res, 'admin', admin.id);
      return redirect(res, '/admin');
    }
    const couple = code ? db.getCoupleByCode(code) : null;
    const ok = auth.verifyPassword(auth.normalizeCouplePassword(form.password), couple ? couple.password_hash : auth.DUMMY_HASH);
    if (!couple || !ok) {
      auth.recordFailure(req);
      return html(res, view({ error: 'Erişim kodu veya şifre hatalı.', values: { code: typed } }), 401);
    }
    auth.clearFailures(req);
    auth.startSession(res, 'couple', couple.id);
    redirect(res, '/panel');
  });

  // Tek dokunuşla giriş (stüdyonun WhatsApp'tan gönderdiği bağlantı)
  router.get('/g/:token', (req, res, { params }) => {
    if (auth.isRateLimited(req)) return redirect(res, '/giris');
    const couple = auth.checkLoginToken(params.token);
    if (!couple) {
      auth.recordFailure(req);
      return html(res, panelViews.coupleLogin(getContent(), { error: 'Bu giriş bağlantısı artık geçerli değil. Erişim kodu ve şifrenizle girin ya da bizden yeni bağlantı isteyin.' }), 410);
    }
    auth.clearFailures(req);
    auth.startSession(res, 'couple', couple.id);
    redirect(res, '/panel');
  });

  // ── Çıkış (çift ve admin ortak) ──
  router.post('/cikis', async (req, res) => {
    const form = await readForm(req);
    if (req.session) checkCsrf(req, form.csrf);
    const wasAdmin = req.session?.kind === 'admin';
    auth.endSession(req, res);
    if (auth.isApp(req)) return redirect(res, '/uygulama');
    redirect(res, wasAdmin ? '/admin/giris' : '/');
  });
}

module.exports = {
  parseTags, register, portfolioItems, heroUrl };
