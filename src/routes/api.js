'use strict';
// n8n'in kullandığı güvenli API. Her istek "Authorization: Bearer <N8N_API_KEY>" taşımalıdır.
// N8N_API_KEY tanımlı değilse bu adresler hiç yokmuş gibi davranır (404).
const crypto = require('node:crypto');
const config = require('../config');
const db = require('../db');
const wa = require('../whatsapp');
const events = require('../events');
const { getContent, getWhatsapp } = require('../content');
const { today, daysBetween, addDays } = require('../jobs');
const { json, readJson, readBody, HttpError } = require('../http');

function requireKey(req) {
  if (!config.n8nApiKey) throw new HttpError(404, 'Bulunamadı');
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given);
  const b = Buffer.from(config.n8nApiKey);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(401, 'Yetkisiz');
}

// Meta'nın gönderdiği webhook gövdesinden mesajları çıkarır
function extractMessages(body) {
  const out = [];
  for (const entry of body?.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      const names = new Map((v.contacts || []).map((ct) => [ct.wa_id, ct.profile?.name || '']));
      for (const m of v.messages || []) {
        let text = '';
        if (m.type === 'text') text = m.text?.body || '';
        else if (m.type === 'button') text = m.button?.text || '';
        else if (m.type === 'interactive') text = m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '';
        else text = `[${m.type}]`;
        out.push({ id: m.id, from: wa.normalizePhone(m.from), name: names.get(m.from) || '', text: String(text).slice(0, 2000) });
      }
    }
  }
  return out.filter((m) => m.from && m.id);
}

function hoursAgoSql(h) {
  return new Date(Date.now() - h * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

// Bugün gönderilmesi gereken hatırlatmaları hesaplar (gönderilmiş olanları atlar).
// Yalnızca üç tür var: çekimden önce plan hatırlatması (çifte), aynı gün ekibe görev hatırlatması, teslimden sonra yorum isteği.
// tpl + vars: n8n için şablon mesajı, panel için (API yokken) aynı metnin düz hâli üretilir
const item = (type, key, couple, phone, tpl, vars) => ({ type, keys: [key], couple, phone, tpl, vars, whatsapp: wa.templateMessage(phone, tpl, vars) });

function dueReminders() {
  const rules = getWhatsapp().kurallar || {};
  const last = getContent().stages.length - 1;
  const t = today();
  const before = Number(rules.hatirlatmaGunOnce) || 3;
  const items = [];
  const reviewLink = getWhatsapp().yorumLinki || '';

  for (const c of db.listCouples()) {
    if (!events.canMessage(c)) continue;
    const who = { id: c.id, name: c.name, phone: c.phone };

    // 1) Çekimden birkaç gün önce, gün planı doldurulmadıysa (her çekim tarihi için bir kez)
    const shoot = c.next_date;
    const planSaved = (() => { try { return Boolean(JSON.parse(c.plan_json || '{}').saved); } catch { return false; } })();
    const left = shoot ? daysBetween(t, shoot) : -1;
    if (shoot && !planSaved && left > 0 && left <= before) {
      const key = `plan:${c.id}:${shoot}`;
      if (!db.wasNotified(key)) items.push(item('plan', key, who, c.phone, 'plan', { ad: c.name, gun: left, link: wa.panelLink() }));
    }

    // 2) "Teslim" aşamasından bir süre sonra yorum isteği (yorum bağlantısı girildiyse, bir kez)
    if (c.stage >= last && c.stage_changed_at && reviewLink && !reviewLink.startsWith('[')
      && daysBetween(c.stage_changed_at, t) >= (rules.yorumIstemeGunSonra ?? 7)) {
      const key = `yorum:${c.id}`;
      if (!db.wasNotified(key)) items.push(item('yorum', key, who, c.phone, 'yorum', { ad: c.name, link: reviewLink }));
    }
  }

  // 3) Ekip: çekimden aynı sayıda gün önce görevli kişilere hatırlatma (görev mesajı son 2 günde gittiyse atlanır)
  const recent = new Date(Date.now() - 48 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  for (const ev of db.eventsBetween(addDays(t, 1), addDays(t, before))) {
    for (const m of db.eventMembers(ev.id)) {
      if (!m.phone || !m.active || !m.wa_optin) continue;
      const key = `ekiphat:${ev.id}:${m.id}:${ev.event_date}`;
      if (db.wasNotified(key) || db.notifiedSince(`gorev:${ev.id}:${m.id}:${ev.event_date}`, recent)) continue;
      items.push({ ...item('ekip', key, { id: ev.couple_id, name: ev.couple_name }, m.phone, 'gorev', wa.taskVars(m, ev, ev.couple_name)), member: { id: m.id, name: m.name, phone: m.phone } });
    }
  }
  return items;
}

function register(router) {
  // Düğün.com teklif talebi e-postası (n8n e-posta kutusunu okur, ham metni buraya iletir) → Talepler
  router.post('/api/dis-talep', async (req, res) => {
    requireKey(req);
    const b = JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString('utf8') || '{}');
    const p = require('../dugun').parse({ subject: b.subject, text: b.text, html: b.html });
    if (!p) return json(res, { ok: true, skipped: 'tanınmadı' });
    const id8 = crypto.createHash('sha1').update(String(b.messageId || `${p.name}|${p.eventDate}`)).digest('hex').slice(0, 16);
    const key = `dugun:${id8}`;
    const dup = db.listLeads().find((l) => l.source === 'dugun' && l.name === p.name && l.event_date === p.eventDate);
    if (db.wasNotified(key) || dup) return json(res, { ok: true, skipped: 'zaten var', id: dup?.id });
    db.markNotified(key);
    const message = ['Düğün.com üzerinden ayrıntılı fiyat teklifi bekliyor.', p.email ? `E-posta: ${p.email}` : ''].filter(Boolean).join(' ');
    const id = db.addLead({ name: p.name, phone: p.phone, eventDate: p.eventDate, service: p.service, message, source: 'dugun' });
    events.newLead({ id, name: `${p.name} (Düğün.com)`, eventDate: p.eventDate, service: p.service, source: 'dugun' });
    json(res, { ok: true, id, lead: p });
  });

  // Bağlantı testi
  router.get('/api/ping', (req, res) => {
    requireKey(req);
    json(res, { ok: true, site: config.siteUrl, whatsappReady: Boolean(config.waPhoneNumberId), time: new Date().toISOString() });
  });

  // Meta webhook doğrulaması (n8n iletir)
  router.get('/api/whatsapp/dogrula', (req, res, { query }) => {
    requireKey(req);
    const ok = query.get('mode') === 'subscribe' && config.waVerifyToken && query.get('token') === config.waVerifyToken;
    if (!ok) throw new HttpError(403, 'Doğrulama kodu eşleşmedi');
    json(res, { challenge: query.get('challenge') || '' });
  });

  // Gelen WhatsApp mesajı: talebi kaydet, gerekirse otomatik cevabı hazırla
  router.post('/api/whatsapp/gelen', async (req, res) => {
    requireKey(req);
    const body = JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString('utf8') || '{}');
    const replies = [];
    const leads = [];
    for (const m of extractMessages(body)) {
      const seen = `msg:${m.id}`;
      if (db.wasNotified(seen)) continue; // Meta aynı mesajı tekrar gönderebilir
      db.markNotified(seen);

      const couple = db.getCoupleByPhone(m.from);
      if (couple) {
        const key = `oto:cift:${m.from}`;
        if (!db.notifiedSince(key, hoursAgoSql(12))) {
          replies.push(wa.textMessage(m.from, 'mevcutCift', { ad: couple.name, link: wa.panelLink() }));
          db.touchNotified(key);
        }
        continue;
      }

      let lead = db.openLeadByPhone(m.from);
      if (lead) {
        db.updateLeadDetails(lead.id, { name: lead.name ? '' : m.name, message: m.text });
      } else {
        const id = db.addLead({ name: m.name, phone: m.from, message: m.text, source: 'whatsapp' });
        lead = db.getLead(id);
        leads.push({ id, name: lead.name, phone: m.from, message: m.text });
        events.newLead({ id, name: lead.name, phone: m.from, phoneDisplay: wa.displayPhone(m.from), message: m.text, source: 'whatsapp' });
      }
      const key = `oto:yeni:${m.from}`;
      if (!db.notifiedSince(key, hoursAgoSql(24))) {
        const first = (m.name || '').split(/\s+/)[0];
        replies.push(wa.textMessage(m.from, 'yeniKisi', { ad: first, link: `${config.siteUrl}/talep?tel=${m.from}` }));
        db.touchNotified(key);
      }
    }
    json(res, { ok: true, replies, newLeads: leads });
  });

  // Günlük hatırlatmalar (n8n her sabah sorar)
  router.get('/api/hatirlatmalar', (req, res) => {
    requireKey(req);
    json(res, { ok: true, date: today(), items: dueReminders() });
  });

  // n8n gönderdiği hatırlatmaları bildirir; aynı hatırlatma bir daha gönderilmez
  router.post('/api/hatirlatmalar/gonderildi', async (req, res) => {
    requireKey(req);
    const { keys } = await readJson(req);
    const valid = (Array.isArray(keys) ? keys : []).filter((k) => /^(plan|yorum|ekiphat):\d+(:[\w-]+)*$/.test(String(k))).slice(0, 500);
    for (const k of valid) db.markNotified(k);
    json(res, { ok: true, marked: valid.length });
  });
}

module.exports = { register, dueReminders, extractMessages };
