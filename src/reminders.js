'use strict';
// Hatırlatıcı zamanlayıcısı: dakikada bir bakar; saati gelen hatırlatıcıyı telefona (bildirim) ve Telegram'a gönderir.
const db = require('./db');
const push = require('./push');
const config = require('./config');
const { today } = require('./jobs');

const nowHm = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());

async function tick() {
  let due;
  try { due = db.remindersToNotify(today(), nowHm()); } catch (err) { console.error('Hatırlatıcı:', err.message); return; }
  for (const r of due) {
    db.markReminderNotified(r.id);
    const when = r.due_time ? `${r.due_time} ` : '';
    const who = [r.person, r.phone ? `+${r.phone}` : ''].filter(Boolean).join(' · ');
    const body = [`${when}${r.title}`, who, r.note].filter(Boolean).join('\n');
    push.toAdmin({ title: 'Hatırlatma', body, url: '/admin#yapilacaklar' }).catch(() => {});
    require('./telegram').notifyAll(`⏰ Hatırlatma\n${body}\n\n${config.siteUrl}/admin`).catch(() => {});
  }
}

function start() {
  if (config.demoMode) return;
  setTimeout(tick, 20 * 1000).unref();
  setInterval(tick, 60 * 1000).unref();
}

module.exports = { start, tick, nowHm };
