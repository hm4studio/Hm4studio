'use strict';
// Tekrar kullanılabilir arayüz parçaları: sayfa iskeleti, menü, alt bilgi, butonlar, galeri, durum çubuğu.
const { h, raw } = require('./html');
const { icon } = require('./icons');
const config = require('../config');

// Demo modunda her sayfanın üstünde görünen bilgi bandı
function demoBanner() {
  if (!config.demoMode) return '';
  return h`<div class="demo-banner" role="note">
    <span><strong>Demo sürüm.</strong> Çift ve stüdyo panellerini serbestçe deneyin; veriler ${config.demoResetHours} saatte bir sıfırlanır.</span>
    <a class="demo-banner__link" href="/gorus">Görüş bildir ${icon('arrow')}</a>
  </div>`;
}

// ── Bağlantı yardımcıları (iletişim bilgileri content/site.json'dan gelir) ──
const links = {
  whatsapp: (c) => `https://wa.me/${String(c.contact.whatsapp).replace(/\D/g, '')}?text=${encodeURIComponent(c.contact.whatsappMessage || '')}`,
  instagram: (c) => `https://www.instagram.com/${encodeURIComponent(c.contact.instagram)}/`,
  tel: (c) => `tel:${String(c.contact.phone).replace(/[^\d+]/g, '')}`,
  mail: (c) => `mailto:${String(c.contact.email).replace(/[\[\]\s]/g, '')}`,
};

const NAV = [
  { href: '/', label: 'Anasayfa', key: 'home' },
  { href: '/portfolyo', label: 'Portfolyo', key: 'portfolio' },
  { href: '/hakkimizda', label: 'Hakkımızda', key: 'about' },
  { href: '/iletisim', label: 'İletişim', key: 'contact' },
];

function brandMark(c) {
  return c.brand.logo
    ? h`<img class="brand__logo" src="${c.brand.logo}" alt="${c.brand.name}" width="140" height="40">`
    : h`<span class="brand__name" lang="en">${c.brand.name}</span>`;
}

// Duyuru bandı (Ayarlar › Site): kampanya, yeni sezon tarihleri vb.
function siteBanner(c) {
  const b = c.banner || {};
  if (!b.on || !b.text) return '';
  return h`<div class="site-banner"><div class="container site-banner__inner"><span>${b.text}</span>${b.link ? h`<a href="${b.link}">${b.linkText || 'İncele'}</a>` : ''}</div></div>`;
}

function siteHeader(c, active, overlay) {
  return h`
  <header class="site-header${overlay ? ' site-header--overlay' : ''}${c.brand.logoPosition === 'center' ? ' site-header--center' : ''}" data-header>
    <div class="container site-header__inner">
      <a class="brand" href="/" aria-label="${c.brand.name} — Anasayfa">${brandMark(c)}</a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" data-nav-toggle>
        ${icon('menu')}${icon('close')}<span class="sr-only">Menüyü aç</span>
      </button>
      <nav class="site-nav" id="site-nav" aria-label="Ana menü" data-nav>
        <ul class="site-nav__list">
          ${NAV.map((n) => h`<li><a href="${n.href}"${n.key === active ? raw(' aria-current="page"') : ''}>${n.label}</a></li>`)}
        </ul>
        <a class="site-nav__login" href="/giris">${icon('lock')}<span>Çift Girişi</span></a>
      </nav>
    </div>
  </header>`;
}

function siteFooter(c) {
  const year = new Date().getFullYear();
  return h`
  <footer class="site-footer">
    <div class="container site-footer__inner">
      <div class="site-footer__brand">
        <a class="brand" href="/">${brandMark(c)}</a>
        <p>${c.footer.note}</p>
      </div>
      <nav class="site-footer__nav" aria-label="Alt menü">
        ${NAV.map((n) => h`<a href="${n.href}">${n.label}</a>`)}
        <a href="/giris">Çift Girişi</a>
        ${config.demoMode ? h`<a href="/gorus">Görüş bildir</a>` : ''}
      </nav>
      <div class="site-footer__social">
        <a class="icon-link" href="${links.instagram(c)}" target="_blank" rel="noopener">${icon('instagram')}<span>@${c.contact.instagram}</span></a>
        <a class="icon-link" href="${links.whatsapp(c)}" target="_blank" rel="noopener">${icon('whatsapp')}<span>WhatsApp</span></a>
      </div>
    </div>
    <div class="container site-footer__base">
      <span>© ${year} ${c.brand.name}</span>
      <span>Tüm fotoğrafların hakları saklıdır. · <a href="/kvkk">KVKK aydınlatma metni</a></span>
    </div>
  </footer>`;
}

function head({ title, description, csrf, bodyClass = '' }) {
  return h`<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
${description ? h`<meta name="description" content="${description}">` : ''}
<meta property="og:title" content="${title}">
${description ? h`<meta property="og:description" content="${description}">` : ''}
<meta name="theme-color" content="#1c1a18">
${config.demoMode ? raw('<meta name="robots" content="noindex, nofollow">') : ''}
${csrf ? h`<meta name="csrf-token" content="${csrf}">` : ''}
<link rel="icon" href="/images/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/images/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="HM4 Studio">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Inter:wght@400;500;600&family=Geist:wght@300;400;500;600&display=swap">
<link rel="stylesheet" href="/css/style.css?v=28">
<link rel="stylesheet" href="/css/tema.css">
</head>
<body class="${bodyClass}">
<a class="skip-link" href="#main">İçeriğe geç</a>`;
}

// Herkese açık sayfa iskeleti
function publicLayout(c, { title, description, active, overlayHeader = false, body }) {
  return String(h`${head({ title: title ? `${title} — ${c.brand.name}` : c.seo.title, description: description || c.seo.description })}
${demoBanner()}
${siteBanner(c)}
${siteHeader(c, active, overlayHeader)}
<main id="main">${body}</main>
${siteFooter(c)}
<script src="/js/site.js?v=6" defer></script>
<script src="/js/pwa.js?v=2" defer></script>
</body>
</html>`);
}

// Telefonda panelin altında duran sekme menüsü (uygulama gibi)
function tabbar(items) {
  if (!items || !items.length) return '';
  return h`<nav class="tabbar" aria-label="Uygulama menüsü">
    ${items.map((t) => t.form
      ? h`<form method="post" action="${t.form}" class="tabbar__form"><input type="hidden" name="csrf" value="${t.csrf}"><button type="submit" class="tabbar__item">${icon(t.icon)}<span>${t.label}</span></button></form>`
      : h`<a class="tabbar__item" href="${t.href}"${t.active ? raw(' aria-current="page"') : ''}>${icon(t.icon)}<span>${t.label}</span></a>`)}
  </nav>`;
}

// Çift ve admin panelleri için sade iskelet
function panelLayout(c, { title, csrf, nav, body, scripts = [], tabs = [], home = '/' }) {
  return String(h`${head({ title: `${title} — ${c.brand.name}`, csrf, bodyClass: home === '/admin' ? 'panel-body pui is-admin' : 'panel-body pui' })}
${demoBanner()}
<header class="panel-header">
  <div class="container panel-header__inner">
    <a class="brand" href="${home}">${brandMark(c)}</a>
    ${nav || ''}
  </div>
</header>
<main id="main" class="panel-main${tabs.length ? ' has-tabbar' : ''}">${body}</main>
${tabbar(tabs)}
<script src="/js/site.js?v=6" defer></script>
<script src="/js/pwa.js?v=2" defer></script>
${scripts.map((s) => h`<script src="${s}" defer></script>`)}
</body>
</html>`);
}

function button(href, label, variant = 'primary', iconName) {
  return h`<a class="btn btn--${variant}" href="${href}">${label}${iconName ? icon(iconName) : ''}</a>`;
}

function sectionHead({ eyebrow, title, text, align = 'left' }) {
  return h`
  <div class="section-head section-head--${align}">
    ${eyebrow ? h`<p class="eyebrow">${eyebrow}</p>` : ''}
    <h2 class="section-title">${title}</h2>
    ${text ? h`<p class="section-text">${text}</p>` : ''}
  </div>`;
}

// Fotoğraf yokken gösterilen zarif yer tutucu
function placeholder(label, ratio = 'portrait') {
  return h`<div class="ph ph--${ratio}" role="img" aria-label="${label}"><span>${icon('image')}${label}</span></div>`;
}

// Herkese açık portfolyo ızgarası (dokununca büyük görüntüleme açılır)
function portfolioGrid(items, { limit } = {}) {
  const list = limit ? items.slice(0, limit) : items;
  return h`
  <ul class="gallery" data-gallery>
    ${list.map((p, i) => h`
    <li class="gallery__item" data-category="${p.category}">
      <a class="gallery__link" href="${p.display}" data-lb data-caption="${p.alt || p.category}">
        <img src="${p.thumb}" alt="${p.alt || `${p.category || 'Düğün'} fotoğrafı`}" loading="${i < 4 ? 'eager' : 'lazy'}" decoding="async" width="600" height="750">
      </a>
    </li>`)}
  </ul>`;
}

// İş aşamaları durum çubuğu (çift ve admin panelinde)
function statusBar(stages, current, note, title = 'İşinizin durumu', video = null) {
  const last = stages.length - 1;
  const pct = Math.round((Math.min(current, last) / last) * 100);
  return h`
  <section class="status" aria-labelledby="status-title">
    <div class="status__head">
      <h2 class="status__title" id="status-title">${title}</h2>
      <p class="status__current">Şu an: <strong>${stages[current] || stages[0]}</strong></p>
    </div>
    <div class="status__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="İlerleme">
      <span class="status__fill" data-pct="${pct}"></span>
    </div>
    <ol class="status__steps">
      ${stages.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return h`<li class="status__step status__step--${state}"${state === 'current' ? raw(' aria-current="step"') : ''}>
          <span class="status__dot">${state === 'done' || (state === 'current' && i === last) ? icon('check') : String(i + 1)}</span>
          <span class="status__label">${s}</span>
        </li>`;
      })}
    </ol>
    ${video && video.status ? (() => {
      const vi = video.stages.indexOf(video.status);
      return h`<div class="vstat">
        <span class="vstat__label">${icon('play')}Video</span>
        <span class="vstat__dots" aria-hidden="true">${video.stages.map((s, i) => h`<i class="${i < vi ? 'is-done' : i === vi ? 'is-now' : ''}"></i>`)}</span>
        <span class="vstat__now">${video.status}</span>
      </div>`;
    })() : ''}
    ${note ? h`<p class="status__note">${note}</p>` : ''}
  </section>`;
}

function flash(message, type = 'info') {
  if (!message) return '';
  return h`<div class="flash flash--${type}" role="status">${message}</div>`;
}

module.exports = { demoBanner, links, publicLayout, panelLayout, button, sectionHead, placeholder, portfolioGrid, statusBar, flash, icon, h, raw };
