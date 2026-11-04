'use strict';
// Talep formu (yeni müşteri) ve admin "Talepler" sayfası.
const { h, raw } = require('./html');
const { publicLayout, panelLayout, flash, icon } = require('./components');
const { adminNav, adminTabs } = require('./admin');
const { formatDate } = require('./panel');
const wa = require('../whatsapp');

const STATUS = {
  yeni: 'Yeni',
  gorusuldu: 'Görüşülüyor',
  rezervasyon: 'Rezervasyon',
  kayip: 'Olmadı',
};

function form(c, { values = {}, error, thanks, services }) {
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
      <form class="card form" method="post" action="/talep">
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
        <p class="hint">Bilgileriniz yalnızca size dönüş yapmak için kullanılır.</p>
        <button class="btn btn--primary" type="submit">Gönder</button>
      </form>`}
    </div>
  </section>`;
  return publicLayout(c, { title: 'Uygunluk sorun', body });
}

function adminList(c, { leads, csrf, flash: f, demoAdmin }) {
  const counts = Object.fromEntries(Object.keys(STATUS).map((k) => [k, leads.filter((l) => l.status === k).length]));
  const body = h`
  <div class="container">
    <div class="panel-title-row"><h1 class="page-title">Talepler</h1></div>
    ${f ? flash(f.message, f.type) : ''}
    <div class="stats stats--4">
      ${Object.entries(STATUS).map(([k, label]) => h`<div class="stat"><span class="stat__num">${counts[k]}</span><span class="stat__label">${label}</span></div>`)}
    </div>
    <p class="muted">WhatsApp’tan yazan ya da sitedeki “Uygunluk sorun” formunu dolduran herkes burada listelenir.</p>
    ${leads.length ? h`
    <ul class="fb-list leads">
      ${leads.map((l) => h`
      <li class="fb lead">
        <div class="fb__head">
          <span class="state state--${l.status === 'yeni' ? 'soon' : l.status === 'rezervasyon' ? 'ok' : l.status === 'kayip' ? 'done' : 'upcoming'}">${STATUS[l.status] || l.status}</span>
          <strong>${l.name || 'İsimsiz'}</strong>
          <span class="fb__meta">${[wa.displayPhone(l.phone), l.event_date ? formatDate(l.event_date) : '', l.place, l.service, l.source === 'whatsapp' ? 'WhatsApp' : 'Site'].filter(Boolean).join(' · ')}</span>
          <time class="fb__time">${new Date(`${l.created_at.replace(' ', 'T')}Z`).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
        </div>
        ${l.message ? h`<p class="fb__msg">${l.message}</p>` : ''}
        <div class="lead__actions">
          ${l.phone ? h`<a class="btn btn--outline btn--sm" href="https://wa.me/${l.phone}" target="_blank" rel="noopener">${icon('whatsapp')}WhatsApp’tan yaz</a>` : ''}
          <form method="post" action="/admin/talepler/${l.id}/durum" class="inline-form lead__status">
            <input type="hidden" name="csrf" value="${csrf}">
            <label class="sr-only" for="st-${l.id}">Durum</label>
            <select id="st-${l.id}" name="status">${Object.entries(STATUS).map(([k, label]) => h`<option value="${k}"${k === l.status ? raw(' selected') : ''}>${label}</option>`)}</select>
            <button class="btn btn--text btn--sm" type="submit">Kaydet</button>
          </form>
          ${l.couple_id ? h`<a class="btn btn--text btn--sm" href="/admin/ciftler/${l.couple_id}">Çifti aç ${icon('arrow')}</a>` : h`
          <a class="btn btn--primary btn--sm" href="/admin/randevu/yeni?talep=${l.id}">Randevu oluştur</a>`}
          <form method="post" action="/admin/talepler/${l.id}/sil" class="inline-form" data-confirm="Bu talep silinsin mi?">
            <input type="hidden" name="csrf" value="${csrf}">
            <button class="btn btn--text btn--sm btn--danger-text" type="submit" aria-label="Talebi sil">${icon('trash')}</button>
          </form>
        </div>
      </li>`)}
    </ul>` : h`<div class="empty-box">${icon('whatsapp')}<p>Henüz talep yok. WhatsApp’tan yazan ya da sitedeki formu dolduran ilk kişi burada görünecek.</p></div>`}
  </div>`;
  return panelLayout(c, { title: 'Talepler', csrf, nav: adminNav('leads', csrf, demoAdmin), home: '/admin', tabs: adminTabs('leads', demoAdmin), body, scripts: ['/js/admin.js?v=3'] });
}

module.exports = { form, adminList, STATUS };
