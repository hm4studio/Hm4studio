'use strict';
// Albüm tasarımcısı: çiftin albüm seçimi (varsa düzenlenmiş halleriyle) tarayıcıda yapraklara dizilir.
// Fotoğraflar sunucuda işlenmez; taslak (yerleşim, kadraj, ayarlar) çiftin kaydında JSON olarak saklanır.
const db = require('../db');
const demo = require('../demo');
const { getContent } = require('../content');
const { html, json, readJson, redirect, HttpError } = require('../http');
const { requireAdmin, checkCsrf, toId } = require('./guards');
const views = require('../views/designer');

// Dosya adından eşleştirme anahtarları: "DSC01234-Edit.jpg" → ["dsc01234edit", "01234"]
const baseKey = (name) => String(name || '').toLowerCase().replace(/\.[a-z0-9]{2,5}$/, '').replace(/[^a-z0-9]/g, '');
const serialKey = (name) => { const m = String(name || '').replace(/\.[a-z0-9]{2,5}$/i, '').match(/\d{3,}/g); return m ? m[m.length - 1] : ''; };

function photoList(couple, set = 'secim') {
  if (set === 'duzenli') {
    return db.listPhotos(couple.id, 'duzenli').map((e) => ({
      id: e.id, name: e.original_name || `foto-${e.id}`, w: e.w || 3, h: e.h || 2,
      thumb: `/m/${e.id}/thumb`, src: `/m/${e.id}/display`, full: e.original_ext ? `/m/${e.id}/original` : `/m/${e.id}/display`,
      edited: true, cover: false,
    }));
  }
  const favs = db.listFavoritePhotos(couple.id);
  const cover = couple.album_cover_id && !favs.some((p) => p.id === couple.album_cover_id) ? db.getPhoto(couple.album_cover_id) : null;
  const list = cover && cover.couple_id === couple.id ? [cover, ...favs] : favs;
  const edited = db.listPhotos(couple.id, 'duzenli');
  const byBase = new Map(), bySerial = new Map();
  for (const e of edited) {
    const b = baseKey(e.original_name), s = serialKey(e.original_name);
    if (b && !byBase.has(b)) byBase.set(b, e);
    if (s && !bySerial.has(s)) bySerial.set(s, e);
  }
  const findEdit = (p) => {
    const b = baseKey(p.original_name), s = serialKey(p.original_name);
    if (byBase.has(b)) return byBase.get(b);
    for (const [k, e] of byBase) if (b && (k.startsWith(b) || b.startsWith(k))) return e;
    return s ? bySerial.get(s) : null;
  };
  return list.map((p) => {
    const e = findEdit(p);
    const use = e || p;
    return {
      id: p.id,
      name: p.original_name || `foto-${p.id}`,
      w: use.w || p.w || 3, h: use.h || p.h || 2,
      thumb: `/m/${use.id}/thumb`,
      src: `/m/${use.id}/display`,
      full: use.original_ext ? `/m/${use.id}/original` : `/m/${use.id}/display`,
      edited: Boolean(e),
      cover: p.id === couple.album_cover_id,
    };
  });
}

function register(router) {
  const coupleOr404 = (id) => {
    const c = db.getCouple(toId(id));
    if (!c) throw new HttpError(404, 'Çift bulunamadı');
    return c;
  };

  // Albüm paneli: çift seçilir (düzenlenmiş fotoğrafı olanlar) ya da sıfırdan albüm
  router.get('/admin/album', (req, res, { query }) => {
    if (!requireAdmin(req, res)) return;
    const couples = db.listEditedCouples();
    const id = query.get('cift') ? toId(query.get('cift')) : 0;
    const sel = id ? db.getCouple(id) : null;
    html(res, views.designerPage(getContent(), { couples, selected: sel, csrf: req.session.csrf, demoAdmin: demo.isDemoAdmin(req) }));
  });
  router.get('/admin/ciftler/:id/tasarimci', (req, res, { params }) => {
    if (!requireAdmin(req, res)) return;
    redirect(res, `/admin/album?cift=${toId(params.id)}`);
  });

  router.get('/admin/ciftler/:id/tasarimci.json', (req, res, { params, query }) => {
    if (req.session?.kind !== 'admin') throw new HttpError(401, 'Oturum gerekli');
    const couple = coupleOr404(params.id);
    let draft = null;
    try { draft = couple.album_draft ? JSON.parse(couple.album_draft) : null; } catch { draft = null; }
    const order = db.getOrder(couple.id);
    const favCount = db.favoriteCount(couple.id);
    const editedCount = db.listPhotos(couple.id, 'duzenli').length;
    const want = query.get('set') || (draft && draft.set) || (favCount ? 'secim' : 'duzenli');
    const set = want === 'duzenli' && editedCount ? 'duzenli' : favCount ? 'secim' : 'duzenli';
    json(res, {
      set, favCount, editedCount,
      couple: { id: couple.id, name: couple.name, locked: Boolean(couple.album_locked), refNo: couple.ref_no || '' },
      photos: photoList(couple, set),
      draft,
      size: order ? String(order.boyut || '') : '',
      pagesHint: order ? String(order.sayfa || '') : '',
    });
  });

  router.post('/admin/ciftler/:id/tasarimci/taslak', async (req, res, { params }) => {
    if (req.session?.kind !== 'admin') throw new HttpError(401, 'Oturum gerekli');
    checkCsrf(req);
    const couple = coupleOr404(params.id);
    const body = await readJson(req);
    const draft = body && typeof body === 'object' ? body : null;
    const text = draft ? JSON.stringify(draft) : '';
    if (text.length > 200 * 1024) throw new HttpError(413, 'Taslak çok büyük.');
    db.setAlbumDraft(couple.id, text || null);
    json(res, { ok: true });
  });
}

module.exports = { register, photoList };
