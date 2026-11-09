'use strict';
// İş takibi: çekimden sonra randevudaki hizmetler için "yapıldı mı?" kontrolü, görevler ve "yarınki görev listen".
// Kural: video ve diğer işler çekimden N gün sonra sorulur; fotoğraf işleri çift albüm seçimini tamamlayınca sorulur.
const db = require('./db');
const { getContent } = require('./content');
const { today, addDays } = require('./jobs');

const checkDays = () => Number(getContent().production?.checkDays) || 10;
const VIDEO_RE = /video|klip|reels|film|drone|kurgu|belgesel/i;
const PHOTO_RE = /foto|çekim|albüm|portre|baskı/i;

// "Fotoğraf + Video + Albüm" ya da paket adları → ayrı işler (paket adlarının içindeki " + " bozulmasın)
function services(ev) {
  const raw = String(ev.package || '').trim();
  if (!raw) return [];
  let rest = ` ${raw} `;
  const found = [];
  const known = db.listPackages ? db.listPackages().map((p) => p.name).filter((n) => n && n.includes('+')).sort((a, b) => b.length - a.length) : [];
  for (const n of known) if (rest.includes(n)) { found.push(n); rest = rest.replace(n, ' + '); }
  for (const part of rest.split('+').map((x) => x.trim()).filter(Boolean)) found.push(part);
  const out = [];
  const type = ev.event_type || 'Çekim';
  for (const name of found) {
    const v = VIDEO_RE.test(name);
    const f = PHOTO_RE.test(name) && !/^hediye/i.test(name);
    if (v && f && /\+|foto.*video|video.*foto/i.test(name)) {
      out.push({ title: `${type} fotoğrafları`, kind: 'foto' }, { title: `${type} videosu`, kind: 'video' });
    } else if (/^fotoğraf$/i.test(name)) out.push({ title: `${type} fotoğrafları`, kind: 'foto' });
    else if (/^video$/i.test(name)) out.push({ title: `${type} videosu`, kind: 'video' });
    else out.push({ title: name, kind: v ? 'video' : f ? 'foto' : 'diger' });
  }
  return out.filter((x, i, a) => a.findIndex((y) => y.title === x.title) === i);
}

function pickMember(members, kind) {
  const role = (m) => String(m.role || '').toLocaleLowerCase('tr-TR');
  if (kind === 'video') return members.find((m) => /video|kurgu/.test(role(m))) || members[0];
  if (kind === 'foto') return members.find((m) => /foto/.test(role(m))) || members[0];
  return members[0];
}

// Geçmiş çekimler için kontrol satırlarını oluşturur (teslim edilmemiş çiftler, son 90 gün)
function syncChecks() {
  const t = today();
  for (const ev of db.eventsBetween(addDays(t, -90), t)) {
    const c = db.getCouple(ev.couple_id);
    if (!c || c.delivered_at) continue;
    const members = db.eventMembers(ev.id);
    for (const s of services(ev)) {
      const m = pickMember(members, s.kind);
      db.addCheck({ coupleId: ev.couple_id, eventId: ev.id, title: s.title, kind: s.kind, memberId: m ? m.id : null });
    }
  }
}

// Bugün sorulacak kontroller, çift ve çekim bazında gruplu
function dueChecks() {
  try { syncChecks(); } catch (err) { console.error('İş takibi:', err.message); }
  const t = today();
  const n = checkDays();
  const groups = new Map();
  for (const k of db.openChecks()) {
    if (k.snooze_until && k.snooze_until > t) continue;
    const ready = k.kind === 'foto' ? Boolean(k.album_locked) && k.event_date <= t : addDays(k.event_date, n) <= t;
    if (!ready) continue;
    const key = `${k.couple_id}:${k.event_id}`;
    const g = groups.get(key) || { coupleId: k.couple_id, coupleName: k.couple_name, eventId: k.event_id, eventType: k.event_type, eventDate: k.event_date, albumLocked: Boolean(k.album_locked), items: [] };
    g.items.push(k);
    groups.set(key, g);
  }
  return [...groups.values()];
}

module.exports = { services, syncChecks, dueChecks, checkDays, pickMember };
