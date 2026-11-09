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

// Disk doluluğu: saatte bir bakar; %85'i geçince günde bir kez telefona ve Telegram'a uyarı gönderir
const DISK_LIMIT = 0.85;
function diskUsage() {
  try {
    const st = require('fs').statfsSync(config.dataDir);
    const total = st.blocks * st.bsize;
    const free = st.bavail * st.bsize;
    return total ? { used: 1 - free / total, free, total } : null;
  } catch { return null; }
}
function diskCheck() {
  const d = diskUsage();
  if (!d || d.used < DISK_LIMIT) return;
  const key = `disk:${today()}`;
  if (db.wasNotified(key)) return;
  db.markNotified(key);
  const gb = (n) => `${(n / 1024 ** 3).toFixed(1)} GB`;
  const body = `Sunucu diski %${Math.round(d.used * 100)} dolu, ${gb(d.free)} boş yer kaldı (toplam ${gb(d.total)}). Disk dolarsa fotoğraf yüklenemez; eski sezonları arşivleyin ya da Hostinger'dan diski büyütün.`;
  push.toAdmin({ title: 'Disk dolmak üzere', body, url: '/admin/veriler' }).catch(() => {});
  require('./telegram').notifyAll(`⚠️ Disk dolmak üzere\n${body}\n\n${config.siteUrl}/admin/veriler`).catch(() => {});
}

function start() {
  if (config.demoMode) return;
  setTimeout(tick, 20 * 1000).unref();
  setInterval(tick, 60 * 1000).unref();
  setTimeout(diskCheck, 60 * 1000).unref();
  setInterval(diskCheck, 60 * 60 * 1000).unref();
}

module.exports = { start, tick, nowHm, diskUsage, DISK_LIMIT };
