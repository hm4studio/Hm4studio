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
const contract = require('../contract');
const contractViews = require('../views/contract');
const { clientIp } = require('../http');

function register(router) {
  const me = (req) => {
    const c = db.getCouple(req.session.userId);
    if (!c) throw new HttpError(404, 'Bulunamadı');
    const k = db.activeContract(c.id);
    const evs = db.listEvents(c.id);
    const dates = evs.map((e) => e.event_date).filter(Boolean);
    return {
      ...c,
      contract_state: k ? (k.signed_at ? 'imzali' : 'bekliyor') : '',
      // Menüde yalnızca işe yarayan sayfalar: plan çekimler bitene kadar, video yalnızca video işi varsa
      show_plan: !dates.length || dates.some((d) => d >= today()),
      show_video: Boolean(c.video_status) || db.videoCount(c.id) > 0 || evs.some((e) => /video|klip|film|reels/i.test(`${e.package || ''} ${e.package_detail || ''}`)),
    };
  };

  // Yapay zekâ asistanı (sağ alttaki balon)
  router.post('/panel/asistan', async (req, res) => {
    if (req.session?.kind !== 'couple') throw new HttpError(401, 'Oturum gerekli');
    checkCsrf(req);
    const assistant = require('../assistant');
    if (!assistant.enabled()) throw new HttpError(404, 'Asistan kapalı');
    const body = await readJson(req);
    const msgs = (Array.isArray(body.messages) ? body.messages : []).slice(-12)
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: m.content.trim().slice(0, m.role === 'user' ? 800 : 1500) }))
      .filter((m) => m.content);
    if (!msgs.length || msgs[msgs.length - 1].role !== 'user') throw new HttpError(400, 'Soru boş');
    const couple = me(req);
    if (assistant.overLimit(couple.id)) return json(res, { reply: 'Bugün çok fazla soru sordunuz. Acil bir durum varsa bize WhatsApp’tan yazın.' });
    try {
      json(res, { reply: await assistant.answer(couple, msgs) || 'Bunu yanıtlayamadım, bize WhatsApp’tan yazabilirsiniz.' });
    } catch (err) {
      json(res, { reply: err.message === 'yogun' ? 'Şu an çok yoğunum, birkaç dakika sonra tekrar dener misiniz?' : 'Şu an yanıt veremiyorum. Sorunuzu bize WhatsApp’tan iletebilirsiniz.', error: true });
    }
  });

  // WhatsApp bildirim izni (KVKK açık rıza; her değişiklik tarihiyle kaydedilir)
  router.post('/panel/whatsapp', async (req, res) => {
    if (!requireCouple(req, res)) return;
    const form = await readForm(req);
    checkCsrf(req, form.csrf);
    const couple = me(req);
    db.setCoupleWaConsent(couple.id, form.waConsent === '1');
    setFlash(req, { message: form.waConsent === '1' ? 'WhatsApp bildirimleri açıldı.' : 'WhatsApp bildirimleri kapatıldı.', type: 'success' });
    redirect(res, '/panel#izinler');
  });

  // ── Sözleşme: oku, bilgileri yaz, imzala ──
  const myContract = (couple) => {
    const k = db.activeContract(couple.id);
    if (!k) throw new HttpError(404, 'Henüz gönderilmiş bir sözleşme yok.');
    return { k, data: JSON.parse(k.snapshot) };
  };
  router.get('/panel/sozlesme', (req, res) => {
    if (!requireCouple(req, res)) return;
    const couple = me(req);
    // Sözleşme henüz gönderilmediyse "bulunamadı" yerine bilgi verip Durum sayfasına dön
    if (!db.activeContract(couple.id)) {
      setFlash(req, { message: 'Sözleşmeniz hazırlanıyor. Hazır olduğunda size haber vereceğiz ve buradan onaylayabileceksiniz.', type: 'info' });
      return redirect(res, '/panel');
    }
    const { k, data } = myContract(couple);
    html(res, contractViews.signPage(getContent(), { coupleShell: views.coupleShell, couple, k, data, csrf: req.session.csrf, flash: takeFlash(req) }));
  });
  router.get('/panel/sozlesme/belge', (req, res) => {
    if (!requireCouple(req, res)) return;
    if (!db.activeContract(me(req).id)) {
      setFlash(req, { message: 'Sözleşmeniz hazırlanıyor. Hazır olduğunda size haber vereceğiz.', type: 'info' });
      return redirect(res, '/panel');
    }
    const { k, data } = myContract(me(req));
    html(res, contractViews.contractDoc(getContent(), { k, data, back: '/panel/sozlesme' }));
  });
  router.post('/panel/sozlesme', async (req, res) => {
    if (!requireCouple(req, res)) return;
    const form = await readForm(req);
    checkCsrf(req, form.csrf);
    const couple = me(req);
    const { k, data } = myContract(couple);
    if (k.signed_at) return redirect(res, '/panel/sozlesme');
    const clean = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
    const values = { waConsent: form.waConsent === '1' ? '1' : '', ad: clean(form.ad, 80), tc: String(form.tc || '').replace(/\D/g, ''), adres: clean(form.adres, 200), izin: form.izin === 'evet' ? 'evet' : form.izin === 'hayir' ? 'hayir' : '' };
    const imza = String(form.imza || '');
    const errors = [];
    if (values.ad.length < 3) errors.push('Ad soyadınızı yazın.');
    if (!contract.validTc(values.tc)) errors.push('T.C. kimlik numarası geçersiz.');
    if (values.adres.length < 5) errors.push('Adresinizi yazın.');
    if (!values.izin) errors.push('Paylaşım izni için bir seçim yapın.');
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(imza) || imza.length < 1500 || imza.length > 600000) errors.push('Lütfen imzanızı çizin.');
    if (form.kabul !== '1') errors.push('Sözleşmeyi okuyup kabul ettiğinizi işaretleyin.');
    if (errors.length) {
      return html(res, contractViews.signPage(getContent(), { coupleShell: views.coupleShell, couple, k, data, csrf: req.session.csrf, flash: { message: errors.join(' '), type: 'error' }, values }), 422);
    }
    const signedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const signer = { ...values, imza, tarih: contractViews.trTime(signedAt).split(' ')[0] };
    const changed = db.signContract(k.id, { ...signer, signedAt, ip: clientIp(req), ua: String(req.headers['user-agent'] || '').slice(0, 300), hash: contract.fingerprint(data, signer) });
    if (changed) { db.setCoupleWaConsent(couple.id, values.waConsent === '1'); events.contractSigned(couple, values.ad); }
    setFlash(req, { message: changed ? 'Teşekkürler, sözleşmeniz onaylandı. Kaydınız kesinleşti; onaylı sözleşmeniz aşağıda ve her zaman bu sayfada.' : 'Sözleşme bu arada güncellendi, lütfen yeniden bakın.', type: changed ? 'success' : 'error' });
    redirect(res, '/panel/sozlesme');
  });

  // Durum sayfası
  router.get('/panel', (req, res) => {
    if (!requireCouple(req, res)) return;
    const couple = me(req);
    const c = getContent();
    const sel = db.listPhotos(couple.id, 'secim');
    const edited = db.listPhotos(couple.id, 'duzenli');
    // Kapak ve fotoğraf şeridi: stüdyonun seçtiği kapak, yoksa yatay bir kare
    const pool = edited.length ? edited : sel;
    const cover = [...edited, ...sel].find((p) => p.id === couple.cover_photo_id) || pool.find((p) => p.w && p.h && p.w > p.h * 1.15) || pool[0] || null;
    html(res, views.couplePanel(c, {
      couple,
      cover,
      strip: pool.filter((p) => !cover || p.id !== cover.id).slice(0, 4).map((p) => p.id),
      card: c.couplePanel?.showPayments ? db.getCoupleCard(couple.id) : null,
      events: db.listEvents(couple.id),
      totalCount: sel.length,
      favCount: sel.filter((p) => p.is_fav).length,
      deliveries: db.listDeliveries(couple.id),
      gifts: (() => {
        // Hediye kuponları: program açıksa ve iş "Teslim" aşamasına geldiyse
        const gifts = require('../gifts');
        const gs = gifts.settings();
        if (!gs.active || couple.stage < (c.stages || []).length - 1) return null;
        const wa = require('../whatsapp');
        return { settings: gs, codes: gifts.ensureCodes(couple), today: today(), wa: (code) => `https://wa.me/?text=${encodeURIComponent(gifts.shareText(couple, code))}` };
      })(),
      editedCount: db.listPhotos(couple.id, 'duzenli').length,
      videoCount: db.videoCount(couple.id),
      reviewLink: (() => { const l = String(require('../content').getWhatsapp().yorumLinki || '').trim(); return /^https:\/\/\S+$/.test(l) ? l : ''; })(),
      csrf: req.session.csrf,
      flash: takeFlash(req),
    }));
  });

  // Fotoğraflar ve albüm seçimi
  router.get('/panel/fotograflar', (req, res, { query }) => {
    if (!requireCouple(req, res)) return;
    const couple = me(req);
    let all = db.listPhotos(couple.id, 'secim');
    if (all.some((p) => !p.gallery_id)) { db.defaultGallery(couple.id); all = db.listPhotos(couple.id, 'secim'); }
    const edited = db.listPhotos(couple.id, 'duzenli');
    const favs = all.filter((p) => p.is_fav);
    // Galeriler (boş olanlar çifte görünmez). Birden çoksa önce galeri kartları açılır.
    const galleries = db.listGalleries(couple.id).filter((x) => x.photo_count > 0).map((x) => {
      const own = all.filter((p) => p.gallery_id === x.id);
      const land = own.find((p) => p.id === couple.cover_photo_id) || own.find((p) => p.w && p.h && p.w > p.h * 1.15);
      return { ...x, cover_id: land ? land.id : null, fav_count: own.filter((p) => p.is_fav).length };
    });
    const gal = galleries.find((x) => x.id === Number(query.get('gal'))) || null;
    const g = query.get('g');
    // Düzenlenmiş fotoğraflar varsa sayfa onlarla açılır
    let view = gal ? 'all' : g === 'fav' ? 'fav' : g === 'secim' ? 'all' : g === 'duzenli' || (!g && edited.length) ? 'edited' : 'all';
    if (view === 'all' && !gal && galleries.length > 1) view = 'galleries';
    const acov = couple.album_cover_id ? all.find((p) => p.id === couple.album_cover_id) : null;
    const photos = view === 'edited' ? edited : view === 'fav' ? (acov && !acov.is_fav ? [acov, ...favs] : favs) : view === 'galleries' ? [] : gal ? all.filter((p) => p.gallery_id === gal.id) : all;
    // Kapak: sayfa ilk açıldığında (sekme seçilmemişken) tam ekran; mümkünse yatay bir kare
    let cover = null;
    if (!g && !gal) {
      const pool = (edited.length ? edited : all).slice(0, 24);
      const chosen = couple.cover_photo_id ? [...edited, ...all].find((p) => p.id === couple.cover_photo_id) : null;
      cover = chosen || pool.find((p) => p.w && p.h && p.w > p.h * 1.15) || pool[0] || null;
    }
    const events = db.listEvents(couple.id);
    html(res, views.couplePhotos(getContent(), { couple, photos, totalCount: all.length, editedCount: edited.length, favCount: favs.length, view, cover, events, galleries, gal, csrf: req.session.csrf, flash: takeFlash(req) }));
  });

  // Videolar
  router.get('/panel/video', (req, res) => {
    if (!requireCouple(req, res)) return;
    const couple = me(req);
    html(res, views.coupleVideos(getContent(), { couple, videos: db.listVideos(couple.id), csrf: req.session.csrf, flash: takeFlash(req) }));
  });

  // Teslim tutanağı (çift kendi kopyasını görür)
  router.get('/panel/teslim/:id', (req, res, { params }) => {
    if (!requireCouple(req, res)) return;
    const d = db.getDelivery(toId(params.id));
    if (!d || d.couple_id !== req.session.userId) throw new HttpError(404, 'Bulunamadı');
    html(res, require('../views/delivery').doc(getContent(), { d, back: '/panel' }));
  });

  // Albüm tasarımı (stüdyo gönderdiyse)
  router.get('/panel/album', (req, res) => {
    if (!requireCouple(req, res)) return;
    const couple = me(req);
    if (!couple.album_design_state) return redirect(res, '/panel');
    html(res, views.coupleAlbum(getContent(), { couple, pages: db.listAlbumPages(couple.id), csrf: req.session.csrf, flash: takeFlash(req) }));
  });
  router.post('/panel/album/sayfa/:id', async (req, res, { params }) => {
    if (!req.session || req.session.kind !== 'couple') throw new HttpError(401, 'Oturum gerekli');
    checkCsrf(req);
    const couple = db.getCouple(req.session.userId);
    const page = db.getAlbumPage(toId(params.id));
    if (!couple || !page || page.couple_id !== couple.id) throw new HttpError(404, 'Bulunamadı');
    if (couple.album_design_state !== 'hazir') throw new HttpError(409, 'Albüm şu an incelemeye açık değil.');
    const b = await readJson(req);
    const status = ['onay', 'degisiklik'].includes(b.status) ? b.status : 'bekliyor';
    const note = status === 'degisiklik' ? String(b.note || '').replace(/\s+/g, ' ').trim().slice(0, 500) : page.note;
    db.reviewAlbumPage(page.id, status, note);
    json(res, { ok: true, status });
  });
  router.post('/panel/album/gonder', async (req, res) => {
    if (!requireCouple(req, res)) return;
    const form = await readForm(req);
    checkCsrf(req, form.csrf);
    const couple = db.getCouple(req.session.userId);
    if (couple.album_design_state !== 'hazir') return redirect(res, '/panel/album');
    const pages = db.listAlbumPages(couple.id);
    const changes = pages.filter((p) => p.status === 'degisiklik').length;
    const pending = pages.filter((p) => p.status === 'bekliyor').length;
    if (form.karar === 'onay') {
      if (pending || changes) { setFlash(req, { message: 'Onaylamak için tüm sayfaları “Beğendim” olarak işaretleyin.', type: 'error' }); return redirect(res, '/panel/album'); }
      db.setAlbumDesign(couple.id, 'onaylandi');
      events.albumDesignReviewed(couple.id, true, 0);
      setFlash(req, { message: 'Albüm tasarımınızı onayladınız. Teşekkür ederiz!', type: 'success' });
    } else {
      if (pending || !changes) { setFlash(req, { message: 'Önce tüm sayfaları inceleyin; değişiklik istediğiniz sayfaya not yazın.', type: 'error' }); return redirect(res, '/panel/album'); }
      db.setAlbumDesign(couple.id, 'degisiklik');
      events.albumDesignReviewed(couple.id, false, changes);
      setFlash(req, { message: 'Değişiklik istekleriniz HM4 Studio’ya iletildi.', type: 'success' });
    }
    redirect(res, '/panel/album');
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
    if (!photo || photo.couple_id !== req.session.userId || photo.kind === 'duzenli') throw new HttpError(404, 'Bulunamadı');
    const couple = db.getCouple(photo.couple_id);
    if (couple.album_locked) throw new HttpError(409, 'Albüm seçiminiz tamamlandı. Değişiklik için bize yazın.');
    if (on && db.favoriteCount(couple.id) >= couple.album_limit) {
      const already = db.listFavoritePhotos(couple.id).some((p) => p.id === photo.id);
      if (!already) throw new HttpError(409, `Albüm sınırına ulaştınız (${couple.album_limit} kare). Eklemek için önce birini çıkarın.`);
    }
    db.setFavorite(photo.couple_id, photo.id, Boolean(on));
    json(res, { ok: true, on: Boolean(on), count: db.listFavoritePhotos(photo.couple_id).length });
  });

  // Albüm kapağı: seçim karelerinin dışında tek bir fotoğraf (aynısına tekrar dokunulursa kalkar)
  router.post('/panel/kapak', async (req, res) => {
    if (req.session?.kind !== 'couple') throw new HttpError(401, 'Oturum gerekli');
    checkCsrf(req);
    const { photoId } = await readJson(req);
    const photo = db.getPhoto(toId(photoId));
    if (!photo || photo.couple_id !== req.session.userId || photo.kind === 'duzenli') throw new HttpError(404, 'Bulunamadı');
    const couple = db.getCouple(photo.couple_id);
    if (couple.album_locked) throw new HttpError(409, 'Albüm seçiminiz tamamlandı. Değişiklik için bize yazın.');
    const on = couple.album_cover_id !== photo.id;
    db.setAlbumCover(couple.id, on ? photo.id : null);
    json(res, { ok: true, on, coverId: on ? photo.id : null, thumb: on ? `/m/${photo.id}/thumb` : '' });
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
    } else if (!couple.album_cover_id || !db.getPhoto(couple.album_cover_id)) {
      setFlash(req, { message: 'Albüm kapağınızı da seçin: kapak olmasını istediğiniz fotoğraftaki kitap simgesine dokunun.', type: 'error' });
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
    const g = query.get('g');
    const onlyFav = g === 'fav';
    const galx = db.getGallery(Number(query.get('gal')) || 0);
    const gal = galx && galx.couple_id === couple.id ? galx : null;
    const coverPh = onlyFav && couple.album_cover_id ? db.getPhoto(couple.album_cover_id) : null;
    const favs = onlyFav ? db.listFavoritePhotos(couple.id) : [];
    const photos = onlyFav ? (coverPh && coverPh.couple_id === couple.id && !favs.some((p) => p.id === coverPh.id) ? [coverPh, ...favs] : favs) : gal ? db.listPhotos(couple.id, 'secim').filter((p) => p.gallery_id === gal.id) : db.listPhotos(couple.id, g === 'duzenli' ? 'duzenli' : 'secim');
    const entries = require('../media').couplePhotoEntries(couple.id, photos, { coverId: onlyFav ? couple.album_cover_id : null });
    if (!entries.length) throw new HttpError(404, 'İndirilecek fotoğraf yok');
    const name = `${couple.name}${onlyFav ? ' - Albüm seçimi' : gal ? ` - ${gal.name}` : g === 'duzenli' ? ' - Düzenlenmiş fotoğraflar' : ' - Fotoğraflar'}.zip`.replace(/[\\/:*?"<>|]+/g, '-');
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

  // Albüm tasarım sayfaları: yalnızca admin veya sahibi çift
  router.get('/m/a/:id/:variant', (req, res, { params }) => {
    const s = req.session;
    const page = db.getAlbumPage(toId(params.id));
    if (!(s && page && (s.kind === 'admin' || (s.kind === 'couple' && s.userId === page.couple_id)))) throw new HttpError(404, 'Bulunamadı');
    const file = params.variant === 'thumb' ? 'thumb.jpg' : params.variant === 'display' ? 'display.jpg' : null;
    const dir = media.coupleDir(page.couple_id, page.file_key);
    if (!file || !fs.existsSync(path.join(dir, file))) throw new HttpError(404, 'Bulunamadı');
    sendFile(req, res, dir, file, { cache: 'private, max-age=86400' });
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
