'use strict';
// İşin yolu: Sözleşme → Çekim → Seçim → Albüm → Teslim. Kayıtlı verilerden hesaplanır (elle aşama seçmeye gerek yok);
// hem stüdyonun çift sayfasında hem çiftin Durum sayfasında aynı çizgi görünür.
const { h, raw } = require('./html');
const { icon } = require('./components');
const { today, addDays } = require('../jobs');

const MON = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const dm = (iso) => (iso ? `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]}` : '');
const day = (s) => String(s || '').slice(0, 10);

// Dosyaların teslimden sonra sunucuda kalacağı gün sayısı (çifte gösterilir; silme işlemini stüdyo kendisi yapar)
const keepDays = (c) => Math.max(Number(c.delivery?.keepDays) || 90, 1);

// x: { contract: ''|'bekliyor'|'imzali', events, photoCount, favCount, limit, locked, design, delivered, finished }
function steps(x) {
  const t = today();
  const dates = (x.events || []).map((e) => e.event_date).filter(Boolean).sort();
  const next = dates.find((d) => d >= t);
  const shot = dates.length > 0 && !next;
  const finished = Boolean(x.delivered || x.finished);
  const list = [
    { key: 'sozlesme', label: 'Sözleşme', done: x.contract === 'imzali' || (!x.contract && shot),
      sub: x.contract === 'imzali' ? 'imzalandı' : x.contract === 'bekliyor' ? 'onay bekliyor' : shot ? '—' : 'gönderilmedi' },
    { key: 'cekim', label: 'Çekim', done: shot, sub: next ? dm(next) : dates.length ? dm(dates[dates.length - 1]) : 'tarih yok' },
    { key: 'secim', label: 'Seçim', done: Boolean(x.locked), sub: x.photoCount ? `${x.favCount}/${x.limit}${x.locked ? ' seçildi' : ''}` : 'fotoğraf yok' },
    { key: 'album', label: 'Albüm', done: x.design === 'onaylandi',
      sub: { hazir: 'incelemede', degisiklik: 'değişiklik', onaylandi: 'onaylandı' }[x.design] || 'tasarım' },
    { key: 'teslim', label: 'Teslim', done: finished, sub: x.delivered ? dm(day(x.delivered)) : 'tutanak' },
  ];
  if (finished) list.forEach((s) => { s.done = true; });
  const cur = list.findIndex((s) => !s.done);
  list.forEach((s, i) => { s.state = s.done ? 'done' : i === cur ? 'now' : 'todo'; });
  return { list, current: cur === -1 ? null : list[cur], next, finished };
}

function road(st, { subs = true, title = '' } = {}) {
  return h`<ol class="road" aria-label="${title || 'İşin yolu'}">${st.list.map((s, i) => h`
    <li class="road__step is-${s.state}"${s.state === 'now' ? raw(' aria-current="step"') : ''}>
      <span class="road__dot">${s.state === 'done' ? icon('check') : String(i + 1)}</span>
      <span class="road__label">${s.label}</span>
      ${subs ? h`<span class="road__sub">${s.sub}</span>` : ''}
    </li>`)}</ol>`;
}

// Stüdyo tarafı: çiftin bilgilerinden adımlar ve "Sıradaki iş"
function forAdmin(c, { couple, card, contract: ct, events, totalCount, favCount }) {
  const last = (c.stages || []).length - 1;
  const st = steps({
    contract: ct ? (ct.signed_at ? 'imzali' : 'bekliyor') : '', events, photoCount: totalCount, favCount,
    limit: couple.album_limit || 35, locked: couple.album_locked, design: couple.album_design_state,
    delivered: couple.delivered_at, finished: couple.stage >= last,
  });
  let plan = {};
  try { plan = JSON.parse(couple.plan_json || '{}') || {}; } catch { /* boş */ }
  const k = st.current?.key;
  const todo = !k ? { text: couple.delivered_at ? `Teslim edildi (${dm(day(couple.delivered_at))}). İş tamamlandı.` : 'İş tamamlandı.', tab: 'teslim', btn: 'Teslim' }
    : k === 'sozlesme' ? (ct ? { text: 'Sözleşme çiftin onayını bekliyor. Gerekirse hatırlatın.', tab: 'odeme', btn: 'Sözleşmeye geç' } : { text: 'Sözleşmeyi hazırlayıp çifte gönderin.', tab: 'odeme', btn: 'Sözleşmeye geç' })
    : k === 'cekim' ? { text: `Çekim ${st.next ? dm(st.next) : 'tarihi girilmedi'}.${st.next ? (plan.saved ? ' Gün planı dolduruldu.' : ' Gün planı henüz doldurulmadı.') : ''}`, tab: 'ozet', btn: 'Etkinlikler' }
    : k === 'secim' ? (totalCount ? { text: `Çift albüm seçimi yapıyor (${favCount}/${couple.album_limit || 35}).`, tab: 'album', btn: 'Seçime bak' } : { text: 'Seçim fotoğraflarını yükleyin; çift albüm karelerini seçsin.', tab: 'foto', btn: 'Fotoğraf yükle' })
    : k === 'album' ? ({
      hazir: { text: 'Albüm tasarımı çiftin incelemesinde.', tab: 'album', btn: 'Albüme geç' },
      degisiklik: { text: 'Çift albüm tasarımında değişiklik istedi.', tab: 'album', btn: 'Değişikliklere bak' },
    }[couple.album_design_state] || { text: 'Çift seçimini tamamladı. RAW dosyalarını hazırlayıp albüm tasarımını gönderin.', tab: 'album', btn: 'Albüme geç' })
    : { text: 'Her şey hazır olunca ofiste teslim tutanağını imzalatın.', tab: 'teslim', btn: 'Teslime geç' };
  return { st, todo };
}

function adminBlock(c, args) {
  const { st, todo } = forAdmin(c, args);
  return h`<section class="cd-road" aria-label="İşin yolu">
    ${road(st)}
    <div class="nextjob${st.current ? '' : ' is-done'}">
      <p class="nextjob__text"><span class="nextjob__k">${st.current ? 'Sıradaki iş' : 'Durum'}</span>${todo.text}</p>
      <a class="btn btn--text btn--sm" href="#${todo.tab}">${todo.btn}${icon('right')}</a>
    </div>
  </section>`;
}

// Çift tarafı
function forCouple(c, { couple, events, totalCount, favCount }) {
  const last = (c.stages || []).length - 1;
  return steps({
    contract: couple.contract_state || '', events, photoCount: totalCount, favCount,
    limit: couple.album_limit || 35, locked: couple.album_locked, design: couple.album_design_state,
    delivered: couple.delivered_at, finished: couple.stage >= last,
  });
}

// Teslimden sonra dosyaların sunucuda kalacağı son gün
function keepUntil(c, couple) {
  if (!couple.delivered_at) return '';
  return addDays(day(couple.delivered_at), keepDays(c));
}

module.exports = { steps, road, forAdmin, adminBlock, forCouple, keepUntil, keepDays, dm };
