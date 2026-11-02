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
addColumn('couples', 'album_limit', 'INTEGER NOT NULL DEFAULT 60');
addColumn('couples', 'album_locked', 'INTEGER NOT NULL DEFAULT 0');
addColumn('couples', 'plan_json', "TEXT NOT NULL DEFAULT '{}'");

const q = (sql) => db.prepare(sql);

module.exports = {
  db,

  // ── Ayarlar ──
  getSetting: (key) => q('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null,
  setSetting: (key, value) =>
    q('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value),

  // ── Admin ──
  countAdmins: () => q('SELECT COUNT(*) AS n FROM admins').get().n,
  getAdminByUsername: (u) => q('SELECT * FROM admins WHERE username = ?').get(u),
  getAdmin: (id) => q('SELECT id, username FROM admins WHERE id = ?').get(id),
  upsertAdmin: (username, hash) =>
    q('INSERT INTO admins(username, password_hash) VALUES(?, ?) ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash').run(username, hash),
  setAdminPassword: (id, hash) => q('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, id),

  // ── Çiftler ──
  listCouples: () => q(`
    SELECT c.*,
      (SELECT COUNT(*) FROM photos p WHERE p.couple_id = c.id) AS photo_count,
      (SELECT COUNT(*) FROM favorites f WHERE f.couple_id = c.id) AS fav_count
    FROM couples c ORDER BY c.created_at DESC, c.id DESC`).all(),
  getCouple: (id) => q('SELECT * FROM couples WHERE id = ?').get(id),
  getCoupleByCode: (code) => q('SELECT * FROM couples WHERE access_code = ?').get(code),
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
  setCoupleStage: (id, stage, note) => q('UPDATE couples SET stage = ?, stage_note = ? WHERE id = ?').run(stage, note, id),
  deleteCouple: (id) => q('DELETE FROM couples WHERE id = ?').run(id),

  // ── Çift fotoğrafları ──
  listPhotos: (coupleId) => q(`
    SELECT p.*, EXISTS(SELECT 1 FROM favorites f WHERE f.photo_id = p.id) AS is_fav
    FROM photos p WHERE p.couple_id = ? ORDER BY p.id`).all(coupleId),
  listFavoritePhotos: (coupleId) => q(`
    SELECT p.*, 1 AS is_fav FROM favorites f JOIN photos p ON p.id = f.photo_id
    WHERE f.couple_id = ? ORDER BY p.id`).all(coupleId),
  getPhoto: (id) => q('SELECT * FROM photos WHERE id = ?').get(id),
  addPhoto: ({ coupleId, fileKey, originalName, originalExt }) =>
    Number(q('INSERT INTO photos(couple_id, file_key, original_name, original_ext) VALUES(?, ?, ?, ?)')
      .run(coupleId, fileKey, originalName, originalExt || null).lastInsertRowid),
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

  // ── Görüşler ──
  addFeedback: ({ name, role, area, rating, message, device }) =>
    q('INSERT INTO feedback(name, role, area, rating, message, device) VALUES(?, ?, ?, ?, ?, ?)')
      .run(name, role, area, rating, message, device),
  listFeedback: () => q('SELECT * FROM feedback ORDER BY id DESC').all(),
  deleteFeedback: (id) => q('DELETE FROM feedback WHERE id = ?').run(id),

  // ── Demo sıfırlama: görüşler ve gerçek admin hesapları korunur ──
  resetDemoData: () => db.exec(`
    DELETE FROM favorites; DELETE FROM photos; DELETE FROM couples; DELETE FROM portfolio;
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
