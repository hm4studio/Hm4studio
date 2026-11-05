'use strict';
// WhatsApp API (n8n + Meta) bağlı değilken: panelde "Gönderilecek mesajlar" listesi.
// Otomasyonun göndereceği her mesaj burada hazır metniyle durur; "Gönder" ofis WhatsApp'ında açar,
// gönderildi olarak işaretlenince listeden düşer. Kurallar otomatik gönderimle aynıdır (aynı anahtarlar).
const db = require('./db');
const wa = require('./whatsapp');
const events = require('./events');
const { getContent } = require('./content');
const { today, daysBetween, addDays } = require('./jobs');
const { dueReminders } = require('./routes/api');

const LABELS = {
  sozlesme: 'Sözleşme onaya sunuldu', fotograflar: 'Seçim fotoğrafları hazır', teslim: 'Teslim edildi',
  plan: 'Çekim planı hatırlatması', yorum: 'Yorum isteği', gorev: 'Ekip görevi', ekip: 'Ekip hatırlatması',
};
const KEY_RE = /^(sozlesme|fotograflar|teslim|plan|yorum|gorev|ekiphat):\d+(:[\w-]+)*$/;

function list() {
  const t = today();
  const last = getContent().stages.length - 1;
  const recent = (d, n) => Boolean(d) && daysBetween(String(d).slice(0, 10), t) <= n; // eski işler listeyi doldurmasın
  const items = [];
  const add = (type, key, couple, phone, tpl, vars, to, extra = []) => {
    if (!db.wasNotified(key)) items.push({ type, keys: [key, ...extra], couple, phone, tpl, vars, to });
  };
  const before = Number(require('./content').getWhatsapp().kurallar?.hatirlatmaGunOnce) || 3;

  for (const c of db.listCouples()) {
    if (!events.canMessage(c)) continue;
    const who = { id: c.id, name: c.name };
    const link = wa.panelLink();
    const k = db.activeContract(c.id);
    if (k && !k.signed_at && recent(k.sent_at, 7)) add('sozlesme', `sozlesme:${c.id}:${k.id}`, who, c.phone, 'sozlesme', { ad: c.name, link });
    const sel = db.listPhotos(c.id, 'secim');
    const firstUp = sel.map((p) => p.uploaded_on).filter(Boolean).sort()[0];
    if (sel.length && !c.album_locked && recent(firstUp, 7)) add('fotograflar', `fotograflar:${c.id}`, who, c.phone, 'fotograflar', { ad: c.name, link });
    if (c.stage >= last && recent(c.stage_changed_at, 7)) add('teslim', `teslim:${c.id}`, who, c.phone, db.videoCount(c.id) > 0 ? 'teslimVideo' : 'teslim', { ad: c.name, link });
  }

  // Ekip görevi (önümüzdeki 60 gündeki etkinlikler; görev verildiğinde bir kez)
  for (const ev of db.eventsBetween(t, addDays(t, 60))) {
    for (const m of db.eventMembers(ev.id)) {
      if (!m.phone || !m.active || !m.wa_optin) continue;
      // Çekim yakınsa görev mesajı hatırlatmanın yerine de geçer (aynı kişiye iki mesaj gitmesin)
      const soon = daysBetween(t, ev.event_date) <= before ? [`ekiphat:${ev.id}:${m.id}:${ev.event_date}`] : [];
      add('gorev', `gorev:${ev.id}:${m.id}:${ev.event_date}`, { id: ev.couple_id, name: ev.couple_name }, m.phone, 'gorev', wa.taskVars(m, ev, ev.couple_name), m.name, soon);
    }
  }

  // Günlük hatırlatmalar (plan, yorum, ekip hatırlatması) — otomasyonla aynı kurallar
  const covered = new Set(items.flatMap((x) => x.keys));
  for (const r of dueReminders()) if (!r.keys.some((k) => covered.has(k))) items.push({ ...r, to: r.member?.name });

  return items.map((x) => {
    const text = wa.templateText(x.tpl, x.vars);
    return { type: x.type, label: LABELS[x.type] || x.type, to: x.to || x.couple?.name || '', coupleId: x.couple?.id, keys: x.keys, text, href: wa.waLink(x.phone, text), team: x.type === 'gorev' || x.type === 'ekip' };
  });
}

module.exports = { list, KEY_RE };
