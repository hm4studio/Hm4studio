'use strict';
// Herkese açık sayfalar ve çift girişi.
const db = require('../db');
const config = require('../config');
const auth = require('../auth');
const media = require('../media');
const { getContent } = require('../content');
const { getInstagramPosts } = require('../instagram');
const { html, redirect, readForm } = require('../http');
const views = require('../views/public');
const panelViews = require('../views/panel');
const appViews = require('../views/app');
const { checkCsrf, slugify } = require('./guards');

function portfolioItems() {
  return db.listPortfolio().map((p) => ({
    ...p,
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

function register(router) {
  router.get('/', (req, res) => {
    const c = getContent();
    html(res, views.home(c, { portfolio: portfolioItems(), heroUrl: heroUrl(c) }));
  });

  router.get('/portfolyo', async (req, res) => {
    const c = getContent();
    html(res, views.portfolioPage(c, { portfolio: portfolioItems(), instagram: await getInstagramPosts(12) }));
  });

  // Sitenin renk ayarı (Ayarlar › Site)
  router.get('/css/tema.css', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(require('../theme').themeCss(getContent()));
  });

  router.get('/hakkimizda', (req, res) => html(res, views.aboutPage(getContent())));
  router.get('/iletisim', (req, res) => html(res, views.contactPage(getContent())));

  // ── Telefon uygulaması açılış ekranı: yalnızca çift / stüdyo girişi ──
  router.get('/uygulama', (req, res) => {
    if (req.session?.kind === 'couple') return redirect(res, '/panel');
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

module.exports = { register, portfolioItems, heroUrl };
