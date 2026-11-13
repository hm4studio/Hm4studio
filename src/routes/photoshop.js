'use strict';
// Photoshop bağlantısı: albüm panelinden iş gönderme, eklenti API'si, sürümler ve eklenti kurulum sayfası.
const fs = require('node:fs');
const path = require('node:path');
const db = require('../db');
const demo = require('../demo');
const media = require('../media');
const ps = require('../photoshop');
const config = require('../config');
const { getContent } = require('../content');
const { html, json, readJson, readBody, readForm, redirect, sendFile, HttpError } = require('../http');
const { requireAdmin, checkCsrf, setFlash, takeFlash, toId } = require('./guards');
const views = require('../views/photoshop');

const PLUGIN_DIR = path.join(__dirname, '..', '..', 'photoshop-plugin');

function register(router) {
  const adminApi = (req) => { if (req.session?.kind !== 'admin') throw new HttpError(401, 'Oturum gerekli'); };
  const pluginApi = (req) => { if (!ps.checkToken(req)) throw new HttpError(401, 'Eklenti anahtarı geçersiz. Panelden yeni bağlantı kodu oluşturun.'); };
  const coupleOr404 = (id) => { const c = db.getCouple(toId(id)); if (!c) throw new HttpError(404, 'Çift bulunamadı'); return c; };

  // ── Albüm panelinden ──
  router.post('/admin/ciftler/:id/ps-gonder', async (req, res, { params }) => {
    adminApi(req); checkCsrf(req);
    const couple = coupleOr404(params.id);
    const body = await readJson(req);
    const photo = db.getPhoto(toId(body.photoId)), file = db.getPhoto(toId(body.fileId));
    if (!photo || !file || photo.couple_id !== couple.id || file.couple_id !== couple.id) throw new HttpError(404, 'Fotoğraf bulunamadı');
    const job = ps.createJob(couple.id, photo.id, file.id);
    json(res, { ok: true, id: job.id, reused: job.reused, status: job.status, connected: ps.tokenInfo().has });
  });
  router.get('/admin/ciftler/:id/ps-durum', (req, res, { params }) => {
    adminApi(req);
    const couple = coupleOr404(params.id);
    json(res, { jobs: ps.coupleJobs(couple.id) });
  });
  router.get('/admin/foto/:fid/surumler', (req, res, { params }) => {
    adminApi(req);
    const p = db.getPhoto(toId(params.fid));
    if (!p) throw new HttpError(404, 'Bulunamadı');
    json(res, { versions: ps.versions(p.id), kind: p.kind });
  });
  router.post('/admin/foto/surum/:vid/geri', (req, res, { params }) => {
    adminApi(req); checkCsrf(req);
    const v = ps.getVersion(toId(params.vid));
    if (!v) throw new HttpError(404, 'Sürüm bulunamadı');
    json(res, { ok: true, ...ps.restore(v) });
  });

  // ── Kurulum sayfası ──
  router.get('/admin/photoshop', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const flash = takeFlash(req);
    html(res, views.setupPage(getContent(), { info: ps.tokenInfo(), token: (flash && flash.psToken) || '', csrf: req.session.csrf, flash, demoAdmin: demo.isDemoAdmin(req), site: config.siteUrl }));
  });
  router.post('/admin/photoshop/kod', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const form = await readForm(req);
    checkCsrf(req, form.csrf);
    if (form.iptal === '1') { ps.revokeToken(); setFlash(req, { message: 'Bağlantı kapatıldı. Eklenti artık bağlanamaz.', type: 'success' }); }
    else setFlash(req, { psToken: ps.createToken() });
    redirect(res, '/admin/photoshop');
  });
  // Eklenti paketi (.ccx = zip); site adresi pakete yazılır
  router.get('/admin/photoshop/hm4-album.ccx', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const files = ['manifest.json', 'index.html', 'index.js', 'icons/icon.png', 'icons/icon@2x.png', 'icons/plugin.png'];
    const tmp = path.join(config.privateDir, 'tmp-ps');
    fs.mkdirSync(tmp, { recursive: true });
    const cfgFile = path.join(tmp, 'config.json');
    fs.writeFileSync(cfgFile, JSON.stringify({ site: config.siteUrl }));
    const entries = files.filter((f) => fs.existsSync(path.join(PLUGIN_DIR, f))).map((f) => ({ name: f, file: path.join(PLUGIN_DIR, f) }));
    entries.push({ name: 'config.json', file: cfgFile });
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="hm4-album.ccx"', 'Cache-Control': 'no-store' });
    await require('../zip').streamZip(res, entries).catch(() => res.destroy());
  });

  // ── Eklenti API'si (Bearer anahtar) ──
  router.get('/api/ps/durum', (req, res) => { pluginApi(req); json(res, { ok: true, studio: getContent().brand?.name || 'HM4 Studio' }); });
  router.get('/api/ps/isler', (req, res) => {
    pluginApi(req);
    json(res, { jobs: ps.openJobs().map((j) => ({ id: j.id, status: j.status, couple: j.couple_name, name: j.original_name || `foto-${j.file_photo_id}.jpg` })) });
  });
  router.get('/api/ps/isler/:id/dosya', (req, res, { params }) => {
    pluginApi(req);
    const job = ps.getJob(toId(params.id));
    const f = job && ps.jobFile(job);
    if (!f) throw new HttpError(404, 'Dosya bulunamadı');
    sendFile(req, res, f.dir, f.file, { cache: 'no-store', download: f.name });
  });
  router.post('/api/ps/isler/:id/acildi', (req, res, { params }) => {
    pluginApi(req);
    const job = ps.getJob(toId(params.id));
    if (!job) throw new HttpError(404, 'İş bulunamadı');
    if (job.status === 'bekliyor') ps.setStatus(job.id, 'acik');
    json(res, { ok: true });
  });
  router.post('/api/ps/isler/:id/iptal', (req, res, { params }) => {
    pluginApi(req);
    const job = ps.getJob(toId(params.id));
    if (job && ['bekliyor', 'acik'].includes(job.status)) ps.setStatus(job.id, 'iptal');
    json(res, { ok: true });
  });
  router.post('/api/ps/isler/:id/yukle', async (req, res, { params }) => {
    pluginApi(req);
    const job = ps.getJob(toId(params.id));
    if (!job) throw new HttpError(404, 'İş bulunamadı');
    // İptal edilmiş olsa da kaydedilen hal kabul edilir (Photoshop'ta açık kalan belge kaydedilince kaybolmasın)
    media.markUploadActivity();
    const body = await readBody(req, config.maxUploadBytes);
    const parts = media.splitParts(req, body);
    const resultId = ps.applyUpload(job, parts);
    json(res, { ok: true, photoId: resultId });
  });
}

module.exports = { register };
