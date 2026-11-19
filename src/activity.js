'use strict';
// Stüdyoya haber verilecek her olay buradan geçer: ana sayfadaki "Son gelişmeler"e yazılır,
// aynı anda telefona (push) ve Telegram'a gider. Böylece kaçırılan bildirim panelde kalır.
const config = require('./config');
const db = require('./db');
const push = require('./push');

const EMOJI = { secim: '💛', album: '📖', siparis: '🧾', sozlesme: '✅', plan: '🗓', teklif: '📨', talep: '📥', indirme: '⬇️', sistem: '⚠️' };

/**
 * @param {string} kind   secim | album | siparis | sozlesme | plan | teklif | talep | indirme
 * @param {object} o      { coupleId, title, text, url, action: [etiket, adres], tag, telegram: false ile kapatılır }
 */
function notify(kind, { coupleId = null, title, text, url = '/admin', action = null, tag, telegram = true }) {
  try {
    db.logActivity({ coupleId, kind, text, url, actionLabel: action ? action[0] : '', actionUrl: action ? action[1] : '' });
  } catch (err) { console.error('Gelişme kaydı:', err.message); }
  try { push.toAdmin({ title, body: text, url, tag }).catch(() => {}); } catch (err) { console.error('Bildirim:', err.message); }
  if (telegram) {
    try {
      require('./telegram').notifyAll(`${EMOJI[kind] || '•'} ${title}\n${text}\n${config.siteUrl}${url}`).catch(() => {});
    } catch (err) { console.error('Telegram bildirimi:', err.message); }
  }
}

module.exports = { notify };
