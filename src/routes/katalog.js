'use strict';
// Albüm kataloğu: admin (model/renk/ebat yönetimi) ve çift (model seçimi) tarafı
const katalog = require('../katalog');
const db = require('../db');
const demo = require('../demo');
const activity = require('../activity');
const { getContent } = require('../content');
const { html, json, redirect, readForm, readBody, HttpError } = require('../http');
const { requireAdmin, requireCouple, checkCsrf, setFlash, takeFlash } = require('./guards');
const views = require('../views/katalog');
const ar = require('../ar');

const back = (no, hash = '') => `/admin/albumler/${Number(no)}${hash}`;
async function formGuard(req, res) {
  if (!requireAdmin(req, res)) return null;
  const form = await readForm(req);
  checkCsrf(req, form.csrf);
  return form;
}
async function imageBody(req) {
  const buf = await readBody(req, 6 * 1024 * 1024);
  let b;
  try { b = JSON.parse(buf.toString('utf8')); } catch { throw new HttpError(400, 'Geçersiz istek.'); }
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.image || ''));
  return { ...b, buf: m ? Buffer.from(m[1], 'base64') : null };
}

// Çiftin albüm seçimi (couples.album_choice JSON) — tasarım başlayınca ya da sipariş onaya gidince kilitlenir
const choiceOf = (c) => { try { return JSON.parse(c.album_choice || 'null'); } catch { return null; } };
function lockedFor(c) {
  if (c.album_design_state) return true;
  const o = db.getOrder(c.id);
  return Boolean(o && ['onay', 'onaylandi'].includes(o.state));
}
const dateTr = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(String(iso || '')) ? String(iso).slice(0, 10).split('-').reverse().join('.') : '');

function register(router) {
  // ───────── Admin ─────────
  router.get('/admin/albumler', (req, res, { query }) => {
    if (!requireAdmin(req, res)) return;
    const all = katalog.malzemeler();
    const m = query.get('malzeme') || '';
    const durum = query.get('durum') || '';
    html(res, views.listPage(getContent(), { items: katalog.list(), malzeme: all.includes(m) ? m : '', durum: ['aktif', 'pasif'].includes(durum) ? durum : '', malzemeler: all, csrf: req.session.csrf, flash: takeFlash(req), demoAdmin: demo.isDemoAdmin(req) }));
  });
  router.post('/admin/albumler', async (req, res) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const m = katalog.create(form.ad);
    setFlash(req, { message: 'Model eklendi. Fotoğrafını, renklerini ve ebatlarını ekleyin; hazır olunca aktif yapın.', type: 'success' });
    redirect(res, back(m.no));
  });
  router.get('/admin/albumler/:no', (req, res, { params }) => {
    if (!requireAdmin(req, res)) return;
    const item = katalog.get(params.no);
    if (!item) throw new HttpError(404, 'Model bulunamadı');
    html(res, views.editPage(getContent(), { item, known: katalog.knownColors(), csrf: req.session.csrf, flash: takeFlash(req), demoAdmin: demo.isDemoAdmin(req) }));
  });
  router.post('/admin/albumler/:no', async (req, res, { params }) => {
    const form = await formGuard(req, res);
    if (!form) return;
    const no = params.no;
    if (form.hizli === '1') {
      katalog.setActive(no, form.aktif === '1');
      return redirect(res, `/admin/albumler${form.geri ? `?${String(form.geri).replace(/[^a-zA-ZçğıöşüÇĞİÖŞÜ=&% ]/g, '')}` : ''}#m${Number(no)}`);
    }
    if (!katalog.get(no)) throw new HttpError(404, 'Model bulunamadı');
    const islem = form.islem || 'kaydet';
    if (islem === 'kaydet') {
      const m = katalog.save(no, { ad: form.ad, aktif: form.aktif === '1', fark: form.fark, not: form.not, renkler: form.renk || [], ebatlar: form.ebat || [] });
      const warn = m.aktif && (!m.foto || !m.renkler.some((r) => r.aktif) || !m.ebatlar.some((e) => e.aktif));
      setFlash(req, warn ? { message: 'Kaydedildi. Not: fotoğrafı, açık rengi ya da ebatı olmayan model çiftlere görünmez.', type: 'info' } : { message: 'Kaydedildi.', type: 'success' });
      return redirect(res, back(no));
    }
    if (islem === 'ebat-ekle') {
      const r = katalog.addSize(no, form.kod);
      setFlash(req, r.error ? { message: r.error, type: 'error' } : { message: 'Ebat eklendi.', type: 'success' });
      return redirect(res, back(no, '#ebatlar'));
    }
    if (islem === 'ebat-sil') { katalog.removeSize(no, form.kod); setFlash(req, { message: 'Ebat kaldırıldı.', type: 'success' }); return redirect(res, back(no, '#ebatlar')); }
    if (islem === 'renk-sil') { katalog.removeColor(no, form.renk_ad); setFlash(req, { message: 'Renk kaldırıldı.', type: 'success' }); return redirect(res, back(no, '#renkler')); }
    if (islem === 'renk-ekle') {
      const r = katalog.addColor(no, { ad: form.renk_ad });
      setFlash(req, r.error ? { message: r.error, type: 'error' } : { message: 'Renk eklendi.', type: 'success' });
      return redirect(res, back(no, '#renkler'));
    }
    if (islem === 'sil') { katalog.remove(no); setFlash(req, { message: 'Model katalogdan silindi.', type: 'success' }); return redirect(res, '/admin/albumler'); }
    throw new HttpError(400, 'Bilinmeyen işlem');
  });
  // Fotoğraf ve renk dokusu yükleme (tarayıcı küçültüp JPEG olarak gönderir)
  router.post('/admin/albumler/:no/gorsel', async (req, res, { params }) => {
    if (req.session?.kind !== 'admin') throw new HttpError(401, 'Oturum gerekli');
    checkCsrf(req);
    const b = await imageBody(req);
    if (!b.buf) throw new HttpError(400, 'Görsel okunamadı.');
    try {
      if (b.tur === 'foto') { if (!katalog.setPhoto(params.no, b.buf)) throw new HttpError(404, 'Model bulunamadı'); }
      else if (b.tur === 'renk') { const r = katalog.addColor(params.no, { ad: b.ad, hex: b.hex, buf: b.buf }); if (r.error) throw new HttpError(400, r.error); }
      else throw new HttpError(400, 'Bilinmeyen tür');
    } catch (err) { if (err instanceof HttpError) throw err; throw new HttpError(400, err.message); }
    setFlash(req, { message: b.tur === 'foto' ? 'Fotoğraf güncellendi.' : 'Renk eklendi.', type: 'success' });
    json(res, { ok: true });
  });

  // ───────── Çift ─────────
  router.get('/panel/albumum', (req, res, { query }) => {
    if (!requireCouple(req, res)) return;
    const couple = db.getCouple(req.session.userId);
    const items = katalog.forCouples();
    const mz = query.get('m') || '';
    html(res, views.coupleList(getContent(), { couple, items, malzeme: items.some((x) => x.malzeme.includes(mz)) ? mz : '', choice: choiceOf(couple), locked: lockedFor(couple), csrf: req.session.csrf, flash: takeFlash(req) }));
  });
  router.get('/panel/albumum/:no', (req, res, { params, query }) => {
    if (!requireCouple(req, res)) return;
    const couple = db.getCouple(req.session.userId);
    const item = katalog.forCouples().find((x) => x.no === Number(params.no));
    if (!item) return redirect(res, '/panel/albumum');
    const ch = choiceOf(couple);
    const pick = { renk: query.get('renk') || (ch && ch.no === item.no ? ch.renk : ''), boy: query.get('boy') || (ch && ch.no === item.no ? ch.kod : '') };
    const names = (ch && ch.isim) || String(couple.name || '').replace(/\s+(ve|&|-)\s+/i, ' & ');
    const date = ch ? ch.tarih : dateTr(couple.event_date);
    html(res, views.coupleDetail(getContent(), { couple, item, pick, names, date, locked: lockedFor(couple), csrf: req.session.csrf, flash: takeFlash(req) }));
  });
  // "Masamda gör": seçilen renk + boy + kapak yazısıyla 3D dosya (kapak yazısı PNG'sini tarayıcı çizer)
  router.post('/panel/albumum/ar', async (req, res) => {
    if (req.session?.kind !== 'couple') throw new HttpError(401, 'Oturum gerekli');
    checkCsrf(req);
    let b;
    try { b = JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString('utf8') || '{}'); } catch { throw new HttpError(400, 'Geçersiz istek.'); }
    const item = katalog.list().find((x) => x.no === Number(b.no));
    const renk = item && item.renkler.find((r) => r.ad === b.renk);
    const boy = item && item.ebatlar.find((e) => e.kod === b.boy);
    if (!renk || !boy) throw new HttpError(400, 'Seçim geçersiz.');
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.yaldiz || ''));
    try {
      const k = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.kumas || ''));
      json(res, ar.build({ doku: renk.doku, kumas: k ? Buffer.from(k[1], 'base64') : null, boy: boy.ad, yaldiz: m ? Buffer.from(m[1], 'base64') : null }));
    } catch (err) { throw new HttpError(400, err.message); }
  });
  router.get('/panel/albumum/:no/onay', (req, res, { params, query }) => {
    if (!requireCouple(req, res)) return;
    const couple = db.getCouple(req.session.userId);
    if (lockedFor(couple)) return redirect(res, '/panel/albumum');
    const item = katalog.forCouples().find((x) => x.no === Number(params.no));
    const renk = item && item.renkler.find((r) => r.ad === query.get('renk'));
    const boy = item && item.ebatlar.find((e) => e.kod === query.get('boy'));
    if (!item || !renk || !boy) { setFlash(req, { message: 'Renk ve boy seçin.', type: 'error' }); return redirect(res, item ? `/panel/albumum/${item.no}` : '/panel/albumum'); }
    const ch = choiceOf(couple);
    const names = (ch && ch.isim) || String(couple.name || '').replace(/\s+(ve|&|-)\s+/i, ' & ');
    const date = (ch && ch.tarih) || dateTr(couple.event_date);
    html(res, views.coupleConfirm(getContent(), { couple, item, renk, boy, names, date, note: (ch && ch.not) || '', csrf: req.session.csrf, flash: takeFlash(req) }));
  });
  router.post('/panel/albumum/onay', async (req, res) => {
    if (!requireCouple(req, res)) return;
    const form = await readForm(req);
    checkCsrf(req, form.csrf);
    const couple = db.getCouple(req.session.userId);
    if (lockedFor(couple)) { setFlash(req, { message: 'Albümünüz tasarıma alındı; seçim değişikliği için stüdyoya yazın.', type: 'error' }); return redirect(res, '/panel/albumum'); }
    const item = katalog.forCouples().find((x) => x.no === Number(form.no));
    const renk = item && item.renkler.find((r) => r.ad === form.renk);
    const boy = item && item.ebatlar.find((e) => e.kod === form.boy);
    if (!item || !renk || !boy) { setFlash(req, { message: 'Seçim geçersiz, tekrar deneyin.', type: 'error' }); return redirect(res, '/panel/albumum'); }
    const isim = String(form.isim || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const tarih = String(form.tarih || '').replace(/[^\d./-]/g, '').slice(0, 12);
    const not = String(form.not || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!isim) { setFlash(req, { message: 'Kapakta yazacak isimleri yazın.', type: 'error' }); return redirect(res, `/panel/albumum/${item.no}/onay?renk=${encodeURIComponent(renk.ad)}&boy=${encodeURIComponent(boy.kod)}`); }
    const prev = choiceOf(couple);
    const choice = { no: item.no, model: item.ad, renk: renk.ad, kod: boy.kod, boy: boy.ad, isim, tarih, not, fark: item.fark, at: new Date().toISOString() };
    db.setAlbumChoice(couple.id, JSON.stringify(choice));
    // Siparişe işlenir (sipariş henüz çifte gönderilmediyse)
    const o = db.getOrder(couple.id);
    if (!o || !['onay', 'onaylandi'].includes(o.state)) {
      const kapak = `Kapak yazısı: ${isim}${tarih ? ` · ${tarih}` : ''}`;
      const keep = String(o?.note || '').split('\n').filter((l) => !/^Kapak yazısı:|^Çiftin notu:/.test(l));
      db.saveOrder(couple.id, { model: item.ad, renk: renk.ad, boyut: boy.ad, note: [kapak, ...(not ? [`Çiftin notu: ${not}`] : []), ...keep].join('\n').slice(0, 1000) });
    }
    const text = `${item.ad} · ${renk.ad} · ${boy.ad}${item.fark ? ` · ${item.fark > 0 ? '+' : ''}${item.fark.toLocaleString('tr-TR')} ₺` : ''}\nKapak: ${isim}${tarih ? ` · ${tarih}` : ''}${not ? `\nNot: ${not}` : ''}`;
    activity.notify('album', { coupleId: couple.id, title: `${couple.name} albüm modelini ${prev ? 'değiştirdi' : 'seçti'}`, text, url: `/admin/ciftler/${couple.id}/siparis`, action: ['Siparişi aç', `/admin/ciftler/${couple.id}/siparis`], tag: `album-secim-${couple.id}` });
    setFlash(req, { message: 'Albüm seçiminiz stüdyomuza iletildi.', type: 'success' });
    redirect(res, '/panel/albumum');
  });
}
module.exports = { register, choiceOf };
