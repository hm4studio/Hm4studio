'use strict';
// Yönetim paneli sayfaları.
const { h, raw } = require('./html');
const { panelLayout, statusBar, flash, icon } = require('./components');
const { photoTile, galleryTabs, logoutForm, formatDate, albumBar, planView } = require('./panel');
const { jobStatus, daysBetween, today } = require('../jobs');
const { displayPhone } = require('../whatsapp');
const { payment, tl } = require('../appointments');

function adminNav(active, csrf, demoAdmin = false) {
  const items = [
    { href: '/admin', label: 'Panel', key: 'couples', icon: 'users' },
    { href: '/admin/talepler', label: 'Talepler', key: 'leads', icon: 'whatsapp' },
    { href: '/admin/takvim', label: 'Takvim', key: 'calendar', icon: 'clock' },
    { href: '/admin/portfolyo', label: 'Portfolyo', key: 'portfolio', icon: 'image' },
    // Görüşler ziyaretçilerin özel yorumlarıdır; demo stüdyo hesabına gösterilmez
    ...(demoAdmin ? [] : [{ href: '/admin/gorusler', label: 'Görüşler', key: 'feedback', icon: 'star' }]),
    { href: '/admin/hesap', label: 'Hesap', key: 'account', icon: 'settings' },
  ];
  return h`<nav class="panel-nav" aria-label="Yönetim menüsü">
    ${items.map((i) => h`<a class="panel-nav__link" href="${i.href}"${i.key === active ? raw(' aria-current="page"') : ''}>${icon(i.icon)}<span>${i.label}</span></a>`)}
    ${logoutForm(csrf)}
  </nav>`;
}

// Telefonda alttaki sekme menüsü
function adminTabs(active, demoAdmin = false) {
  return [
    { href: '/admin', label: 'Panel', icon: 'users', active: active === 'couples' },
    { href: '/admin/talepler', label: 'Talepler', icon: 'whatsapp', active: active === 'leads' },
    { href: '/admin/takvim', label: 'Takvim', icon: 'clock', active: active === 'calendar' },
    { href: '/admin/portfolyo', label: 'Portfolyo', icon: 'image', active: active === 'portfolio' },
    { href: '/admin/hesap', label: 'Hesap', icon: 'settings', active: active === 'account' || active === 'feedback' },
  ];
}

const csrfField = (csrf) => h`<input type="hidden" name="csrf" value="${csrf}">`;

function flashBlock(f) {
  if (!f) return '';
  return h`
  ${flash(f.message, f.type)}
  ${f.credentials ? h`
  <div class="credentials" role="status">
    <p class="credentials__title">${icon('lock')}Çiftle paylaşacağınız giriş bilgileri</p>
    <dl>
      <div><dt>Giriş adresi</dt><dd>${f.credentials.url}</dd></div>
      <div><dt>Erişim kodu</dt><dd><code>${f.credentials.code}</code></dd></div>
      <div><dt>Şifre</dt><dd><code>${f.credentials.password}</code></dd></div>
    </dl>
    <p class="muted">Şifre güvenlik nedeniyle yalnızca şimdi gösterilir. Kaybolursa "Şifre yenile" ile yenisini oluşturun.</p>
  </div>` : ''}`;
}

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const shortDate = (iso) => (iso ? iso.split('-').reverse().join('.') : '');

// Ay takvimi: her günde o günün etkinlikleri
function monthCalendar(couples, ym) {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // pazartesi başlangıç
  const t = today();
  const byDay = new Map();
  for (const k of couples) {
    if (!k.event_date || !k.event_date.startsWith(ym)) continue;
    const d = Number(k.event_date.slice(8));
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(k);
  }
  for (const list of byDay.values()) list.sort((a, b) => (a.start_time || '99').localeCompare(b.start_time || '99'));
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysIn; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return h`
  <section class="cal" aria-labelledby="cal-title">
    <div class="cal__head">
      <h2 class="cal__title" id="cal-title">${MONTHS[m - 1]} ${y}</h2>
      <div class="cal__nav">
        <a class="cal__btn" href="/admin?ay=${prev}" aria-label="Önceki ay">${icon('left')}</a>
        <a class="cal__today" href="/admin">Bugün</a>
        <a class="cal__btn" href="/admin?ay=${next}" aria-label="Sonraki ay">${icon('right')}</a>
      </div>
    </div>
    <div class="cal__grid" role="grid">
      ${DAYS.map((d) => h`<div class="cal__dow" role="columnheader">${d}</div>`)}
      ${cells.map((d) => {
        if (!d) return h`<div class="cal__cell cal__cell--empty"></div>`;
        const iso = `${ym}-${String(d).padStart(2, '0')}`;
        const list = byDay.get(d) || [];
        return h`<div class="cal__cell${iso === t ? ' is-today' : ''}${list.length ? ' has-events' : ''}" role="gridcell">
          <a class="cal__day" href="/admin/randevu/yeni?tarih=${iso}" title="${shortDate(iso)} için randevu oluştur">${d}</a>
          ${list.map((k) => h`<a class="cal__ev cal__ev--${k.stage === 0 ? 'new' : 'go'}" href="/admin/ciftler/${k.id}" title="${k.name} · ${k.event_type || 'Etkinlik'}${k.start_time ? ' · ' + k.start_time : ''}">
            <span class="cal__ev-time">${k.start_time || ''}</span><span class="cal__ev-name">${k.name}</span></a>`)}
        </div>`;
      })}
    </div>
    <p class="cal__hint muted">Boş bir güne dokunarak o tarihe randevu oluşturabilirsiniz.</p>
  </section>`;
}

// Çift kartı (panelde arama ve süzgeçle)
function coupleCard(c, k) {
  const pay = payment(k);
  const last = c.stages.length - 1;
  const pct = Math.round((Math.min(k.stage, last) / last) * 100);
  const search = [k.name, k.full_name, k.partner_name, k.ref_no, k.city, k.venue, k.phone, k.package].join(' ').toLocaleLowerCase('tr-TR');
  return h`<li class="ccard" data-card data-search="${search}" data-stage="${k.stage}" data-type="${k.event_type}" data-pay="${pay[0]}" data-date="${k.event_date || ''}">
    <a class="ccard__link" href="/admin/ciftler/${k.id}">
      <div class="ccard__top">
        <span class="ccard__ref">${k.ref_no || '—'}</span>
        ${k.event_type ? h`<span class="ccard__type">${k.event_type}</span>` : ''}
      </div>
      <h3 class="ccard__name">${k.name}</h3>
      <p class="ccard__meta">${k.event_date ? shortDate(k.event_date) : 'Tarih yok'}${k.start_time ? ` · ${k.start_time}` : ''}${k.city || k.venue ? ` · ${[k.venue, k.city].filter(Boolean).join(', ')}` : ''}</p>
      <div class="ccard__stage">
        <span class="ccard__track"><span class="ccard__fill" data-pct="${pct}"></span></span>
        <span class="ccard__stage-label">${c.stages[k.stage] || c.stages[0]}</span>
      </div>
      <div class="ccard__foot">
        <span class="pay pay--${pay[0]}">${pay[1]}${pay[2] ? ` · ${tl(pay[2])}` : ''}</span>
        <span class="ccard__ready" aria-label="Hazır olanlar">
          <span class="${k.photo_ready ? 'is-on' : ''}" title="Fotoğraf">F</span><span class="${k.video_ready ? 'is-on' : ''}" title="Video">V</span><span class="${k.album_ready ? 'is-on' : ''}" title="Albüm">A</span>
        </span>
      </div>
    </a>
  </li>`;
}

function dashboard(c, { couples, ym, csrf, flash: f, demoAdmin }) {
  const t = today();
  const in30 = couples.filter((k) => k.event_date && k.event_date >= t && daysBetween(t, k.event_date) <= 30)
    .sort((a, b) => (a.event_date + (a.start_time || '')).localeCompare(b.event_date + (b.start_time || '')));
  const thisMonth = couples.filter((k) => k.event_date && k.event_date.startsWith(t.slice(0, 7))).length;
  const balance = couples.reduce((s, k) => s + payment(k)[2], 0);
  const late = couples.filter((k) => jobStatus(k, c.stages)[0] === 'late').length;
  const o = c.appointments || {};
  const body = h`
  <div class="container">
    <div class="panel-title-row">
      <div>
        <p class="eyebrow">${new Date(`${t}T12:00:00`).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1 class="page-title">Panel</h1>
      </div>
      <a class="btn btn--primary" href="/admin/randevu/yeni">${icon('plus')}Yeni randevu</a>
    </div>
    ${flashBlock(f)}

    <div class="stats stats--4">
      <div class="stat"><span class="stat__num">${thisMonth}</span><span class="stat__label">Bu ay etkinlik</span></div>
      <div class="stat"><span class="stat__num">${in30.length}</span><span class="stat__label">Önümüzdeki 30 gün</span></div>
      <div class="stat"><span class="stat__num stat__num--sm">${tl(balance)}</span><span class="stat__label">Bekleyen bakiye</span></div>
      <a class="stat stat--link" href="/admin/takvim"><span class="stat__num">${late}</span><span class="stat__label">Geciken teslim ${icon('arrow')}</span></a>
    </div>

    <div class="dash">
      ${monthCalendar(couples, ym)}
      <section class="dash__side" aria-labelledby="up-title">
        <h2 class="panel-section__title" id="up-title">Yaklaşan</h2>
        ${in30.length ? h`<ul class="jobs">${in30.slice(0, 8).map((k) => {
          const dt = new Date(`${k.event_date}T12:00:00`);
          const n = daysBetween(t, k.event_date);
          return h`<li class="job">
            <div class="job__date" aria-hidden="true"><span class="job__day">${dt.getDate()}</span><span class="job__mon">${dt.toLocaleDateString('tr-TR', { month: 'short' })}</span></div>
            <div class="job__main"><a class="strong-link" href="/admin/ciftler/${k.id}">${k.name}</a>
              <span class="muted">${[k.event_type, k.start_time, k.venue || k.city].filter(Boolean).join(' · ') || 'Ayrıntı girilmedi'}</span></div>
            <div class="job__side"><span class="muted job__rel">${n === 0 ? 'bugün' : n === 1 ? 'yarın' : `${n} gün`}</span></div>
          </li>`;
        })}</ul>` : h`<p class="muted">Önümüzdeki 30 günde randevu yok.</p>`}
      </section>
    </div>

    <section class="panel-section" aria-labelledby="cards-title">
      <div class="panel-section__head cards-head">
        <h2 class="panel-section__title" id="cards-title">Çift kartları <span class="muted" data-card-count>(${couples.length})</span></h2>
        <a class="btn btn--text btn--sm" href="/admin/randevular.csv">${icon('download')}Excel'e aktar</a>
      </div>
      <div class="card-filters" data-card-filters>
        <label class="sr-only" for="q">Ara</label>
        <input id="q" type="search" placeholder="İsim, telefon, mekân, randevu no…" data-f-q autocomplete="off">
        <label class="sr-only" for="f-stage">Aşama</label>
        <select id="f-stage" data-f-stage><option value="">Tüm aşamalar</option>${c.stages.map((s, i) => h`<option value="${i}">${s}</option>`)}</select>
        <label class="sr-only" for="f-type">Tür</label>
        <select id="f-type" data-f-type><option value="">Tüm türler</option>${(o.eventTypes || []).map((x) => h`<option>${x}</option>`)}</select>
        <label class="sr-only" for="f-pay">Ödeme</label>
        <select id="f-pay" data-f-pay><option value="">Tüm ödemeler</option><option value="unpaid">Ödeme bekleniyor</option><option value="deposit">Kapora alındı</option><option value="paid">Ödendi</option><option value="none">Tutar girilmedi</option></select>
        <label class="sr-only" for="f-sort">Sıralama</label>
        <select id="f-sort" data-f-sort><option value="new">En yeni kayıt</option><option value="date">Etkinlik tarihine göre</option></select>
      </div>
      ${couples.length ? h`<ul class="ccards" data-cards>${couples.map((k) => coupleCard(c, k))}</ul>
        <p class="muted" data-cards-empty hidden>Aramaya uyan çift yok.</p>`
        : h`<div class="empty-box"><p>Henüz randevu yok. <a href="/admin/randevu/yeni">İlk randevuyu oluşturun.</a></p></div>`}
    </section>
  </div>`;
  return panelLayout(c, { title: 'Panel', csrf, nav: adminNav('couples', csrf, demoAdmin), home: '/admin', tabs: adminTabs('couples', demoAdmin), body, scripts: ['/js/dashboard.js?v=1'] });
}

// Randevu formu (yeni ve düzenleme ortak)
function appointmentPage(c, { values = {}, action, title, submitLabel, csrf, errors = [], talepId, back, demoAdmin, isNew }) {
  const o = c.appointments || {};
  const v = (k) => values[k] ?? '';
  const sel = (name, list, placeholder) => h`<select id="${name}" name="${name}"><option value="">${placeholder}</option>${(list || []).map((x) => h`<option${x === v(name) ? raw(' selected') : ''}>${x}</option>`)}</select>`;
  const chk = (name, label) => h`<label class="check"><input type="checkbox" name="${name}" value="1"${values[name] ? raw(' checked') : ''}><span>${label}</span></label>`;
  const body = h`
  <div class="container container--form">
    <a class="back-link" href="${back}">${icon('left')}Geri</a>
    <h1 class="page-title">${title}</h1>
    ${errors.length ? h`<div class="flash flash--error" role="alert">${errors.map((e) => h`<div>${e}</div>`)}</div>` : ''}
    <form class="form appt-form" method="post" action="${action}">
      ${csrfField(csrf)}
      ${talepId ? h`<input type="hidden" name="talep" value="${talepId}">` : ''}

      <fieldset class="appt-group">
        <legend>Kişi</legend>
        <div class="appt-row">
          <div class="field"><label for="fullName">Ad soyad</label><input id="fullName" name="fullName" type="text" required maxlength="80" value="${v('fullName')}" autocomplete="off"></div>
          <div class="field"><label for="partnerName">Eş adı</label><input id="partnerName" name="partnerName" type="text" maxlength="80" value="${v('partnerName')}" autocomplete="off"></div>
        </div>
        <div class="appt-row">
          <div class="field"><label for="phone">Telefon</label><input id="phone" name="phone" type="tel" inputmode="tel" maxlength="20" placeholder="05XX XXX XX XX" value="${v('phone')}"></div>
          <div class="field"><label for="source">Müşteri kaynağı</label>${sel('source', o.sources, 'Seçin')}</div>
        </div>
      </fieldset>

      <fieldset class="appt-group">
        <legend>Etkinlik</legend>
        <div class="appt-row">
          <div class="field"><label for="eventType">Etkinlik türü</label>${sel('eventType', o.eventTypes, 'Seçin')}</div>
          <div class="field"><label for="eventDate">Tarih</label><input id="eventDate" name="eventDate" type="date" value="${v('eventDate')}"></div>
          <div class="field"><label for="startTime">Başlangıç saati</label><input id="startTime" name="startTime" type="time" value="${v('startTime')}"></div>
        </div>
        <div class="appt-row">
          <div class="field"><label for="city">Şehir</label><input id="city" name="city" type="text" maxlength="60" value="${v('city')}"></div>
          <div class="field"><label for="venue">Mekân</label><input id="venue" name="venue" type="text" maxlength="160" value="${v('venue')}"></div>
        </div>
      </fieldset>

      <fieldset class="appt-group">
        <legend>Paket ve ödeme</legend>
        <div class="appt-row">
          <div class="field"><label for="package">Paket</label><input id="package" name="package" type="text" maxlength="80" list="pkg-list" value="${v('package')}">
            <datalist id="pkg-list">${(o.packages || []).map((x) => h`<option value="${x}">`)}</datalist></div>
          <div class="field"><label for="total">Toplam tutar (₺)</label><input id="total" name="total" type="text" inputmode="numeric" placeholder="0" value="${v('total')}" data-money></div>
          <div class="field"><label for="deposit">Kapora (₺)</label><input id="deposit" name="deposit" type="text" inputmode="numeric" placeholder="0" value="${v('deposit')}" data-money></div>
        </div>
        <div class="field"><label for="packageDetail">Paket detayı</label><textarea id="packageDetail" name="packageDetail" rows="3" maxlength="1000">${v('packageDetail')}</textarea></div>
        <div class="appt-balance" data-balance aria-live="polite"></div>
        ${chk('paidFull', 'Kalan bakiye tahsil edildi')}
      </fieldset>

      <fieldset class="appt-group">
        <legend>Teslim</legend>
        <div class="appt-row">
          <div class="field"><label for="dueDate">Teslim tarihi <span class="muted">(boşsa etkinlikten ${o.defaultDeliveryDays || 45} gün sonra)</span></label><input id="dueDate" name="dueDate" type="date" value="${v('dueDate')}"></div>
          <div class="field"><label for="albumLimit">Albüm kare sayısı</label><input id="albumLimit" name="albumLimit" type="number" min="1" max="1000" inputmode="numeric" value="${v('albumLimit') || 60}"></div>
        </div>
        ${isNew ? '' : h`<div class="appt-checks">${chk('photoReady', 'Fotoğraflar hazır')}${chk('videoReady', 'Video hazır')}${chk('albumReady', 'Albüm hazır')}</div>`}
        ${chk('waOptin', 'WhatsApp bildirimleri gönderilsin')}
      </fieldset>

      <fieldset class="appt-group">
        <legend>Notlar</legend>
        <div class="field"><label for="notes" class="sr-only">Notlar</label><textarea id="notes" name="notes" rows="4" maxlength="3000" placeholder="Yalnızca siz görürsünüz.">${v('notes')}</textarea></div>
      </fieldset>

      <div class="appt-actions">
        <button class="btn btn--primary" type="submit">${submitLabel}</button>
        <a class="btn btn--text" href="${back}">Vazgeç</a>
      </div>
    </form>
  </div>`;
  return panelLayout(c, { title, csrf, nav: adminNav('couples', csrf, demoAdmin), home: '/admin', tabs: adminTabs('couples', demoAdmin), body, scripts: ['/js/dashboard.js?v=1'] });
}

// Çift sayfasındaki randevu özeti
function appointmentSummary(c, k) {
  const pay = payment(k);
  const row = (label, value) => (value ? h`<div><dt>${label}</dt><dd>${value}</dd></div>` : '');
  return h`
  <section class="card appt-card" aria-labelledby="appt-title">
    <div class="appt-card__head">
      <h2 class="card__title" id="appt-title">Randevu</h2>
      <a class="btn btn--outline btn--sm" href="/admin/ciftler/${k.id}/duzenle">Düzenle</a>
    </div>
    <dl class="appt-dl">
      ${row('Randevu no', k.ref_no)}
      ${row('Ad soyad', k.full_name)}
      ${row('Eş adı', k.partner_name)}
      ${k.phone ? h`<div><dt>Telefon</dt><dd><a href="tel:+${k.phone}">${displayPhone(k.phone)}</a> · <a href="https://wa.me/${k.phone}" target="_blank" rel="noopener">WhatsApp</a></dd></div>` : ''}
      ${row('Etkinlik', [k.event_type, k.event_date ? shortDate(k.event_date) : '', k.start_time].filter(Boolean).join(' · '))}
      ${row('Yer', [k.venue, k.city].filter(Boolean).join(', '))}
      ${row('Paket', k.package)}
      ${row('Paket detayı', k.package_detail)}
      ${k.total_amount ? h`<div><dt>Ödeme</dt><dd>${tl(k.total_amount)} · kapora ${tl(k.deposit)} · <span class="pay pay--${pay[0]}">${pay[1]}${pay[2] ? ` · kalan ${tl(pay[2])}` : ''}</span></dd></div>` : ''}
      ${row('Teslim', k.due_date ? shortDate(k.due_date) : '')}
      <div><dt>Hazır</dt><dd>${[k.photo_ready && 'Fotoğraf', k.video_ready && 'Video', k.album_ready && 'Albüm'].filter(Boolean).join(', ') || 'Henüz yok'}</dd></div>
      ${row('Albüm bilgisi gönderildi', k.album_info_sent_at ? shortDate(k.album_info_sent_at) : '')}
      ${row('Kaynak', k.source)}
      ${row('Notlar', k.notes)}
    </dl>
  </section>`;
}

function coupleDetail(c, { couple, photos, totalCount, favCount, view, csrf, flash: f, loginUrl, demoAdmin }) {
  const base = `/admin/ciftler/${couple.id}`;
  const body = h`
  <div class="container">
    <a class="back-link" href="/admin">${icon('left')}Panel</a>
    <div class="panel-title-row">
      <div>
        <h1 class="page-title">${couple.name}</h1>
        <p class="muted">${couple.ref_no ? couple.ref_no + ' · ' : ''}${couple.event_date ? formatDate(couple.event_date) + ' · ' : ''}Erişim kodu: <code>${couple.access_code}</code></p>
      </div>
    </div>
    ${flashBlock(f)}

    ${statusBar(c.stages, couple.stage, couple.stage_note, 'İş durumu (çiftin gördüğü)')}

    <div class="admin-grid admin-grid--3">
      <section class="card" aria-labelledby="stage-title">
        <h2 class="card__title" id="stage-title">İş aşamasını güncelle</h2>
        <form class="form" method="post" action="${base}/asama">
          ${csrfField(csrf)}
          <div class="field">
            <label for="stage">Aşama</label>
            <select id="stage" name="stage">
              ${c.stages.map((s, i) => h`<option value="${i}"${i === couple.stage ? raw(' selected') : ''}>${i + 1}. ${s}</option>`)}
            </select>
          </div>
          <div class="field">
            <label for="note">Çifte not <span class="muted">(isteğe bağlı)</span></label>
            <textarea id="note" name="note" rows="3" maxlength="500" placeholder="Örn. Video kurgusu bu hafta tamamlanacak.">${couple.stage_note}</textarea>
          </div>
          <button class="btn btn--primary" type="submit">Kaydet</button>
        </form>
      </section>

      ${appointmentSummary(c, couple)}

      <section class="card" aria-labelledby="access-title">
        <h2 class="card__title" id="access-title">Giriş</h2>
        <p class="muted">Giriş adresi: <code>${loginUrl}</code></p>
        <p class="muted">Erişim kodu: <code>${couple.access_code}</code></p>
        <form method="post" action="${base}/sifre" data-confirm="Yeni şifre oluşturulsun mu? Eski şifre çalışmayı bırakır.">
          ${csrfField(csrf)}
          <button class="btn btn--outline" type="submit">Şifre yenile</button>
        </form>
      </section>
    </div>

    ${planView(couple)}

    <section class="panel-section" aria-labelledby="upload-title">
      <div class="panel-section__head">
        <h2 class="panel-section__title" id="upload-title">Fotoğraf yükle</h2>
        <p class="muted">Fotoğraflar tarayıcınızda web için küçültülür, sonra yüklenir. Dosyalar gizli klasörde saklanır; yalnızca bu çift ve siz görebilirsiniz.</p>
      </div>
      <form class="uploader" data-uploader data-endpoint="${base}/fotograflar">
        <label class="uploader__drop">
          ${icon('upload')}
          <span><strong>Fotoğraf seçin</strong> veya buraya sürükleyin</span>
          <span class="muted">JPG, PNG veya WEBP · çoklu seçim</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple data-files>
        </label>
        <label class="check">
          <input type="checkbox" data-keep-original checked>
          <span>Orijinal dosyaları da sakla (çift tam çözünürlükte indirebilsin)</span>
        </label>
        <ul class="uploader__list" data-list aria-live="polite"></ul>
      </form>
    </section>

    <section class="panel-section" aria-labelledby="gallery-title">
      <div class="panel-section__head">
        <h2 class="panel-section__title" id="gallery-title">Galeri ve albüm seçimi</h2>
        <p class="muted">Kalbe dokunarak çiftin albüm seçimini düzenleyebilirsiniz.</p>
      </div>
      ${albumBar(couple, favCount, { admin: true, csrf, base })}
      ${galleryTabs(base, view, totalCount, favCount)}
      ${photos.length ? h`
      <ul class="tiles" data-gallery>
        ${photos.map((p) => photoTile(p, { favEndpoint: `${base}/favori`, canDelete: true, csrf, deleteAction: `${base}/fotograflar/${p.id}/sil` }))}
      </ul>` : h`<div class="empty-box">${icon('image')}<p>${view === 'fav' ? 'Bu çift henüz albüm için kare seçmedi.' : 'Henüz fotoğraf yüklenmedi.'}</p></div>`}
    </section>

    <section class="danger-zone" aria-labelledby="danger-title">
      <h2 class="card__title" id="danger-title">Çifti sil</h2>
      <p class="muted">Çift, tüm fotoğrafları ve favorileri kalıcı olarak silinir.</p>
      <form method="post" action="${base}/sil" data-confirm="${couple.name} ve tüm fotoğrafları kalıcı olarak silinsin mi? Bu işlem geri alınamaz.">
        ${csrfField(csrf)}
        <button class="btn btn--danger" type="submit">${icon('trash')}Çifti sil</button>
      </form>
    </section>
  </div>`;
  return panelLayout(c, { title: couple.name, csrf, nav: adminNav('couples', csrf, demoAdmin), home: '/admin', tabs: adminTabs('couples', demoAdmin), body, scripts: ['/js/panel.js?v=2', '/js/admin.js?v=1'] });
}

function calendar(c, { couples, csrf, demoAdmin }) {
  const t = today();
  const rows = couples.map((k) => ({ k, st: jobStatus(k, c.stages) }));
  const count = (key) => rows.filter((r) => r.st[0] === key).length;
  const deliveries = rows.filter((r) => ['late', 'soon', 'ok'].includes(r.st[0])).sort((a, b) => (a.k.due_date || '9').localeCompare(b.k.due_date || '9'));
  const shoots = rows.filter((r) => r.st[0] === 'upcoming').sort((a, b) => a.k.event_date.localeCompare(b.k.event_date));
  const done = rows.filter((r) => r.st[0] === 'done');
  const item = (r, mode) => {
    const d = mode === 'shoot' ? r.k.event_date : r.k.due_date;
    const dt = d ? new Date(`${d}T12:00:00`) : null;
    const n = d ? daysBetween(t, d) : null;
    const rel = n === null ? 'Teslim tarihi yok' : n === 0 ? 'bugün' : n > 0 ? `${n} gün kaldı` : `${Math.abs(n)} gün geçti`;
    return h`<li class="job">
      <div class="job__date" aria-hidden="true">${dt ? h`<span class="job__day">${dt.getDate()}</span><span class="job__mon">${dt.toLocaleDateString('tr-TR', { month: 'short' })}</span>` : h`<span class="job__day">—</span>`}</div>
      <div class="job__main"><a class="strong-link" href="/admin/ciftler/${r.k.id}">${r.k.name}</a>
        <span class="muted">${mode === 'shoot' ? `Çekim · ${formatDate(d)}` : `${d ? `Teslim · ${formatDate(d)}` : 'Teslim tarihi girilmedi'} · ${c.stages[r.k.stage] || ''}`}</span></div>
      <div class="job__side"><span class="state state--${r.st[0]}">${r.st[1]}</span>${mode === 'done' ? '' : h`<span class="muted job__rel">${rel}</span>`}</div>
    </li>`;
  };
  const body = h`
  <div class="container">
    <div class="panel-title-row"><h1 class="page-title">İş takvimi</h1></div>
    <div class="stats stats--4">
      <div class="stat"><span class="stat__num">${count('late')}</span><span class="stat__label">Geciken teslim</span></div>
      <div class="stat"><span class="stat__num">${count('soon')}</span><span class="stat__label">Bu hafta teslim</span></div>
      <div class="stat"><span class="stat__num">${count('ok')}</span><span class="stat__label">Devam eden iş</span></div>
      <div class="stat"><span class="stat__num">${shoots.length}</span><span class="stat__label">Yaklaşan çekim</span></div>
    </div>
    <section class="panel-section">
      <div class="panel-section__head"><h2 class="panel-section__title">Teslimler</h2>
        <p class="muted">En yakın teslim en üstte. Teslim tarihini çiftin sayfasındaki Bilgiler kartından değiştirebilirsiniz.</p></div>
      ${deliveries.length ? h`<ul class="jobs">${deliveries.map((r) => item(r, 'due'))}</ul>` : h`<div class="empty-box"><p>Bekleyen teslim yok.</p></div>`}
    </section>
    <section class="panel-section">
      <div class="panel-section__head"><h2 class="panel-section__title">Yaklaşan çekimler</h2></div>
      ${shoots.length ? h`<ul class="jobs">${shoots.map((r) => item(r, 'shoot'))}</ul>` : h`<div class="empty-box"><p>Planlanmış çekim yok. Çifte çekim tarihi girdiğinizde burada görünür.</p></div>`}
    </section>
    ${done.length ? h`<section class="panel-section">
      <div class="panel-section__head"><h2 class="panel-section__title">Teslim edilenler</h2></div>
      <ul class="jobs">${done.map((r) => item(r, 'done'))}</ul>
    </section>` : ''}
  </div>`;
  return panelLayout(c, { title: 'İş takvimi', csrf, nav: adminNav('calendar', csrf, demoAdmin), home: '/admin', tabs: adminTabs('calendar', demoAdmin), body });
}

function portfolioAdmin(c, { items, heroId, csrf, flash: f, demoAdmin }) {
  const catOptions = (selected) => h`<option value="">Kategori yok</option>${c.portfolio.categories.map((k) => h`<option value="${k}"${k === selected ? raw(' selected') : ''}>${k}</option>`)}`;
  const body = h`
  <div class="container">
    <div class="panel-title-row">
      <h1 class="page-title">Portfolyo</h1>
      <a class="btn btn--outline btn--sm" href="/portfolyo" target="_blank" rel="noopener">Sitede gör ${icon('arrow')}</a>
    </div>
    ${flashBlock(f)}

    <section class="panel-section" aria-labelledby="pf-upload">
      <div class="panel-section__head">
        <h2 class="panel-section__title" id="pf-upload">Portfolyoya fotoğraf ekle</h2>
        <p class="muted">Instagram'da paylaştığınız fotoğrafları buraya yükleyin. Bu fotoğraflar herkese açık sitede görünür.</p>
      </div>
      <form class="uploader" data-uploader data-endpoint="/admin/portfolyo">
        <div class="field field--inline">
          <label for="pf-cat">Kategori</label>
          <select id="pf-cat" data-category>${catOptions('')}</select>
        </div>
        <label class="uploader__drop">
          ${icon('upload')}
          <span><strong>Fotoğraf seçin</strong> veya buraya sürükleyin</span>
          <span class="muted">JPG, PNG veya WEBP · çoklu seçim</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple data-files>
        </label>
        <ul class="uploader__list" data-list aria-live="polite"></ul>
      </form>
    </section>

    <section class="panel-section" aria-labelledby="pf-list">
      <div class="panel-section__head">
        <h2 class="panel-section__title" id="pf-list">Yüklü fotoğraflar <span class="muted">(${items.length})</span></h2>
        <p class="muted">"Kapak yap" ile anasayfadaki büyük fotoğrafı seçin.</p>
      </div>
      ${items.length ? h`
      <ul class="pf-admin">
        ${items.map((p) => h`
        <li class="pf-admin__item${p.id === heroId ? ' is-hero' : ''}">
          <a class="pf-admin__img" href="${p.display}" data-lb><img src="${p.thumb}" alt="${p.alt || p.category || 'Portfolyo fotoğrafı'}" loading="lazy"></a>
          ${p.id === heroId ? h`<span class="badge badge--done pf-admin__badge">Kapak</span>` : ''}
          <form class="form form--compact" method="post" action="/admin/portfolyo/${p.id}">
            ${csrfField(csrf)}
            <label class="sr-only" for="cat-${p.id}">Kategori</label>
            <select id="cat-${p.id}" name="category">${catOptions(p.category)}</select>
            <label class="sr-only" for="alt-${p.id}">Açıklama</label>
            <input id="alt-${p.id}" name="alt" type="text" maxlength="160" placeholder="Kısa açıklama (erişilebilirlik)" value="${p.alt}">
            <button class="btn btn--outline btn--sm" type="submit">Kaydet</button>
          </form>
          <div class="pf-admin__actions">
            <form method="post" action="/admin/portfolyo/${p.id}/kapak">${csrfField(csrf)}<button class="btn btn--text btn--sm" type="submit">${icon('star')}Kapak yap</button></form>
            <form method="post" action="/admin/portfolyo/${p.id}/sil" data-confirm="Bu fotoğraf portfolyodan silinsin mi?">${csrfField(csrf)}<button class="btn btn--text btn--sm btn--danger-text" type="submit">${icon('trash')}Sil</button></form>
          </div>
        </li>`)}
      </ul>` : h`<div class="empty-box">${icon('image')}<p>Henüz portfolyo fotoğrafı yok.</p></div>`}
    </section>
  </div>`;
  return panelLayout(c, { title: 'Portfolyo', csrf, nav: adminNav('portfolio', csrf, demoAdmin), home: '/admin', tabs: adminTabs('portfolio', demoAdmin), body, scripts: ['/js/admin.js?v=1'] });
}

function account(c, { admin, csrf, flash: f, demoAdmin }) {
  const body = h`
  <div class="container container--narrow">
    <h1 class="page-title">Hesap</h1>
    ${flashBlock(f)}
    <section class="card">
      <h2 class="card__title">Şifre değiştir</h2>
      <p class="muted">Kullanıcı adı: <strong>${admin.username}</strong></p>
      <form class="form" method="post" action="/admin/hesap">
        ${csrfField(csrf)}
        <div class="field"><label for="cur">Mevcut şifre</label><input id="cur" name="current" type="password" autocomplete="current-password" required></div>
        <div class="field"><label for="new">Yeni şifre <span class="muted">(en az 10 karakter)</span></label><input id="new" name="next" type="password" autocomplete="new-password" minlength="10" required></div>
        <button class="btn btn--primary" type="submit">Şifreyi değiştir</button>
      </form>
    </section>
    ${demoAdmin ? '' : h`<section class="card account-logout">
      <h2 class="card__title">Görüşler</h2>
      <p class="muted">Demo ziyaretçilerinin bıraktığı görüşleri okuyun.</p>
      <a class="btn btn--outline btn--sm" href="/admin/gorusler">Görüşleri aç ${icon('arrow')}</a>
    </section>`}
    <section class="card account-logout">
      <h2 class="card__title">Oturum</h2>
      <p class="muted">Bu cihazda yönetim panelinden çıkış yapın.</p>
      ${logoutForm(csrf, 'Çıkış yap')}
    </section>
  </div>`;
  return panelLayout(c, { title: 'Hesap', csrf, nav: adminNav('account', csrf, demoAdmin), home: '/admin', tabs: adminTabs('account', demoAdmin), body });
}

module.exports = { appointmentPage, calendar, adminNav, adminTabs, dashboard, coupleDetail, portfolioAdmin, account };
