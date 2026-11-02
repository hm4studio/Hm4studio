'use strict';
// İş takibi yardımcıları: teslim durumu ve çekim günü planı alanları.

// Bugünün tarihi Türkiye saatine göre (YYYY-AA-GG)
function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function daysBetween(fromIso, toIso) {
  return Math.round((new Date(`${toIso}T12:00:00Z`) - new Date(`${fromIso}T12:00:00Z`)) / 864e5);
}

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// [anahtar, etiket]: upcoming | done | late | soon | ok
function jobStatus(couple, stages) {
  const t = today();
  if (couple.event_date && couple.event_date > t) return ['upcoming', 'Çekim bekleniyor'];
  if (couple.stage >= stages.length - 1) return ['done', 'Teslim edildi'];
  if (couple.due_date && couple.due_date < t) return ['late', 'Gecikti'];
  if (couple.due_date && daysBetween(t, couple.due_date) <= 7) return ['soon', 'Bu hafta teslim'];
  return ['ok', 'Yolunda'];
}

// Çiftin doldurduğu çekim günü planı
const PLAN_FIELDS = [
  { key: 'prep', label: 'Hazırlık yeri (gelin / damat evi)', short: 'Hazırlık', placeholder: 'Adres', max: 300 },
  { key: 'venue', label: 'Düğün / kına mekânı', short: 'Mekân', placeholder: 'Mekân adı ve adresi', max: 300 },
  { key: 'outdoor', label: 'Dış çekim yeri', short: 'Dış çekim', placeholder: 'Örn. göl kıyısı, gün batımı', max: 300 },
  { key: 'song', label: 'Klip için şarkı tercihi', short: 'Klip şarkısı', placeholder: 'Şarkı adı veya tarz', max: 300 },
  { key: 'flow', label: 'Günün akışı (saat saat)', short: 'Günün akışı', placeholder: '13:00  Gelin hazırlığı\n15:30  Dış çekim\n19:00  Salon girişi', max: 2000, area: true },
  { key: 'people', label: 'Önemli kişiler', short: 'Önemli kişiler', placeholder: 'Karelerde mutlaka olmasını istediğiniz kişiler', max: 1000, area: true },
  { key: 'notes', label: 'Ek notlar', short: 'Notlar', placeholder: 'Bilmemiz gereken başka bir şey var mı?', max: 2000, area: true },
];

function parsePlan(couple) {
  try { return JSON.parse(couple.plan_json || '{}') || {}; } catch { return {}; }
}

module.exports = { today, daysBetween, addDays, jobStatus, PLAN_FIELDS, parsePlan };
