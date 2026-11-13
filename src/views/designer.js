'use strict';
// Albüm tasarımcısı sayfası (iskelet; çalışma alanını public/js/designer.js kurar).
const { h, raw } = require('./html');
const { panelLayout, icon } = require('./components');
const admin = require('./admin');

const num = (id, label, value, attrs = {}) => h`<div class="field"><label for="${id}">${label}</label><input id="${id}" type="number" inputmode="decimal" value="${value}" step="${attrs.step || 1}" min="${attrs.min ?? 0}" data-cfg></div>`;

function designerPage(c, { couples = [], selected: couple = null, csrf, demoAdmin }) {
  const base = couple ? `/admin/ciftler/${couple.id}` : '';
  const body = h`
  <div class="container dz" data-designer data-base="${base}">
    <div class="dz-head">
      <div>
        <h1 class="page-title">Albüm</h1>
        <p class="muted dz-sub">${couple ? h`<a href="${base}#album">${couple.name} sayfasına git ${icon('right')}</a>` : 'Bir çift seçin ya da cihazınızdan fotoğraf ekleyerek sıfırdan başlayın.'}</p>
      </div>
      <div class="dz-head__act">
        <span class="dz-save muted" data-save aria-live="polite"></span>
        ${couple ? h`<a class="btn btn--text btn--sm" href="/admin/photoshop">Photoshop bağlantısı</a>` : ''}
        <button type="button" class="btn btn--outline btn--sm" data-toggle-settings aria-expanded="false" aria-controls="dz-settings">${icon('settings')}Ayarlar</button>
        <button type="button" class="btn btn--primary btn--sm" data-auto>${icon('sparkle')}Otomatik diz</button>
      </div>
    </div>

    <div class="dz-source">
      <label class="dz-pick"><span class="dz-pick__lbl">Albüm</span>
        <select data-source aria-label="Çift seçin">
          <option value=""${couple ? '' : raw(' selected')}>Sıfırdan albüm · cihazdan fotoğraf</option>
          ${couples.length ? h`<optgroup label="Düzenlenmiş fotoğrafı olan çiftler">${couples.map((k) => h`<option value="${k.id}"${couple && couple.id === k.id ? raw(' selected') : ''}>${k.name} · ${k.edited_count} düzenlenmiş${k.fav_count ? ` · ${k.fav_count} seçim` : ''}</option>`)}</optgroup>` : ''}
          ${couple && !couples.some((k) => k.id === couple.id) ? h`<option value="${couple.id}" selected>${couple.name}</option>` : ''}
        </select>
      </label>
      <div class="dz-set" data-set hidden>
        <button type="button" data-set-btn="secim">Albüm seçimi <span data-n="secim"></span></button>
        <button type="button" data-set-btn="duzenli">Tüm düzenlenmiş <span data-n="duzenli"></span></button>
      </div>
      ${couple ? '' : h`<label class="btn btn--outline btn--sm dz-files">${icon('upload')}Fotoğraf ekle<input type="file" accept="image/jpeg,image/png,image/webp" multiple data-files></label>`}
    </div>

    <section class="dz-settings" id="dz-settings" hidden>
      <div class="dz-settings__grid">
        ${num('pw', 'Sayfa genişliği (cm)', 30, { step: 0.5, min: 10 })}
        ${num('ph', 'Sayfa yüksekliği (cm)', 30, { step: 0.5, min: 10 })}
        ${num('leaves', 'Yaprak sayısı (otomatik diz)', 10, { min: 1 })}
        <div class="field"><label for="perPage">Yaprak başına fotoğraf</label><select id="perPage" data-cfg><option value="mix">3–4 karışık</option><option value="3">3</option><option value="4">4</option></select></div>
        ${num('gapPx', 'Fotoğraf arası (px, 300 DPI)', 30)}
        ${num('cut', 'Kesme / taşma payı (mm)', 5)}
        ${num('safe', 'Güvenli alan (mm)', 15)}
        ${num('foldM', 'Katlama payı (mm)', 10)}
        <div class="field"><label for="sortMode">Otomatik sıralama</label><select id="sortMode" data-cfg><option value="time">Çekim saatine göre</option><option value="name">Dosya adına göre</option><option value="color">Renk ve tona göre</option></select></div>
        <div class="field"><label for="dpi">Dışa aktarma</label><select id="dpi" data-cfg><option value="150">150 DPI</option><option value="200">200 DPI</option><option value="250">250 DPI</option><option value="300" selected>300 DPI</option></select></div>
      </div>
      <label class="check dz-bleed"><input type="checkbox" id="fullBleed" data-cfg><span>Kenara kadar doldur (taşma payıyla)</span></label>
      <p class="muted dz-note">Güvenli alan ve katlama payı varsayılandır; baskı firmasının önerisine göre değiştirin.</p>
    </section>

    <section class="dz-tpl" aria-label="Şablonlar">
      <div class="dz-tpl__head"><span data-tpl-head></span><span class="muted" data-tpl-count></span></div>
      <div class="dz-tpl__row"><span class="dz-tpl__lbl">Tam uyan</span><div class="dz-tpl__list" data-tpl-exact></div></div>
      <div class="dz-tpl__row"><span class="dz-tpl__lbl">Yakın</span><div class="dz-tpl__list" data-tpl-near></div></div>
    </section>

    <section class="dz-stage" aria-label="Yaprak">
      <div class="dz-note" data-note hidden></div>
      <div class="dz-canvas" data-wrap>
        <div class="dz-peek dz-peek--prev" data-peek="-1"></div>
        <div class="dz-spread" data-spread></div>
        <div class="dz-peek dz-peek--next" data-peek="1"></div>
      </div>
      <div class="dz-nav">
        <button type="button" class="dz-ic" data-go="-1" aria-label="Önceki yaprak">${icon('left')}</button>
        <strong data-sheet-label></strong>
        <button type="button" class="dz-ic" data-go="1" aria-label="Sonraki yaprak">${icon('right')}</button>
      </div>
      <div class="dz-tools">
        <button type="button" class="dz-tool" data-variant>${icon('grid')}Düzeni değiştir</button>
        <button type="button" class="dz-tool" data-select-all aria-pressed="false" title="Kısayol: ⌘A">${icon('check')}<span>Tümünü seç</span></button>
        <div class="dz-gapctl"><label for="dz-gap">Boşluk</label><input id="dz-gap" type="range" min="0" max="120" step="2" value="30" data-gap><output data-gap-out>30 px</output>
          <span class="dz-gapseg"><button type="button" data-gap-scope="leaf" aria-pressed="true">Bu yaprak</button><button type="button" data-gap-scope="all" aria-pressed="false">Tüm albüm</button></span></div>
        <button type="button" class="dz-tool dz-tool--side" data-out-jump hidden>${icon('image')}<span data-out-count></span></button>
        <button type="button" class="dz-tool" data-crop aria-pressed="false">${icon('move')}Kadraj</button>
        <div class="dz-crop" data-crop-panel hidden>
          <span class="dz-crop__lbl muted" data-crop-label></span>
          <label class="dz-zoom"><span class="sr-only">Yakınlık</span><input type="range" min="0.3" max="3" step="0.05" value="1" data-zoom></label>
          <div class="dz-pad">
            <button type="button" class="dz-ic" data-nudge="0,-1" aria-label="Yukarı">${icon('up')}</button>
            <button type="button" class="dz-ic" data-nudge="-1,0" aria-label="Sola">${icon('left')}</button>
            <button type="button" class="dz-ic" data-nudge="1,0" aria-label="Sağa">${icon('right')}</button>
            <button type="button" class="dz-ic" data-nudge="0,1" aria-label="Aşağı">${icon('down')}</button>
          </div>
          <button type="button" class="dz-tool" data-fit>Tam sığdır</button>
          ${couple ? h`<button type="button" class="dz-tool dz-tool--ps" data-ps title="Kısayol: E"><i>Ps</i>Photoshop'ta düzenle <kbd>E</kbd></button>` : ''}
          <button type="button" class="dz-tool dz-tool--out" data-remove title="Fotoğraf silinmez; şeridin sonundaki “Kenarda” kutusunda bekler">${icon('down')}Kenara al</button>
        </div>
      </div>
      <div class="dz-versions" data-versions hidden></div>
    </section>

    <section class="dz-tl" aria-label="Hikâye şeridi">
      <div class="dz-tl__head"><span><strong>Hikâye şeridi</strong> <span class="muted" data-sort-label></span></span><span class="dz-tl__right"><span class="muted dz-tl__hint">İki fotoğrafın arasına dokunun: yeni yaprak başlar · çizgiye dokunun: yapraklar birleşir</span><button type="button" class="dz-tool dz-tool--sm" data-pool-toggle hidden aria-expanded="false">${icon('plus')}Seçim dışından ekle</button></span></div>
      <div class="dz-pool" data-pool hidden><p class="muted">Çiftin seçmediği fotoğraflar. Dokunduğunuz fotoğraf açık yaprağa eklenir; yerleşim bozulmaz.</p><div class="dz-pool__grid" data-pool-grid></div></div>
      <div class="dz-strip" data-strip></div>
    </section>

    <div class="dz-foot">
      <p class="muted" data-status>Yükleniyor…</p>
      <div class="dz-foot__act">
        <button type="button" class="btn btn--outline" data-export="one">${icon('download')}Bu yaprağı indir</button>
        <button type="button" class="btn btn--outline" data-export="all">${icon('download')}Tümünü indir</button>
        ${couple ? h`<button type="button" class="btn btn--primary" data-send>${icon('send')}Çiftin albüm onayına aktar</button>` : ''}
      </div>
    </div>
  </div>`;
  return panelLayout(c, { title: couple ? `Albüm · ${couple.name}` : 'Albüm', csrf, nav: admin.adminNav('album', csrf, demoAdmin), home: '/admin', tabs: admin.adminTabs('list', demoAdmin), body, scripts: ['/js/designer.js?v=19'] });
}

module.exports = { designerPage };
