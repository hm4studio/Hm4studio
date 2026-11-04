'use strict';
// Yönetim paneli sayfaları.
const { h, raw } = require('./html');
const { panelLayout, statusBar, flash, icon } = require('./components');
const { photoTile, galleryTabs, logoutForm, formatDate, albumBar, planView } = require('./panel');
const { jobStatus, daysBetween, today, addDays } = require('../jobs');
const { displayPhone } = require('../whatsapp');
const { payment, tl, shortDate, eventIndexes } = require('../appointments');

function adminNav(active, csrf, demoAdmin = false) {
  const items = [
    { href: '/admin', label: 'Panel', key: 'couples', icon: 'users' },
    { href: '/admin/talepler', label: 'Talepler', key: 'leads', icon: 'whatsapp' },
    { href: '/admin/takvim', label: 'Takvim', key: 'calendar', icon: 'clock' },
    { href: '/admin/rapor', label: 'Rapor', key: 'report', icon: 'chart' },
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
    { href: '/admin/hesap', label: 'Daha', icon: 'settings', active: ['account', 'feedback', 'portfolio', 'report'].includes(active) },
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
const longDay = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });

// Ay takvimi: her günde o günün etkinlikleri (bir çiftin farklı günlerdeki etkinlikleri ayrı ayrı görünür)
function monthCalendar(monthEvents, ym) {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // pazartesi başlangıç
  const t = today();
  const byDay = new Map();
  for (const e of monthEvents) {
    const d = Number(e.event_date.slice(8));
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(e);
  }
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
        return h`<div class="cal__cell${iso === t ? ' is-today' : ''}${list.length > 1 ? ' is-busy' : ''}" role="gridcell">
          <a class="cal__day" href="/admin/randevu/yeni?tarih=${iso}" title="${shortDate(iso)} için randevu oluştur">${d}</a>
          ${list.map((e) => h`<a class="cal__ev cal__ev--${e.couple_stage === 0 ? 'new' : 'go'}" href="/admin/ciftler/${e.couple_id}" title="${e.couple_name} · ${e.event_type || 'Etkinlik'}${e.start_time ? ' · ' + e.start_time : ''}">
            <span class="cal__ev-time">${e.start_time || ''}</span><span class="cal__ev-name">${e.couple_name}</span></a>`)}
        </div>`;
      })}
    </div>
    <p class="cal__hint muted">Boş bir güne dokunarak o tarihe randevu oluşturabilirsiniz. Aynı gün iki çekim varsa gün işaretlenir.</p>
  </section>`;
}

// Yarının programı: çekimler (saat, mekân, ekip, istekler) ve yarın teslimi olanlar
function tomorrowBlock(c, tomorrowEvents, tomorrowDue) {
  const tm = addDays(today(), 1);
  return h`
  <section class="tmr" aria-labelledby="tmr-title">
    <div class="tmr__head">
      <p class="eyebrow">Yarın · ${longDay(tm)}</p>
      <h2 class="tmr__title" id="tmr-title">${tomorrowEvents.length ? `${tomorrowEvents.length} çekim var` : 'Yarın çekim yok'}</h2>
    </div>
    ${tomorrowEvents.length ? h`<ol class="tmr__list">${tomorrowEvents.map((e) => h`
      <li class="tmr__item">
        <span class="tmr__time">${e.start_time || '—'}</span>
        <div class="tmr__main">
          <a class="strong-link" href="/admin/ciftler/${e.couple_id}">${e.couple_name}</a>
          <span class="muted">${[e.event_type, e.venue, e.city].filter(Boolean).join(' · ') || 'Ayrıntı girilmedi'}</span>
          ${e.team ? h`<span class="tmr__team">Ekip: ${e.team}</span>` : ''}
          ${e.package_detail ? h`<span class="tmr__note">${e.package_detail}</span>` : ''}
        </div>
        ${e.couple_phone ? h`<a class="tmr__call" href="tel:+${e.couple_phone}" aria-label="${e.couple_name} ara">${icon('phone')}</a>` : ''}
      </li>`)}</ol>` : ''}
    ${tomorrowDue.length ? h`<p class="tmr__due">Yarın teslim: ${tomorrowDue.map((k, i) => h`${i ? ', ' : ''}<a href="/admin/ciftler/${k.id}">${k.name}</a>`)}</p>` : ''}
  </section>`;
}

// Çift kartı (panelde arama ve süzgeçle)
function coupleCard(c, k) {
  const pay = payment(k);
  const last = c.stages.length - 1;
  const pct = Math.round((Math.min(k.stage, last) / last) * 100);
  const search = [k.name, k.full_name, k.partner_name, k.ref_no, k.phone, k.types].join(' ').toLocaleLowerCase('tr-TR');
  const shown = k.next_date || k.event_date;
  return h`<li class="ccard" data-card data-search="${search}" data-stage="${k.stage}" data-type="${k.types || ''}" data-pay="${pay[0]}" data-date="${shown || ''}">
    <a class="ccard__link" href="/admin/ciftler/${k.id}">
      <div class="ccard__top">
        <span class="ccard__ref">${k.ref_no || '—'}</span>
        <span class="ccard__type">${k.types || ''}</span>
      </div>
      <h3 class="ccard__name">${k.name}</h3>
      <p class="ccard__meta">${shown ? `${k.next_date ? 'Sıradaki' : 'Son'}: ${shortDate(shown)}` : 'Tarih yok'}${k.event_count > 1 ? ` · ${k.event_count} etkinlik` : ''}</p>
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

function dashboard(c, { couples, monthEvents, upcoming, ym, csrf, flash: f, demoAdmin }) {
  const t = today();
  const tm = addDays(t, 1);
  const tomorrowEvents = upcoming.filter((e) => e.event_date === tm);
  const tomorrowDue = couples.filter((k) => k.due_date === tm && k.stage < c.stages.length - 1);
  const later = upcoming.filter((e) => e.event_date > tm);
  const balance = couples.reduce((s, k) => s + payment(k)[2], 0);
  const late = couples.filter((k) => jobStatus(k, c.stages)[0] === 'late').length;
  const o = c.appointments || {};
  const body = h`
  <div class="container">
    <div class="panel-title-row">
      <div>
        <p class="eyebrow">${longDay(t)}</p>
        <h1 class="page-title">Panel</h1>
      </div>
      <a class="btn btn--primary" href="/admin/randevu/yeni">${icon('plus')}Yeni randevu</a>
    </div>
    ${flashBlock(f)}

    ${tomorrowBlock(c, tomorrowEvents, tomorrowDue)}

    <div class="stats stats--4">
      <div class="stat"><span class="stat__num">${monthEvents.length}</span><span class="stat__label">${MONTHS[Number(ym.slice(5)) - 1]} ayında etkinlik</span></div>
      <div class="stat"><span class="stat__num">${upcoming.length}</span><span class="stat__label">Önümüzdeki 30 gün</span></div>
      <div class="stat"><span class="stat__num stat__num--sm">${tl(balance)}</span><span class="stat__label">Bekleyen bakiye</span></div>
      <a class="stat stat--link" href="/admin/takvim"><span class="stat__num">${late}</span><span class="stat__label">Geciken teslim ${icon('arrow')}</span></a>
    </div>

    <div class="dash">
      ${monthCalendar(monthEvents, ym)}
      <section class="dash__side" aria-labelledby="up-title">
        <h2 class="panel-section__title" id="up-title">Yaklaşan</h2>
        ${later.length ? h`<ul class="jobs">${later.slice(0, 8).map((e) => {
          const dt = new Date(`${e.event_date}T12:00:00`);
          const n = daysBetween(t, e.event_date);
          return h`<li class="job">
            <div class="job__date" aria-hidden="true"><span class="job__day">${dt.getDate()}</span><span class="job__mon">${dt.toLocaleDateString('tr-TR', { month: 'short' })}</span></div>
            <div class="job__main"><a class="strong-link" href="/admin/ciftler/${e.couple_id}">${e.couple_name}</a>
              <span class="muted">${[e.event_type, e.start_time, e.venue || e.city].filter(Boolean).join(' · ') || 'Ayrıntı girilmedi'}</span></div>
            <div class="job__side"><span class="muted job__rel">${n} gün</span></div>
          </li>`;
        })}</ul>` : h`<p class="muted">Yarından sonraki 30 günde randevu yok.</p>`}
      </section>
    </div>

    <section class="panel-section" aria-labelledby="cards-title">
      <div class="panel-section__head cards-head">
        <h2 class="panel-section__title" id="cards-title">Çift kartları <span class="muted" data-card-count>(${couples.length})</span></h2>
        <a class="btn btn--text btn--sm" href="/admin/randevular.csv">${icon('download')}Excel'e aktar</a>
      </div>
      <div class="card-filters" data-card-filters>
        <label class="sr-only" for="q">Ara</label>
        <input id="q" type="search" placeholder="İsim, telefon, randevu no…" data-f-q autocomplete="off">
        <label class="sr-only" for="f-stage">Aşama</label>
        <select id="f-stage" data-f-stage><option value="">Tüm aşamalar</option>${c.stages.map((s, i) => h`<option value="${i}">${s}</option>`)}</select>
        <label class="sr-only" for="f-type">Tür</label>
        <select id="f-type" data-f-type><option value="">Tüm türler</option>${(o.eventTypes || []).map((x) => h`<option>${x}</option>`)}</select>
        <label class="sr-only" for="f-pay">Ödeme</label>
        <select id="f-pay" data-f-pay><option value="">Tüm ödemeler</option><option value="unpaid">Ödeme bekleniyor</option><option value="deposit">Kapora alındı</option><option value="paid">Ödendi</option><option value="none">Tutar girilmedi</option></select>
        <label class="sr-only" for="f-sort">Sıralama</label>
        <select id="f-sort" data-f-sort><option value="new">En yeni kayıt</option><option value="date">Sıradaki etkinliğe göre</option></select>
      </div>
      ${couples.length ? h`<ul class="ccards" data-cards>${couples.map((k) => coupleCard(c, k))}</ul>
        <p class="muted" data-cards-empty hidden>Aramaya uyan çift yok.</p>`
        : h`<div class="empty-box"><p>Henüz randevu yok. <a href="/admin/randevu/yeni">İlk randevuyu oluşturun.</a></p></div>`}
    </section>
  </div>`;
  return panelLayout(c, { title: 'Panel', csrf, nav: adminNav('couples', csrf, demoAdmin), home: '/admin', tabs: adminTabs('couples', demoAdmin), body, scripts: ['/js/dashboard.js?v=2'] });
}

// Bir etkinlik bloğu (formda tekrar eder; JS "Tarih ekle" ile kopyalar)
function eventBlock(c, values, i, n) {
  const o = c.appointments || {};
  const v = (k) => values[`ev${i}_${k}`] ?? '';
  const id = (k) => `ev${i}_${k}`;
  return h`
  <div class="ev-block" data-ev data-ev-index="${i}">
    <div class="ev-block__head">
      <h3 class="ev-block__title"><span data-ev-num>${n}</span>. etkinlik</h3>
      <button type="button" class="btn btn--text btn--sm btn--danger-text" data-ev-remove>${icon('trash')}Kaldır</button>
    </div>
    <input type="hidden" name="${id('id')}" value="${v('id')}">
    <div class="appt-row">
      <div class="field"><label for="${id('type')}">Etkinlik türü</label><select id="${id('type')}" name="${id('type')}"><option value="">Seçin</option>${(o.eventTypes || []).map((x) => h`<option${x === v('type') ? raw(' selected') : ''}>${x}</option>`)}</select></div>
      <div class="field"><label for="${id('date')}">Tarih</label><input id="${id('date')}" name="${id('date')}" type="date" value="${v('date')}" data-ev-date></div>
      <div class="field"><label for="${id('time')}">Başlangıç saati</label><input id="${id('time')}" name="${id('time')}" type="time" value="${v('time')}"></div>
    </div>
    <p class="ev-block__warn" data-ev-warn hidden></p>
    <div class="appt-row">
      <div class="field"><label for="${id('city')}">Şehir</label><input id="${id('city')}" name="${id('city')}" type="text" maxlength="60" value="${v('city')}"></div>
      <div class="field"><label for="${id('venue')}">Mekân</label><input id="${id('venue')}" name="${id('venue')}" type="text" maxlength="160" value="${v('venue')}"></div>
    </div>
    <div class="appt-row">
      <div class="field"><label for="${id('package')}">Paket</label><input id="${id('package')}" name="${id('package')}" type="text" maxlength="80" list="pkg-list" value="${v('package')}"></div>
      <div class="field"><label for="${id('price')}">Tutar (₺)</label><input id="${id('price')}" name="${id('price')}" type="text" inputmode="numeric" placeholder="0" value="${v('price')}" data-money data-ev-price></div>
      <div class="field"><label for="${id('team')}">Ekip</label><input id="${id('team')}" name="${id('team')}" type="text" maxlength="120" list="team-list" placeholder="Kim gidecek?" value="${v('team')}"></div>
    </div>
    <div class="field"><label for="${id('detail')}">Paket detayı ve istekler</label><textarea id="${id('detail')}" name="${id('detail')}" rows="3" maxlength="1500" placeholder="Bu gün için özel istekler, çekim süresi, ek hizmetler…">${v('detail')}</textarea></div>
  </div>`;
}

// Kişi kartı formu (yeni ve düzenleme ortak)
function appointmentPage(c, { values = {}, action, title, submitLabel, csrf, errors = [], talepId, back, demoAdmin, isNew, teamNames = [] }) {
  const o = c.appointments || {};
  const v = (k) => values[k] ?? '';
  const sel = (name, list, placeholder) => h`<select id="${name}" name="${name}"><option value="">${placeholder}</option>${(list || []).map((x) => h`<option${x === v(name) ? raw(' selected') : ''}>${x}</option>`)}</select>`;
  const chk = (name, label) => h`<label class="check"><input type="checkbox" name="${name}" value="1"${values[name] && values[name] !== '0' ? raw(' checked') : ''}><span>${label}</span></label>`;
  const idx = eventIndexes(values);
  const coupleId = (/\/admin\/ciftler\/(\d+)\//.exec(action) || [])[1] || '';
  const body = h`
  <div class="container container--form">
    <a class="back-link" href="${back}">${icon('left')}Geri</a>
    <h1 class="page-title">${title}</h1>
    ${errors.length ? h`<div class="flash flash--error" role="alert">${errors.map((e) => h`<div>${e}</div>`)}</div>` : ''}
    <form class="form appt-form" method="post" action="${action}" data-appt-form data-couple="${coupleId}">
      ${csrfField(csrf)}
      ${talepId ? h`<input type="hidden" name="talep" value="${talepId}">` : ''}
      <datalist id="pkg-list">${(o.packages || []).map((x) => h`<option value="${x}">`)}</datalist>
      <datalist id="team-list">${[...new Set([...(o.team || []), ...teamNames])].map((x) => h`<option value="${x}">`)}</datalist>

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
        <legend>Etkinlikler</legend>
        <p class="muted appt-help">Aynı kişi farklı günlerde farklı etkinlikler için randevu alabilir (örn. dış çekim, kına, düğün). Her tarih için ayrı paket ve istek girin.</p>
        <div class="ev-list" data-ev-list>
          ${idx.map((i, n) => eventBlock(c, values, i, n + 1))}
        </div>
        <template data-ev-template>${eventBlock(c, {}, '__i__', '__n__')}</template>
        <button type="button" class="btn btn--outline btn--sm ev-add" data-ev-add>${icon('plus')}Tarih ekle</button>
      </fieldset>

      <fieldset class="appt-group">
        <legend>Ödeme</legend>
        <div class="appt-sum" data-sum aria-live="polite"></div>
        ${isNew ? h`<div class="appt-row">
          <div class="field"><label for="deposit">Kapora (₺)</label><input id="deposit" name="deposit" type="text" inputmode="numeric" placeholder="0" value="${v('deposit')}" data-money data-deposit></div>
          <div class="field"><label for="depositDate">Kapora tarihi</label><input id="depositDate" name="depositDate" type="date" value="${v('depositDate')}"></div>
        </div>` : h`<p class="muted appt-help">Ödemeleri kişi kartındaki "Ödemeler" bölümünden ekleyin.</p>`}
      </fieldset>

      <fieldset class="appt-group">
        <legend>Teslim</legend>
        <div class="appt-row">
          <div class="field"><label for="dueDate">Teslim tarihi <span class="muted">(boşsa son etkinlikten ${o.defaultDeliveryDays || 45} gün sonra)</span></label><input id="dueDate" name="dueDate" type="date" value="${v('dueDate')}"></div>
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
  return panelLayout(c, { title, csrf, nav: adminNav('couples', csrf, demoAdmin), home: '/admin', tabs: adminTabs('couples', demoAdmin), body, scripts: ['/js/dashboard.js?v=2'] });
}

// Kişi kartı özeti, etkinlikler ve ödemeler (çift sayfasında)
function appointmentSummary(c, k, events, payments, csrf) {
  const pay = payment(k);
  const base = `/admin/ciftler/${k.id}`;
  const row = (label, value) => (value ? h`<div><dt>${label}</dt><dd>${value}</dd></div>` : '');
  return h`
  <section class="panel-section" aria-labelledby="card-title">
    <div class="panel-section__head appt-card__head">
      <h2 class="panel-section__title" id="card-title">Kişi kartı</h2>
      <div class="appt-card__actions">
        <a class="btn btn--outline btn--sm" href="${base}/belge">${icon('download')}Randevu belgesi</a>
        <a class="btn btn--primary btn--sm" href="${base}/duzenle">Düzenle</a>
      </div>
    </div>
    <div class="appt-cols">
      <dl class="appt-dl">
        ${row('Randevu no', k.ref_no)}
        ${row('Ad soyad', k.full_name)}
        ${row('Eş adı', k.partner_name)}
        ${k.phone ? h`<div><dt>Telefon</dt><dd><a href="tel:+${k.phone}">${displayPhone(k.phone)}</a> · <a href="https://wa.me/${k.phone}" target="_blank" rel="noopener">WhatsApp</a></dd></div>` : ''}
        ${row('Kaynak', k.source)}
        ${row('Teslim', k.due_date ? shortDate(k.due_date) : '')}
        <div><dt>Hazır</dt><dd>${[k.photo_ready && 'Fotoğraf', k.video_ready && 'Video', k.album_ready && 'Albüm'].filter(Boolean).join(', ') || 'Henüz yok'}</dd></div>
        ${row('Albüm bilgisi gönderildi', k.album_info_sent_at ? shortDate(k.album_info_sent_at) : '')}
        ${row('Notlar', k.notes)}
      </dl>

      <div>
        <h3 class="appt-sub">Etkinlikler <span class="muted">(${events.length})</span></h3>
        ${events.length ? h`<ol class="ev-view">${events.map((e) => h`
          <li class="ev-view__item">
            <div class="ev-view__date"><span class="ev-view__day">${e.event_date ? Number(e.event_date.slice(8)) : '—'}</span><span class="ev-view__mon">${e.event_date ? MONTHS[Number(e.event_date.slice(5, 7)) - 1].slice(0, 3) : ''}</span></div>
            <div class="ev-view__main">
              <span><strong>${e.event_type || 'Etkinlik'}</strong>${e.start_time ? h` · ${e.start_time}` : ''}</span>
              <span class="muted">${[e.venue, e.city].filter(Boolean).join(', ')}</span>
              ${e.package ? h`<span>${e.package}${e.price ? h` · ${tl(e.price)}` : ''}</span>` : e.price ? h`<span>${tl(e.price)}</span>` : ''}
              ${e.team ? h`<span class="muted">Ekip: ${e.team}</span>` : ''}
              ${e.package_detail ? h`<span class="ev-view__note">${e.package_detail}</span>` : ''}
            </div>
          </li>`)}</ol>` : h`<p class="muted">Etkinlik girilmedi.</p>`}
      </div>
    </div>
  </section>

  <section class="panel-section" id="odemeler" aria-labelledby="pay-title">
    <div class="panel-section__head">
      <h2 class="panel-section__title" id="pay-title">Ödemeler</h2>
    </div>
    <div class="pay-sum">
      <div><span class="pay-sum__label">Toplam</span><span class="pay-sum__num">${tl(k.total)}</span></div>
      <div><span class="pay-sum__label">Alınan</span><span class="pay-sum__num">${tl(k.paid)}</span></div>
      <div><span class="pay-sum__label">Kalan</span><span class="pay-sum__num">${tl(pay[2])}</span></div>
      <div><span class="pay-sum__label">Durum</span><span class="pay pay--${pay[0]}">${pay[1]}</span></div>
    </div>
    ${payments.length ? h`<ul class="pay-list">${payments.map((p) => h`
      <li><span>${shortDate(p.paid_on)}</span><strong>${tl(p.amount)}</strong><span class="muted">${[p.method, p.note].filter(Boolean).join(' · ')}</span>
        <form method="post" action="${base}/odeme/${p.id}/sil" data-confirm="${tl(p.amount)} ödeme kaydı silinsin mi?">${csrfField(csrf)}<button class="btn btn--text btn--sm btn--danger-text" type="submit" aria-label="Sil">${icon('trash')}</button></form>
      </li>`)}</ul>` : ''}
    ${pay[2] > 0 || !k.total ? h`<form class="pay-form" method="post" action="${base}/odeme">
      ${csrfField(csrf)}
      <div class="field"><label for="p-amount">Tutar (₺)</label><input id="p-amount" name="amount" type="text" inputmode="numeric" required value="${pay[2] ? pay[2].toLocaleString('tr-TR') : ''}" data-money></div>
      <div class="field"><label for="p-date">Tarih</label><input id="p-date" name="paidOn" type="date" value="${today()}"></div>
      <div class="field"><label for="p-method">Yöntem</label><select id="p-method" name="method"><option>IBAN</option><option>Nakit</option><option>Kart</option><option>Diğer</option></select></div>
      <div class="field"><label for="p-note">Not</label><input id="p-note" name="note" type="text" maxlength="120" placeholder="Örn. 2. taksit"></div>
      <button class="btn btn--outline btn--sm" type="submit">${icon('plus')}Ödeme ekle</button>
    </form>` : ''}
  </section>`;
}

// Randevu belgesi: yazdırılır veya "PDF olarak kaydet" ile paylaşılır
function appointmentDoc(c, { card: k, events, payments, back, forCouple }) {
  const pay = payment(k);
  const contact = c.contact || {};
  return String(h`<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Randevu belgesi ${k.ref_no || ''} — ${c.brand.name}</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="/css/style.css?v=6">
</head><body class="doc-body">
<div class="doc-tools">
  <a class="btn btn--text btn--sm" href="${back}">${icon('left')}Geri</a>
  <button class="btn btn--primary btn--sm" type="button" data-print>${icon('download')}Yazdır / PDF kaydet</button>
</div>
<main class="doc">
  <header class="doc__head">
    <div><p class="doc__brand" lang="en">${c.brand.name}</p><p class="doc__tag">${c.footer?.note || ''}</p></div>
    <div class="doc__ref"><span>Randevu no</span><strong>${k.ref_no || '—'}</strong><span>${shortDate(today())}</span></div>
  </header>
  <h1 class="doc__title">Randevu belgesi</h1>
  <dl class="doc__people">
    <div><dt>Ad soyad</dt><dd>${k.full_name || k.name}</dd></div>
    ${k.partner_name ? h`<div><dt>Eş adı</dt><dd>${k.partner_name}</dd></div>` : ''}
    ${k.phone ? h`<div><dt>Telefon</dt><dd>${displayPhone(k.phone)}</dd></div>` : ''}
  </dl>
  <table class="doc__table">
    <thead><tr><th>Tarih</th><th>Etkinlik</th><th>Yer</th><th>Paket</th><th class="num">Tutar</th></tr></thead>
    <tbody>${events.map((e) => h`<tr>
      <td>${shortDate(e.event_date)}${e.start_time ? h`<br><span class="muted">${e.start_time}</span>` : ''}</td>
      <td>${e.event_type}</td>
      <td>${[e.venue, e.city].filter(Boolean).join(', ')}</td>
      <td>${e.package}${e.package_detail ? h`<div class="doc__detail">${e.package_detail}</div>` : ''}</td>
      <td class="num">${e.price ? tl(e.price) : ''}</td></tr>`)}</tbody>
    <tfoot>
      <tr><td colspan="4">Toplam</td><td class="num">${tl(k.total)}</td></tr>
      ${payments.map((p) => h`<tr class="doc__paid"><td colspan="4">Ödeme · ${shortDate(p.paid_on)}${p.note ? ` · ${p.note}` : ''}</td><td class="num">− ${tl(p.amount)}</td></tr>`)}
      <tr class="doc__rest"><td colspan="4">Kalan bakiye</td><td class="num">${tl(pay[2])}</td></tr>
    </tfoot>
  </table>
  ${k.due_date ? h`<p class="doc__note">Tahmini teslim tarihi: ${shortDate(k.due_date)}</p>` : ''}
  <footer class="doc__foot">
    ${[contact.phone, contact.email, contact.instagram ? '@' + String(contact.instagram).replace(/^@/, '') : ''].filter(Boolean).join(' · ')}
  </footer>
</main>
<script src="/js/dashboard.js?v=2" defer></script>
</body></html>`);
}

// Aylık rapor: etkinlik sayısı, ciro (etkinlik ayına göre), tahsilat (ödeme ayına göre), müşteri kaynakları
function report(c, { year, events, payments, couples, csrf, demoAdmin }) {
  const months = MONTHS.map((name, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    const evs = events.filter((e) => e.event_date && e.event_date.startsWith(key));
    return { name, key, count: evs.length, revenue: evs.reduce((s, e) => s + e.price, 0), collected: payments.filter((p) => p.paid_on.startsWith(key)).reduce((s, p) => s + p.amount, 0) };
  });
  const maxRev = Math.max(1, ...months.map((m) => Math.max(m.revenue, m.collected)));
  const yearCouples = couples.filter((k) => events.some((e) => e.couple_id === k.id && e.event_date && e.event_date.startsWith(String(year))));
  const sources = new Map();
  for (const k of yearCouples) {
    const s = k.source || 'Belirtilmedi';
    const cur = sources.get(s) || { count: 0, revenue: 0 };
    cur.count++; cur.revenue += events.filter((e) => e.couple_id === k.id && e.event_date && e.event_date.startsWith(String(year))).reduce((x, e) => x + e.price, 0);
    sources.set(s, cur);
  }
  const srcList = [...sources.entries()].sort((a, b) => b[1].count - a[1].count);
  const maxSrc = Math.max(1, ...srcList.map(([, v]) => v.count));
  const types = new Map();
  for (const e of events) if (e.event_date && e.event_date.startsWith(String(year))) types.set(e.event_type || 'Diğer', (types.get(e.event_type || 'Diğer') || 0) + 1);
  const tot = months.reduce((a, m) => ({ count: a.count + m.count, revenue: a.revenue + m.revenue, collected: a.collected + m.collected }), { count: 0, revenue: 0, collected: 0 });
  const body = h`
  <div class="container">
    <div class="panel-title-row">
      <h1 class="page-title">Rapor · ${year}</h1>
      <div class="cal__nav">
        <a class="cal__btn" href="/admin/rapor?yil=${year - 1}" aria-label="Önceki yıl">${icon('left')}</a>
        <a class="cal__btn" href="/admin/rapor?yil=${year + 1}" aria-label="Sonraki yıl">${icon('right')}</a>
      </div>
    </div>
    <div class="stats stats--4">
      <div class="stat"><span class="stat__num">${tot.count}</span><span class="stat__label">Etkinlik</span></div>
      <div class="stat"><span class="stat__num">${yearCouples.length}</span><span class="stat__label">Müşteri</span></div>
      <div class="stat"><span class="stat__num stat__num--sm">${tl(tot.revenue)}</span><span class="stat__label">Ciro (etkinlik tarihine göre)</span></div>
      <div class="stat"><span class="stat__num stat__num--sm">${tl(tot.collected)}</span><span class="stat__label">Tahsilat</span></div>
    </div>

    <section class="panel-section">
      <div class="panel-section__head"><h2 class="panel-section__title">Aylara göre</h2>
        <p class="muted"><span class="legend legend--rev"></span>Ciro <span class="legend legend--col"></span>Tahsilat</p></div>
      <ul class="rbars">${months.map((m) => h`
        <li class="rbar">
          <span class="rbar__name">${m.name}</span>
          <span class="rbar__bars">
            <span class="rbar__bar rbar__bar--rev" data-pct="${Math.round(m.revenue / maxRev * 100)}"></span>
            <span class="rbar__bar rbar__bar--col" data-pct="${Math.round(m.collected / maxRev * 100)}"></span>
          </span>
          <span class="rbar__val">${m.count ? `${m.count} etkinlik · ` : ''}${tl(m.revenue)}</span>
        </li>`)}</ul>
    </section>

    <div class="report-cols">
      <section class="panel-section">
        <div class="panel-section__head"><h2 class="panel-section__title">Müşteri kaynakları</h2></div>
        ${srcList.length ? h`<ul class="rbars">${srcList.map(([name, v]) => h`
          <li class="rbar"><span class="rbar__name">${name}</span>
            <span class="rbar__bars"><span class="rbar__bar rbar__bar--rev" data-pct="${Math.round(v.count / maxSrc * 100)}"></span></span>
            <span class="rbar__val">${v.count} müşteri · ${tl(v.revenue)}</span></li>`)}</ul>` : h`<p class="muted">Bu yıl kayıt yok.</p>`}
      </section>
      <section class="panel-section">
        <div class="panel-section__head"><h2 class="panel-section__title">Etkinlik türleri</h2></div>
        ${types.size ? h`<ul class="plain-stats">${[...types.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => h`<li><span>${t}</span><strong>${n}</strong></li>`)}</ul>` : h`<p class="muted">Bu yıl kayıt yok.</p>`}
      </section>
    </div>
  </div>`;
  return panelLayout(c, { title: `Rapor ${year}`, csrf, nav: adminNav('report', csrf, demoAdmin), home: '/admin', tabs: adminTabs('report', demoAdmin), body });
}

function coupleDetail(c, { couple, card, events: evs, payments, photos, totalCount, favCount, view, csrf, flash: f, loginUrl, demoAdmin }) {
  const base = `/admin/ciftler/${couple.id}`;
  const body = h`
  <div class="container">
    <a class="back-link" href="/admin">${icon('left')}Panel</a>
    <div class="panel-title-row">
      <div>
        <h1 class="page-title">${couple.name}</h1>
        <p class="muted">${couple.ref_no ? couple.ref_no + ' · ' : ''}${card.types || ''}</p>
      </div>
    </div>
    ${flashBlock(f)}

    ${appointmentSummary(c, card, evs, payments, csrf)}

    ${statusBar(c.stages, couple.stage, couple.stage_note, 'İş durumu (çiftin gördüğü)')}

    <div class="admin-grid admin-grid--2">
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
    <section class="card account-logout">
      <h2 class="card__title">Diğer bölümler</h2>
      <div class="account-links">
        <a class="btn btn--outline btn--sm" href="/admin/rapor">${icon('chart')}Aylık rapor</a>
        <a class="btn btn--outline btn--sm" href="/admin/portfolyo">${icon('image')}Portfolyo</a>
      </div>
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

module.exports = { appointmentPage, appointmentDoc, report, calendar, adminNav, adminTabs, dashboard, coupleDetail, portfolioAdmin, account };
