'use strict';
// Hatırlatıcı zamanlayıcısı: dakikada bir bakar; saati gelen hatırlatıcıyı telefona (bildirim) ve Telegram'a gönderir.
const db = require('./db');
const push = require('./push');
const config = require('./config');
const { today } = require('./jobs');

const nowHm = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());

// Her akşam 20:00: yarınki görev listesi (stüdyoya telefon bildirimi ve Telegram)
function tasksTomorrow() {
  if (nowHm() < '20:00') return;
  const tm = require('./jobs').addDays(today(), 1);
  const key = `gorevyarin:0:${tm.replace(/-/g, '')}`;
  if (db.wasNotified(key)) return;
  const list = db.openTasks().filter((x) => x.due_date === tm);
  db.markNotified(key);
  if (!list.length) return;
  const lines = list.map((x) => `• ${x.title}${x.member_name ? ` (${x.member_name.split(' ')[0]})` : ''}`).join('\n');
  push.toAdmin({ title: `Yarınki görev listen (${list.length})`, body: lines, url: '/admin/gorevler' }).catch(() => {});
  require('./telegram').notifyAll(`📋 Yarınki görev listen (${list.length})\n${lines}\n\n${config.siteUrl}/admin/gorevler`).catch(() => {});
}

async function tick() {
  try { tasksTomorrow(); } catch (err) { console.error('Görev listesi:', err.message); }
  try { preNotify(); } catch (err) { console.error('Hatırlatıcı:', err.message); }
}

// Hatırlatma: belirlenen günden 1 gün önce, aynı saatte (saat yoksa 09:00) telefona bildirim + Telegram.
// Günü gelince saati geçene kadar Bugün ekranının üstünde durur (bildirim tekrar gelmez).
function preNotify() {
  const { addDays } = require('./jobs');
  const t = today(), hm = nowHm();
  for (const r of db.openReminders()) {
    if (r.pre_notified_at) continue;
    const at = r.due_time || '09:00';
    const pre = addDays(r.due_date, -1);
    const passed = r.due_date < t || (r.due_date === t && hm >= at);
    // Bildirim anından sonra eklenen hatırlatma için bildirim gönderilmez (zaten yeni eklendi, Bugün ekranında görünür)
    const created = r.created_at ? new Date(`${String(r.created_at).replace(' ', 'T')}Z`) : null;
    const createdIst = created ? new Date(created.getTime() + 3 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') : '';
    if (passed || (createdIst && createdIst >= `${pre} ${at}`)) { db.markReminderPreNotified(r.id); continue; }
    if (t < pre || (t === pre && hm < at)) continue;
    db.markReminderPreNotified(r.id);
    const dayWord = r.due_date === t ? 'Bugün' : 'Yarın';
    const when = `${dayWord}${r.due_time ? ` ${r.due_time}` : ''}`;
    const who = [r.person, r.phone ? `+${r.phone}` : ''].filter(Boolean).join(' · ');
    const body = [`${when} · ${r.title}`, who, r.note].filter(Boolean).join('\n');
    push.toAdmin({ title: `Hatırlatma · ${dayWord.toLowerCase()}`, body, url: '/admin' }).catch(() => {});
    require('./telegram').notifyAll(`⏰ Hatırlatma (${dayWord.toLowerCase()})\n${body}\n\n${config.siteUrl}/admin`).catch(() => {});
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
  const purge = () => { try { require('./purge').run(); } catch (e) { console.error('Orijinal temizliği:', e.message); } };
  setTimeout(purge, 2 * 60 * 1000).unref();
  setInterval(purge, 60 * 60 * 1000).unref();
}

module.exports = { start, tick, nowHm, diskUsage, DISK_LIMIT };
