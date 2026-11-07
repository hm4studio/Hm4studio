'use strict';
// Stüdyo sahibinin Telegram asistanı. Yalnızca izin verilen sohbetlere (TELEGRAM_CHAT_IDS) cevap verir,
// sitedeki verilere bakarak soruları yanıtlar ("en yakın çekimim ne zaman", "Menderes sözleşmeyi imzaladı mı").
// Hiçbir şeyi değiştiremez. Telegram'a sunucu kendisi bağlanır (uzun sorgulama); dışarıdan adres açmaya gerek yok.
// T.C. kimlik no, adres, imza, telefon ve şifreler modele gönderilmez.
const config = require('./config');
const db = require('./db');
const { getContent } = require('./content');
const { today, addDays } = require('./jobs');

const API = (method) => `${process.env.TELEGRAM_API_BASE || 'https://api.telegram.org'}/bot${config.telegramToken}/${method}`;
const enabled = () => Boolean(config.telegramToken && config.openaiKey && config.telegramChatIds.length && !config.demoMode);

async function tg(method, body, timeoutMs = 15000) {
  const res = await fetch(API(method), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(timeoutMs) });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description || res.status}`);
  return data.result;
}

// ── Sitedeki verilerin modele verilecek özeti ──
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const dstr = (iso) => {
  if (!iso) return '-';
  const d = new Date(`${iso}T12:00:00Z`);
  return `${iso} ${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', timeZone: 'UTC' })} ${DAYS[d.getUTCDay()]}`;
};
const tl = (n) => `${Number(n || 0).toLocaleString('tr-TR')} TL`;

function studioData() {
  const c = getContent();
  const stages = c.stages || [];
  const t = today();
  const since = addDays(t, -400);
  const lines = [];
  const couples = db.listCouples();
  for (const k of couples) {
    const evs = db.listEvents(k.id);
    const last = evs.map((e) => e.event_date).filter(Boolean).sort().pop();
    if (last && last < since && !k.next_date) continue; // çok eski işler
    let plan = {};
    try { plan = JSON.parse(k.plan_json || '{}') || {}; } catch { plan = {}; }
    const ct = db.activeContract(k.id);
    const sel = db.listPhotos(k.id, 'secim').length;
    const edited = db.listPhotos(k.id, 'duzenli').length;
    const videos = db.videoCount(k.id);
    const kalan = Math.max((k.total || 0) - (k.paid || 0), 0);
    lines.push([
      `### ${k.name}${k.ref_no ? ` (${k.ref_no})` : ''}`,
      `Kişiler: ${[k.full_name, k.partner_name].filter(Boolean).join(' ve ') || '-'}${k.source ? ` · Kaynak: ${k.source}` : ''}`,
      `Aşama: ${stages[k.stage] || '-'}${k.video_status ? ` · Video: ${k.video_status}` : ''}${k.due_date ? ` · Teslim tarihi: ${dstr(k.due_date)}` : ''}`,
      `Sözleşme: ${!ct ? 'gönderilmedi' : ct.signed_at ? `imzalandı (${ct.signed_at.slice(0, 10)})` : `gönderildi, imza bekleniyor (gönderim ${String(ct.sent_at || '').slice(0, 10)})`}`,
      `Fotoğraflar: seçim ${sel}, düzenlenmiş ${edited}, video ${videos} · Albüm seçimi: ${k.album_locked ? `tamamlandı (${k.fav_count}/${k.album_limit})` : sel ? `devam ediyor (${k.fav_count}/${k.album_limit} seçildi)` : 'henüz fotoğraf yok'}`,
      `Gün planı: ${plan.saved ? `dolduruldu (${plan.saved})` : 'doldurulmadı'}`,
      k.album_design_state ? `Albüm tasarımı: ${{ hazir: 'çiftin incelemesinde', degisiklik: 'çift değişiklik istedi', onaylandi: 'çift onayladı' }[k.album_design_state]}` : '',
      `Ödeme: toplam ${tl(k.total)}, ödenen ${tl(k.paid)}, kalan ${tl(kalan)}`,
      k.notes ? `Not: ${String(k.notes).replace(/\s+/g, ' ').slice(0, 300)}` : '',
      ...evs.map((e) => {
        const team = db.eventMembers(e.id).map((m) => m.name).join(', ');
        return `- Etkinlik: ${e.event_type || 'Etkinlik'} · ${dstr(e.event_date)}${e.start_time ? ` ${e.start_time}` : ''} · ${[e.venue, e.city].filter(Boolean).join(', ') || 'yer yok'}${e.package ? ` · Paket: ${e.package}` : ''}${e.price ? ` · ${tl(e.price)}` : ''}${team ? ` · Ekip: ${team}` : ''}${e.package_detail ? ` · Not: ${e.package_detail.replace(/\s+/g, ' ').slice(0, 200)}` : ''}`;
      }),
    ].filter(Boolean).join('\n'));
  }
  const quotes = db.listQuotes().filter((q) => !q.couple_id).slice(0, 30);
  const leads = db.listLeads().filter((l) => ['yeni', 'gorusuldu'].includes(l.status)).slice(0, 40);
  return [
    `Bugün: ${dstr(t)}`,
    `Çift sayısı: ${lines.length}`,
    '',
    '## Çiftler',
    lines.join('\n\n') || 'Kayıt yok.',
    '',
    '## Teklifler (randevuya dönmemiş)',
    quotes.length ? quotes.map((q) => `- ${q.name} · ${q.event_type || ''} ${q.event_date ? dstr(q.event_date) : ''} · durum: ${{ hazir: 'gönderildi, açılmadı', goruldu: 'çift açtı', kabul: 'KABUL ETTİ' }[q.status]} · oluşturma ${q.created_at.slice(0, 10)}`).join('\n') : 'Yok.',
    '',
    '## Açık talepler (henüz randevuya dönmemiş)',
    leads.length ? leads.map((l) => `- ${l.name || 'İsimsiz'} · durum: ${l.status} · geliş: ${String(l.created_at || '').slice(0, 10)}${l.event_date ? ` · istenen tarih: ${dstr(l.event_date)}` : ''}${l.service ? ` · ${l.service}` : ''}${l.place ? ` · ${l.place}` : ''}${l.source ? ` · kaynak: ${l.source}` : ''}`).join('\n') : 'Yok.',
  ].join('\n');
}

function systemPrompt() {
  return `Sen ${getContent().brand?.name || 'HM4 Studio'} sahibinin kişisel asistanısın ve Telegram'dan yazışıyorsun. Karşındaki kişi stüdyonun sahibi (fotoğrafçı).
Kurallar:
- Türkçe, kısa ve net cevap ver. Gereksiz giriş cümlesi kurma. Tarih verirken gün adını da söyle (ör. "23 Kasım Pazartesi, 14:00, İstanbul").
- Yalnızca aşağıdaki verilere dayan; bilgi yoksa "kayıtlarda yok" de, asla uydurma.
- İsimler eksik ya da farklı yazılabilir: soru "Menderes" diyorsa çift adında veya kişi adlarında geçen kaydı bul. Birden fazla eşleşme varsa hepsini kısaca listele.
- "En yakın çekim", "bu hafta", "bu ay" gibi soruları bugünün tarihine göre hesapla. Geçmiş tarihleri "yaklaşan" sayma.
- Şehir sorularında etkinliğin şehir/yer bilgisine bak.
- Hiçbir şeyi değiştiremezsin; değişiklik istenirse panelden yapılması gerektiğini söyle.
- Markdown başlık veya tablo kullanma; gerekirse kısa satırlar ve "•" ile liste yap.

${studioData()}`;
}

// Kısa konuşma hafızası (sohbet başına son 8 mesaj, 30 dakika)
const memory = new Map();
function history(chatId) {
  const m = memory.get(chatId);
  if (!m || Date.now() - m.at > 30 * 60 * 1000) return [];
  return m.msgs;
}
function remember(chatId, msgs) { memory.set(chatId, { at: Date.now(), msgs: msgs.slice(-8) }); }

async function answer(chatId, text) {
  const msgs = [...history(chatId), { role: 'user', content: text.slice(0, 1500) }];
  const res = await fetch(`${config.openaiBase}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.openaiKey}` },
    body: JSON.stringify({ model: config.openaiModel, messages: [{ role: 'system', content: systemPrompt() }, ...msgs], max_completion_tokens: 700, store: false }),
    signal: AbortSignal.timeout(45000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status} ${data?.error?.message || ''}`);
  const reply = String(data.choices?.[0]?.message?.content || '').trim() || 'Buna cevap veremedim.';
  remember(chatId, [...msgs, { role: 'assistant', content: reply }]);
  return reply;
}

async function handle(msg) {
  const chatId = msg.chat?.id;
  const text = String(msg.text || '').trim();
  if (!chatId || !text) return;
  if (!config.telegramChatIds.includes(String(chatId))) {
    await tg('sendMessage', { chat_id: chatId, text: `Bu sohbet yetkili değil. Sohbet no: ${chatId}` }).catch(() => {});
    return;
  }
  if (/^\/(start|yardim|help)\b/i.test(text)) {
    await tg('sendMessage', { chat_id: chatId, text: 'Merhaba! Çekimlerin, çiftlerin ve işlerin hakkında sorabilirsin. Örnekler:\n• En yakın çekimim ne zaman?\n• Bu ay İstanbul çekimim var mı?\n• Menderes sözleşmeyi imzaladı mı?\n• Albüm seçimini kimler tamamlamadı?\n• Bu hafta kimden ödeme alacağım?' });
    return;
  }
  if (/^\/(yeni|sifirla)\b/i.test(text)) { memory.delete(chatId); await tg('sendMessage', { chat_id: chatId, text: 'Yeni konuşma başladı.' }); return; }
  tg('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
  let reply;
  try { reply = await answer(chatId, text); } catch (err) {
    console.error('Telegram asistanı:', err.message);
    reply = 'Şu an cevap veremiyorum, birazdan tekrar dener misin?';
  }
  for (let i = 0; i < reply.length; i += 4000) await tg('sendMessage', { chat_id: chatId, text: reply.slice(i, i + 4000) });
}

let running = false;
async function loop() {
  let offset = 0;
  await tg('deleteWebhook', {}).catch(() => {});
  while (running) {
    try {
      const updates = await tg('getUpdates', { offset, timeout: 50, allowed_updates: ['message'] }, 60000);
      for (const u of updates) {
        offset = u.update_id + 1;
        if (u.message) await handle(u.message).catch((err) => console.error('Telegram:', err.message));
      }
    } catch (err) {
      if (!/aborted|timeout/i.test(err.message)) console.error('Telegram bağlantısı:', err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

function start() {
  if (!enabled() || running) return;
  running = true;
  console.log('Telegram asistanı açık.');
  loop();
}

module.exports = { start, studioData, systemPrompt, enabled };
