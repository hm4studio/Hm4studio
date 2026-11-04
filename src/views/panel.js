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
  <section class="auth pui">
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
  <section class="panel-section cpage" id="plan" aria-labelledby="plan-title">
    <div class="panel-section__head">
      <h1 class="panel-section__title" id="plan-title">Çekim günü planı</h1>
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

// Çift paneli: ayrı sayfalar (Durum, Fotoğraflar, Video, Plan)
const COUPLE_PAGES = [
  { key: 'durum', href: '/panel', label: 'Durum', icon: 'clock' },
  { key: 'foto', href: '/panel/fotograflar', label: 'Fotoğraflar', icon: 'image' },
  { key: 'video', href: '/panel/video', label: 'Video', icon: 'play' },
  { key: 'plan', href: '/panel/plan', label: 'Plan', icon: 'pin' },
];

function coupleShell(c, { couple, page, csrf, flash: f, body, scripts = [] }) {
  const nav = h`<div class="panel-nav"><span class="panel-nav__who">${couple.name}</span>${config.demoMode ? h`<a class="panel-nav__link" href="/gorus?alan=${encodeURIComponent('Çift paneli')}">${icon('star')}<span>Görüş bildir</span></a>` : ''}${logoutForm(csrf)}</div>`;
  const content = h`
  <div class="container">
    <nav class="cpages" aria-label="Panel sayfaları">
      ${COUPLE_PAGES.map((p) => h`<a class="cpages__link" href="${p.href}"${p.key === page ? raw(' aria-current="page"') : ''}>${p.label}</a>`)}
    </nav>
    ${f ? flash(f.message, f.type) : ''}
    ${body}
  </div>`;
  const tabs = [
    ...COUPLE_PAGES.map((p) => ({ href: p.href, label: p.label, icon: p.icon, active: p.key === page })),
    { form: '/cikis', csrf, label: 'Çıkış', icon: 'logout' },
  ];
  const title = (COUPLE_PAGES.find((p) => p.key === page) || {}).label || 'Panelim';
  return panelLayout(c, { title, csrf, nav, body: content, scripts, tabs, home: '/panel' });
}

// Durum: iş durumu, randevular, ödeme
function couplePanel(c, { couple, card = null, events = [], totalCount = 0, videoCount = 0, csrf, flash: f }) {
  const body = h`
    <section class="welcome">
      <p class="eyebrow">Hoş geldiniz</p>
      <h1 class="page-title">${couple.name}</h1>
      ${couple.event_date ? h`<p class="muted">${formatDate(couple.event_date)}</p>` : ''}
    </section>

    <div class="install" data-install hidden>
      <img class="install__icon" src="/images/icon-192.png" alt="" width="48" height="48">
      <div class="install__copy"><p class="install__title">HM4 Studio’yu telefonunuza ekleyin</p><p class="install__text" data-install-text></p></div>
      <button type="button" class="btn btn--primary btn--sm" data-install-btn hidden>Ekle</button>
      <button type="button" class="install__close" data-install-close aria-label="Kapat">${icon('close')}</button>
    </div>

    <div id="durum">${statusBar(c.stages, couple.stage, couple.stage_note, 'İşinizin durumu', { status: couple.video_status, stages: c.appointments?.videoStages || [] })}</div>

    ${totalCount || videoCount ? h`<div class="cquick">
      ${totalCount ? h`<a class="cquick__item" href="/panel/fotograflar"><span class="cquick__num">${totalCount}</span><span>fotoğraf</span>${icon('right')}</a>` : ''}
      ${videoCount ? h`<a class="cquick__item" href="/panel/video"><span class="cquick__num">${videoCount}</span><span>video</span>${icon('right')}</a>` : ''}
    </div>` : ''}

    ${events.length ? h`<section class="panel-section" id="randevular" aria-labelledby="ev-title">
      <div class="panel-section__head appt-card__head">
        <h2 class="panel-section__title" id="ev-title">Randevularınız</h2>
        <a class="btn btn--outline btn--sm" href="/panel/belge">${icon('download')}Randevu belgesi</a>
      </div>
      <ul class="jobs">${events.map((e) => {
        const dt = e.event_date ? new Date(`${e.event_date}T12:00:00`) : null;
        return h`<li class="job">
          <div class="job__date" aria-hidden="true">${dt ? h`<span class="job__day">${dt.getDate()}</span><span class="job__mon">${dt.toLocaleDateString('tr-TR', { month: 'short' })}</span>` : h`<span class="job__day">—</span>`}</div>
          <div class="job__main"><strong>${e.event_type || 'Etkinlik'}${e.start_time ? ` · ${e.start_time}` : ''}</strong>
            <span class="muted">${[e.venue, e.city].filter(Boolean).join(', ')}</span></div>
        </li>`;
      })}</ul>
    </section>` : ''}

    ${card && card.total ? (() => {
      const kalan = Math.max(card.total - card.paid, 0);
      const tl = (n) => `${Number(n || 0).toLocaleString('tr-TR')} ₺`;
      return h`<section class="panel-section" id="odeme" aria-labelledby="pay-title">
        <div class="panel-section__head"><h2 class="panel-section__title" id="pay-title">Ödeme</h2></div>
        <dl class="cpay">
          <div><dt>Toplam</dt><dd>${tl(card.total)}</dd></div>
          <div><dt>Ödenen</dt><dd>${tl(card.paid)}</dd></div>
          <div><dt>Kalan</dt><dd class="${kalan ? 'is-due' : 'is-done'}">${kalan ? tl(kalan) : 'Ödendi'}</dd></div>
        </dl>
      </section>`;
    })() : ''}`;
  return coupleShell(c, { couple, page: 'durum', csrf, flash: f, body, scripts: ['/js/panel.js?v=4'] });
}

// Fotoğraflar: galeri, albüm seçimi, indirme
function couplePhotos(c, { couple, photos, totalCount, favCount, view, csrf, flash: f }) {
  const body = h`
    <section class="panel-section cpage" id="fotograflar" aria-labelledby="gallery-title">
      <div class="panel-section__head">
        <h1 class="panel-section__title" id="gallery-title">Fotoğraflarınız</h1>
        <p class="muted">Albümünüze girecek kareleri kalbe dokunarak seçin. Bitirince “Seçimi tamamladım”a basın.</p>
        ${totalCount ? h`<div class="dl-row">
          <a class="btn btn--outline btn--sm" href="/panel/indir" download>${icon('download')}Tümünü indir (${totalCount})</a>
          ${favCount ? h`<a class="btn btn--text btn--sm" href="/panel/indir?g=fav" download>${icon('download')}Seçimimi indir (${favCount})</a>` : ''}
        </div>` : ''}
      </div>
      ${totalCount ? albumBar(couple, favCount, { admin: false, csrf }) : ''}
      ${totalCount && !couple.album_locked ? h`<a class="selpill" href="/panel/fotograflar?g=fav" data-selpill hidden><span class="selpill__icon">${icon('heart')}</span><strong data-album-count>${favCount}</strong>&nbsp;/ ${couple.album_limit || 60} kare seçildi</a>` : ''}
      ${galleryTabs('/panel/fotograflar', view, totalCount, favCount)}
      ${photos.length ? h`
      <ul class="tiles" data-gallery>
        ${photos.map((p) => photoTile(p, { favEndpoint: '/panel/favori', csrf, locked: Boolean(couple.album_locked) }))}
      </ul>` : h`<div class="empty-box">${icon('image')}<p>${view === 'fav'
          ? 'Henüz albüm için kare seçmediniz. “Tüm fotoğraflar” sekmesinden kalbe dokunarak ekleyebilirsiniz.'
          : 'Fotoğraflarınız hazırlandığında burada görünecek.'}</p></div>`}
    </section>`;
  return coupleShell(c, { couple, page: 'foto', csrf, flash: f, body, scripts: ['/js/panel.js?v=4'] });
}

// Video: klip, film, reels — izle ve indir
function coupleVideos(c, { couple, videos, csrf, flash: f }) {
  const wide = videos.filter((v) => v.kind !== 'Reels');
  const reels = videos.filter((v) => v.kind === 'Reels');
  const item = (v) => h`
    <li class="vid${v.kind === 'Reels' ? ' vid--reel' : ''}">
      ${v.file_key ? h`<video class="vid__player" src="/v/${v.id}" controls playsinline preload="metadata"></video>`
        : h`<a class="vid__link" href="${v.link}" target="_blank" rel="noopener">${icon('play')}<span>İzlemek için dokunun</span></a>`}
      <div class="vid__meta">
        <div><p class="vid__title">${v.title || v.kind}</p><p class="vid__sub">${v.kind}${v.size ? ` · ${Math.max(1, Math.round(v.size / 1024 / 1024))} MB` : ''}</p></div>
        ${v.file_key ? h`<a class="btn btn--outline btn--sm" href="/v/${v.id}?indir=1" download>${icon('download')}İndir</a>`
          : h`<a class="btn btn--outline btn--sm" href="${v.link}" target="_blank" rel="noopener">Aç</a>`}
      </div>
    </li>`;
  const body = h`
    <section class="panel-section cpage" aria-labelledby="video-title">
      <div class="panel-section__head">
        <h1 class="panel-section__title" id="video-title">Videolarınız</h1>
        ${couple.video_status ? h`<p class="muted">Video durumu: ${couple.video_status}</p>` : ''}
      </div>
      ${videos.length ? h`
        ${wide.length ? h`<ul class="vids">${wide.map(item)}</ul>` : ''}
        ${reels.length ? h`<h2 class="vids__head">Reels</h2><ul class="vids vids--reels">${reels.map(item)}</ul>` : ''}`
        : h`<div class="empty-box">${icon('play')}<p>${couple.video_status ? 'Videonuz hazırlanıyor. Hazır olduğunda burada izleyip indirebileceksiniz.' : 'Videolarınız hazır olduğunda burada görünecek.'}</p></div>`}
    </section>`;
  return coupleShell(c, { couple, page: 'video', csrf, flash: f, body });
}

// Plan: çekim günü planı
function couplePlan(c, { couple, csrf, flash: f }) {
  return coupleShell(c, { couple, page: 'plan', csrf, flash: f, body: planSection(couple, csrf), scripts: ['/js/panel.js?v=4'] });
}

module.exports = { couplePhotos, coupleVideos, couplePlan, coupleLogin, adminLogin, couplePanel, photoTile, galleryTabs, logoutForm, formatDate, albumBar, planView };
