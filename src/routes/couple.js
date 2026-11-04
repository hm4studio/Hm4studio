'use strict';
// Çift paneli ve gizli fotoğraf dosyalarının yetkili servis edilmesi.
const path = require('node:path');
const fs = require('node:fs');
const db = require('../db');
const media = require('../media');
const { getContent } = require('../content');
const { html, json, redirect, readForm, readJson, sendFile, HttpError } = require('../http');
const { PLAN_FIELDS, today } = require('../jobs');
const events = require('../events');
const views = require('../views/panel');
const adminViews = require('../views/admin');
const { requireCouple, checkCsrf, toId, setFlash, takeFlash } = require('./guards');

function register(router) {
  const me = (req) => { const c = db.getCouple(req.session.userId); if (!c) throw new HttpError(404, 'Bulunamadı'); return c; };

  // Durum sayfası
  router.get('/panel', (req, res) => {
    if (!requireCouple(req, res)) return;
    const couple = me(req);
    const c = getContent();
    html(res, views.couplePanel(c, {
      couple,
      card: c.couplePanel?.showPayments ? db.getCoupleCard(couple.id) : null,
      events: db.listEvents(couple.id),
      totalCount: db.listPhotos(couple.id).length,
      videoCount: db.videoCount(couple.id),
      csrf: req.session.csrf,
      flash: takeFlash(req),
    }));
  });

  // Fotoğraflar ve albüm seçimi
  router.get('/panel/fotograflar', (req, res, { query }) => {
    if (!requireCouple(req, res)) return;
    const couple = me(req);
    const all = db.listPhotos(couple.id);
    const favs = all.filter((p) => p.is_fav);
    const view = query.get('g') === 'fav' ? 'fav' : 'all';
    html(res, views.couplePhotos(getContent(), { couple, photos: view === 'fav' ? favs : all, totalCount: all.length, favCount: favs.length, view, csrf: req.session.csrf, flash: takeFlash(req) }));
  });

  // Videolar
  router.get('/panel/video', (req, res) => {
    if (!requireCouple(req, res)) return;
    const couple = me(req);
    html(res, views.coupleVideos(getContent(), { couple, videos: db.listVideos(couple.id), csrf: req.session.csrf, flash: takeFlash(req) }));
  });

  // Çekim günü planı
  router.get('/panel/plan', (req, res) => {
    if (!requireCouple(req, res)) return;
    html(res, views.couplePlan(getContent(), { couple: me(req), csrf: req.session.csrf, flash: takeFlash(req) }));
  });

  // Video dosyası (yalnızca yönetici veya o çift; bölüm isteği desteklenir)
  router.get('/v/:id', (req, res, { params, query }) => {
    const s = req.session;
    const v = db.getVideo(toId(params.id));
    const allowed = s && v && v.file_key && (s.kind === 'admin' || (s.kind === 'couple' && s.userId === v.couple_id));
    if (!allowed) throw new HttpError(404, 'Bulunamadı');
    const name = query.get('indir') ? `${(v.title || v.kind || 'video').replace(/[\\/:*?"<>|]+/g, '-')}.${v.ext}` : undefined;
    if (!sendFile(req, res, media.videoDir(v.couple_id), `${v.file_key}.${v.ext}`, { cache: 'private, max-age=3600', download: name })) throw new HttpError(404, 'Bulunamadı');
  });

  // Favori ekle/çıkar — çift yalnızca kendi fotoğrafını işaretleyebilir
  router.post('/panel/favori', async (req, res) => {
    if (req.session?.kind !== 'couple') throw new HttpError(401, 'Oturum gerekli');
    checkCsrf(req);
    const { photoId, on } = await readJson(req);
    const photo = db.getPhoto(toId(photoId));
    if (!photo || photo.couple_id !== req.session.userId) throw new HttpError(404, 'Bulunamadı');
    const couple = db.getCouple(photo.couple_id);
    if (couple.album_locked) throw new HttpError(409, 'Albüm seçiminiz tamamlandı. Değişiklik için bize yazın.');
    if (on && db.favoriteCount(couple.id) >= couple.album_limit) {
      const already = db.listFavoritePhotos(couple.id).some((p) => p.id === photo.id);
      if (!already) throw new HttpError(409, `Albüm sınırına ulaştınız (${couple.album_limit} kare). Eklemek için önce birini çıkarın.`);
    }
    db.setFavorite(photo.couple_id, photo.id, Boolean(on));
    json(res, { ok: true, on: Boolean(on), count: db.listFavoritePhotos(photo.couple_id).length });
  });

  // Albüm seçimini tamamla (kilitle)
  router.post('/panel/album-tamamla', async (req, res) => {
    if (!requireCouple(req, res)) return;
    const form = await readForm(req);
    checkCsrf(req, form.csrf);
    const couple = db.getCouple(req.session.userId);
    if (!couple) throw new HttpError(404, 'Bulunamadı');
    if (db.favoriteCount(couple.id) === 0) {
      setFlash(req, { message: 'Önce albüm için en az bir kare seçin.', type: 'error' });
    } else {
      db.setAlbumLocked(couple.id, true);
      events.albumLocked(couple);
      setFlash(req, { message: 'Teşekkürler! Albüm seçiminiz HM4 Studio’ya iletildi.', type: 'success' });
    }
    redirect(res, '/panel/fotograflar');
  });

  // Çekim günü planını kaydet
  router.post('/panel/plan', async (req, res) => {
    if (!requireCouple(req, res)) return;
    const form = await readForm(req);
    checkCsrf(req, form.csrf);
    const plan = { saved: today() };
    for (const f of PLAN_FIELDS) plan[f.key] = String(form[f.key] || '').replace(/\r\n/g, '\n').trim().slice(0, f.max);
    db.setPlan(req.session.userId, plan);
    events.planSaved({ id: req.session.userId });
    setFlash(req, { message: 'Planınız kaydedildi. HM4 Studio ekibi görebilir.', type: 'success' });
    redirect(res, '/panel/plan');
  });

  // Tüm fotoğrafları (veya albüm seçimini) tek ZIP olarak indir
  router.get('/panel/indir', async (req, res, { query }) => {
    if (!requireCouple(req, res)) return;
    const couple = db.getCouple(req.session.userId);
    if (!couple) throw new HttpError(404, 'Bulunamadı');
    const onlyFav = query.get('g') === 'fav';
    const photos = onlyFav ? db.listFavoritePhotos(couple.id) : db.listPhotos(couple.id);
    const entries = require('../media').couplePhotoEntries(couple.id, photos);
    if (!entries.length) throw new HttpError(404, 'İndirilecek fotoğraf yok');
    const name = `${couple.name}${onlyFav ? ' - Albüm seçimi' : ' - Fotoğraflar'}.zip`.replace(/[\\/:*?"<>|]+/g, '-');
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="fotograflar.zip"; filename*=UTF-8''${encodeURIComponent(name)}`, 'Cache-Control': 'no-store' });
    await require('../zip').streamZip(res, entries).catch(() => res.destroy());
  });

  // Randevu belgesi (çift kendi bilgilerini görür, yazdırabilir)
  router.get('/panel/belge', (req, res) => {
    if (!requireCouple(req, res)) return;
    const couple = db.getCouple(req.session.userId);
    if (!couple) throw new HttpError(404, 'Bulunamadı');
    html(res, adminViews.appointmentDoc(getContent(), { card: db.getCoupleCard(couple.id), events: db.listEvents(couple.id), payments: db.listPayments(couple.id), back: '/panel', forCouple: true }));
  });

  // Gizli fotoğraf dosyaları: yalnızca admin veya fotoğrafın sahibi çift erişebilir
  router.get('/m/:id/:variant', (req, res, { params, query }) => {
    const s = req.session;
    const photo = db.getPhoto(toId(params.id));
    const allowed = s && photo && (s.kind === 'admin' || (s.kind === 'couple' && s.userId === photo.couple_id));
    if (!allowed) throw new HttpError(404, 'Bulunamadı');

    const dir = media.coupleDir(photo.couple_id, photo.file_key);
    let file;
    if (params.variant === 'thumb') file = 'thumb.jpg';
    else if (params.variant === 'display') file = 'display.jpg';
    else if (params.variant === 'original' && photo.original_ext) file = `original.${photo.original_ext}`;
    else throw new HttpError(404, 'Bulunamadı');
    if (!fs.existsSync(path.join(dir, file))) throw new HttpError(404, 'Bulunamadı');

    let download;
    if (query.get('indir')) {
      const base = (photo.original_name || `foto-${photo.id}`).replace(/\.[^.]+$/, '');
      download = `${base}${path.extname(file)}`;
    }
    sendFile(req, res, dir, file, { cache: 'private, max-age=3600', download });
  });
}

module.exports = { register };
