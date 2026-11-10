'use strict';
// Talep formu (yeni müşteri) ve admin "Talepler" sayfası.
const { h, raw } = require('./html');
const { publicLayout, panelLayout, flash, icon } = require('./components');
const { adminNav, adminTabs } = require('./admin');
const { formatDate } = require('./panel');
const wa = require('../whatsapp');
const { WA_CONSENT } = require('../kvkk');

const STATUS = {
  yeni: 'Yeni',
  gorusuldu: 'Görüşülüyor',
  rezervasyon: 'Rezervasyon',
  kayip: 'Olmadı',
};

function form(c, { values = {}, error, thanks, services, gift = null }) {
  const sel = (a, b) => (a === b ? raw(' selected') : '');
  const body = h`
  <section class="page-hero">
    <div class="container container--narrow">
      <p class="eyebrow">${c.brand.tagline}</p>
      <h1 class="page-title">Uygunluk sorun</h1>
      <p class="page-lead">Birkaç bilgi yeterli; tarihinizi kontrol edip size WhatsApp’tan dönelim.</p>
    </div>
  </section>
  <section class="section section--flush-top">
    <div class="container container--narrow">
      ${thanks ? h`
      <div class="card thanks">
        <h2 class="card__title">Teşekkürler!</h2>
        <p class="muted">Bilgileriniz bize ulaştı. Uygunluğu kontrol edip en kısa sürede size yazacağız.</p>
        <div class="btn-row"><a class="btn btn--primary" href="/portfolyo">Portfolyoya göz atın</a></div>
      </div>` : h`
      ${flash(error, 'error')}
      ${gift ? h`<div class="gift-note">${icon('star')}<span><strong>${gift.owner}</strong> size bir hediye gönderdi: ${gift.text}. Kuponunuz <strong>${gift.code}</strong> bu forma eklendi.</span></div>` : ''}
      <form class="card form" method="post" action="/talep">
        ${values.hediye ? h`<input type="hidden" name="hediye" value="${values.hediye}">` : ''}
        <div class="hp" aria-hidden="true"><label for="website">Bu alanı boş bırakın</label><input id="website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
        <input type="hidden" name="kaynak" value="${values.kaynak || 'site'}">
        <div class="plan-grid">
          <div class="field"><label for="t-name">Adınız</label><input id="t-name" name="name" type="text" required maxlength="80" autocomplete="name" value="${values.name || ''}"></div>
          <div class="field"><label for="t-phone">Telefon (WhatsApp)</label><input id="t-phone" name="phone" type="tel" required maxlength="20" autocomplete="tel" inputmode="tel" placeholder="05XX XXX XX XX" value="${values.phone || ''}"></div>
          <div class="field"><label for="t-date">Tarih</label><input id="t-date" name="eventDate" type="date" value="${values.eventDate || ''}" data-availability aria-describedby="t-date-note"><p class="avail" id="t-date-note" data-avail-note aria-live="polite" hidden></p></div>
          <div class="field"><label for="t-place">Şehir / mekân</label><input id="t-place" name="place" type="text" maxlength="120" value="${values.place || ''}"></div>
        </div>
        <div class="field"><label for="t-service">Ne için?</label>
          <select id="t-service" name="service">
            <option value="">Seçin</option>
            ${services.map((s) => h`<option value="${s}"${sel(s, values.service)}>${s}</option>`)}
            <option value="Diğer"${sel('Diğer', values.service)}>Diğer</option>
          </select>
        </div>
        <div class="field"><label for="t-msg">Eklemek istedikleriniz <span class="muted">(isteğe bağlı)</span></label><textarea id="t-msg" name="message" rows="4" maxlength="1500">${values.message || ''}</textarea></div>
        <div class="consents">
          <label class="check"><input type="checkbox" name="kvkk" value="1" required${values.kvkk === '1' ? raw(' checked') : ''}><span><a href="/kvkk" target="_blank">Aydınlatma metnini</a> okudum.</span></label>
          <label class="check"><input type="checkbox" name="waConsent" value="1"${values.waConsent === '1' ? raw(' checked') : ''}><span>${WA_CONSENT} <span class="muted">(İşaretlemezseniz sizi telefonla ararız.)</span></span></label>
        </div>
        <button class="btn btn--primary" type="submit">Gönder</button>
      </form>`}
    </div>
  </section>`;
  return publicLayout(c, { title: 'Uygunluk sorun', description: `Düğün, nişan, kına ya da dış çekim tarihiniz için ${c.brand.name} uygunluğunu sorun; size kısa sürede fiyat ve bilgiyle dönelim.`, path: '/talep', body, seoKey: 'talep' });
}

// Talepler ve teklifler tek sayfada: Yeni / Teklif gönderildi / Kabul etti / Olmadı
const TABS = [['yeni', 'Yeni'], ['teklif', 'Teklif gönderildi'], ['kabul', 'Kabul etti'], ['olmadi', 'Olmadı']];
const QSTATE = { hazir: 'açılmadı', goruldu: 'görüldü', kabul: 'kabul etti' };
function bucket(l, q) {
  if (l.status === 'kayip') return 'olmadi';
  if (l.status === 'rezervasyon' || q?.status === 'kabul') return 'kabul';
  if (q || l.status === 'gorusuldu') return 'teklif';
  return 'yeni';
}
const SRC = { whatsapp: 'WhatsApp', dugun: 'Düğün.com' };
const ago = (iso) => {
  const d = new Date(`${String(iso).replace(' ', 'T')}Z`);
  const m = Math.round((Date.now() - d) / 60000);
  if (m < 60) return `${Math.max(m, 1)} dk önce`;
  if (m < 1440) return `${Math.round(m / 60)} saat önce`;
  const n = Math.round(m / 1440);
  return n === 1 ? 'dün' : n < 30 ? `${n} gün önce` : d.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', year: 'numeric' });
};

function adminList(c, { leads, csrf, flash: f, demoAdmin, quotes = [], loose = [], tab = 'yeni', total = (q) => 0 }) {
  const qOf = new Map(quotes.map((q) => [q.lead_id, q])); // her talebin son teklifi
  const rows = leads.map((l) => ({ l, q: qOf.get(l.id), b: bucket(l, qOf.get(l.id)) }));
  // Talepten bağımsız hazırlanan teklifler
  const qrows = loose.map((q) => ({ q, b: q.status === 'kabul' ? 'kabul' : 'teklif' }));
  const counts = Object.fromEntries(TABS.map(([k]) => [k, rows.filter((r) => r.b === k).length + qrows.filter((r) => r.b === k).length]));
  if (!TABS.some(([k]) => k === tab)) tab = 'yeni';
  const shown = rows.filter((r) => r.b === tab);
  const shownQ = qrows.filter((r) => r.b === tab);
  const leadRow = ({ l, q }) => h`
      <li class="fb lead">
        <div class="fb__head">
          <strong>${l.name || 'İsimsiz'}</strong>
          ${l.gift_code ? h`<span class="tchip t-soz">Hediye</span>` : ''}
          ${q ? h`<span class="state state--${q.status === 'kabul' ? 'ok' : q.status === 'goruldu' ? 'soon' : 'upcoming'}">Teklif · ${QSTATE[q.status]}</span>` : l.status === 'gorusuldu' ? h`<span class="state state--upcoming">Görüşülüyor</span>` : ''}
          <span class="fb__meta">${[l.event_date ? formatDate(l.event_date) : '', l.service, l.place, wa.displayPhone(l.phone), SRC[l.source] || 'Site', l.gift_code ? `kupon ${l.gift_code}` : '', l.source === 'site' && l.kvkk_at && !l.wa_consent ? 'WhatsApp izni yok, telefonla arayın' : ''].filter(Boolean).join(' · ')}</span>
          <time class="fb__time">${ago(l.created_at)}</time>
        </div>
        ${l.message ? h`<p class="fb__msg">${l.message}</p>` : ''}
        <div class="lead__actions">
          ${l.phone ? h`<a class="btn btn--outline btn--sm" href="https://wa.me/${l.phone}" target="_blank" rel="noopener">${icon('whatsapp')}WhatsApp</a>` : ''}
          ${l.source === 'dugun' ? h`<a class="btn btn--outline btn--sm" href="https://www.dugun.com" target="_blank" rel="noopener">Düğün.com’da yanıtla ${icon('arrow')}</a>` : ''}
          ${l.couple_id ? h`<a class="btn btn--text btn--sm" href="/admin/ciftler/${l.couple_id}">Çifti aç ${icon('arrow')}</a>` : h`
          ${q ? h`<a class="btn btn--outline btn--sm" href="/admin/teklif/${q.id}">Teklifi aç</a>` : h`<a class="btn btn--primary btn--sm" href="/admin/teklif/yeni?talep=${l.id}">Teklif hazırla</a>`}
          <a class="btn btn--${q?.status === 'kabul' || l.status === 'rezervasyon' ? 'primary' : 'text'} btn--sm" href="/admin/randevu/yeni?${q ? `teklif=${q.id}` : `talep=${l.id}`}">${q?.status === 'kabul' ? 'Randevuya çevir' : 'Randevu oluştur'}</a>`}
          <a class="btn btn--text btn--sm" href="/admin/hatirlatma/yeni?talep=${l.id}">${icon('bell')}Hatırlat</a>
          <details class="lead__more">
            <summary class="btn btn--text btn--sm">Durum</summary>
            <form method="post" action="/admin/talepler/${l.id}/durum" class="inline-form lead__status">
              <input type="hidden" name="csrf" value="${csrf}">
              <label class="sr-only" for="st-${l.id}">Durum</label>
              <select id="st-${l.id}" name="status">${Object.entries(STATUS).map(([k, label]) => h`<option value="${k}"${k === l.status ? raw(' selected') : ''}>${label}</option>`)}</select>
              <button class="btn btn--text btn--sm" type="submit">Kaydet</button>
            </form>
            <form method="post" action="/admin/talepler/${l.id}/sil" class="inline-form" data-confirm="Bu talep silinsin mi?">
              <input type="hidden" name="csrf" value="${csrf}">
              <button class="btn btn--text btn--sm btn--danger-text" type="submit">${icon('trash')}Sil</button>
            </form>
          </details>
        </div>
      </li>`;
  const quoteRow = ({ q }) => h`
      <li class="fb lead">
        <div class="fb__head">
          <strong>${q.accepted_name || q.name}</strong>
          <span class="state state--${q.status === 'kabul' ? 'ok' : q.status === 'goruldu' ? 'soon' : 'upcoming'}">Teklif · ${QSTATE[q.status]}</span>
          <span class="fb__meta">${[q.event_date ? formatDate(q.event_date) : '', q.event_type, q.place, `${Number(total(q)).toLocaleString('tr-TR')} ₺`].filter(Boolean).join(' · ')}</span>
          <time class="fb__time">${ago(q.created_at)}</time>
        </div>
        <div class="lead__actions">
          <a class="btn btn--outline btn--sm" href="/admin/teklif/${q.id}">Teklifi aç</a>
          ${q.couple_id ? h`<a class="btn btn--text btn--sm" href="/admin/ciftler/${q.couple_id}">Çifti aç ${icon('arrow')}</a>` : q.status === 'kabul' ? h`<a class="btn btn--primary btn--sm" href="/admin/randevu/yeni?teklif=${q.id}">Randevuya çevir</a>` : ''}
        </div>
      </li>`;
  const empty = { yeni: 'Yeni talep yok. Siteden, WhatsApp’tan ve Düğün.com’dan gelenler burada görünür.', teklif: 'Yanıt bekleyen teklif yok.', kabul: 'Henüz kabul edilen teklif yok.', olmadi: 'Boş.' }[tab];
  const body = h`
  <div class="container">
    <div class="panel-title-row"><div><h1 class="page-title">Talepler</h1><p class="muted">Site formu, WhatsApp, Düğün.com ve hediye kuponuyla gelenler</p></div>
      <a class="btn btn--outline btn--sm" href="/admin/teklif/yeni">${icon('plus')}Yeni teklif</a></div>
    ${require('./guide').hint('leads')}
    ${f ? flash(f.message, f.type) : ''}
    <nav class="ltabs" aria-label="Talep durumları">
      ${TABS.map(([k, label]) => h`<a class="ltabs__tab" href="/admin/talepler?sekme=${k}"${k === tab ? raw(' aria-current="page"') : ''}>${label}<span class="ltabs__n">${counts[k]}</span></a>`)}
    </nav>
    ${shown.length || shownQ.length ? h`<ul class="fb-list leads">${shown.map(leadRow)}${shownQ.map(quoteRow)}</ul>`
      : h`<div class="empty-box">${icon('whatsapp')}<p>${empty}</p></div>`}
  </div>`;
  return panelLayout(c, { title: 'Talepler', csrf, nav: adminNav('leads', csrf, demoAdmin), home: '/admin', tabs: adminTabs('leads', demoAdmin), body, scripts: ['/js/admin.js?v=4'] });
}

module.exports = { form, adminList, STATUS };
