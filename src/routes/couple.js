'use strict';
// Çift paneli ve gizli fotoğraf dosyalarının yetkili servis edilmesi.
const path = require('node:path');
const fs = require('node:fs');
const db = require('../db');
const media = require('../media');
const { getContent } = require('../content');
const { html, json, readJson, sendFile, HttpError } = require('../http');
const views = require('../views/panel');
const { requireCouple, checkCsrf, toId } = require('./guards');

function register(router) {
  router.get('/panel', (req, res, { query }) => {
    if (!requireCouple(req, res)) return;
    const couple = db.getCouple(req.session.userId);
    if (!couple) throw new HttpError(404, 'Bulunamadı');
    const all = db.listPhotos(couple.id);
    const favs = all.filter((p) => p.is_fav);
    const view = query.get('g') === 'fav' ? 'fav' : 'all';
    html(res, views.couplePanel(getContent(), {
      couple,
      photos: view === 'fav' ? favs : all,
      totalCount: all.length,
      favCount: favs.length,
      view,
      csrf: req.session.csrf,
    }));
  });

  // Favori ekle/çıkar — çift yalnızca kendi fotoğrafını işaretleyebilir
  router.post('/panel/favori', async (req, res) => {
    if (req.session?.kind !== 'couple') throw new HttpError(401, 'Oturum gerekli');
    checkCsrf(req);
    const { photoId, on } = await readJson(req);
    const photo = db.getPhoto(toId(photoId));
    if (!photo || photo.couple_id !== req.session.userId) throw new HttpError(404, 'Bulunamadı');
    db.setFavorite(photo.couple_id, photo.id, Boolean(on));
    json(res, { ok: true, on: Boolean(on), count: db.listFavoritePhotos(photo.couple_id).length });
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
