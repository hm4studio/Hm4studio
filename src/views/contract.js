'use strict';
// Sözleşme sayfaları: yazdırılabilir belge, çiftin onay sayfası, admin bölümü ve şablon ayarı.
const { h, raw } = require('./html');
const { icon, panelLayout } = require('./components');
const contract = require('../contract');

const csrfField = (csrf) => h`<input type="hidden" name="csrf" value="${csrf}">`;
const trTime = (sqlUtc) => (sqlUtc ? new Date(`${sqlUtc.replace(' ', 'T')}Z`).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const trDate = (sqlUtc) => trTime(sqlUtc).split(' ')[0];

function signerOf(k) {
  if (!k?.signed_at) return {};
  return { ad: k.signer_name, tc: k.signer_tc, adres: k.signer_address, izin: k.consent, imza: k.signature, tarih: trDate(k.signed_at) };
}

const docNo = (k) => `S-${String(k.id).padStart(5, '0')}`;

function auditBlock(k) {
  if (!k.signed_at) return '';
  return h`<section class="ct-audit">
    <h2>Elektronik onay kaydı</h2>
    <dl>
      <div><dt>Belge no</dt><dd>${docNo(k)}</dd></div>
      <div><dt>Gönderildi</dt><dd>${trTime(k.sent_at)}</dd></div>
      <div><dt>Onaylandı</dt><dd>${trTime(k.signed_at)} (Türkiye saati)</dd></div>
      <div><dt>Onaylayan</dt><dd>${k.signer_name}, çift paneline kendi erişim kodu ve şifresiyle giriş yaparak</dd></div>
      <div><dt>IP adresi</dt><dd>${k.ip || '—'}</dd></div>
      <div><dt>Cihaz</dt><dd class="ct-ua">${k.user_agent || '—'}</dd></div>
      <div><dt>Doğrulama kodu</dt><dd class="ct-hash">${k.hash}</dd></div>
    </dl>
    <p>Müşteri metnin tamamını okuduğunu ve kabul ettiğini işaretleyip ad soyadını yazarak ve imzasını çizerek onaylamıştır. Doğrulama kodu, onaylanan metnin ve imzalayan bilgilerinin parmak izidir; metinde sonradan yapılacak her değişiklik bu kodu değiştirir.</p>
  </section>`;
}

// Sözleşme metni (sayfa içinde ya da yazdırılabilir belgede)
function body(k, data) {
  return h`
    <header class="ct-head">
      <img class="doc-logo" src="/images/logo/hm4-dikey-lacivert.svg" alt="HM4 Studio" width="110" height="60">
      <p class="ct-brand" lang="en">${data.company?.unvan || 'HM4 Studio'}</p>
      <h1 class="ct-title">${data.title}</h1>
      <p class="ct-meta">${data.randevuNo ? h`Randevu no ${data.randevuNo} · ` : ''}${k ? h`Belge no ${docNo(k)}` : 'Önizleme'}</p>
    </header>
    <div class="ct-text">${contract.render(data, signerOf(k))}</div>`;
}

// Yazdırılabilir tam sayfa (admin ve çift)
function contractDoc(c, { k, data, back }) {
  return String(h`<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${data.title} ${data.randevuNo || ''} — ${data.musteri}</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="/css/style.css?v=24">
</head><body class="doc-body">
<div class="doc-tools">
  <a class="btn btn--text btn--sm" href="${back}">${icon('left')}Geri</a>
  <button class="btn btn--primary btn--sm" type="button" data-print>${icon('download')}Yazdır / PDF kaydet</button>
</div>
<main class="doc ct-doc">
  ${!k ? h`<p class="ct-preview">Önizleme: çifte gönderildiğinde metin bu hâliyle dondurulur.</p>` : ''}
  ${body(k, data)}
  ${k ? auditBlock(k) : ''}
</main>
<script src="/js/dashboard.js?v=10" defer></script>
</body></html>`);
}

// Çiftin sözleşme sayfası
function signPage(c, { coupleShell, couple, k, data, csrf, flash, values = {} }) {
  const signed = Boolean(k.signed_at);
  const page = h`
    <section class="welcome">
      <p class="eyebrow">Sözleşme</p>
      <h1 class="page-title">${signed ? 'Sözleşmeniz onaylandı' : 'Sözleşmenizi okuyup onaylayın'}</h1>
      <p class="muted">${signed ? h`${trTime(k.signed_at)} tarihinde onayladınız. Bir kopyasını indirip saklayabilirsiniz.` : 'Metni sonuna kadar okuyun, bilgilerinizi yazın ve imzanızı parmağınızla çizin.'}</p>
      ${signed ? h`<p><a class="btn btn--primary btn--sm" href="/panel/sozlesme/belge">${icon('download')}Sözleşmeyi indir / yazdır</a></p>` : ''}
    </section>
    <article class="ct-paper">${body(k, data)}</article>
    ${signed ? '' : h`
    <form class="form ct-form" method="post" action="/panel/sozlesme" data-sign-form>
      ${csrfField(csrf)}
      <h2 class="ct-form__title">Onay</h2>
      <div class="field"><label for="s-ad">Ad soyad</label><input id="s-ad" name="ad" type="text" required maxlength="80" autocomplete="name" value="${values.ad ?? data.musteri}"></div>
      <div class="appt-row">
        <div class="field"><label for="s-tc">T.C. kimlik no</label><input id="s-tc" name="tc" type="text" inputmode="numeric" required pattern="[0-9]{11}" maxlength="11" autocomplete="off" value="${values.tc || ''}"></div>
        <div class="field"><label for="s-adres">Adres</label><input id="s-adres" name="adres" type="text" required maxlength="200" autocomplete="street-address" value="${values.adres || ''}"></div>
      </div>
      <fieldset class="field ct-consent">
        <legend>Çekimlerin HM4 Studio tarafından tanıtım amaçlı paylaşılmasına</legend>
        <label class="check"><input type="radio" name="izin" value="evet" required${values.izin === 'evet' ? raw(' checked') : ''}><span>İzin veriyorum</span></label>
        <label class="check"><input type="radio" name="izin" value="hayir"${values.izin === 'hayir' ? raw(' checked') : ''}><span>İzin vermiyorum</span></label>
      </fieldset>
      <div class="field">
        <label for="s-pad">İmza</label>
        <div class="sigpad"><canvas id="s-pad" data-sigpad aria-label="İmza alanı. Parmağınızla veya fareyle imzanızı çizin."></canvas><span class="sigpad__hint" data-sig-hint>Buraya imzanızı çizin</span></div>
        <div class="sigpad__tools"><button class="btn btn--text btn--sm" type="button" data-sig-clear>Temizle</button></div>
        <input type="hidden" name="imza" data-sig-value>
        <p class="field-error" data-sig-error hidden>Lütfen imzanızı çizin.</p>
      </div>
      <label class="check"><input type="checkbox" name="waConsent" value="1"${values.waConsent === '1' ? raw(' checked') : ''}><span>${require('../kvkk').WA_CONSENT} <span class="muted">(İsteğe bağlı)</span></span></label>
      <label class="check"><input type="checkbox" name="kabul" value="1" required><span>Sözleşmenin tamamını okudum, anladım ve kabul ediyorum.</span></label>
      <button class="btn btn--primary" type="submit">Sözleşmeyi onayla</button>
      <p class="muted ct-form__note">Onay anında tarih, saat ve bağlantı adresiniz (IP) kayda alınır. Onayladıktan sonra metin değiştirilemez.</p>
    </form>`}`;
  return coupleShell(c, { couple, page: 'sozlesme', csrf, flash, body: page, scripts: ['/js/contract.js?v=2'] });
}

// Admin: çift sayfasındaki sözleşme bölümü
function adminSection({ coupleId, k, csrf, phone, loginUrl, coupleName }) {
  const base = `/admin/ciftler/${coupleId}/sozlesme`;
  const msg = `Merhaba ${coupleName}, HM4 Studio sözleşmeniz hazır. Panelinize girip "Sözleşme" sayfasından okuyup onaylayabilirsiniz:\n${loginUrl}`;
  const waLink = `https://wa.me/${phone || ''}?text=${encodeURIComponent(msg)}`;
  let state;
  if (!k) state = h`<p class="muted">Henüz gönderilmedi. Randevu bilgileri (etkinlikler, tutarlar, kapora) sözleşmeye kendiliğinden yazılır.</p>`;
  else if (k.signed_at) state = h`<p><span class="paypill paypill--paid">Onaylandı</span> ${trTime(k.signed_at)} · ${k.signer_name} · paylaşım izni: ${k.consent === 'evet' ? 'var' : 'yok'}</p>`;
  else state = h`<p><span class="paypill paypill--unpaid">Onay bekliyor</span> ${trTime(k.sent_at)} tarihinde gönderildi.</p>`;
  return h`
  <section class="panel-section" id="sozlesme" aria-labelledby="ct-title">
    <div class="panel-section__head appt-card__head">
      <h2 class="panel-section__title" id="ct-title">Sözleşme</h2>
      <div class="appt-card__actions">
        ${k ? h`<a class="btn btn--outline btn--sm" href="${base}">${icon('download')}${k.signed_at ? 'İmzalı sözleşme' : 'Gönderilen metin'}</a>` : h`<a class="btn btn--outline btn--sm" href="${base}?onizleme=1">Önizle</a>`}
        ${k && !k.signed_at ? h`<a class="btn btn--primary btn--sm" href="${waLink}" target="_blank" rel="noopener">${icon('whatsapp')}WhatsApp'tan hatırlat</a>` : ''}
      </div>
    </div>
    ${state}
    <div class="ct-actions">
      ${!k || k.signed_at ? h`<form method="post" action="${base}"${k ? raw(' data-confirm="Yeni bir sözleşme gönderilsin mi? İmzalı olan kayıtta kalır; çiftten yenisini onaylaması istenir."') : ''}>${csrfField(csrf)}<button class="btn btn--${k ? 'text' : 'primary'} btn--sm" type="submit">${k ? 'Güncel bilgilerle yeniden gönder' : 'Sözleşmeyi çifte gönder'}</button></form>` : ''}
      ${k && !k.signed_at ? h`
        <form method="post" action="${base}">${csrfField(csrf)}<button class="btn btn--text btn--sm" type="submit">Güncel bilgilerle yenile</button></form>
        <form method="post" action="${base}/iptal" data-confirm="Gönderilen sözleşme geri çekilsin mi?">${csrfField(csrf)}<button class="btn btn--text btn--sm btn--danger-text" type="submit">Geri çek</button></form>` : ''}
    </div>
    ${!k ? '' : h`<p class="muted ct-note">Çift panelde "Sözleşme" sayfasını görür. ${k.signed_at ? '' : h`Mesajı göndermek için: <a href="${waLink}" target="_blank" rel="noopener">WhatsApp</a>.`}</p>`}
  </section>`;
}

// Ayarlar › Sözleşme şablonu
function settingsPage(c, { adminNav, adminTabs, flashBlock, csrf, flash, demoAdmin }) {
  const s = contract.settings(c);
  const co = s.company;
  const sig = contract.studioSignature();
  const f = (id, label, val, extra = '') => h`<div class="field"><label for="c-${id}">${label}</label><input id="c-${id}" name="${id}" type="text" maxlength="160" value="${val || ''}"${raw(extra)}></div>`;
  const page = h`
  <div class="container container--form">
    <a class="back-link" href="/admin/hesap">${icon('left')}Ayarlar</a>
    <h1 class="page-title">Sözleşme ve KVKK</h1>
    ${flashBlock(flash)}
    <form class="form" method="post" action="/admin/sozlesme">
      ${csrfField(csrf)}
      <section class="panel-section">
        <div class="panel-section__head"><h2 class="panel-section__title">Firma bilgileri</h2></div>
        ${f('title', 'Sözleşme başlığı', s.title)}
        <div class="appt-row">${f('unvan', 'Ünvan', co.unvan)}${f('sorumlu', 'Yetkili kişi', co.sorumlu)}</div>
        <div class="appt-row">${f('telefon', 'Telefon', co.telefon)}${f('mahkeme', 'Yetkili mahkeme (il/ilçe)', co.mahkeme)}</div>
        ${f('adres', 'Adres', co.adres)}
        <div class="appt-row">${f('vergiDairesi', 'Vergi dairesi', co.vergiDairesi)}${f('vergiNo', 'Vergi no', co.vergiNo, ' inputmode="numeric"')}</div>
      </section>
      <section class="panel-section">
        <div class="panel-section__head"><h2 class="panel-section__title">Metin</h2></div>
        <p class="muted">"## " ile başlayan satır başlık, "- " ile başlayan satır maddedir. Boş satır yeni paragraf açar. Aşağıdaki alanlar her çiftin randevusundan kendiliğinden dolar:</p>
        <ul class="ct-keys">
          <li><code>{TARAFLAR}</code> firma ve müşteri bilgileri</li>
          <li><code>{HIZMETLER}</code> etkinlik, tarih, saat, yer, paket tablosu</li>
          <li><code>{ODEME}</code> toplam, kapora, kalan, kalan ödeme tarihi</li>
          <li><code>{IMZA}</code> imza alanı</li>
          <li><code>{sehir}</code> <code>{kapora}</code> <code>{toplam}</code> <code>{kalan}</code> <code>{mahkeme}</code> <code>{imza_tarihi}</code> <code>{paylasim_izni}</code> <code>{musteri}</code> <code>{randevu_no}</code></li>
        </ul>
        <div class="field"><label for="c-template" class="sr-only">Sözleşme metni</label><textarea id="c-template" name="template" rows="28" maxlength="40000" class="ct-editor">${s.template}</textarea></div>
        <label class="check"><input type="checkbox" name="reset" value="1"><span>Metni ilk hâline döndür</span></label>
      </section>
      <section class="panel-section" id="kvkk">
        <div class="panel-section__head"><h2 class="panel-section__title">KVKK aydınlatma metni</h2><a class="btn btn--text btn--sm" href="/kvkk" target="_blank">Sitede gör</a></div>
        <p class="muted">Sitede /kvkk adresinde yayınlanır; talep formu, çift girişi ve sözleşme sayfası buna bağlanır. <code>{unvan}</code> <code>{sorumlu}</code> <code>{adres}</code> <code>{telefon}</code> <code>{eposta}</code> yukarıdaki firma bilgilerinden dolar.</p>
        <div class="field"><label for="c-kvkk" class="sr-only">KVKK metni</label><textarea id="c-kvkk" name="kvkk" rows="20" maxlength="30000" class="ct-editor">${require('../kvkk').settings(c).text}</textarea></div>
        <label class="check"><input type="checkbox" name="kvkkReset" value="1"><span>KVKK metnini ilk hâline döndür</span></label>
      </section>
      <button class="btn btn--primary" type="submit">Kaydet</button>
      <p class="muted">Değişiklik yalnızca bundan sonra gönderilecek sözleşmeleri etkiler. Gönderilmiş ve onaylanmış sözleşmeler olduğu gibi kalır. Metni bir avukata kontrol ettirmenizi öneririz.</p>
    </form>

    <section class="panel-section" id="imza">
      <div class="panel-section__head"><h2 class="panel-section__title">Yetkili imzası</h2></div>
      <p class="muted">Bir kez çizin; çiftlere gönderilen her sözleşmede ${co.sorumlu} adının altında görünür.</p>
      ${sig ? h`<div class="ct-cursig"><img src="${sig}" alt="Kayıtlı imza"><form method="post" action="/admin/sozlesme/imza" data-confirm="Kayıtlı imza silinsin mi?">${csrfField(csrf)}<input type="hidden" name="sil" value="1"><button class="btn btn--text btn--sm btn--danger-text" type="submit">İmzayı sil</button></form></div>` : ''}
      <form class="form ct-form" method="post" action="/admin/sozlesme/imza" data-sign-form>
        ${csrfField(csrf)}
        <div class="field">
          <label for="s-pad">${sig ? 'Yeniden çiz' : 'İmzanızı çizin'}</label>
          <div class="sigpad"><canvas id="s-pad" data-sigpad aria-label="İmza alanı"></canvas><span class="sigpad__hint" data-sig-hint>Buraya imzanızı çizin</span></div>
          <div class="sigpad__tools"><button class="btn btn--text btn--sm" type="button" data-sig-clear>Temizle</button></div>
          <input type="hidden" name="imza" data-sig-value>
          <p class="field-error" data-sig-error hidden>Lütfen imzanızı çizin.</p>
        </div>
        <button class="btn btn--primary" type="submit">İmzayı kaydet</button>
      </form>
    </section>
  </div>`;
  return panelLayout(c, { title: 'Sözleşme ve KVKK', csrf, nav: adminNav('contract', csrf, demoAdmin), home: '/admin', tabs: adminTabs('contract', demoAdmin), body: page, scripts: ['/js/dashboard.js?v=10', '/js/contract.js?v=2'] });
}

module.exports = { contractDoc, signPage, adminSection, settingsPage, trTime };
