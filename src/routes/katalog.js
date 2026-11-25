'use strict';
// Admin › Albüm kataloğu
const katalog = require('../katalog');
const demo = require('../demo');
const { getContent } = require('../content');
const { html, redirect, readForm, HttpError } = require('../http');
const { requireAdmin, checkCsrf, setFlash, takeFlash } = require('./guards');
const views = require('../views/katalog');

function register(router) {
  router.get('/admin/albumler', (req, res, { query }) => {
    if (!requireAdmin(req, res)) return;
    const m = query.get('malzeme') || '';
    const durum = query.get('durum') || '';
    html(res, views.listPage(getContent(), { items: katalog.list(), malzeme: katalog.MALZEMELER.includes(m) ? m : '', durum: ['aktif', 'pasif'].includes(durum) ? durum : '', malzemeler: katalog.MALZEMELER, csrf: req.session.csrf, flash: takeFlash(req), demoAdmin: demo.isDemoAdmin(req) }));
  });
  router.get('/admin/albumler/:no', (req, res, { params }) => {
    if (!requireAdmin(req, res)) return;
    const item = katalog.get(params.no);
    if (!item) throw new HttpError(404, 'Model bulunamadı');
    html(res, views.editPage(getContent(), { item, csrf: req.session.csrf, flash: takeFlash(req), demoAdmin: demo.isDemoAdmin(req) }));
  });
  router.post('/admin/albumler/:no', async (req, res, { params }) => {
    if (!requireAdmin(req, res)) return;
    const form = await readForm(req);
    checkCsrf(req, form.csrf);
    if (form.hizli === '1') {
      katalog.setActive(params.no, form.aktif === '1');
      return redirect(res, `/admin/albumler${form.geri ? `?${String(form.geri).replace(/[^a-zçğıöşü=&]/gi, '')}` : ''}#m${Number(params.no)}`);
    }
    if (!katalog.save(params.no, { aktif: form.aktif === '1', fark: form.fark, not: form.not, renkler: form.renk || [], ebatlar: form.ebat || [] })) throw new HttpError(404, 'Model bulunamadı');
    setFlash(req, { message: 'Kaydedildi.', type: 'success' });
    redirect(res, `/admin/albumler/${Number(params.no)}`);
  });
}
module.exports = { register };
