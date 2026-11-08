'use strict';
// Teklifler: admin formu ve listesi, çifte giden teklif sayfası.
const { h, raw } = require('./html');
const { publicLayout, panelLayout, icon, links } = require('./components');
const { adminNav, adminTabs } = require('./admin');
const { formatDate } = require('./panel');
const wa = require('../whatsapp');

const tl = (n) => `${Number(n || 0).toLocaleString('tr-TR')} ₺`;
const STATUS = { hazir: 'Gönderilmedi / açılmadı', goruldu: 'Görüldü', kabul: 'Kabul edildi' };
const STATE_CLASS = { hazir: 'upcoming', goruldu: 'soon', kabul: 'ok' };
const items = (q) => { try { return JSON.parse(q.items_json || '[]') || []; } catch { return []; } };
const subtotal = (q) => items(q).reduce((s, x) => s + (Number(x.price) || 0), 0);
const total = (q) => Math.max(subtotal(q) - (q.discount || 0), 0);
const expired = (q, today) => q.status !== 'kabul' && q.valid_until && q.valid_until < today;
const csrfField = (csrf) => h`<input type="hidden" name="csrf" value="${csrf}">`;
const when = (s) => (s ? new Date(`${s.replace(' ', 'T')}Z`).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

function quoteLink(q, siteUrl) { return `${siteUrl}/teklif/${q.token}`; }

// ── Admin: teklif formu ──
function form(c, { values = {}, packages = [], action, csrf, title, back, errors = [], demoAdmin }) {
  const v = (k) => values[k] ?? '';
  const chosen = new Set([].concat(values.pk || []));
  const types = c.appointments?.eventTypes || [];
  const body = h`
  <div class="container container--form">
    <a class="back-link" href="${back}">${icon('left')}Geri</a>
    <h1 class="page-title">${title}</h1>
    ${errors.length ? h`<div class="flash flash--error" role="alert">${errors.map((e) => h`<div>${e}</div>`)}</div>` : ''}
    <form class="form quote-form" method="post" action="${action}" data-quote-form>
      ${csrfField(csrf)}
      ${values.lead ? h`<input type="hidden" name="lead" value="${values.lead}">` : ''}
      <section class="panel-section">
        <div class="panel-section__head"><h2 class="panel-section__title">Kime</h2></div>
        <div class="appt-row">
          <div class="field"><label for="q-name">Ad soyad</label><input id="q-name" name="name" required maxlength="80" value="${v('name')}"></div>
          <div class="field"><label for="q-phone">Telefon <span class="muted">(isteğe bağlı)</span></label><input id="q-phone" name="phone" type="tel" maxlength="20" value="${v('phone')}"></div>
        </div>
        <div class="appt-row">
          <div class="field"><label for="q-type">Etkinlik</label><select id="q-type" name="eventType"><option value="">Seçin</option>${types.map((t) => h`<option${t === v('eventType') ? raw(' selected') : ''}>${t}</option>`)}</select></div>
          <div class="field"><label for="q-date">Tarih</label><input id="q-date" name="eventDate" type="date" value="${v('eventDate')}"></div>
        </div>
        <div class="field"><label for="q-place">Şehir / mekân <span class="muted">(isteğe bağlı)</span></label><input id="q-place" name="place" maxlength="120" value="${v('place')}"></div>
      </section>

      <section class="panel-section">
        <div class="panel-section__head"><h2 class="panel-section__title">Paketler ve hizmetler</h2><span class="muted" data-q-sum></span></div>
        ${packages.length ? h`<div class="ev-team__list">${packages.map((x) => h`<label class="ev-team__item">
          <input type="checkbox" name="pk[]" value="${x.id}" data-q-price="${x.price || 0}"${chosen.has(String(x.id)) ? raw(' checked') : ''}>
          <span>${x.name}${x.price ? h` <span class="muted">· ${tl(x.price)}</span>` : ''}</span></label>`)}</div>`
          : h`<p class="muted">Paket listeniz boş. <a href="/admin/paketler">Paketler</a> sayfasından ekleyebilir ya da aşağıya elle yazabilirsiniz.</p>`}
        <p class="muted quote-form__hint">Listede olmayan kalemler:</p>
        ${[1, 2, 3].map((i) => h`<div class="appt-row">
          <div class="field"><label for="x${i}-n" class="sr-only">Kalem ${i}</label><input id="x${i}-n" name="x${i}_name" maxlength="80" placeholder="Ör. Drone çekimi" value="${v(`x${i}_name`)}"></div>
          <div class="field"><label for="x${i}-p" class="sr-only">Tutar ${i}</label><input id="x${i}-p" name="x${i}_price" inputmode="numeric" placeholder="Tutar (₺)" value="${v(`x${i}_price`)}" data-money data-q-extra></div>
        </div>`)}
      </section>

      <section class="panel-section">
        <div class="panel-section__head"><h2 class="panel-section__title">Fiyat ve koşullar</h2></div>
        <div class="appt-row">
          <div class="field"><label for="q-disc">İndirim (₺)</label><input id="q-disc" name="discount" inputmode="numeric" placeholder="0" value="${v('discount')}" data-money data-q-discount></div>
          <div class="field"><label for="q-dep">Kapora (₺)</label><input id="q-dep" name="deposit" inputmode="numeric" placeholder="0" value="${v('deposit')}" data-money></div>
        </div>
        <div class="field"><label for="q-valid">Geçerlilik (gün)</label><input id="q-valid" name="validDays" type="number" min="1" max="90" value="${v('validDays') || 7}"></div>
        <div class="field"><label for="q-note">Not <span class="muted">(çift görür; isteğe bağlı)</span></label><textarea id="q-note" name="note" rows="4" maxlength="1500">${v('note')}</textarea></div>
        <p class="quote-form__total">Toplam: <strong data-q-total>—</strong></p>
      </section>
      <button class="btn btn--primary" type="submit">Kaydet ve bağlantıyı al</button>
    </form>
  </div>`;
  return panelLayout(c, { title, csrf, nav: adminNav('leads', csrf, demoAdmin), home: '/admin', tabs: adminTabs('leads', demoAdmin), body, scripts: ['/js/quote.js?v=1'] });
}

// ── Admin: tek teklif ──
function adminView(c, { q, csrf, flash: f, siteUrl, today, demoAdmin }) {
  const link = quoteLink(q, siteUrl);
  const text = wa.templateText('teklif', { ad: q.name, etkinlik: (q.event_type || 'çekiminiz').toLocaleLowerCase('tr-TR'), link });
  const its = items(q);
  const body = h`
  <div class="container container--form">
    <a class="back-link" href="/admin/talepler?sekme=teklif">${icon('left')}Talepler</a>
    <h1 class="page-title">${q.name} · teklif</h1>
    ${f ? h`<div class="flash flash--${f.type || 'success'}" role="status">${f.message}</div>` : ''}
    <section class="panel-section">
      <div class="panel-section__head"><h2 class="panel-section__title">Durum</h2>
        <span class="state state--${expired(q, today) ? 'done' : STATE_CLASS[q.status]}">${expired(q, today) ? 'Süresi doldu' : STATUS[q.status]}</span></div>
      <ul class="quote-timeline">
        <li>Hazırlandı: ${when(q.created_at)}</li>
        ${q.viewed_at ? h`<li>Çift açtı: ${when(q.viewed_at)}</li>` : ''}
        ${q.accepted_at ? h`<li><strong>Kabul etti: ${when(q.accepted_at)}</strong>${q.accepted_name ? ` · ${q.accepted_name}` : ''}${q.accepted_phone ? ` · ${wa.displayPhone(q.accepted_phone)}` : ''}</li>` : ''}
        ${q.valid_until ? h`<li>Geçerlilik: ${formatDate(q.valid_until)}</li>` : ''}
      </ul>
    </section>
    <section class="panel-section">
      <div class="panel-section__head"><h2 class="panel-section__title">Çifte gönderin</h2></div>
      <p class="quote-link"><code>${link}</code></p>
      <div class="btn-row">
        ${q.phone ? h`<a class="btn btn--primary btn--sm" href="${wa.waLink(q.phone, text)}" target="_blank" rel="noopener">${icon('whatsapp')}WhatsApp’tan gönder</a>` : ''}
        <button type="button" class="btn btn--outline btn--sm" data-copy="${link}">Bağlantıyı kopyala</button>
        <button type="button" class="btn btn--outline btn--sm" data-copy="${text}">Mesajı kopyala</button>
        <a class="btn btn--text btn--sm" href="${link}?onizleme=1" target="_blank" rel="noopener">Önizle ${icon('arrow')}</a>
      </div>
      <p class="muted">Düğün.com’dan gelen talepler için “Mesajı kopyala” deyip Düğün.com’daki cevabınıza yapıştırın.</p>
    </section>
    <section class="panel-section">
      <div class="panel-section__head"><h2 class="panel-section__title">Özet</h2></div>
      <p>${[q.event_type, q.event_date ? formatDate(q.event_date) : '', q.place].filter(Boolean).join(' · ')}</p>
      <ul class="quote-items">${its.map((x) => h`<li><span>${x.name}</span><span>${tl(x.price)}</span></li>`)}
        ${q.discount ? h`<li><span>İndirim</span><span>−${tl(q.discount)}</span></li>` : ''}
        <li class="quote-items__total"><span>Toplam</span><span>${tl(total(q))}</span></li></ul>
      ${q.deposit ? h`<p class="muted">Kapora: ${tl(q.deposit)}</p>` : ''}
    </section>
    <div class="btn-row">
      ${q.couple_id ? h`<a class="btn btn--primary" href="/admin/ciftler/${q.couple_id}">Çifti aç ${icon('arrow')}</a>` : h`<a class="btn btn--primary" href="/admin/randevu/yeni?teklif=${q.id}">Randevuya çevir</a>`}
      ${q.status !== 'kabul' ? h`<a class="btn btn--outline" href="/admin/teklif/${q.id}/duzenle">Düzenle</a>` : ''}
      <form method="post" action="/admin/teklif/${q.id}/sil" class="inline-form" data-confirm="Bu teklif silinsin mi? Bağlantı da çalışmaz hâle gelir.">
        ${csrfField(csrf)}<button class="btn btn--text btn--danger-text" type="submit">${icon('trash')}Sil</button>
      </form>
    </div>
  </div>`;
  return panelLayout(c, { title: 'Teklif', csrf, nav: adminNav('leads', csrf, demoAdmin), home: '/admin', tabs: adminTabs('leads', demoAdmin), body, scripts: ['/js/admin.js?v=6'] });
}

// ── Admin: liste ──
function list(c, { quotes, csrf, today, demoAdmin }) {
  const body = h`
  <div class="container">
    <a class="back-link" href="/admin/talepler">${icon('left')}Talepler</a>
    <div class="panel-title-row"><h1 class="page-title">Teklifler</h1><a class="btn btn--primary btn--sm" href="/admin/teklif/yeni">${icon('plus')}Yeni teklif</a></div>
    ${quotes.length ? h`<ul class="fb-list">${quotes.map((q) => h`
      <li class="fb"><div class="fb__head">
        <span class="state state--${expired(q, today) ? 'done' : STATE_CLASS[q.status]}">${expired(q, today) ? 'Süresi doldu' : STATUS[q.status]}</span>
        <strong><a href="/admin/teklif/${q.id}">${q.name}</a></strong>
        <span class="fb__meta">${[q.event_type, q.event_date ? formatDate(q.event_date) : '', tl(total(q))].filter(Boolean).join(' · ')}</span>
        <time class="fb__time">${when(q.created_at)}</time>
      </div></li>`)}</ul>` : h`<p class="muted">Henüz teklif yok. Talepler listesindeki “Teklif hazırla” ile başlayın.</p>`}
  </div>`;
  return panelLayout(c, { title: 'Teklifler', csrf, nav: adminNav('leads', csrf, demoAdmin), home: '/admin', tabs: adminTabs('leads', demoAdmin), body });
}

// ── Çiftin gördüğü teklif sayfası ──
function publicPage(c, { q, today, done, error }) {
  const its = items(q);
  const isExpired = expired(q, today);
  const body = h`
  <section class="page-hero">
    <div class="container container--narrow">
      <p class="eyebrow">${c.brand.name} · Fiyat teklifi</p>
      <h1 class="page-title">Sayın ${q.name},</h1>
      <p class="page-lead">${[q.event_type, q.event_date ? formatDate(q.event_date) : '', q.place].filter(Boolean).join(' · ') || 'Çekiminiz'} için hazırladığımız teklif aşağıdadır.</p>
    </div>
  </section>
  <section class="section section--flush-top">
    <div class="container container--narrow">
      <div class="card quote-card">
        <ul class="quote-items">
          ${its.map((x) => h`<li><div><strong>${x.name}</strong>${x.detail ? h`<p class="muted">${x.detail}</p>` : ''}</div><span>${tl(x.price)}</span></li>`)}
          ${q.discount ? h`<li><span>Ara toplam</span><span>${tl(subtotal(q))}</span></li><li><span>İndirim</span><span>−${tl(q.discount)}</span></li>` : ''}
          <li class="quote-items__total"><span>Toplam</span><span>${tl(total(q))}</span></li>
        </ul>
        ${q.deposit ? h`<p>Rezervasyon <strong>${tl(q.deposit)}</strong> kapora ile kesinleşir; kalan tutar çekim günü ödenir.</p>` : h`<p>Rezervasyon kapora ile kesinleşir.</p>`}
        ${q.note ? h`<div class="quote-note">${q.note.split(/\n+/).map((p) => h`<p>${p}</p>`)}</div>` : ''}
        ${q.valid_until && q.status !== 'kabul' ? h`<p class="muted">Bu teklif ${formatDate(q.valid_until)} tarihine kadar geçerlidir.</p>` : ''}
      </div>

      ${q.status === 'kabul' || done ? h`
      <div class="card thanks">
        <h2 class="card__title">Teşekkür ederiz!</h2>
        <p class="muted">Teklifi kabul ettiğinizi aldık. Rezervasyonunuzu tamamlamak için en kısa sürede size ulaşacağız.</p>
        <div class="btn-row"><a class="btn btn--outline" href="${links.whatsapp(c)}" target="_blank" rel="noopener">${icon('whatsapp')}WhatsApp’tan yazın</a></div>
      </div>` : isExpired ? h`
      <div class="card"><p>Bu teklifin süresi doldu. Güncel fiyat için bize yazın.</p>
        <div class="btn-row"><a class="btn btn--primary" href="${links.whatsapp(c)}" target="_blank" rel="noopener">${icon('whatsapp')}WhatsApp’tan yazın</a></div></div>` : h`
      <form class="card form" method="post" action="/teklif/${q.token}">
        <h2 class="card__title">Teklifi kabul ediyorum</h2>
        ${error ? h`<div class="flash flash--error" role="alert">${error}</div>` : ''}
        <div class="hp" aria-hidden="true"><label for="website">Bu alanı boş bırakın</label><input id="website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
        <div class="field"><label for="a-name">Adınız soyadınız</label><input id="a-name" name="name" required maxlength="80" autocomplete="name" value="${q.name}"></div>
        <div class="field"><label for="a-phone">Telefonunuz</label><input id="a-phone" name="phone" type="tel" required maxlength="20" autocomplete="tel" value="${q.phone ? wa.displayPhone(q.phone) : ''}"></div>
        <label class="check"><input type="checkbox" name="kvkk" value="1" required><span><a href="/kvkk" target="_blank" rel="noopener">Aydınlatma metnini</a> okudum; rezervasyon için bilgilerimin işlenmesini kabul ediyorum.</span></label>
        <div class="btn-row">
          <button class="btn btn--primary" type="submit">Kabul ediyorum</button>
          <a class="btn btn--outline" href="${links.whatsapp(c)}" target="_blank" rel="noopener">${icon('whatsapp')}Sorum var</a>
        </div>
        <p class="muted">Kabul ettiğinizde sizinle iletişime geçip rezervasyonunuzu tamamlıyoruz; bu adımda ödeme alınmaz.</p>
      </form>`}
    </div>
  </section>`;
  return publicLayout(c, { title: 'Fiyat teklifi', body });
}

module.exports = { form, adminView, list, publicPage, items, total, quoteLink, STATUS };
