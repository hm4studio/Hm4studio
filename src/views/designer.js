'use strict';
// Albüm tasarımcısı sayfası (iskelet; çalışma alanını public/js/designer.js kurar).
const { h } = require('./html');
const { panelLayout, icon } = require('./components');
const admin = require('./admin');

const num = (id, label, value, attrs = {}) => h`<div class="field"><label for="${id}">${label}</label><input id="${id}" type="number" inputmode="decimal" value="${value}" step="${attrs.step || 1}" min="${attrs.min ?? 0}" data-cfg></div>`;

function designerPage(c, { couple, csrf, demoAdmin }) {
  const base = `/admin/ciftler/${couple.id}`;
  const body = h`
  <div class="container dz" data-designer data-base="${base}">
    <div class="dz-head">
      <div>
        <a class="back-link" href="${base}#album">${icon('left')}${couple.name}</a>
        <h1 class="page-title">Albüm tasarımı</h1>
      </div>
      <div class="dz-head__act">
        <span class="dz-save muted" data-save aria-live="polite"></span>
        <button type="button" class="btn btn--outline btn--sm" data-toggle-settings aria-expanded="false" aria-controls="dz-settings">${icon('settings')}Ayarlar</button>
        <button type="button" class="btn btn--primary btn--sm" data-auto>${icon('sparkle')}Otomatik diz</button>
      </div>
    </div>

    <section class="dz-settings" id="dz-settings" hidden>
      <div class="dz-settings__grid">
        ${num('pw', 'Sayfa genişliği (cm)', 30, { step: 0.5, min: 10 })}
        ${num('ph', 'Sayfa yüksekliği (cm)', 30, { step: 0.5, min: 10 })}
        ${num('leaves', 'Yaprak sayısı', 10, { min: 1 })}
        <div class="field"><label for="perPage">Yaprak başına fotoğraf</label><select id="perPage" data-cfg><option value="mix">3–4 karışık</option><option value="3">3</option><option value="4">4</option></select></div>
        ${num('gapPx', 'Fotoğraf arası (px, 300 DPI)', 30)}
        ${num('cut', 'Kesme payı (mm)', 5)}
        ${num('safe', 'Güvenli alan (mm)', 15)}
        ${num('foldM', 'Katlama payı (mm)', 10)}
        <div class="field"><label for="sortMode">Otomatik sıralama</label><select id="sortMode" data-cfg><option value="name">Çekim sırasına göre</option><option value="color">Renk ve tona göre</option></select></div>
        <div class="field"><label for="dpi">Dışa aktarma</label><select id="dpi" data-cfg><option value="150">150 DPI</option><option value="200">200 DPI</option><option value="250" selected>250 DPI</option></select></div>
      </div>
      <label class="check dz-bleed"><input type="checkbox" id="fullBleed" data-cfg><span>Kenara kadar doldur (taşma payıyla)</span></label>
      <p class="muted dz-note">Güvenli alan ve katlama payı varsayılandır; baskı firmasının önerisine göre değiştirin.</p>
    </section>

    <div class="dz-work">
      <aside class="dz-tray" aria-label="Albüm seçimi">
        <div class="dz-tray__head"><strong>Albüm seçimi</strong><span class="muted" data-tray-count></span></div>
        <p class="dz-tray__hint muted">Fotoğrafı tutup yaprağa bırakın. Yapraktan buraya bırakılan fotoğraf çıkar.</p>
        <div class="dz-thumbs" data-thumbs></div>
      </aside>

      <div class="dz-stage">
        <div class="dz-nav">
          <button type="button" class="dz-ic" data-go="-1" aria-label="Önceki yaprak">${icon('left')}</button>
          <strong data-sheet-label></strong>
          <button type="button" class="dz-ic" data-go="1" aria-label="Sonraki yaprak">${icon('right')}</button>
        </div>
        <div class="dz-canvas" data-wrap><div class="dz-spread" data-spread></div></div>
        <div class="dz-tools">
          <button type="button" class="dz-tool" data-variant>${icon('grid')}Düzeni değiştir</button>
          <button type="button" class="dz-tool" data-crop aria-pressed="false">${icon('move')}Kadraj</button>
          <div class="dz-crop" data-crop-panel hidden>
            <span class="dz-crop__lbl muted" data-crop-label>Bir fotoğrafa dokunun</span>
            <label class="dz-zoom"><span class="sr-only">Yakınlık</span><input type="range" min="0.3" max="3" step="0.05" value="1" data-zoom></label>
            <div class="dz-pad">
              <button type="button" class="dz-ic" data-nudge="0,-1" aria-label="Yukarı">${icon('up')}</button>
              <button type="button" class="dz-ic" data-nudge="-1,0" aria-label="Sola">${icon('left')}</button>
              <button type="button" class="dz-ic" data-nudge="1,0" aria-label="Sağa">${icon('right')}</button>
              <button type="button" class="dz-ic" data-nudge="0,1" aria-label="Aşağı">${icon('down')}</button>
            </div>
            <button type="button" class="dz-tool" data-fit>Tam sığdır</button>
          </div>
        </div>
        <div class="dz-strip" data-strip aria-label="Tüm yapraklar"></div>
      </div>
    </div>

    <div class="dz-foot">
      <p class="muted" data-status>Yükleniyor…</p>
      <div class="dz-foot__act">
        <button type="button" class="btn btn--outline" data-export="one">${icon('download')}Bu yaprağı indir</button>
        <button type="button" class="btn btn--outline" data-export="all">${icon('download')}Tümünü indir</button>
        <button type="button" class="btn btn--primary" data-send>${icon('send')}Albüm tasarımına aktar</button>
      </div>
    </div>
  </div>`;
  return panelLayout(c, { title: `Albüm tasarımı · ${couple.name}`, csrf, nav: admin.adminNav('list', csrf, demoAdmin), home: '/admin', tabs: admin.adminTabs('list', demoAdmin), body, scripts: ['/js/designer.js?v=1'] });
}

module.exports = { designerPage };
