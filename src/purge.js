'use strict';
// İndirme sonrası orijinal temizliği: çift fotoğrafları toplu indirince kaydı tutulur, çifte "orijinaller şu gün silinecek"
// bildirimi gider; gün gelince o tarihe kadar yüklenmiş fotoğrafların orijinal dosyaları silinir (küçük haller kalır).
// Albüm çalışması sürüyorsa (seçim var, tasarım onaylanmadı) düzenlenmiş orijinaller baskıya lazım olacağı için beklenir.
const fs = require('node:fs');
const path = require('node:path');
const { db } = require('./db');
const dbx = require('./db');
const media = require('./media');
const push = require('./push');
const { getContent } = require('./content');
const { today, addDays } = require('./jobs');

const q = (sql) => db.prepare(sql);
const KINDS = { secim: 'Seçim fotoğrafları', duzenli: 'Düzenlenmiş fotoğraflar' };

// Ayar: indirmeden kaç gün sonra (0 = kapalı)
const purgeDays = () => { const n = Number(getContent().delivery?.purgeDays); return Number.isFinite(n) ? Math.max(0, Math.min(365, Math.round(n))) : 10; };
const nowIso = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const trDay = (iso) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }) : '');

const rows = (coupleId) => q('SELECT * FROM orig_purge WHERE couple_id = ?').all(coupleId);
const row = (coupleId, kind) => q('SELECT * FROM orig_purge WHERE couple_id = ? AND kind = ?').get(coupleId, kind);
const hasOriginals = (coupleId, kind, before) => Boolean(q(`SELECT 1 FROM photos WHERE couple_id = ? AND kind = ? AND original_ext IS NOT NULL${before ? ' AND created_at <= ?' : ''} LIMIT 1`).get(...[coupleId, kind, ...(before ? [before] : [])]));

// Çift toplu indirdi: ilk indirmede (ya da temizlikten sonra yeni orijinaller yüklendiyse) süre başlar
function markDownload(couple, kind) {
  if (!KINDS[kind]) return null;
  const r = row(couple.id, kind);
  if (r && !r.done_at) return r;
  if (r && r.done_at && !hasOriginals(couple.id, kind, null)) return r;
  const days = purgeDays();
  const due = days ? addDays(today(), days) : null;
  q(`INSERT INTO orig_purge(couple_id, kind, downloaded_at, due_on, done_at, freed) VALUES(?, ?, ?, ?, NULL, 0)
     ON CONFLICT(couple_id, kind) DO UPDATE SET downloaded_at = excluded.downloaded_at, due_on = excluded.due_on, done_at = NULL, freed = 0`).run(couple.id, kind, nowIso(), due);
  const label = kind === 'duzenli' ? 'Fotoğraflarınız' : 'Seçim fotoğraflarınız';
  push.toCouple(couple.id, {
    title: `${label} indirildi`,
    body: due ? `Orijinal boyuttaki dosyalar ${trDay(due)} tarihinde sunucudan silinecek; panelde küçük halleri kalır. İndirmeyi tamamladığınızdan emin olun.` : 'İndirdiğiniz için teşekkürler.',
    url: '/panel/fotograflar', tag: `indirme-${kind}`,
  }).catch(() => {});
  push.toAdmin({ title: `${couple.name} fotoğrafları indirdi`, body: `${KINDS[kind]} toplu indirildi.${due ? ` Orijinaller ${trDay(due)} tarihinde silinecek.` : ''}`, url: `/admin/ciftler/${couple.id}` }).catch(() => {});
  return row(couple.id, kind);
}

function markVideo(couple) {
  if (couple.dl_video_at) return;
  q('UPDATE couples SET dl_video_at = ? WHERE id = ?').run(nowIso(), couple.id);
  push.toAdmin({ title: `${couple.name} videoyu indirdi`, body: 'Çift teslim videosunu indirdi.', url: `/admin/ciftler/${couple.id}` }).catch(() => {});
}

// Albüm çalışması sürüyor mu? (seçim yapılmış, tasarım onaylanmamış)
const albumInProgress = (c) => dbx.favoriteCount(c.id) > 0 && c.album_design_state !== 'onaylandi';

// Süresi gelenleri temizle (saatlik)
function run() {
  const due = q('SELECT * FROM orig_purge WHERE done_at IS NULL AND due_on IS NOT NULL AND due_on <= ?').all(today());
  for (const r of due) {
    const c = dbx.getCouple(r.couple_id);
    if (!c) continue;
    if (r.kind === 'duzenli' && albumInProgress(c)) continue; // baskıdan sonra
    let freed = 0;
    const list = q('SELECT id, file_key, original_ext FROM photos WHERE couple_id = ? AND kind = ? AND original_ext IS NOT NULL AND created_at <= ?').all(c.id, r.kind, r.downloaded_at);
    for (const p of list) {
      const f = path.join(media.coupleDir(c.id, p.file_key), `original.${p.original_ext}`);
      try { freed += fs.statSync(f).size; fs.rmSync(f, { force: true }); } catch { /* zaten yok */ }
      q('UPDATE photos SET original_ext = NULL WHERE id = ?').run(p.id);
    }
    q('UPDATE orig_purge SET done_at = ?, freed = ? WHERE couple_id = ? AND kind = ?').run(nowIso(), freed, c.id, r.kind);
  }
}

// Panelde gösterilecek durum
function statusFor(couple) {
  const out = {};
  for (const r of rows(couple.id)) {
    const waiting = !r.done_at && r.kind === 'duzenli' && r.due_on && r.due_on <= today() && albumInProgress(couple);
    out[r.kind] = { ...r, label: KINDS[r.kind], dueText: trDay(r.due_on), waiting };
  }
  return out;
}

module.exports = { markDownload, markVideo, run, statusFor, purgeDays, trDay };
