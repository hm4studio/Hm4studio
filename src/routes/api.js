'use strict';
// n8n'in kullandığı güvenli API. Her istek "Authorization: Bearer <N8N_API_KEY>" taşımalıdır.
// N8N_API_KEY tanımlı değilse bu adresler hiç yokmuş gibi davranır (404).
const crypto = require('node:crypto');
const config = require('../config');
const db = require('../db');
const wa = require('../whatsapp');
const events = require('../events');
const { getContent, getWhatsapp } = require('../content');
const { today, daysBetween } = require('../jobs');
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

// Bugün gönderilmesi gereken hatırlatmaları hesaplar (gönderilmiş olanları atlar)
function dueReminders() {
  const rules = getWhatsapp().kurallar || {};
  const stages = getContent().stages;
  const last = stages.length - 1;
  const t = today();
  const items = [];
  const reviewLink = getWhatsapp().yorumLinki || '';

  for (const c of db.listCouples()) {
    if (!events.canMessage(c)) continue;
    const who = { id: c.id, name: c.name, phone: c.phone };

    // 1) Çekimden önce plan formu hatırlatması (plan henüz kaydedilmediyse)
    const planSaved = (() => { try { return Boolean(JSON.parse(c.plan_json || '{}').saved); } catch { return false; } })();
    if (c.event_date && !planSaved) {
      const left = daysBetween(t, c.event_date);
      const offsets = [...(rules.planHatirlatmaGunOnce || [7, 2])].sort((a, b) => b - a);
      const applicable = offsets.filter((n) => left > 0 && left <= n);
      const keys = applicable.map((n) => `plan:${c.id}:${n}:${c.event_date}`);
      if (applicable.length && keys.some((k) => !db.wasNotified(k))) {
        items.push({ type: 'plan', keys, couple: who, whatsapp: wa.templateMessage(c.phone, 'plan', { ad: c.name, gun: left, link: wa.panelLink() }) });
        continue;
      }
    }

    // 2) Fotoğraflar yüklendikten birkaç gün sonra albüm seçimi hatırlatması
    const lastUpload = db.lastUploadDay(c.id);
    if (lastUpload && !c.album_locked && c.stage < last && daysBetween(lastUpload, t) >= (rules.albumHatirlatmaGunSonra ?? 5)) {
      const key = `album:${c.id}:${lastUpload}`;
      if (!db.wasNotified(key)) {
        items.push({ type: 'album', keys: [key], couple: who, whatsapp: wa.templateMessage(c.phone, 'album', { ad: c.name, kare: c.album_limit, link: wa.panelLink() }) });
        continue;
      }
    }

    // 3) Teslimden bir süre sonra yorum isteme (yorum bağlantısı girildiyse)
    if (c.stage >= last && c.stage_changed_at && reviewLink && !reviewLink.startsWith('[')
      && daysBetween(c.stage_changed_at, t) >= (rules.yorumIstemeGunSonra ?? 7)) {
      const key = `yorum:${c.id}`;
      if (!db.wasNotified(key)) {
        items.push({ type: 'yorum', keys: [key], couple: who, whatsapp: wa.templateMessage(c.phone, 'yorum', { ad: c.name, link: reviewLink }) });
      }
    }
  }
  return items;
}

function register(router) {
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
    const valid = (Array.isArray(keys) ? keys : []).filter((k) => /^(plan|album|yorum):\d+(:[\w-]+)*$/.test(String(k))).slice(0, 500);
    for (const k of valid) db.markNotified(k);
    json(res, { ok: true, marked: valid.length });
  });
}

module.exports = { register, dueReminders, extractMessages };
