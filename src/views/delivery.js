'use strict';
// Teslim tutanağı: ofiste teslimde çift ekranda imzalar; yazdırılabilir belge (stüdyo ve çift panelinden).
const { h, raw } = require('./html');
const { panelLayout, icon } = require('./components');
const { adminNav, adminTabs } = require('./admin');
const { trTime } = require('./contract');

const tl = (n) => `${Number(n || 0).toLocaleString('tr-TR')} ₺`;
const snap = (d) => { try { return JSON.parse(d.snapshot || '{}') || {}; } catch { return {}; } };

// Ofiste açılan imza sayfası (stüdyonun cihazında; çift parmağıyla imzalar)
function formPage(c, { couple, items, existing = [], balance = 0, values = {}, errors = [], csrf, demoAdmin }) {
  const base = `/admin/ciftler/${couple.id}`;
  const chosen = values.item ? new Set([].concat(values.item)) : null;
  const rows = [...items.map((name, i) => ({ name, i })), ...[0, 1].map((j) => ({ name: '', i: items.length + j }))];
  const body = h`
  <div class="container container--form">
    <a class="back-link" href="${base}">${icon('left')}${couple.name}</a>
    <h1 class="page-title">Teslim tutanağı</h1>
    ${errors.length ? h`<div class="flash flash--error" role="alert">${errors.map((e) => h`<div>${e}</div>`)}</div>` : ''}
    ${balance > 0 ? h`<div class="flash flash--error" role="status">Dikkat: kalan ödeme ${tl(balance)}. Teslimden önce tahsil etmek isteyebilirsiniz.</div>` : ''}
    ${existing.length ? h`<p class="muted">Bu çift için daha önce ${existing.length} tutanak imzalandı: ${existing.map((d, i) => h`${i ? ', ' : ''}<a href="${base}/teslim/${d.id}">${trTime(d.created_at)}</a>`)}. Yeni tutanak ayrıca kaydedilir (ör. albüm sonradan teslim edildiyse).</p>` : ''}
    <form class="form ct-form dl-form" method="post" action="${base}/teslim" data-sign-form>
      <input type="hidden" name="csrf" value="${csrf}">
      <section class="panel-section">
        <div class="panel-section__head"><h2 class="panel-section__title">Teslim edilenler</h2></div>
        <p class="muted">Teslim ettiklerinizi işaretleyin; adet ya da açıklama ekleyebilirsiniz (ör. “64 GB, 1 adet”, “30×30, 40 sayfa”).</p>
        <ul class="dl-items">${rows.map(({ name, i }) => h`<li>
          ${name ? h`<label class="check"><input type="checkbox" name="item[]" value="${i}"${!chosen || chosen.has(String(i)) ? raw(' checked') : ''}><span>${name}</span></label>
            <input type="hidden" name="name_${i}" value="${name}">`
            : h`<label class="sr-only" for="dl-n${i}">Diğer</label><input id="dl-n${i}" name="name_${i}" maxlength="80" placeholder="Diğer (isteğe bağlı)" value="${values[`name_${i}`] || ''}">`}
          <label class="sr-only" for="dl-d${i}">Açıklama</label><input id="dl-d${i}" name="detail_${i}" maxlength="120" placeholder="Adet / açıklama" value="${values[`detail_${i}`] || ''}">
        </li>`)}</ul>
        <div class="field"><label for="dl-note">Not <span class="muted">(isteğe bağlı)</span></label><textarea id="dl-note" name="note" rows="2" maxlength="500">${values.note || ''}</textarea></div>
      </section>

      <section class="panel-section dl-sign">
        <div class="panel-section__head"><h2 class="panel-section__title">Teslim alan</h2></div>
        <p class="muted">Bu bölümü çift doldurur.</p>
        <div class="field"><label for="s-ad">Ad soyad</label><input id="s-ad" name="ad" required maxlength="80" autocomplete="off" value="${values.ad ?? (couple.full_name || '')}"></div>
        <div class="field">
          <label for="s-pad">İmza</label>
          <div class="sigpad"><canvas id="s-pad" data-sigpad aria-label="İmza alanı. Parmağınızla imzanızı çizin."></canvas><span class="sigpad__hint" data-sig-hint>Buraya imzanızı çizin</span></div>
          <div class="sigpad__tools"><button class="btn btn--text btn--sm" type="button" data-sig-clear>Temizle</button></div>
          <input type="hidden" name="imza" data-sig-value>
          <p class="field-error" data-sig-error hidden>Lütfen imzanızı çizin.</p>
        </div>
        <label class="check"><input type="checkbox" name="kabul" value="1" required><span>Yukarıda işaretlenen ürün ve dosyaların tamamını <strong>eksiksiz, çalışır durumda ve hasarsız</strong> teslim aldım.</span></label>
        <button class="btn btn--primary" type="submit">${icon('check')}Teslim aldım, imzala</button>
        <p class="muted ct-form__note">İmzayla birlikte tarih, saat ve cihaz bilgisi kayda alınır; tutanak sonradan değiştirilemez. İş “Teslim” aşamasına geçer.</p>
      </section>
    </form>
  </div>`;
  return panelLayout(c, { title: 'Teslim tutanağı', csrf, nav: adminNav('couples', csrf, demoAdmin), home: '/admin', tabs: adminTabs('couples', demoAdmin), body, scripts: ['/js/contract.js?v=2'] });
}

// Yazdırılabilir tutanak
function doc(c, { d, back }) {
  const s = snap(d);
  const co = s.company || {};
  return String(h`<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Teslim tutanağı ${s.refNo || ''} — ${s.couple || ''}</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="/css/style.css?v=90">
</head><body class="doc-body">
<div class="doc-tools">
  <a class="btn btn--text btn--sm" href="${back}">${icon('left')}Geri</a>
  <button class="btn btn--primary btn--sm" type="button" data-print>${icon('download')}Yazdır / PDF kaydet</button>
</div>
<main class="doc ct-doc">
  <header class="dl-head">
    <img class="doc-logo" src="/images/logo/hm4-dikey-lacivert.svg" alt="HM4 Studio" width="110" height="60">
    <p class="ct-k" lang="en">${co.unvan || c.brand.name}</p>
    <h1 class="ct-title">Teslim Tutanağı</h1>
    <p class="muted">${[s.refNo ? `Randevu no ${s.refNo}` : '', s.couple, trTime(d.created_at)].filter(Boolean).join(' · ')}</p>
  </header>
  <table class="ct-table">
    <thead><tr><th>Teslim edilen</th><th>Adet / açıklama</th></tr></thead>
    <tbody>${(s.items || []).map((x) => h`<tr><td>${x.name}</td><td>${x.detail || '—'}</td></tr>`)}</tbody>
  </table>
  ${s.note ? h`<p><strong>Not:</strong> ${s.note}</p>` : ''}
  <p class="dl-statement">${s.statement}</p>
  <div class="ct-sign">
    <div><p class="ct-k">Teslim eden · <span lang="en">${co.unvan || c.brand.name}</span></p><p>${co.sorumlu || ''}</p>${co.imza ? h`<img class="ct-sig" src="${co.imza}" alt="Yetkili imzası">` : ''}</div>
    <div><p class="ct-k">Teslim alan</p><p>${d.signer_name}</p><img class="ct-sig" src="${d.signature}" alt="Teslim alanın imzası"></div>
  </div>
  <section class="ct-audit">
    <h2>Elektronik imza kaydı</h2>
    <dl>
      <div><dt>Tutanak no</dt><dd>T-${String(d.id).padStart(5, '0')}</dd></div>
      <div><dt>İmzalandı</dt><dd>${trTime(d.created_at)} (Türkiye saati), stüdyoda, stüdyo cihazında</dd></div>
      <div><dt>Cihaz</dt><dd class="ct-ua">${d.user_agent || '—'}</dd></div>
      <div><dt>Doğrulama kodu</dt><dd class="ct-hash">${d.hash}</dd></div>
    </dl>
    <p>Doğrulama kodu, tutanak metninin ve imzanın parmak izidir; sonradan yapılacak her değişiklik bu kodu değiştirir.</p>
  </section>
</main>
<script src="/js/dashboard.js?v=16" defer></script>
</body></html>`);
}

module.exports = { formPage, doc, snap };
