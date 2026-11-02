'use strict';
// Telefon uygulamasının (ana ekrana eklenen) açılış ekranı: yalnızca çift ve stüdyo girişi.
// Sitenin menüsü, alt bilgisi ve diğer sayfaları burada gösterilmez.
const { h, raw } = require('./html');
const config = require('../config');

function appLogin(c, { mode = 'cift', error, values = {}, heroUrl, noAdmin }) {
  const isCouple = mode !== 'studyo';
  const title = isCouple ? 'Çift Girişi' : 'Stüdyo Girişi';
  return String(h`<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title} — ${c.brand.name}</title>
<meta name="theme-color" content="#1c1a18">
<meta name="robots" content="noindex">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/images/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/images/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${c.brand.name}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Inter:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/css/style.css?v=3">
</head>
<body class="app-body">
<main class="app-login" id="main">
  <div class="app-login__media" aria-hidden="true">
    ${heroUrl ? h`<img src="${heroUrl}" alt="">` : ''}
    <div class="app-login__shade"></div>
    <div class="app-login__brand"><span class="brand__name" lang="en">${c.brand.name}</span><span class="app-login__tag">${c.brand.tagline}</span></div>
  </div>

  <section class="app-login__sheet" aria-labelledby="app-title">
    <nav class="app-switch" aria-label="Giriş türü">
      <a class="app-switch__item" href="/uygulama"${isCouple ? raw(' aria-current="page"') : ''}>Çift</a>
      <a class="app-switch__item" href="/uygulama?giris=studyo"${!isCouple ? raw(' aria-current="page"') : ''}>Stüdyo</a>
    </nav>

    <h1 class="app-login__title" id="app-title">${isCouple ? 'Fotoğraflarınıza hoş geldiniz' : 'Stüdyo paneli'}</h1>
    <p class="app-login__lead">${isCouple
      ? 'Size verilen erişim kodu ve şifreyle giriş yapın.'
      : 'Çiftleri, teslimleri ve portfolyoyu buradan yönetin.'}</p>

    ${error ? h`<div class="flash flash--error" role="alert">${error}</div>` : ''}

    ${!isCouple && noAdmin && !config.demoMode ? h`<p class="auth__note">Henüz yönetici hesabı yok. Sunucuda "npm run admin" komutuyla oluşturun.</p>` : h`
    <form class="form" method="post" action="${isCouple ? '/giris' : '/admin/giris'}" novalidate>
      <input type="hidden" name="app" value="1">
      <div class="field">
        <label for="code">${isCouple ? 'Erişim kodu' : 'Kullanıcı adı'}</label>
        <input id="code" name="${isCouple ? 'code' : 'username'}" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required value="${values.code || ''}">
      </div>
      <div class="field">
        <label for="password">Şifre</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required>
      </div>
      <button class="btn btn--primary btn--block" type="submit">Giriş yap</button>
    </form>`}

    ${config.demoMode ? h`
    <form method="post" action="${isCouple ? '/demo/cift' : '/demo/admin'}" class="app-login__demo">
      <button class="btn btn--outline btn--block" type="submit">Demo ${isCouple ? 'çift' : 'stüdyo'} hesabıyla dene</button>
    </form>` : ''}

    <p class="app-login__help">${isCouple
      ? raw('Erişim kodunuzu bilmiyor musunuz? Stüdyonuzdan isteyin.')
      : raw('Şifrenizi unuttuysanız sunucuda <code>npm run admin</code> ile yenileyin.')}</p>
  </section>
</main>
<script src="/js/pwa.js?v=1" defer></script>
</body>
</html>`);
}

module.exports = { appLogin };
