'use strict';
// Photoshop bağlantısı kurulum sayfası
const { h } = require('./html');
const { panelLayout, icon } = require('./components');
const admin = require('./admin');

const trDate = (iso) => (iso ? new Date(iso).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '');

function setupPage(c, { info, token, csrf, flash: f, demoAdmin, site }) {
  const body = h`
  <div class="container container--form ps-setup">
    <a class="back-link" href="/admin/album">${icon('left')}Albüm</a>
    <h1 class="page-title">Photoshop bağlantısı</h1>
    <p class="muted">Albüm panelinde “Photoshop'ta düzenle”ye bastığınız fotoğraf, Mac'teki Photoshop'ta kendiliğinden açılır; ⌘S ile kaydedince yeni hali siteye yüklenir ve çiftin düzenlenmiş fotoğrafları arasında da güncellenir.</p>
    ${f && f.message ? h`<div class="flash flash--${f.type || 'success'}" role="status">${f.message}</div>` : ''}
    <p class="ps-state ${info.has ? 'is-on' : ''}"><b></b>${info.has ? h`Bağlantı açık · kod ${trDate(info.at)} tarihinde oluşturuldu` : 'Henüz bağlantı yok'}</p>

    ${token ? h`<section class="ps-token" aria-live="polite">
      <p><strong>Bağlantı kodunuz</strong> · yalnızca şimdi gösterilir. Eklentideki “Bağlantı kodu” alanına yapıştırın.</p>
      <div class="ps-token__row"><code>${token}</code><button type="button" class="btn btn--primary btn--sm" data-copy="${token}">${icon('copy')}Kopyala</button></div>
    </section>` : ''}

    <ol class="ps-steps">
      <li><strong>Eklentiyi indirin.</strong> <a class="btn btn--outline btn--sm" href="/admin/photoshop/hm4-album.ccx">${icon('download')}hm4-album.ccx</a></li>
      <li><strong>Kurun.</strong> İnen dosyaya çift tıklayın; Creative Cloud eklentiyi Photoshop'a kurar. Kurmazsa: Creative Cloud uygulamasından ücretsiz <em>UXP Developer Tool</em>'u kurun, indirdiğiniz dosyanın uzantısını <code>.zip</code> yapıp açın, “Add Plugin” ile içindeki <code>manifest.json</code>'u seçip “Load”a basın.</li>
      <li><strong>Paneli açın.</strong> Photoshop › Eklentiler (Plugins) › <em>HM4 Albüm</em>.</li>
      <li><strong>Bağlanın.</strong> Aşağıdan bağlantı kodu oluşturup eklentiye yapıştırın. Eklenti bu adrese bağlanır: <code>${site}</code></li>
    </ol>

    <form method="post" action="/admin/photoshop/kod" class="ps-actions">
      <input type="hidden" name="csrf" value="${csrf}">
      <button class="btn btn--primary" type="submit">${icon('lock')}${info.has ? 'Yeni bağlantı kodu oluştur' : 'Bağlantı kodu oluştur'}</button>
      ${info.has ? h`<button class="btn btn--text" type="submit" name="iptal" value="1">Bağlantıyı kapat</button>` : ''}
    </form>
    <p class="muted ps-note">Yeni kod oluşturunca eskisi geçersiz olur. Kod, bu bilgisayardaki Photoshop'un sitenize fotoğraf yüklemesine izin verir; başkasıyla paylaşmayın.</p>
  </div>`;
  return panelLayout(c, { title: 'Photoshop bağlantısı', csrf, nav: admin.adminNav('album', csrf, demoAdmin), home: '/admin', tabs: admin.adminTabs('list', demoAdmin), body, scripts: ['/js/admin.js?v=7'] });
}

module.exports = { setupPage };
