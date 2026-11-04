'use strict';
// Telefon uygulamasının (ana ekrana eklenen) açılış ekranı: tek bir giriş formu.
// Çiftler erişim koduyla, stüdyo yöneticisi kendi kullanıcı adıyla aynı formdan girer;
// sistem kimin girdiğini kendisi anlar. Sitenin menüsü ve diğer sayfaları burada gösterilmez.
const { h, raw } = require('./html');
const config = require('../config');

function appLogin(c, { error, values = {}, heroUrl }) {
  return String(h`<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Giriş — ${c.brand.name}</title>
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
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Inter:wght@400;500;600&family=Geist:wght@300;400;500;600&display=swap">
<link rel="stylesheet" href="/css/style.css?v=14">
</head>
<body class="app-body pui">
<main class="app-login" id="main">
  <div class="app-login__media" aria-hidden="true">
    ${heroUrl ? h`<img src="${heroUrl}" alt="">` : ''}
    <div class="app-login__shade"></div>
    <div class="app-login__brand"><span class="brand__name" lang="en">${c.brand.name}</span><span class="app-login__tag">${c.brand.tagline}</span></div>
  </div>

  <section class="app-login__sheet" aria-labelledby="app-title">
    <h1 class="app-login__title" id="app-title">Fotoğraflarınıza hoş geldiniz</h1>
    <p class="app-login__lead">Size verilen erişim kodu ve şifreyle giriş yapın.</p>

    ${error ? h`<div class="flash flash--error" role="alert">${error}</div>` : ''}

    <form class="form" method="post" action="/giris" novalidate>
      <input type="hidden" name="app" value="1">
      <div class="field">
        <label for="code">Erişim kodu</label>
        <input id="code" name="code" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required value="${values.code || ''}">
      </div>
      <div class="field">
        <label for="password">Şifre</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required>
      </div>
      <button class="btn btn--primary btn--block" type="submit">Giriş yap</button>
    </form>

    ${config.demoMode ? h`
    <form method="post" action="/demo/cift" class="app-login__demo">
      <button class="btn btn--outline btn--block" type="submit">Demo hesabıyla dene</button>
    </form>` : ''}

    <p class="app-login__help">${raw('Erişim kodunuzu bilmiyor musunuz? Stüdyonuzdan isteyin.')}</p>
  </section>
</main>
<script src="/js/pwa.js?v=2" defer></script>
</body>
</html>`);
}

module.exports = { appLogin };
