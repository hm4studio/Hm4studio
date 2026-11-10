'use strict';
// Albüm siparişi: Siparişler sayfası, sipariş formu, çiftin onayı, belge ve Ayarlar › Albüm seçenekleri.
const db = require('../db');
const demo = require('../demo');
const events = require('../events');
const orders = require('../orders');
const wa = require('../whatsapp');
const { getContent } = require('../content');

const siteOver = () => { try { return JSON.parse(db.getSetting('site_overrides') || '{}') || {}; } catch { return {}; } };
const saveOver = (o) => db.setSetting('site_overrides', JSON.stringify(o));
const { html, redirect, readForm, HttpError } = require('../http');
const { requireAdmin, requireCouple, checkCsrf, setFlash, takeFlash, toId } = require('./guards');
const views = require('../views/orders');
const { today, addDays } = require('../jobs');

function register(router) {
  const guard = async (req, res) => {
    if (!requireAdmin(req, res)) return null;
    const form = await readForm(req);
    checkCsrf(req, form.csrf);
    return form;
  };
  const coupleOr404 = (id) => {
    const c = db.getCouple(toId(id));
    if (!c) throw new HttpError(404, 'Çift bulunamadı');
    return c;
  };
  const ctx = (req) => ({ csrf: req.session.csrf, flash: takeFlash(req), demoAdmin: demo.isDemoAdmin(req) });

  // Siparişler: tamamlanacak, çiftin onayında, laba gönderilecek, labda, gelen, planlanan
  router.get('/admin/siparisler', (req, res) => {
    if (!requireAdmin(req, res)) return;
    html(res, views.listPage(getContent(), { rows: listRows(), ...ctx(req) }));
  });

  // Sipariş formu
  router.get('/admin/ciftler/:id/siparis', (req, res, { params }) => {
    if (!requireAdmin(req, res)) return;
    const couple = coupleOr404(params.id);
    html(res, views.formPage(getContent(), { couple, order: db.getOrder(couple.id) || {}, pages: db.listAlbumPages(couple.id).length, options: orders.options(), ...ctx(req) }));
  });
  router.post('/admin/ciftler/:id/siparis', async (req, res, { params }) => {
    const form = await guard(req, res);
    if (!form) return;
    const couple = coupleOr404(params.id);
    const old = db.getOrder(couple.id) || {};
    const x = { ...orders.read(form), note: orders.area(form.note, 1500) };
    const send = form.karar === 'gonder';
    if (send && !orders.complete(x)) {
      setFlash(req, { message: 'Çifte göndermek için beş alanı da seçin: paket, boyut, sayfa, model, renk.', type: 'error' });
      db.saveOrder(couple.id, { ...x, state: ['onay', 'onaylandi'].includes(old.state) ? old.state : 'taslak' });
      return redirect(res, `/admin/ciftler/${couple.id}/siparis`);
    }
    if (old.state === 'onaylandi' && !send) {
      db.saveOrder(couple.id, { note: x.note });
      setFlash(req, { message: 'Not kaydedildi. Onaylanmış siparişte seçimleri değiştirip yeniden onaya gönderebilirsiniz.', type: 'success' });
      return redirect(res, `/admin/ciftler/${couple.id}/siparis`);
    }
    db.saveOrder(couple.id, { ...x, state: send ? 'onay' : old.state === 'onay' ? 'onay' : 'taslak' });
    if (send) {
      db.sendOrder(couple.id);
      events.albumOrderSent(couple.id);
      setFlash(req, { message: `Sipariş ${couple.name} çiftine onaya gönderildi.${wa.autoSend() ? '' : ' WhatsApp mesajı Gönderilecek mesajlar listesinde.'}`, type: 'success' });
    } else setFlash(req, { message: 'Taslak kaydedildi.', type: 'success' });
    redirect(res, `/admin/ciftler/${couple.id}/siparis`);
  });
  // Laba gönderildi / albüm geldi
  router.post('/admin/ciftler/:id/siparis/durum', async (req, res, { params }) => {
    const form = await guard(req, res);
    if (!form) return;
    const couple = coupleOr404(params.id);
    const o = db.getOrder(couple.id);
    if (!o || o.state !== 'onaylandi') throw new HttpError(409, 'Önce çift siparişi onaylamalı.');
    const col = form.alan === 'geldi' ? 'arrived_at' : 'lab_at';
    db.setOrderStamp(couple.id, col, !o[col]);
    if (col === 'arrived_at' && !o.arrived_at && !o.lab_at) db.setOrderStamp(couple.id, 'lab_at', true);
    redirect(res, /^\/admin[\w/-]*$/.test(String(form.back || '')) ? form.back : `/admin/ciftler/${couple.id}/siparis`);
  });
  router.get('/admin/ciftler/:id/siparis/belge', (req, res, { params }) => {
    if (!requireAdmin(req, res)) return;
    const couple = coupleOr404(params.id);
    const o = db.getOrder(couple.id);
    if (!o || !['onay', 'onaylandi', 'degisiklik'].includes(o.state)) throw new HttpError(404, 'Sipariş henüz çifte gönderilmedi.');
    html(res, views.doc(getContent(), { couple, order: o, back: `/admin/ciftler/${couple.id}/siparis` }));
  });

  // Panel rehberi
  router.get('/admin/rehber', (req, res, { query }) => {
    if (!requireAdmin(req, res)) return;
    html(res, require('../views/guide').page(getContent(), { step: Number(query.get('adim')) || 1, csrf: req.session.csrf, demoAdmin: demo.isDemoAdmin(req) }));
  });

  // Ayarlar › Albüm seçenekleri
  router.get('/admin/album-secenekleri', (req, res) => {
    if (!requireAdmin(req, res)) return;
    html(res, views.optionsPage(getContent(), { options: orders.options(), ...ctx(req) }));
  });
  router.post('/admin/album-secenekleri', async (req, res) => {
    const form = await guard(req, res);
    if (!form) return;
    const o = siteOver();
    o.albumOptions = Object.fromEntries(orders.FIELDS.map(([k]) => {
      const list = String(form[k] || '').split(/\r?\n/).map((x) => orders.clean(x, 60)).filter(Boolean);
      return [k, [...new Set(list)].slice(0, 40)];
    }));
    saveOver(o);
    setFlash(req, { message: 'Albüm seçenekleri kaydedildi.', type: 'success' });
    redirect(res, '/admin/album-secenekleri');
  });

  // Çift: siparişi gör, onayla ya da değişiklik iste
  router.get('/panel/siparis', (req, res) => {
    if (!requireCouple(req, res)) return;
    const couple = db.getCouple(req.session.userId);
    const o = db.getOrder(couple.id);
    if (!o || !['onay', 'onaylandi', 'degisiklik'].includes(o.state)) return redirect(res, '/panel');
    html(res, views.couplePage(getContent(), { couple, order: o, csrf: req.session.csrf, flash: takeFlash(req) }));
  });
  router.post('/panel/siparis', async (req, res) => {
    if (!requireCouple(req, res)) return;
    const form = await readForm(req);
    checkCsrf(req, form.csrf);
    const couple = db.getCouple(req.session.userId);
    const o = db.getOrder(couple.id);
    if (!o || o.state !== 'onay') return redirect(res, '/panel/siparis');
    if (form.karar === 'onay') {
      db.approveOrder(couple.id);
      events.albumOrderReviewed(couple.id, true);
      setFlash(req, { message: 'Albüm siparişinizi onayladınız. Teşekkür ederiz!', type: 'success' });
    } else {
      const note = orders.area(form.not, 800);
      if (!note) { setFlash(req, { message: 'Neyi değiştirmek istediğinizi kısaca yazın.', type: 'error' }); return redirect(res, '/panel/siparis#degisiklik'); }
      db.saveOrder(couple.id, { state: 'degisiklik', change_note: note });
      events.albumOrderReviewed(couple.id, false, note);
      setFlash(req, { message: 'İsteğiniz HM4 Studio’ya iletildi.', type: 'success' });
    }
    redirect(res, '/panel/siparis');
  });
  router.get('/panel/siparis/belge', (req, res) => {
    if (!requireCouple(req, res)) return;
    const couple = db.getCouple(req.session.userId);
    const o = db.getOrder(couple.id);
    if (!o || !['onay', 'onaylandi', 'degisiklik'].includes(o.state)) return redirect(res, '/panel');
    html(res, views.doc(getContent(), { couple, order: o, back: '/panel/siparis' }));
  });
}

// Siparişler sayfasının satırları: sipariş kaydı olanlar + tasarımı onaylanmış ama kaydı olmayanlar
function listRows() {
  const byCouple = new Map(db.listOrders().map((o) => [o.couple_id, o]));
  const rows = [];
  for (const c of db.listCouples()) {
    const o = byCouple.get(c.id) || null;
    // Kaydı olmayan eski işler (teslim edilmiş ya da tasarımı 90 günden eski) listeyi doldurmasın
    if (!o && (c.album_design_state !== 'onaylandi' || c.delivered_at || !c.album_design_at || c.album_design_at.slice(0, 10) < addDays(today(), -90))) continue;
    rows.push({ couple: c, order: o, st: orders.stage(o, c) });
  }
  return rows;
}

// Bugün sayfası için: albümü onaylanmış, siparişi tamamlanmamış ya da değişiklik istenmiş çiftler
function prompts() {
  return listRows().filter((r) => ['tamamla', 'degisiklik', 'lab-bekliyor'].includes(r.st.key));
}

module.exports = { register, listRows, prompts };
