'use strict';
// Giriş sayfaları ve çift paneli.
const { h, raw } = require('./html');
const { publicLayout, panelLayout, statusBar, flash, icon } = require('./components');
const config = require('../config');
const { PLAN_FIELDS, parsePlan } = require('../jobs');

// Demo modunda giriş ekranındaki "tek tıkla dene" kutusu
function demoTry(kind) {
  if (!config.demoMode) return '';
  return h`
  <div class="demo-try">
    <p class="demo-try__title">Demoyu deneyin</p>
    <p class="muted">Şifre gerekmez. Örnek verilerle açılır.</p>
    <div class="demo-try__actions">
      <form method="post" action="/demo/cift"><button class="btn ${kind === 'couple' ? 'btn--primary' : 'btn--outline'} btn--block" type="submit">Çift olarak gir</button></form>
      <form method="post" action="/demo/admin"><button class="btn ${kind === 'admin' ? 'btn--primary' : 'btn--outline'} btn--block" type="submit">Stüdyo (admin) olarak gir</button></form>
    </div>
  </div>`;
}

function loginForm({ action, title, lead, codeLabel, codeName, error, values = {}, note, demoKind }) {
  return h`
  <section class="auth">
    <div class="auth__card">
      <span class="auth__icon">${icon('lock')}</span>
      <h1 class="auth__title">${title}</h1>
      <p class="auth__lead">${lead}</p>
      ${demoTry(demoKind)}
      ${flash(error, 'error')}
      ${note ? h`<p class="auth__note">${note}</p>` : h`
      <form class="form" method="post" action="${action}" novalidate>
        <div class="field">
          <label for="code">${codeLabel}</label>
          <input id="code" name="${codeName}" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required value="${values.code || ''}">
        </div>
        <div class="field">
          <label for="password">Şifre</label>
          <input id="password" name="password" type="password" autocomplete="current-password" required>
        </div>
        <button class="btn btn--primary btn--block" type="submit">Giriş yap</button>
      </form>`}
    </div>
  </section>`;
}

function coupleLogin(c, { error, values } = {}) {
  const body = h`${loginForm({
    action: '/giris',
    title: 'Çift Girişi',
    lead: 'Size verilen erişim kodu ve şifreyle fotoğraflarınızı görün, favorilerinizi seçin ve işinizin durumunu takip edin.',
    codeLabel: 'Erişim kodu',
    codeName: 'code',
    error,
    values,
    demoKind: 'couple',
  })}
  <p class="auth__help">Erişim kodunuzu bilmiyor musunuz? <a href="/iletisim">Bize ulaşın</a>.</p>`;
  return publicLayout(c, { title: 'Çift Girişi', body });
}

function adminLogin(c, { error, values, noAdmin } = {}) {
  const body = loginForm({
    action: '/admin/giris',
    title: 'Yönetim Paneli',
    lead: 'Stüdyo yöneticisi girişi.',
    codeLabel: 'Kullanıcı adı',
    codeName: 'username',
    error,
    values,
    note: noAdmin && !config.demoMode ? 'Henüz yönetici hesabı yok. Sunucuda "npm run admin" komutunu çalıştırarak oluşturun.' : null,
    demoKind: 'admin',
  });
  return publicLayout(c, { title: 'Yönetim Paneli', body });
}

function logoutForm(csrf, label = 'Çıkış') {
  return h`<form method="post" action="/cikis" class="inline-form">
    <input type="hidden" name="csrf" value="${csrf}">
    <button class="btn btn--text" type="submit">${icon('logout')}<span>${label}</span></button>
  </form>`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Çift ve admin galerilerinde ortak fotoğraf kutusu
function photoTile(p, { favEndpoint, canDelete, csrf, deleteAction, locked }) {
  const fav = Boolean(p.is_fav);
  return h`
  <li class="tile${fav ? ' is-fav' : ''}" data-tile>
    <a class="tile__img" href="/m/${p.id}/display" data-lb data-caption="${p.original_name || ''}">
      <img src="/m/${p.id}/thumb" alt="${p.original_name || 'Fotoğraf'}" loading="lazy" decoding="async" width="640" height="640">
    </a>
    <div class="tile__bar">
      <button type="button" class="tile__fav" data-fav="${favEndpoint}" data-photo="${p.id}" aria-pressed="${fav ? 'true' : 'false'}" aria-label="${fav ? 'Albümden çıkar' : 'Albüme ekle'}"${locked ? raw(' disabled') : ''}>
        ${icon('heart')}
      </button>
      <a class="tile__btn" href="/m/${p.id}/${p.original_ext ? 'original' : 'display'}?indir=1" aria-label="İndir">${icon('download')}</a>
      ${canDelete ? h`<form method="post" action="${deleteAction}" class="inline-form" data-confirm="Bu fotoğraf kalıcı olarak silinsin mi?">
        <input type="hidden" name="csrf" value="${csrf}">
        <button type="submit" class="tile__btn tile__btn--danger" aria-label="Sil">${icon('trash')}</button>
      </form>` : ''}
    </div>
  </li>`;
}

function galleryTabs(base, view, total, favs) {
  return h`
  <div class="tabs" role="tablist" aria-label="Galeri görünümü">
    <a class="tab${view !== 'fav' ? ' is-active' : ''}" href="${base}" ${view !== 'fav' ? raw('aria-current="page"') : ''}>Tüm fotoğraflar <span class="tab__count">${total}</span></a>
    <a class="tab${view === 'fav' ? ' is-active' : ''}" href="${base}?g=fav" ${view === 'fav' ? raw('aria-current="page"') : ''}>${icon('heart')}Albüm seçimi <span class="tab__count" data-fav-count>${favs}</span></a>
  </div>`;
}

// Albüm seçimi: sayaç, ilerleme ve "Seçimi tamamladım"
function albumBar(couple, favCount, { admin, csrf, base }) {
  const limit = couple.album_limit || 60;
  const locked = Boolean(couple.album_locked);
  const pct = Math.min(100, Math.round((favCount / limit) * 100));
  let action;
  if (locked) {
    action = h`<span class="badge badge--done">${icon('check')}Seçim tamamlandı</span>${admin ? h`
      <form method="post" action="${base}/album-kilit" class="inline-form">
        <input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="locked" value="0">
        <button class="btn btn--text btn--sm" type="submit">Kilidi aç</button>
      </form>` : ''}`;
  } else if (admin) {
    action = h`<span class="muted">Çift seçim yapıyor</span>`;
  } else {
    action = h`<form method="post" action="/panel/album-tamamla" class="inline-form" data-confirm="Seçiminiz HM4 Studio'ya gönderilsin mi? Sonrasında değişiklik için bize yazmanız gerekir.">
      <input type="hidden" name="csrf" value="${csrf}">
      <button class="btn btn--primary btn--sm" type="submit" data-album-lock${favCount ? '' : raw(' disabled')}>Seçimi tamamladım</button>
    </form>`;
  }
  return h`
  <div class="album-bar" data-album data-limit="${limit}">
    <div class="album-bar__info">
      <p class="album-bar__title">Albüm seçimi</p>
      <p class="album-bar__count"><strong data-album-count>${favCount}</strong> / ${limit} kare</p>
      <div class="album-bar__track" role="progressbar" aria-valuemin="0" aria-valuemax="${limit}" aria-valuenow="${favCount}" aria-label="Albüm seçimi"><span class="album-bar__fill" data-pct="${pct}"></span></div>
    </div>
    <div class="album-bar__action">${action}</div>
  </div>
  ${locked && !admin ? h`<p class="album-note">Seçiminiz HM4 Studio’ya iletildi. Değiştirmek isterseniz bize yazın.</p>` : ''}`;
}

function planSection(couple, csrf) {
  const plan = parsePlan(couple);
  const field = (f) => h`
    <div class="field">
      <label for="pl-${f.key}">${f.label}</label>
      ${f.area
        ? h`<textarea id="pl-${f.key}" name="${f.key}" rows="4" maxlength="${f.max}" placeholder="${f.placeholder}">${plan[f.key] || ''}</textarea>`
        : h`<input id="pl-${f.key}" name="${f.key}" type="text" maxlength="${f.max}" placeholder="${f.placeholder}" value="${plan[f.key] || ''}">`}
    </div>`;
  return h`
  <section class="panel-section" id="plan" aria-labelledby="plan-title">
    <div class="panel-section__head">
      <h2 class="panel-section__title" id="plan-title">Çekim günü planı</h2>
      <p class="muted">Günün akışını ve adresleri buraya yazın; ekibimiz çekimden önce bu planla hazırlanır. İstediğiniz zaman güncelleyebilirsiniz.</p>
    </div>
    <form class="card form" method="post" action="/panel/plan">
      <input type="hidden" name="csrf" value="${csrf}">
      <div class="plan-grid">${PLAN_FIELDS.filter((f) => !f.area).map(field)}</div>
      ${PLAN_FIELDS.filter((f) => f.area).map(field)}
      <div class="plan-foot">
        <button class="btn btn--primary" type="submit">Planı kaydet</button>
        ${plan.saved ? h`<span class="muted">Son kayıt: ${formatDate(plan.saved)}</span>` : ''}
      </div>
    </form>
  </section>`;
}

// Admin tarafında planın okunur hâli
function planView(couple) {
  const plan = parsePlan(couple);
  const rows = PLAN_FIELDS.filter((f) => plan[f.key]);
  return h`
  <section class="panel-section" aria-labelledby="planv-title">
    <div class="panel-section__head">
      <h2 class="panel-section__title" id="planv-title">Çekim günü planı</h2>
      <p class="muted">${plan.saved ? `Çiftin doldurduğu plan · son güncelleme ${formatDate(plan.saved)}` : 'Çift henüz planı doldurmadı.'}</p>
    </div>
    ${rows.length ? h`<dl class="plan-view">${rows.map((f) => h`<div><dt>${f.short}</dt><dd>${plan[f.key]}</dd></div>`)}</dl>` : ''}
  </section>`;
}

function couplePanel(c, { couple, photos, totalCount, favCount, view, csrf, flash: f }) {
  const nav = h`<div class="panel-nav"><span class="panel-nav__who">${couple.name}</span>${config.demoMode ? h`<a class="panel-nav__link" href="/gorus?alan=${encodeURIComponent('Çift paneli')}">${icon('star')}<span>Görüş bildir</span></a>` : ''}${logoutForm(csrf)}</div>`;
  const body = h`
  <div class="container">
    <section class="welcome">
      <p class="eyebrow">Hoş geldiniz</p>
      <h1 class="page-title">${couple.name}</h1>
      ${couple.event_date ? h`<p class="muted">${formatDate(couple.event_date)}</p>` : ''}
    </section>
    ${f ? flash(f.message, f.type) : ''}

    <nav class="subnav" aria-label="Panel bölümleri">
      <a class="chip" href="#durum">İş durumu</a>
      <a class="chip" href="#fotograflar">Fotoğraflar ve albüm</a>
      <a class="chip" href="#plan">Çekim günü planı</a>
    </nav>

    <div class="install" data-install hidden>
      <img class="install__icon" src="/images/icon-192.png" alt="" width="48" height="48">
      <div class="install__copy"><p class="install__title">HM4 Studio’yu telefonunuza ekleyin</p><p class="install__text" data-install-text></p></div>
      <button type="button" class="btn btn--primary btn--sm" data-install-btn hidden>Ekle</button>
      <button type="button" class="install__close" data-install-close aria-label="Kapat">${icon('close')}</button>
    </div>

    <div id="durum">${statusBar(c.stages, couple.stage, couple.stage_note)}</div>

    <section class="panel-section" id="fotograflar" aria-labelledby="gallery-title">
      <div class="panel-section__head">
        <h2 class="panel-section__title" id="gallery-title">Fotoğraflarınız</h2>
        <p class="muted">Albümünüze girecek kareleri kalbe dokunarak seçin. Bitirince “Seçimi tamamladım”a basın.</p>
      </div>
      ${totalCount ? albumBar(couple, favCount, { admin: false, csrf }) : ''}
      ${galleryTabs('/panel', view, totalCount, favCount)}
      ${photos.length ? h`
      <ul class="tiles" data-gallery>
        ${photos.map((p) => photoTile(p, { favEndpoint: '/panel/favori', csrf, locked: Boolean(couple.album_locked) }))}
      </ul>` : h`<div class="empty-box">${icon('image')}<p>${view === 'fav'
          ? 'Henüz albüm için kare seçmediniz. “Tüm fotoğraflar” sekmesinden kalbe dokunarak ekleyebilirsiniz.'
          : 'Fotoğraflarınız hazırlandığında burada görünecek.'}</p></div>`}
    </section>

    ${planSection(couple, csrf)}
  </div>`;
  const tabs = [
    { href: '/panel#durum', label: 'Durum', icon: 'clock' },
    { href: '/panel', label: 'Fotoğraflar', icon: 'image', active: view !== 'fav' },
    { href: '/panel?g=fav', label: 'Albüm', icon: 'heart', active: view === 'fav' },
    { href: '/panel#plan', label: 'Plan', icon: 'pin' },
    { form: '/cikis', csrf, label: 'Çıkış', icon: 'logout' },
  ];
  return panelLayout(c, { title: 'Panelim', csrf, nav, body, scripts: ['/js/panel.js?v=2'], tabs });
}

module.exports = { coupleLogin, adminLogin, couplePanel, photoTile, galleryTabs, logoutForm, formatDate, albumBar, planView };
