'use strict';
// Giriş sayfaları ve çift paneli.
const { h, raw } = require('./html');
const { publicLayout, panelLayout, statusBar, flash, icon } = require('./components');
const config = require('../config');

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
function photoTile(p, { favEndpoint, canDelete, csrf, deleteAction }) {
  const fav = Boolean(p.is_fav);
  return h`
  <li class="tile${fav ? ' is-fav' : ''}" data-tile>
    <a class="tile__img" href="/m/${p.id}/display" data-lb data-caption="${p.original_name || ''}">
      <img src="/m/${p.id}/thumb" alt="${p.original_name || 'Fotoğraf'}" loading="lazy" decoding="async" width="640" height="640">
    </a>
    <div class="tile__bar">
      <button type="button" class="tile__fav" data-fav="${favEndpoint}" data-photo="${p.id}" aria-pressed="${fav ? 'true' : 'false'}" aria-label="Favorilere ekle">
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
    <a class="tab${view === 'fav' ? ' is-active' : ''}" href="${base}?g=fav" ${view === 'fav' ? raw('aria-current="page"') : ''}>${icon('heart')}Favoriler <span class="tab__count" data-fav-count>${favs}</span></a>
  </div>`;
}

function couplePanel(c, { couple, photos, totalCount, favCount, view, csrf }) {
  const nav = h`<div class="panel-nav"><span class="panel-nav__who">${couple.name}</span>${config.demoMode ? h`<a class="panel-nav__link" href="/gorus?alan=${encodeURIComponent('Çift paneli')}">${icon('star')}<span>Görüş bildir</span></a>` : ''}${logoutForm(csrf)}</div>`;
  const body = h`
  <div class="container">
    <section class="welcome">
      <p class="eyebrow">Hoş geldiniz</p>
      <h1 class="page-title">${couple.name}</h1>
      ${couple.event_date ? h`<p class="muted">${formatDate(couple.event_date)}</p>` : ''}
    </section>

    ${statusBar(c.stages, couple.stage, couple.stage_note)}

    <section class="panel-section" aria-labelledby="gallery-title">
      <div class="panel-section__head">
        <h2 class="panel-section__title" id="gallery-title">Fotoğraflarınız</h2>
        <p class="muted">Beğendiğiniz fotoğrafları kalp simgesine dokunarak favorilerinize ekleyin. Seçiminizi biz de görüyoruz.</p>
      </div>
      ${galleryTabs('/panel', view, totalCount, favCount)}
      ${photos.length ? h`
      <ul class="tiles" data-gallery>
        ${photos.map((p) => photoTile(p, { favEndpoint: '/panel/favori', csrf }))}
      </ul>` : h`<div class="empty-box">${icon('image')}<p>${view === 'fav'
          ? 'Henüz favori seçmediniz. "Tüm fotoğraflar" sekmesinden kalbe dokunarak ekleyebilirsiniz.'
          : 'Fotoğraflarınız hazırlandığında burada görünecek.'}</p></div>`}
    </section>
  </div>`;
  return panelLayout(c, { title: 'Panelim', csrf, nav, body, scripts: ['/js/panel.js?v=1'] });
}

module.exports = { coupleLogin, adminLogin, couplePanel, photoTile, galleryTabs, logoutForm, formatDate };
