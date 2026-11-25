'use strict';
// Admin › Albüm kataloğu ekranları
const { h } = require('./html');
const { panelLayout, icon, flash } = require('./components');
const admin = require('./admin');

const tl = (n) => `${n > 0 ? '+' : ''}${Number(n).toLocaleString('tr-TR')} ₺`;
const layout = (c, title, csrf, demoAdmin, body) => panelLayout(c, { title, csrf, nav: admin.adminNav('editor', csrf, demoAdmin), home: '/admin/editor', tabs: admin.adminTabs('editor', demoAdmin), body });

function card(m, geri, csrf) {
  const renk = m.renkler.filter((r) => r.aktif);
  const ebat = m.ebatlar.filter((e) => e.aktif);
  return h`<article class="kt-card${m.aktif ? '' : ' is-off'}" id="m${m.no}">
    <a class="kt-card__img" href="/admin/albumler/${m.no}"><img src="${m.foto}" alt="${m.ad}" loading="lazy" decoding="async" width="400" height="400"></a>
    <div class="kt-card__body">
      <div class="kt-card__top"><a class="kt-card__name" href="/admin/albumler/${m.no}">${m.ad}</a>
        <form method="post" action="/admin/albumler/${m.no}"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="hizli" value="1"><input type="hidden" name="geri" value="${geri}"><input type="hidden" name="aktif" value="${m.aktif ? '0' : '1'}">
          <button class="kt-state${m.aktif ? ' is-on' : ''}" type="submit" title="${m.aktif ? 'Pasife al' : 'Aktif yap'}">${m.aktif ? 'Aktif' : 'Pasif'}</button></form>
      </div>
      <p class="kt-card__sub">${m.malzeme.join(' · ')}${m.fark ? h` · <b>${tl(m.fark)}</b>` : ''}</p>
      <div class="kt-card__foot">
        <span class="kt-dots">${renk.map((r) => h`<img src="${r.doku}" alt="${r.ad}" title="${r.ad}" loading="lazy" width="18" height="18">`)}</span>
        <span class="kt-sizes">${ebat.map((e) => e.ad).join(' · ')}</span>
      </div>
      ${m.kaynakNot ? h`<p class="kt-warn">${icon('alert')}Katalogda tutarsızlık var</p>` : ''}
    </div>
  </article>`;
}

function listPage(c, { items, malzeme, durum, malzemeler, csrf, flash: f, demoAdmin }) {
  const shown = items.filter((m) => (!malzeme || m.malzeme.includes(malzeme)) && (!durum || (durum === 'aktif') === m.aktif));
  const q = (p) => { const s = new URLSearchParams({ ...(malzeme ? { malzeme } : {}), ...(durum ? { durum } : {}), ...p }); for (const [k, v] of [...s]) if (!v) s.delete(k); const t = s.toString(); return `/admin/albumler${t ? `?${t}` : ''}`; };
  const geri = new URLSearchParams({ ...(malzeme ? { malzeme } : {}), ...(durum ? { durum } : {}) }).toString();
  const body = h`
  <div class="container kt">
    <p class="ed__kicker"><a href="/admin/editor">Editör</a></p>
    <h1 class="page-title">Albüm kataloğu</h1>
    <p class="muted kt-lead">${items.length} model · ${items.filter((m) => m.aktif).length} aktif · Tedarikçi kataloğundan aktarıldı. Pasif modelleri çiftler görmez.</p>
    ${f ? flash(f.message, f.type) : ''}
    <nav class="kt-filters" aria-label="Filtre">
      <a class="kt-chip${!malzeme ? ' is-on' : ''}" href="${q({ malzeme: '' })}">Tümü</a>
      ${malzemeler.map((x) => h`<a class="kt-chip${malzeme === x ? ' is-on' : ''}" href="${q({ malzeme: x })}">${x}</a>`)}
      <span class="kt-filters__sep"></span>
      <a class="kt-chip${durum === 'aktif' ? ' is-on' : ''}" href="${q({ durum: durum === 'aktif' ? '' : 'aktif' })}">Aktif</a>
      <a class="kt-chip${durum === 'pasif' ? ' is-on' : ''}" href="${q({ durum: durum === 'pasif' ? '' : 'pasif' })}">Pasif</a>
    </nav>
    ${shown.length ? h`<div class="kt-grid">${shown.map((m) => card(m, geri, csrf))}</div>` : h`<p class="muted">Bu filtrede model yok.</p>`}
  </div>`;
  return layout(c, 'Albüm kataloğu', csrf, demoAdmin, body);
}

function editPage(c, { item: m, csrf, flash: f, demoAdmin }) {
  const body = h`
  <div class="container kt kt-edit">
    <p class="ed__kicker"><a href="/admin/albumler">Albüm kataloğu</a></p>
    <h1 class="page-title">${m.ad}</h1>
    ${f ? flash(f.message, f.type) : ''}
    <div class="kt-edit__grid">
      <figure class="kt-edit__img"><img src="${m.foto}" alt="${m.ad}" width="800" height="800"></figure>
      <form class="kt-form" method="post" action="/admin/albumler/${m.no}">
        <input type="hidden" name="csrf" value="${csrf}">
        ${m.kaynakNot ? h`<p class="kt-warn kt-warn--box">${icon('alert')}${m.kaynakNot}</p>` : ''}
        <label class="kt-switch"><input type="checkbox" name="aktif" value="1"${m.aktif ? ' checked' : ''}><span>Çiftlere göster (aktif)</span></label>
        <p class="kt-form__label">Renkler <span class="muted">· çiftin seçebileceği renkler</span></p>
        <div class="kt-swatches">
          ${m.renkler.map((r) => h`<label class="kt-sw"><input type="checkbox" name="renk[]" value="${r.ad}"${r.aktif ? ' checked' : ''}><img src="${r.doku}" alt="" width="96" height="96"><span>${r.ad}</span></label>`)}
        </div>
        <p class="kt-form__label">Ebatlar <span class="muted">· albümün kapalı ölçüsü (katalogdaki açık ölçü)</span></p>
        <div class="kt-sizes-pick">
          ${m.ebatlar.map((e) => h`<label class="kt-size"><input type="checkbox" name="ebat[]" value="${e.kod}"${e.aktif ? ' checked' : ''}><span><b>${e.ad}</b><small>${e.kod}</small></span></label>`)}
        </div>
        <div class="kt-row">
          <label class="field"><span class="field__label">Fiyat farkı (₺)</span><input class="input" type="text" inputmode="numeric" name="fark" value="${m.fark || ''}" placeholder="0"></label>
          <label class="field"><span class="field__label">Not (sadece siz görürsünüz)</span><input class="input" type="text" name="not" maxlength="300" value="${m.not}" placeholder="ör. stokta yok, sadece 30×30"></label>
        </div>
        <button class="btn btn--primary" type="submit">${icon('check')}Kaydet</button>
      </form>
    </div>
  </div>`;
  return layout(c, m.ad, csrf, demoAdmin, body);
}
module.exports = { listPage, editPage };
