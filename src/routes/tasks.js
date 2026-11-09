'use strict';
// İş takibi: çekim sonrası kontroller (yapıldı / görev listesine ekle / ertele) ve Görevler sayfası.
const db = require('../db');
const demo = require('../demo');
const { getContent } = require('../content');
const { html, redirect, readForm, HttpError } = require('../http');
const { requireAdmin, checkCsrf, setFlash, takeFlash } = require('./guards');
const views = require('../views/admin');
const { today, addDays } = require('../jobs');

const okDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
const clean = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const back = (form, dflt) => (/^\/admin[\w/?=&#-]*$/.test(String(form.back || '')) ? form.back : dflt);

function register(router) {
  const guard = async (req, res) => {
    if (!requireAdmin(req, res)) return null;
    const form = await readForm(req);
    checkCsrf(req, form.csrf);
    return form;
  };
  const checkOr404 = (id) => {
    const k = db.getCheck(Number(id) || 0);
    if (!k) throw new HttpError(404, 'Bulunamadı');
    return k;
  };

  // Kontrol: yapıldı → listeden kalkar
  router.post('/admin/kontrol/:id/yapildi', async (req, res, { params }) => {
    const form = await guard(req, res);
    if (!form) return;
    const k = checkOr404(params.id);
    db.resolveCheck(k.id, 'done');
    redirect(res, back(form, '/admin#kontrol'));
  });
  // Bir çekimin tüm işleri yapıldı
  router.post('/admin/kontrol/etkinlik/:eventId/yapildi', async (req, res, { params }) => {
    const form = await guard(req, res);
    if (!form) return;
    for (const k of db.openChecks().filter((x) => x.event_id === Number(params.eventId))) db.resolveCheck(k.id, 'done');
    redirect(res, back(form, '/admin#kontrol'));
  });
  // Ertele: 1-3-5-7 gün sonra tekrar sorulur
  router.post('/admin/kontrol/:id/ertele', async (req, res, { params }) => {
    const form = await guard(req, res);
    if (!form) return;
    const k = checkOr404(params.id);
    const days = [1, 3, 5, 7].includes(Number(form.days)) ? Number(form.days) : 3;
    db.snoozeCheck(k.id, addDays(today(), days));
    setFlash(req, { message: `“${k.title}” ${days} gün sonra tekrar sorulacak.`, type: 'success' });
    redirect(res, back(form, '/admin#kontrol'));
  });
  // Görev listesine ekle (kime + teslim tarihi)
  router.post('/admin/kontrol/:id/gorev', async (req, res, { params }) => {
    const form = await guard(req, res);
    if (!form) return;
    const k = checkOr404(params.id);
    const member = db.listTeam().find((m) => m.id === Number(form.memberId));
    const couple = db.getCouple(k.couple_id);
    db.addTask({ coupleId: k.couple_id, checkId: k.id, title: `${k.title} · ${couple ? couple.name : ''}`.replace(/ · $/, ''), memberId: member ? member.id : null, dueDate: okDate(form.due) || addDays(today(), 7) });
    db.resolveCheck(k.id, 'task');
    setFlash(req, { message: `Görev eklendi${member ? `: ${member.name}` : ''}.`, type: 'success' });
    redirect(res, back(form, '/admin#kontrol'));
  });

  // Görevler sayfası
  router.get('/admin/gorevler', (req, res, { query }) => {
    if (!requireAdmin(req, res)) return;
    html(res, views.tasksPage(getContent(), {
      tasks: db.openTasks(), done: db.doneTasks(20), team: db.listTeam().filter((m) => m.active),
      couples: db.listCouples().filter((c) => !c.delivered_at).map((c) => ({ id: c.id, name: c.name })),
      who: Number(query.get('kisi')) || 0, csrf: req.session.csrf, flash: takeFlash(req), demoAdmin: demo.isDemoAdmin(req),
    }));
  });
  router.post('/admin/gorevler', async (req, res) => {
    const form = await guard(req, res);
    if (!form) return;
    const title = clean(form.title, 160);
    if (!title) { setFlash(req, { message: 'Görevin adını yazın.', type: 'error' }); return redirect(res, '/admin/gorevler'); }
    const member = db.listTeam().find((m) => m.id === Number(form.memberId));
    const couple = form.coupleId ? db.getCouple(Number(form.coupleId)) : null;
    db.addTask({ coupleId: couple ? couple.id : null, title: couple ? `${title} · ${couple.name}` : title, memberId: member ? member.id : null, dueDate: okDate(form.due) || addDays(today(), 7) });
    setFlash(req, { message: 'Görev eklendi.', type: 'success' });
    redirect(res, '/admin/gorevler');
  });
  router.post('/admin/gorevler/:id/tamam', async (req, res, { params }) => {
    const form = await guard(req, res);
    if (!form) return;
    const t = db.getTask(Number(params.id) || 0);
    if (!t) throw new HttpError(404, 'Bulunamadı');
    db.setTaskDone(t.id, !t.done_at);
    redirect(res, back(form, '/admin/gorevler'));
  });
  router.post('/admin/gorevler/:id/ertele', async (req, res, { params }) => {
    const form = await guard(req, res);
    if (!form) return;
    const t = db.getTask(Number(params.id) || 0);
    if (!t) throw new HttpError(404, 'Bulunamadı');
    const days = [1, 3, 5, 7].includes(Number(form.days)) ? Number(form.days) : 1;
    db.updateTask(t.id, { title: t.title, memberId: t.member_id, dueDate: addDays([t.due_date, today()].sort().pop(), days) });
    redirect(res, back(form, '/admin/gorevler'));
  });
  router.post('/admin/gorevler/:id/sil', async (req, res, { params }) => {
    const form = await guard(req, res);
    if (!form) return;
    db.deleteTask(Number(params.id) || 0);
    redirect(res, back(form, '/admin/gorevler'));
  });
}

module.exports = { register };
