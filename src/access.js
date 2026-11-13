'use strict';
// İndirme izni: kalan ödemesi olan çift fotoğraf/video indiremez (çifte ödeme mesajı gösterilmez; düğmeler görünmez).
// Yönetici çiftin sayfasından "İndirmeyi aç" ile istisna tanıyabilir. Fiyat girilmemişse indirme açıktır.
const db = require('./db');

function downloadState(coupleOrId) {
  const id = typeof coupleOrId === 'object' ? coupleOrId.id : coupleOrId;
  const c = typeof coupleOrId === 'object' && 'dl_override' in coupleOrId ? coupleOrId : db.getCouple(id);
  const card = db.getCoupleCard(id) || {};
  const remaining = Math.max(0, Number(card.total || 0) - Number(card.paid || 0));
  const override = Boolean(c && c.dl_override);
  return { ok: override || remaining <= 0, remaining, override };
}
const canDownload = (c) => downloadState(c).ok;

module.exports = { downloadState, canDownload };
