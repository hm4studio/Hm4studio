'use strict';
// SQLite veritabanı (Node.js'in yerleşik node:sqlite modülü). Ek kurulum gerekmez.
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.privateDir, { recursive: true });
fs.mkdirSync(config.publicMediaDir, { recursive: true });

const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS couples (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  access_code TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  event_date TEXT,
  stage INTEGER NOT NULL DEFAULT 0,
  stage_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY,
  couple_id INTEGER NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  file_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL DEFAULT '',
  original_ext TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS photos_couple ON photos(couple_id);
CREATE TABLE IF NOT EXISTS favorites (
  couple_id INTEGER NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (couple_id, photo_id)
);
CREATE TABLE IF NOT EXISTS portfolio (
  id INTEGER PRIMARY KEY,
  file_key TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT '',
  alt TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL DEFAULT '',
  rating INTEGER,
  message TEXT NOT NULL,
  device TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('admin','couple')),
  user_id INTEGER NOT NULL,
  csrf TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
`);

// Sonradan eklenen alanlar (mevcut veritabanlarını bozmadan eklenir)
function addColumn(table, column, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
}
addColumn('couples', 'due_date', 'TEXT');
addColumn('couples', 'album_limit', 'INTEGER NOT NULL DEFAULT 35');
addColumn('couples', 'album_locked', 'INTEGER NOT NULL DEFAULT 0');
addColumn('couples', 'plan_json', "TEXT NOT NULL DEFAULT '{}'");
addColumn('couples', 'phone', 'TEXT');
addColumn('couples', 'wa_optin', 'INTEGER NOT NULL DEFAULT 1');
addColumn('couples', 'stage_changed_at', 'TEXT');
addColumn('photos', 'uploaded_on', 'TEXT');
addColumn('photos', 'kind', "TEXT NOT NULL DEFAULT 'secim'"); // secim: albüm seçimi için · duzenli: düzenlenmiş (renkli) teslim
addColumn('couples', 'discount', 'INTEGER NOT NULL DEFAULT 0'); // randevuda uygulanan indirim (₺); toplam = etkinlik fiyatları − indirim
addColumn('photos', 'w', 'INTEGER'); // küçük önizlemenin boyutu: galeride fotoğraflar kırpılmadan, kendi oranında dizilir
addColumn('photos', 'h', 'INTEGER');
addColumn('photos', 'upload_key', 'TEXT'); // tarayıcının her dosyaya verdiği anahtar: tekrar denemede aynı fotoğraf iki kez eklenmez
db.exec('CREATE INDEX IF NOT EXISTS photos_upload_key ON photos(couple_id, upload_key)');
addColumn('couples', 'archived_at', 'TEXT');
addColumn('couples', 'archived_selection', "TEXT NOT NULL DEFAULT ''");
addColumn('couples', 'archived_photos', 'INTEGER NOT NULL DEFAULT 0');
addColumn('couples', 'wa_consent_at', 'TEXT');
addColumn('couples', 'video_status', "TEXT NOT NULL DEFAULT ''");
// Albüm tasarım onayı: çift sayfaları tek tek onaylar ya da değişiklik ister
addColumn('couples', 'album_design_state', "TEXT NOT NULL DEFAULT ''"); // '' | hazir | degisiklik | onaylandi
addColumn('couples', 'album_design_round', 'INTEGER NOT NULL DEFAULT 0');
addColumn('couples', 'album_design_at', 'TEXT');
addColumn('couples', 'delivered_at', 'TEXT'); // teslim tutanağı imzalandı
db.exec(`
CREATE TABLE IF NOT EXISTS album_pages (
  id INTEGER PRIMARY KEY,
  couple_id INTEGER NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  file_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'bekliyor',
  note TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS album_pages_couple ON album_pages(couple_id);
CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  couple_id INTEGER REFERENCES couples(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL DEFAULT '',
  event_date TEXT,
  place TEXT NOT NULL DEFAULT '',
  items_json TEXT NOT NULL DEFAULT '[]',
  discount INTEGER NOT NULL DEFAULT 0,
  deposit INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  valid_until TEXT,
  status TEXT NOT NULL DEFAULT 'hazir',
  viewed_at TEXT,
  accepted_at TEXT,
  accepted_name TEXT NOT NULL DEFAULT '',
  accepted_phone TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS quotes_lead ON quotes(lead_id);
CREATE TABLE IF NOT EXISTS gift_codes (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  couple_id INTEGER NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  expires_on TEXT NOT NULL,
  used_at TEXT,
  used_lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  used_couple_id INTEGER REFERENCES couples(id) ON DELETE SET NULL,
  reward_given_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS gift_codes_couple ON gift_codes(couple_id);
CREATE TABLE IF NOT EXISTS deliveries (
  id INTEGER PRIMARY KEY,
  couple_id INTEGER NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  snapshot TEXT NOT NULL,
  signer_name TEXT NOT NULL,
  signature TEXT NOT NULL,
  ip TEXT, user_agent TEXT,
  hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS deliveries_couple ON deliveries(couple_id);
CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  due_date TEXT NOT NULL,
  due_time TEXT,
  person TEXT, phone TEXT, note TEXT,
  couple_id INTEGER REFERENCES couples(id) ON DELETE SET NULL,
  lead_id INTEGER,
  notified_at TEXT, done_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS reminders_due ON reminders(done_at, due_date);
`);
// Randevu kartı alanları
for (const [col, def] of [
  ['ref_no', 'TEXT'], ['full_name', "TEXT NOT NULL DEFAULT ''"], ['partner_name', "TEXT NOT NULL DEFAULT ''"],
  ['event_type', "TEXT NOT NULL DEFAULT ''"], ['start_time', "TEXT NOT NULL DEFAULT ''"], ['city', "TEXT NOT NULL DEFAULT ''"],
  ['venue', "TEXT NOT NULL DEFAULT ''"], ['package', "TEXT NOT NULL DEFAULT ''"], ['package_detail', "TEXT NOT NULL DEFAULT ''"],
  ['total_amount', 'INTEGER NOT NULL DEFAULT 0'], ['deposit', 'INTEGER NOT NULL DEFAULT 0'], ['paid_full', 'INTEGER NOT NULL DEFAULT 0'],
  ['source', "TEXT NOT NULL DEFAULT ''"], ['notes', "TEXT NOT NULL DEFAULT ''"],
  ['photo_ready', 'INTEGER NOT NULL DEFAULT 0'], ['video_ready', 'INTEGER NOT NULL DEFAULT 0'], ['album_ready', 'INTEGER NOT NULL DEFAULT 0'],
  ['album_info_sent_at', 'TEXT'],
]) addColumn('couples', col, def);

db.exec(`
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  event_date TEXT,
  place TEXT NOT NULL DEFAULT '',
  service TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'site',
  status TEXT NOT NULL DEFAULT 'yeni',
  couple_id INTEGER REFERENCES couples(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS leads_phone ON leads(phone);
`);
addColumn('leads', 'wa_consent', 'INTEGER NOT NULL DEFAULT 0');
addColumn('leads', 'kvkk_at', 'TEXT');
addColumn('leads', 'gift_code', 'TEXT'); // hediye kuponuyla gelen talep
db.exec(`
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  couple_id INTEGER NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL DEFAULT '',
  event_date TEXT,
  start_time TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  venue TEXT NOT NULL DEFAULT '',
  package TEXT NOT NULL DEFAULT '',
  package_detail TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL DEFAULT 0,
  team TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS events_couple ON events(couple_id);
CREATE INDEX IF NOT EXISTS events_date ON events(event_date);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  couple_id INTEGER NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  paid_on TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS payments_couple ON payments(couple_id);
CREATE TABLE IF NOT EXISTS team (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  phone TEXT,
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  wa_optin INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS packages (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  detail TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY,
  couple_id INTEGER NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'Klip',
  file_key TEXT,
  ext TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  link TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS videos_couple ON videos(couple_id);
CREATE TABLE IF NOT EXISTS event_team (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, member_id)
);
CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY,
  couple_id INTEGER NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  snapshot TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  signed_at TEXT,
  signer_name TEXT, signer_tc TEXT, signer_address TEXT, consent TEXT,
  signature TEXT, ip TEXT, user_agent TEXT, hash TEXT,
  cancelled_at TEXT
);
CREATE INDEX IF NOT EXISTS contracts_couple ON contracts(couple_id);
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  device TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notifications (
  key TEXT PRIMARY KEY,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

const q = (sql) => db.prepare(sql);

// Eski tek-etkinlikli kayıtları yeni yapıya taşı (bir kez çalışır)
(function migrateSingleEvent() {
  const rows = q(`SELECT * FROM couples c WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.couple_id = c.id)
    AND (c.event_type <> '' OR c.total_amount > 0 OR c.venue <> '')`).all();
  for (const c of rows) {
    q('INSERT INTO events(couple_id, event_type, event_date, start_time, city, venue, package, package_detail, price) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(c.id, c.event_type, c.event_date, c.start_time, c.city, c.venue, c.package, c.package_detail, c.total_amount || 0);
    const paid = c.paid_full ? c.total_amount : c.deposit;
    if (paid > 0) q("INSERT INTO payments(couple_id, amount, paid_on, note) VALUES(?, ?, date('now'), 'Kapora')").run(c.id, paid);
  }
})();

// Teslim tarihi çekimden sonra sayılır: elle girilmemişse (ya da eski kayıtta çekimden önceye düşüyorsa)
// son çekim tarihi + varsayılan teslim süresi. due_manual = elle girilen değer (formda yalnızca o gösterilir).
function withDue(r) {
  if (!r) return r;
  let days = 45;
  try { days = Number(require('./content').getContent().appointments?.defaultDeliveryDays) || 45; } catch { /* varsayılan */ }
  const plus = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  r.due_manual = r.due_date || null;
  const invalid = r.due_date && r.event_date && r.due_date <= r.event_date;
  if (!r.due_date || invalid) { r.due_date = r.event_date ? plus(r.event_date, days) : null; r.due_auto = Boolean(r.due_date); }
  return r;
}

// Boyutu bilinmeyen fotoğrafların önizleme boyutu dosyadan okunup kaydedilir (eski yüklemeler için bir kez)
function withDims(rows) {
  const missing = rows.filter((p) => !p.w);
  if (missing.length) {
    const media = require('./media');
    const upd = q('UPDATE photos SET w = ?, h = ? WHERE id = ?');
    for (const p of missing) {
      const d = media.thumbSize(p.couple_id, p.file_key);
      if (d && d.w && d.h) { p.w = d.w; p.h = d.h; upd.run(d.w, d.h, p.id); }
    }
  }
  return rows;
}

// Kart özeti: etkinlik sayısı, toplam tutar, ödenen, sıradaki etkinlik
const CARD_SQL = `
  SELECT c.*,
    (SELECT COUNT(*) FROM photos p WHERE p.couple_id = c.id) AS photo_count,
    (SELECT COUNT(*) FROM favorites f WHERE f.couple_id = c.id) AS fav_count,
    (SELECT COUNT(*) FROM events e WHERE e.couple_id = c.id) AS event_count,
    (SELECT COALESCE(SUM(price), 0) FROM events e WHERE e.couple_id = c.id) AS gross,
    MAX((SELECT COALESCE(SUM(price), 0) FROM events e WHERE e.couple_id = c.id) - COALESCE(c.discount, 0), 0) AS total,
    (SELECT COALESCE(SUM(amount), 0) FROM payments y WHERE y.couple_id = c.id) AS paid,
    (SELECT group_concat(event_type, ', ') FROM (SELECT event_type FROM events e WHERE e.couple_id = c.id AND event_type <> '' ORDER BY event_date)) AS types,
    (SELECT MIN(event_date) FROM events e WHERE e.couple_id = c.id AND event_date >= date('now', '+3 hours')) AS next_date,
    (SELECT CASE WHEN k.signed_at IS NOT NULL THEN 'imzali' ELSE 'bekliyor' END FROM contracts k WHERE k.couple_id = c.id AND k.cancelled_at IS NULL ORDER BY k.id DESC LIMIT 1) AS contract_status
  FROM couples c`;

module.exports = {
  db,

  // ── Ayarlar ──
  getSetting: (key) => q('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null,
  setSetting: (key, value) =>
    q('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value),

  // ── Admin ──
  countAdmins: () => q('SELECT COUNT(*) AS n FROM admins').get().n,
  getAdminByUsername: (u) => q('SELECT * FROM admins WHERE username = ?').get(u),
  findAdminLogin: (u) => q("SELECT * FROM admins WHERE lower(username) = lower(?) AND username <> 'demo'").get(u),
  getAdmin: (id) => q('SELECT id, username FROM admins WHERE id = ?').get(id),
  upsertAdmin: (username, hash) =>
    q('INSERT INTO admins(username, password_hash) VALUES(?, ?) ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash').run(username, hash),
  setAdminPassword: (id, hash) => q('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, id),

  // ── Çiftler ──
  listCouples: () => q(`${CARD_SQL} ORDER BY c.created_at DESC, c.id DESC`).all().map(withDue),
  getCoupleCard: (id) => withDue(q(`${CARD_SQL} WHERE c.id = ?`).get(id)),
  getCouple: (id) => withDue(q('SELECT * FROM couples WHERE id = ?').get(id)),
  getCoupleByCode: (code) => withDue(q('SELECT * FROM couples WHERE access_code = ?').get(code)),
  createCouple: ({ name, accessCode, hash, eventDate }) =>
    Number(q('INSERT INTO couples(name, access_code, password_hash, event_date) VALUES(?, ?, ?, ?)')
      .run(name, accessCode, hash, eventDate || null).lastInsertRowid),
  updateCouple: (id, { name, eventDate, dueDate, albumLimit }) =>
    q('UPDATE couples SET name = ?, event_date = ?, due_date = ?, album_limit = ? WHERE id = ?').run(name, eventDate || null, dueDate || null, albumLimit, id),
  setCoupleDue: (id, dueDate) => q('UPDATE couples SET due_date = ? WHERE id = ?').run(dueDate || null, id),
  setAlbum: (id, { limit, locked }) => q('UPDATE couples SET album_limit = ?, album_locked = ? WHERE id = ?').run(limit, locked ? 1 : 0, id),
  setAlbumLocked: (id, locked) => q('UPDATE couples SET album_locked = ? WHERE id = ?').run(locked ? 1 : 0, id),
  setPlan: (id, plan) => q('UPDATE couples SET plan_json = ? WHERE id = ?').run(JSON.stringify(plan), id),
  favoriteCount: (coupleId) => q('SELECT COUNT(*) AS n FROM favorites WHERE couple_id = ?').get(coupleId).n,
  setCouplePassword: (id, hash) => q('UPDATE couples SET password_hash = ? WHERE id = ?').run(hash, id),
  setCoupleStage: (id, stage, note) => q("UPDATE couples SET stage_changed_at = CASE WHEN stage <> ? THEN date('now') ELSE stage_changed_at END, stage = ?, stage_note = ? WHERE id = ?").run(stage, stage, note, id),
  setCoupleContact: (id, phone, optin) => q('UPDATE couples SET phone = ?, wa_optin = ? WHERE id = ?').run(phone || null, optin ? 1 : 0, id),
  getCoupleByPhone: (phone) => q('SELECT * FROM couples WHERE phone = ? ORDER BY id DESC LIMIT 1').get(phone),
  // Randevu kartı: otomatik numara (HM4-2026-001) ve tüm alanların güncellenmesi
  nextRefNo: (year) => {
    const prefix = `HM4-${year}-`;
    const last = q("SELECT ref_no FROM couples WHERE ref_no LIKE ? ORDER BY ref_no DESC LIMIT 1").get(`${prefix}%`)?.ref_no;
    const n = last ? Number(last.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(n).padStart(3, '0')}`;
  },
  setRefNo: (id, ref) => q('UPDATE couples SET ref_no = ? WHERE id = ?').run(ref, id),
  updateAppointment: (id, a) => q(`UPDATE couples SET name = ?, full_name = ?, partner_name = ?, phone = ?, source = ?,
      event_type = ?, event_date = ?, start_time = ?, city = ?, venue = ?, due_date = ?,
      package = ?, package_detail = ?, total_amount = ?, deposit = ?, paid_full = ?,
      photo_ready = ?, video_ready = ?, album_ready = ?, album_limit = ?, wa_optin = ?, notes = ? WHERE id = ?`)
    .run(a.name, a.fullName, a.partnerName, a.phone || null, a.source, a.eventType, a.eventDate || null, a.startTime, a.city, a.venue,
      a.dueDate || null, a.package, a.packageDetail, a.total, a.deposit, a.paidFull ? 1 : 0,
      a.photoReady ? 1 : 0, a.videoReady ? 1 : 0, a.albumReady ? 1 : 0, a.albumLimit, a.waOptin ? 1 : 0, a.notes, id),
  updateCard: (id, a) => q(`UPDATE couples SET name = ?, full_name = ?, partner_name = ?, phone = ?, source = ?, due_date = ?,
      photo_ready = ?, video_ready = ?, album_ready = ?, album_limit = ?, wa_optin = ?, notes = ? WHERE id = ?`)
    .run(a.name, a.fullName, a.partnerName, a.phone || null, a.source, a.dueDate || null,
      a.photoReady ? 1 : 0, a.videoReady ? 1 : 0, a.albumReady ? 1 : 0, a.albumLimit, a.waOptin ? 1 : 0, a.notes, id),
  // Çiftin ana tarihi = son etkinlik (teslim ve hatırlatmalar buna göre)
  setDiscount: (id, amount) => q('UPDATE couples SET discount = ? WHERE id = ?').run(Math.max(Math.round(Number(amount) || 0), 0), id),
  syncCoupleDate: (id) => q('UPDATE couples SET event_date = (SELECT MAX(event_date) FROM events WHERE couple_id = ?) WHERE id = ?').run(id, id),

  // ── Etkinlikler (bir çiftin birden çok tarihi) ──
  listEvents: (coupleId) => q("SELECT * FROM events WHERE couple_id = ? ORDER BY COALESCE(event_date, '9999'), start_time, id").all(coupleId),
  getEvent: (id) => q('SELECT * FROM events WHERE id = ?').get(id),
  eventsBetween: (from, to) => q(`SELECT e.*, c.name AS couple_name, c.stage AS couple_stage, c.phone AS couple_phone FROM events e JOIN couples c ON c.id = e.couple_id
    WHERE e.event_date BETWEEN ? AND ? ORDER BY e.event_date, e.start_time, e.id`).all(from, to),
  eventsOn: (date, exceptCoupleId) => q(`SELECT e.*, c.name AS couple_name FROM events e JOIN couples c ON c.id = e.couple_id
    WHERE e.event_date = ? AND e.couple_id <> ? ORDER BY e.start_time`).all(date, exceptCoupleId || 0),
  allEvents: () => q(`SELECT e.*, c.name AS couple_name, c.source AS couple_source FROM events e JOIN couples c ON c.id = e.couple_id ORDER BY e.event_date`).all(),
  addEvent: (coupleId, e) => Number(q(`INSERT INTO events(couple_id, event_type, event_date, start_time, city, venue, package, package_detail, price, team)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(coupleId, e.eventType, e.eventDate || null, e.startTime, e.city, e.venue, e.package, e.packageDetail, e.price, e.team).lastInsertRowid),
  updateEvent: (id, e) => q(`UPDATE events SET event_type = ?, event_date = ?, start_time = ?, city = ?, venue = ?, package = ?, package_detail = ?, price = ?, team = ? WHERE id = ?`)
    .run(e.eventType, e.eventDate || null, e.startTime, e.city, e.venue, e.package, e.packageDetail, e.price, e.team, id),
  // ── Ekip ──
  listTeam: () => q(`SELECT t.*, (SELECT COUNT(*) FROM event_team x JOIN events e ON e.id = x.event_id WHERE x.member_id = t.id AND e.event_date >= date('now', '+3 hours')) AS upcoming
    FROM team t ORDER BY t.active DESC, t.name`).all(),
  getMember: (id) => q('SELECT * FROM team WHERE id = ?').get(id),
  addMember: (m) => Number(q('INSERT INTO team(name, role, phone, notes, active, wa_optin) VALUES(?, ?, ?, ?, ?, ?)').run(m.name, m.role, m.phone || null, m.notes, m.active ? 1 : 0, m.waOptin ? 1 : 0).lastInsertRowid),
  updateMember: (id, m) => q('UPDATE team SET name = ?, role = ?, phone = ?, notes = ?, active = ?, wa_optin = ? WHERE id = ?').run(m.name, m.role, m.phone || null, m.notes, m.active ? 1 : 0, m.waOptin ? 1 : 0, id),
  deleteMember: (id) => q('DELETE FROM team WHERE id = ?').run(id),
  memberEvents: (memberId) => q(`SELECT e.*, c.name AS couple_name FROM event_team x JOIN events e ON e.id = x.event_id JOIN couples c ON c.id = e.couple_id
    WHERE x.member_id = ? ORDER BY e.event_date DESC LIMIT 30`).all(memberId),
  eventMemberIds: (eventId) => q('SELECT member_id FROM event_team WHERE event_id = ?').all(eventId).map((r) => r.member_id),
  eventMembers: (eventId) => q('SELECT t.* FROM event_team x JOIN team t ON t.id = x.member_id WHERE x.event_id = ? ORDER BY t.name').all(eventId),
  // Etkinliğin ekibini ayarlar; yeni eklenen kişilerin kimliklerini döndürür (onlara görev mesajı gider)
  setEventTeam: (eventId, ids) => {
    const before = new Set(q('SELECT member_id FROM event_team WHERE event_id = ?').all(eventId).map((r) => r.member_id));
    const valid = new Set(q('SELECT id FROM team').all().map((r) => r.id));
    const want = [...new Set(ids)].filter((id) => valid.has(id));
    q('DELETE FROM event_team WHERE event_id = ?').run(eventId);
    for (const id of want) q('INSERT INTO event_team(event_id, member_id) VALUES(?, ?)').run(eventId, id);
    const names = want.length ? q(`SELECT group_concat(name, ', ') AS n FROM (SELECT name FROM team WHERE id IN (${want.map(() => '?').join(',')}) ORDER BY name)`).get(...want).n : '';
    q('UPDATE events SET team = ? WHERE id = ?').run(names || '', eventId);
    return want.filter((id) => !before.has(id));
  },
  // ── Paketler ──
  listPackages: () => q(`SELECT p.*, (SELECT COUNT(*) FROM events e WHERE e.package = p.name) AS used FROM packages p ORDER BY p.active DESC, p.event_type, p.price, p.name`).all(),
  getPackage: (id) => q('SELECT * FROM packages WHERE id = ?').get(id),
  addPackage: (x) => Number(q('INSERT INTO packages(name, price, detail, event_type, active) VALUES(?, ?, ?, ?, ?)').run(x.name, x.price, x.detail, x.eventType, x.active ? 1 : 0).lastInsertRowid),
  updatePackage: (id, x) => q('UPDATE packages SET name = ?, price = ?, detail = ?, event_type = ?, active = ? WHERE id = ?').run(x.name, x.price, x.detail, x.eventType, x.active ? 1 : 0, id),
  deletePackage: (id) => q('DELETE FROM packages WHERE id = ?').run(id),
  packageNames: () => q("SELECT package, COUNT(*) AS n FROM events WHERE package <> '' GROUP BY package ORDER BY n DESC LIMIT 30").all().map((r) => r.package),
  teamNames: () => q("SELECT DISTINCT team FROM events WHERE team <> '' ORDER BY team").all().map((r) => r.team),
  deleteEvent: (id) => q('DELETE FROM events WHERE id = ?').run(id),

  // ── Ödemeler ──
  listPayments: (coupleId) => q('SELECT * FROM payments WHERE couple_id = ? ORDER BY paid_on, id').all(coupleId),
  allPayments: () => q('SELECT * FROM payments ORDER BY paid_on').all(),
  addPayment: (coupleId, p) => Number(q('INSERT INTO payments(couple_id, amount, paid_on, method, note) VALUES(?, ?, ?, ?, ?)')
    .run(coupleId, p.amount, p.paidOn, p.method || '', p.note || '').lastInsertRowid),
  getPayment: (id) => q('SELECT * FROM payments WHERE id = ?').get(id),
  deletePayment: (id) => q('DELETE FROM payments WHERE id = ?').run(id),

  setVideoStatus: (id, v) => q('UPDATE couples SET video_status = ? WHERE id = ?').run(v, id),
  listVideos: (coupleId) => q("SELECT * FROM videos WHERE couple_id = ? ORDER BY CASE kind WHEN 'Reels' THEN 1 ELSE 0 END, id").all(coupleId),
  getVideo: (id) => q('SELECT * FROM videos WHERE id = ?').get(id),
  addVideo: (v) => Number(q('INSERT INTO videos(couple_id, title, kind, file_key, ext, size, link) VALUES(?, ?, ?, ?, ?, ?, ?)').run(v.coupleId, v.title, v.kind, v.fileKey || null, v.ext || null, v.size || 0, v.link || null).lastInsertRowid),
  deleteVideo: (id) => q('DELETE FROM videos WHERE id = ?').run(id),
  videoCount: (coupleId) => q('SELECT COUNT(*) AS n FROM videos WHERE couple_id = ?').get(coupleId).n,
  // Dosyaları temizlenmiş çift: seçim listesi ve sayı saklanır, fotoğraf/video kayıtları silinir
  archiveCoupleFiles: (id, { selection, photoCount, withVideos, onlySelection }) => {
    q("UPDATE couples SET archived_at = date('now'), archived_selection = ?, archived_photos = archived_photos + ? WHERE id = ?").run(selection, photoCount, id);
    q('DELETE FROM favorites WHERE couple_id = ?').run(id);
    if (onlySelection) q("DELETE FROM photos WHERE couple_id = ? AND kind = 'secim'").run(id);
    else q('DELETE FROM photos WHERE couple_id = ?').run(id);
    if (withVideos) q('DELETE FROM videos WHERE couple_id = ? AND file_key IS NOT NULL').run(id);
  },
  clampStages: (n) => q('UPDATE couples SET stage = ? WHERE stage > ?').run(n - 1, n - 1),
  markAlbumInfoSent: (id) => q("UPDATE couples SET album_info_sent_at = date('now') WHERE id = ?").run(id),
  deleteCouple: (id) => q('DELETE FROM couples WHERE id = ?').run(id),

  // ── Çift fotoğrafları ──
  // kind verilmezse çiftin bütün fotoğrafları; 'secim' veya 'duzenli' ile yalnızca o grup
  listPhotos: (coupleId, kind) => withDims(kind
    ? q(`SELECT p.*, EXISTS(SELECT 1 FROM favorites f WHERE f.photo_id = p.id) AS is_fav FROM photos p WHERE p.couple_id = ? AND p.kind = ? ORDER BY p.id`).all(coupleId, kind)
    : q(`SELECT p.*, EXISTS(SELECT 1 FROM favorites f WHERE f.photo_id = p.id) AS is_fav FROM photos p WHERE p.couple_id = ? ORDER BY p.id`).all(coupleId)),
  listFavoritePhotos: (coupleId) => withDims(q(`
    SELECT p.*, 1 AS is_fav FROM favorites f JOIN photos p ON p.id = f.photo_id
    WHERE f.couple_id = ? ORDER BY p.id`).all(coupleId)),
  getPhoto: (id) => q('SELECT * FROM photos WHERE id = ?').get(id),
  addPhoto: ({ coupleId, fileKey, originalName, originalExt, kind, uploadKey, w = null, h = null }) =>
    Number(q("INSERT INTO photos(couple_id, file_key, original_name, original_ext, uploaded_on, kind, upload_key, w, h) VALUES(?, ?, ?, ?, date('now'), ?, ?, ?, ?)")
      .run(coupleId, fileKey, originalName, originalExt || null, kind === 'duzenli' ? 'duzenli' : 'secim', uploadKey || null, w, h).lastInsertRowid),
  photoByUploadKey: (coupleId, uploadKey) => q('SELECT id FROM photos WHERE couple_id = ? AND upload_key = ?').get(coupleId, uploadKey),
  deletePhoto: (id) => q('DELETE FROM photos WHERE id = ?').run(id),

  // ── Favoriler ──
  setFavorite: (coupleId, photoId, on) => on
    ? q('INSERT OR IGNORE INTO favorites(couple_id, photo_id) VALUES(?, ?)').run(coupleId, photoId)
    : q('DELETE FROM favorites WHERE couple_id = ? AND photo_id = ?').run(coupleId, photoId),

  // ── Portfolyo ──
  listPortfolio: () => q('SELECT * FROM portfolio ORDER BY id DESC').all(),
  getPortfolioItem: (id) => q('SELECT * FROM portfolio WHERE id = ?').get(id),
  addPortfolioItem: ({ fileKey, category, alt }) =>
    Number(q('INSERT INTO portfolio(file_key, category, alt) VALUES(?, ?, ?)').run(fileKey, category, alt).lastInsertRowid),
  updatePortfolioItem: (id, { category, alt }) => q('UPDATE portfolio SET category = ?, alt = ? WHERE id = ?').run(category, alt, id),
  deletePortfolioItem: (id) => q('DELETE FROM portfolio WHERE id = ?').run(id),

  // ── Talepler (yeni müşteri adayları) ──
  setLeadGift: (id, code) => q('UPDATE leads SET gift_code = ? WHERE id = ?').run(code, id),
  addLead: (l) => Number(q("INSERT INTO leads(name, phone, event_date, place, service, message, source, wa_consent, kvkk_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? THEN datetime('now') END)")
    .run(l.name || '', l.phone || '', l.eventDate || null, l.place || '', l.service || '', l.message || '', l.source || 'site', l.waConsent ? 1 : 0, l.kvkk ? 1 : 0).lastInsertRowid),
  setLeadConsent: (id, waConsent) => q("UPDATE leads SET wa_consent = ?, kvkk_at = datetime('now') WHERE id = ?").run(waConsent ? 1 : 0, id),
  // KVKK: sonuçlanmayan ve 1 yıldır dokunulmamış talepler silinir
  // ── Albüm tasarım sayfaları ──
  listAlbumPages: (coupleId) => q('SELECT * FROM album_pages WHERE couple_id = ?').all(coupleId)
    .sort((a, b) => a.original_name.localeCompare(b.original_name, 'tr', { numeric: true }) || a.id - b.id),
  getAlbumPage: (id) => q('SELECT * FROM album_pages WHERE id = ?').get(id),
  albumPageByName: (coupleId, name) => q('SELECT * FROM album_pages WHERE couple_id = ? AND original_name = ?').get(coupleId, name),
  addAlbumPage: (coupleId, fileKey, name) => Number(q('INSERT INTO album_pages(couple_id, file_key, original_name) VALUES(?, ?, ?)').run(coupleId, fileKey, name).lastInsertRowid),
  // Revize sayfa: dosya değişir, inceleme sıfırlanır (çiftin önceki notu görünür kalır ki neyin düzeltildiği bilinsin)
  replaceAlbumPage: (id, fileKey) => q("UPDATE album_pages SET file_key = ?, status = 'bekliyor', version = version + 1, updated_at = datetime('now') WHERE id = ?").run(fileKey, id),
  reviewAlbumPage: (id, status, note) => q("UPDATE album_pages SET status = ?, note = ?, updated_at = datetime('now') WHERE id = ?").run(status, note, id),
  deleteAlbumPage: (id) => q('DELETE FROM album_pages WHERE id = ?').run(id),
  setAlbumDesign: (coupleId, state, bumpRound = false) => q(`UPDATE couples SET album_design_state = ?, album_design_at = datetime('now')${bumpRound ? ', album_design_round = album_design_round + 1' : ''} WHERE id = ?`).run(state, coupleId),

  // ── Teslim tutanakları ──
  // ── Hatırlatıcılar (stüdyonun kendi girdiği: "yarın 14:00 Ayşe ile görüşme") ──
  addReminder: (x) => Number(q('INSERT INTO reminders(title, due_date, due_time, person, phone, note, couple_id, lead_id) VALUES(?, ?, ?, ?, ?, ?, ?, ?)')
    .run(x.title, x.dueDate, x.dueTime || null, x.person || null, x.phone || null, x.note || null, x.coupleId || null, x.leadId || null).lastInsertRowid),
  updateReminder: (id, x) => q('UPDATE reminders SET title = ?, due_date = ?, due_time = ?, person = ?, phone = ?, note = ?, notified_at = NULL WHERE id = ?')
    .run(x.title, x.dueDate, x.dueTime || null, x.person || null, x.phone || null, x.note || null, id),
  getReminder: (id) => q('SELECT r.*, c.name AS couple_name FROM reminders r LEFT JOIN couples c ON c.id = r.couple_id WHERE r.id = ?').get(id),
  openReminders: () => q("SELECT r.*, c.name AS couple_name FROM reminders r LEFT JOIN couples c ON c.id = r.couple_id WHERE r.done_at IS NULL ORDER BY r.due_date, COALESCE(r.due_time, '99:99'), r.id").all(),
  doneReminder: (id) => q("UPDATE reminders SET done_at = datetime('now') WHERE id = ? AND done_at IS NULL").run(id).changes > 0,
  deleteReminder: (id) => q('DELETE FROM reminders WHERE id = ?').run(id),
  // Saati gelmiş (ya da saatsizse sabah 9'u geçmiş), henüz bildirilmemiş hatırlatıcılar
  remindersToNotify: (day, hm) => q("SELECT * FROM reminders WHERE done_at IS NULL AND notified_at IS NULL AND (due_date < ? OR (due_date = ? AND COALESCE(due_time, '09:00') <= ?))").all(day, day, hm),
  markReminderNotified: (id) => q("UPDATE reminders SET notified_at = datetime('now') WHERE id = ?").run(id),

  addDelivery: (x) => {
    const id = Number(q('INSERT INTO deliveries(couple_id, snapshot, signer_name, signature, ip, user_agent, hash) VALUES(?, ?, ?, ?, ?, ?, ?)')
      .run(x.coupleId, JSON.stringify(x.snapshot), x.signerName, x.signature, x.ip || null, x.userAgent || null, x.hash).lastInsertRowid);
    q("UPDATE couples SET delivered_at = datetime('now') WHERE id = ?").run(x.coupleId);
    return id;
  },
  listDeliveries: (coupleId) => q('SELECT id, couple_id, signer_name, created_at, snapshot FROM deliveries WHERE couple_id = ? ORDER BY id').all(coupleId),
  getDelivery: (id) => q('SELECT * FROM deliveries WHERE id = ?').get(id),

  // ── Hediye kuponları ──
  giftCodesFor: (coupleId) => q('SELECT g.*, u.name AS used_by FROM gift_codes g LEFT JOIN couples u ON u.id = g.used_couple_id WHERE g.couple_id = ? ORDER BY g.id').all(coupleId),
  giftByCode: (code) => q('SELECT g.*, c.name AS owner FROM gift_codes g JOIN couples c ON c.id = g.couple_id WHERE g.code = ?').get(code),
  addGiftCode: (coupleId, code, expiresOn) => q('INSERT INTO gift_codes(couple_id, code, expires_on) VALUES(?, ?, ?)').run(coupleId, code, expiresOn),
  useGiftCode: (id, leadId, coupleId) => q("UPDATE gift_codes SET used_at = datetime('now'), used_lead_id = COALESCE(?, used_lead_id), used_couple_id = ? WHERE id = ? AND used_couple_id IS NULL").run(leadId || null, coupleId, id).changes,
  markGiftLead: (id, leadId) => q('UPDATE gift_codes SET used_lead_id = ? WHERE id = ? AND used_couple_id IS NULL').run(leadId, id),
  giveGiftReward: (id) => q("UPDATE gift_codes SET reward_given_at = datetime('now') WHERE id = ?").run(id),
  giftUsedBy: (coupleId) => q('SELECT g.*, c.name AS owner FROM gift_codes g JOIN couples c ON c.id = g.couple_id WHERE g.used_couple_id = ?').get(coupleId),
  giftRewardsDue: () => q('SELECT g.*, c.name AS owner, u.name AS used_by FROM gift_codes g JOIN couples c ON c.id = g.couple_id JOIN couples u ON u.id = g.used_couple_id WHERE g.reward_given_at IS NULL').all(),
  giftStats: () => q('SELECT c.id, c.name, COUNT(g.id) AS total, SUM(g.used_couple_id IS NOT NULL) AS used FROM gift_codes g JOIN couples c ON c.id = g.couple_id GROUP BY c.id ORDER BY used DESC, c.name').all(),

  // ── Teklifler ──
  addQuote: (x) => Number(q(`INSERT INTO quotes(token, lead_id, name, phone, event_type, event_date, place, items_json, discount, deposit, note, valid_until)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(x.token, x.leadId || null, x.name, x.phone || '', x.eventType || '', x.eventDate || null, x.place || '', JSON.stringify(x.items || []), x.discount || 0, x.deposit || 0, x.note || '', x.validUntil || null).lastInsertRowid),
  updateQuote: (id, x) => q(`UPDATE quotes SET name = ?, phone = ?, event_type = ?, event_date = ?, place = ?, items_json = ?, discount = ?, deposit = ?, note = ?, valid_until = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(x.name, x.phone || '', x.eventType || '', x.eventDate || null, x.place || '', JSON.stringify(x.items || []), x.discount || 0, x.deposit || 0, x.note || '', x.validUntil || null, id),
  getQuote: (id) => q('SELECT * FROM quotes WHERE id = ?').get(id),
  quoteByToken: (token) => q('SELECT * FROM quotes WHERE token = ?').get(token),
  listQuotes: () => q('SELECT * FROM quotes ORDER BY id DESC LIMIT 300').all(),
  quotesForLeads: () => q('SELECT * FROM quotes WHERE lead_id IS NOT NULL ORDER BY id').all(),
  markQuoteViewed: (id) => q("UPDATE quotes SET viewed_at = datetime('now'), status = CASE WHEN status = 'hazir' THEN 'goruldu' ELSE status END WHERE id = ? AND viewed_at IS NULL").run(id).changes,
  acceptQuote: (id, name, phone) => q("UPDATE quotes SET status = 'kabul', accepted_at = datetime('now'), accepted_name = ?, accepted_phone = ? WHERE id = ? AND status <> 'kabul'").run(name, phone, id).changes,
  setQuoteCouple: (id, coupleId) => q('UPDATE quotes SET couple_id = ? WHERE id = ?').run(coupleId, id),
  deleteQuote: (id) => q('DELETE FROM quotes WHERE id = ?').run(id),

  purgeOldLeads: () => q("DELETE FROM leads WHERE couple_id IS NULL AND status IN ('yeni', 'gorusuldu', 'kayip') AND updated_at < datetime('now', '-1 year')").run().changes,
  setCoupleWaConsent: (id, on) => q("UPDATE couples SET wa_optin = ?, wa_consent_at = datetime('now') WHERE id = ?").run(on ? 1 : 0, id),
  updateLeadDetails: (id, l) => q("UPDATE leads SET name = COALESCE(NULLIF(?, ''), name), event_date = COALESCE(?, event_date), place = COALESCE(NULLIF(?, ''), place), service = COALESCE(NULLIF(?, ''), service), message = CASE WHEN ? = '' THEN message WHEN message = '' THEN ? ELSE message || char(10) || ? END, updated_at = datetime('now') WHERE id = ?")
    .run(l.name || '', l.eventDate || null, l.place || '', l.service || '', l.message || '', l.message || '', l.message || '', id),
  openLeadByPhone: (phone) => q("SELECT * FROM leads WHERE phone = ? AND status IN ('yeni', 'gorusuldu') ORDER BY id DESC LIMIT 1").get(phone),
  listLeads: () => q("SELECT * FROM leads ORDER BY CASE status WHEN 'yeni' THEN 0 WHEN 'gorusuldu' THEN 1 WHEN 'rezervasyon' THEN 2 ELSE 3 END, id DESC").all(),
  getLead: (id) => q('SELECT * FROM leads WHERE id = ?').get(id),
  setLeadStatus: (id, status, coupleId) => q("UPDATE leads SET status = ?, couple_id = COALESCE(?, couple_id), updated_at = datetime('now') WHERE id = ?").run(status, coupleId || null, id),
  deleteLead: (id) => q('DELETE FROM leads WHERE id = ?').run(id),
  countNewLeads: () => q("SELECT COUNT(*) AS n FROM leads WHERE status = 'yeni'").get().n,

  // ── Sözleşmeler (gönderilen metin dondurulur; imzalandıktan sonra değiştirilemez) ──
  activeContract: (coupleId) => q('SELECT * FROM contracts WHERE couple_id = ? AND cancelled_at IS NULL ORDER BY id DESC LIMIT 1').get(coupleId),
  getContract: (id) => q('SELECT * FROM contracts WHERE id = ?').get(id),
  createContract: (coupleId, snapshot) => {
    q("UPDATE contracts SET cancelled_at = datetime('now') WHERE couple_id = ? AND cancelled_at IS NULL AND signed_at IS NULL").run(coupleId);
    return Number(q('INSERT INTO contracts(couple_id, snapshot) VALUES(?, ?)').run(coupleId, snapshot).lastInsertRowid);
  },
  cancelContract: (id) => q("UPDATE contracts SET cancelled_at = datetime('now') WHERE id = ?").run(id),
  signContract: (id, f) => q(`UPDATE contracts SET signed_at = ?, signer_name = ?, signer_tc = ?, signer_address = ?, consent = ?, signature = ?, ip = ?, user_agent = ?, hash = ?
    WHERE id = ? AND signed_at IS NULL AND cancelled_at IS NULL`).run(f.signedAt, f.ad, f.tc, f.adres, f.izin, f.imza, f.ip, f.ua, f.hash, id).changes,

  // ── Telefon bildirimi abonelikleri ──
  addPushSub: (s) => q(`INSERT INTO push_subs(endpoint, kind, user_id, p256dh, auth, device) VALUES(?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET kind = excluded.kind, user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device`).run(s.endpoint, s.kind, s.userId, s.p256dh, s.auth, s.device || ''),
  deleteOwnPushSub: (endpoint, kind, userId) => q('DELETE FROM push_subs WHERE endpoint = ? AND kind = ? AND user_id = ?').run(endpoint, kind, userId),
  deletePushSub: (endpoint) => q('DELETE FROM push_subs WHERE endpoint = ?').run(endpoint),
  listPushSubs: (kind, userId) => (kind === 'admin' ? q("SELECT * FROM push_subs WHERE kind = 'admin'").all() : q('SELECT * FROM push_subs WHERE kind = ? AND user_id = ?').all(kind, userId)),
  // ── Gönderilen bildirimler (aynı mesaj iki kez gitmesin) ──
  wasNotified: (key) => Boolean(q('SELECT 1 FROM notifications WHERE key = ?').get(key)),
  markNotified: (key) => q('INSERT OR IGNORE INTO notifications(key) VALUES(?)').run(key),
  notifiedSince: (key, isoDateTime) => Boolean(q('SELECT 1 FROM notifications WHERE key = ? AND sent_at >= ?').get(key, isoDateTime)),
  touchNotified: (key) => q("INSERT INTO notifications(key, sent_at) VALUES(?, datetime('now')) ON CONFLICT(key) DO UPDATE SET sent_at = datetime('now')").run(key),
  lastUploadDay: (coupleId) => q('SELECT MAX(uploaded_on) AS d FROM photos WHERE couple_id = ?').get(coupleId).d,

  // ── Görüşler ──
  addFeedback: ({ name, role, area, rating, message, device }) =>
    q('INSERT INTO feedback(name, role, area, rating, message, device) VALUES(?, ?, ?, ?, ?, ?)')
      .run(name, role, area, rating, message, device),
  listFeedback: () => q('SELECT * FROM feedback ORDER BY id DESC').all(),
  deleteFeedback: (id) => q('DELETE FROM feedback WHERE id = ?').run(id),

  // ── Demo sıfırlama: görüşler ve gerçek admin hesapları korunur ──
  resetDemoData: () => db.exec(`
    DELETE FROM contracts; DELETE FROM push_subs WHERE kind = 'couple'; DELETE FROM favorites; DELETE FROM photos; DELETE FROM videos; DELETE FROM event_team; DELETE FROM team; DELETE FROM packages; DELETE FROM events; DELETE FROM payments; DELETE FROM couples; DELETE FROM portfolio; DELETE FROM leads; DELETE FROM notifications;
    DELETE FROM settings WHERE key = 'hero_portfolio_id';
    DELETE FROM sessions WHERE kind = 'couple';
    DELETE FROM sessions WHERE kind = 'admin' AND user_id IN (SELECT id FROM admins WHERE username = 'demo');
  `),

  // ── Oturumlar ──
  createSession: (idHash, kind, userId, csrf, expiresAt) =>
    q('INSERT INTO sessions(id_hash, kind, user_id, csrf, expires_at) VALUES(?, ?, ?, ?, ?)').run(idHash, kind, userId, csrf, expiresAt),
  getSession: (idHash) => q('SELECT * FROM sessions WHERE id_hash = ? AND expires_at > ?').get(idHash, Date.now()),
  deleteSession: (idHash) => q('DELETE FROM sessions WHERE id_hash = ?').run(idHash),
  deleteSessionsFor: (kind, userId) => q('DELETE FROM sessions WHERE kind = ? AND user_id = ?').run(kind, userId),
  purgeSessions: () => q('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now()),
};
