'use strict';
// Personel hakedişi: çekim günü geçen her görev için kişinin ücreti (etkinliğe özel ücret ya da çekim türü ücreti).
// Bakiye = hakediş − yapılan ödemeler. Gelecekteki görevler "planlanan" olarak ayrıca gösterilir.
const db = require('./db');
const { today } = require('./jobs');

const typeOf = (t, types) => (types.includes(t) ? t : 'Diğer');

/** Bir görevin ücreti: etkinliğe özel ücret > kişinin o tür ücreti > kişinin "Diğer" ücreti > 0 */
function feeOf(a, rates, types) {
  if (a.fee !== null && a.fee !== undefined) return a.fee;
  const r = rates[a.member_id] || {};
  const t = typeOf(a.event_type, types);
  return r[t] ?? r['Diğer'] ?? 0;
}

function ratesByMember() {
  const out = {};
  for (const r of db.allRates()) (out[r.member_id] ||= {})[r.event_type] = r.amount;
  return out;
}

/** Bir kişinin hesabı: hakediş satırları, ödemeler, toplamlar */
function account(memberId, types) {
  const t = today();
  const rates = ratesByMember();
  const rows = [
    ...db.staffAssignments(memberId).map((a) => ({ ...a, amount: feeOf(a, rates, types), custom: a.fee !== null && a.fee !== undefined, rate: (rates[memberId] || {})[typeOf(a.event_type, types)] ?? (rates[memberId] || {})['Diğer'] ?? 0, done: a.event_date < t })),
    ...db.archivedAssignments(memberId).map((a) => ({ ...a, custom: false, rate: a.amount, done: true })),
  ];
  const payments = db.staffPayments(memberId);
  const earned = rows.filter((r) => r.done).reduce((s, r) => s + r.amount, 0);
  const planned = rows.filter((r) => !r.done).reduce((s, r) => s + r.amount, 0);
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  return { rows, payments, earned, planned, paid, balance: earned - paid, missingRate: rows.some((r) => !r.amount && !r.custom) };
}

/** Herkes için özet + rapor verisi (yıl) */
function overview(types, year) {
  const t = today();
  const rates = ratesByMember();
  const team = db.listTeam();
  const all = [
    ...db.staffAssignments().map((a) => ({ ...a, amount: feeOf(a, rates, types), done: a.event_date < t })),
    ...db.archivedAssignments().map((a) => ({ ...a, done: true })),
  ];
  const pays = db.staffPayments();
  const y = String(year);
  const people = team.map((m) => {
    const mine = all.filter((a) => a.member_id === m.id);
    const earned = mine.filter((a) => a.done).reduce((s, a) => s + a.amount, 0);
    const paid = pays.filter((p) => p.member_id === m.id).reduce((s, p) => s + p.amount, 0);
    const yearRows = mine.filter((a) => a.done && a.event_date.startsWith(y));
    return { id: m.id, name: m.name, role: m.role, active: m.active, earned, paid, balance: earned - paid,
      yearAmount: yearRows.reduce((s, a) => s + a.amount, 0), yearCount: yearRows.length,
      noRates: !Object.keys(rates[m.id] || {}).length };
  });
  const yearRows = all.filter((a) => a.done && a.event_date.startsWith(y));
  const months = Array.from({ length: 12 }, (_, i) => {
    const key = `${y}-${String(i + 1).padStart(2, '0')}`;
    return yearRows.filter((a) => a.event_date.startsWith(key)).reduce((s, a) => s + a.amount, 0);
  });
  const byType = new Map();
  for (const a of yearRows) {
    const k = typeOf(a.event_type, types);
    const cur = byType.get(k) || { amount: 0, events: new Set() };
    cur.amount += a.amount; cur.events.add(a.event_id);
    byType.set(k, cur);
  }
  const shoots = new Set(yearRows.map((a) => a.event_id)).size;
  const total = yearRows.reduce((s, a) => s + a.amount, 0);
  return {
    people, months, total, shoots,
    byType: [...byType.entries()].map(([type, v]) => ({ type, amount: v.amount, count: v.events.size })).sort((a, b) => b.amount - a.amount),
    due: people.filter((p) => p.balance > 0).reduce((s, p) => s + p.balance, 0),
    paidYear: pays.filter((p) => p.paid_on.startsWith(y)).reduce((s, p) => s + p.amount, 0),
  };
}

/** Çift silinmeden önce: çekim günü geçmiş görevlerin tutarı arşive yazılır (ödeme geçmişi bozulmasın) */
function archiveCouple(coupleId, types) {
  const t = today();
  const rates = ratesByMember();
  for (const a of db.staffAssignments().filter((x) => x.couple_id === coupleId && x.event_date < t)) {
    const amount = feeOf(a, rates, types);
    if (amount > 0) db.archiveAssignment({ ...a, amount });
  }
}

module.exports = { account, overview, feeOf, typeOf, archiveCouple };
