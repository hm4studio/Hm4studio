'use strict';
// Herkese açık sayfalar ve çift girişi.
const db = require('../db');
const auth = require('../auth');
const media = require('../media');
const { getContent } = require('../content');
const { getInstagramPosts } = require('../instagram');
const { html, redirect, readForm } = require('../http');
const views = require('../views/public');
const panelViews = require('../views/panel');
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

  router.get('/hakkimizda', (req, res) => html(res, views.aboutPage(getContent())));
  router.get('/iletisim', (req, res) => html(res, views.contactPage(getContent())));

  // ── Çift girişi ──
  router.get('/giris', (req, res) => {
    if (req.session?.kind === 'couple') return redirect(res, '/panel');
    html(res, panelViews.coupleLogin(getContent()));
  });

  router.post('/giris', async (req, res) => {
    const c = getContent();
    const form = await readForm(req);
    const code = slugify(form.code || '');
    if (auth.isRateLimited(req)) {
      return html(res, panelViews.coupleLogin(c, { error: 'Çok fazla hatalı deneme. Lütfen 15 dakika sonra tekrar deneyin.', values: { code } }), 429);
    }
    const couple = code ? db.getCoupleByCode(code) : null;
    const ok = auth.verifyPassword(form.password || '', couple ? couple.password_hash : auth.DUMMY_HASH);
    if (!couple || !ok) {
      auth.recordFailure(req);
      return html(res, panelViews.coupleLogin(c, { error: 'Erişim kodu veya şifre hatalı.', values: { code } }), 401);
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
    redirect(res, wasAdmin ? '/admin/giris' : '/');
  });
}

module.exports = { register, portfolioItems };
