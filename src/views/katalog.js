'use strict';
// Admin › Albüm kataloğu ekranları
const { h, raw } = require('./html');
const { panelLayout, icon, flash } = require('./components');
const admin = require('./admin');

const tl = (n) => `${n > 0 ? '+' : ''}${Number(n).toLocaleString('tr-TR')} ₺`;
const layout = (c, title, csrf, demoAdmin, body, scripts = []) => panelLayout(c, { title, csrf, nav: admin.adminNav('editor', csrf, demoAdmin), home: '/admin', tabs: admin.adminTabs('editor', demoAdmin), body, scripts });

function card(m, geri, csrf) {
  const renk = m.renkler.filter((r) => r.aktif);
  const ebat = m.ebatlar.filter((e) => e.aktif);
  return h`<article class="kt-card${m.aktif ? '' : ' is-off'}" id="m${m.no}">
    <a class="kt-card__img" href="/admin/albumler/${m.no}">${m.foto ? h`<img src="${m.foto}" alt="${m.ad}" loading="lazy" decoding="async" width="400" height="400">` : h`<span class="kt-noimg">${icon('image')}Fotoğraf yok</span>`}</a>
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
    <p class="muted kt-lead">${items.length} model · ${items.filter((m) => m.aktif).length} aktif · Pasif modelleri çiftler görmez.</p>
    ${f ? flash(f.message, f.type) : ''}
    <form class="kt-new" method="post" action="/admin/albumler"><input type="hidden" name="csrf" value="${csrf}">
      <input class="input" type="text" name="ad" maxlength="40" placeholder="Yeni model adı (ör. Roma)" required>
      <button class="btn btn--primary" type="submit">${icon('plus')}Model ekle</button>
    </form>
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

function editPage(c, { item: m, known, csrf, flash: f, demoAdmin }) {
  const hid = h`<input type="hidden" name="csrf" value="${csrf}">`;
  const act = (islem, extra, label, cls = 'kt-x') => h`<form method="post" action="/admin/albumler/${m.no}">${hid}<input type="hidden" name="islem" value="${islem}">${extra}<button class="${cls}" type="submit" title="${label}" aria-label="${label}">${icon('trash')}</button></form>`;
  const free = known.filter((k) => !m.renkler.some((r) => r.ad === k.ad));
  const body = h`
  <div class="container kt kt-edit" data-kt="${m.no}">
    <p class="ed__kicker"><a href="/admin/albumler">Albüm kataloğu</a></p>
    <h1 class="page-title">${m.ad}</h1>
    ${f ? flash(f.message, f.type) : ''}
    <div class="kt-edit__grid">
      <div>
        <figure class="kt-edit__img">${m.foto ? h`<img src="${m.foto}" alt="${m.ad}" width="800" height="800">` : h`<span class="kt-noimg">${icon('image')}Fotoğraf yok</span>`}</figure>
        <label class="btn btn--ghost kt-upbtn">${icon('upload')}${m.foto ? 'Fotoğrafı değiştir' : 'Fotoğraf yükle'}<input type="file" accept="image/*" data-kt-up="foto" hidden></label>
      </div>
      <div>
        <form class="kt-form" id="kt-main" method="post" action="/admin/albumler/${m.no}">
          ${hid}<input type="hidden" name="islem" value="kaydet">
          ${m.kaynakNot ? h`<p class="kt-warn kt-warn--box">${icon('alert')}${m.kaynakNot}</p>` : ''}
          <label class="field"><span class="field__label">Model adı</span><input class="input" type="text" name="ad" maxlength="40" value="${m.ad}" required></label>
          <label class="kt-switch"><input type="checkbox" name="aktif" value="1"${m.aktif ? ' checked' : ''}><span>Çiftlere göster (aktif)</span></label>
          <div class="kt-row">
            <label class="field"><span class="field__label">Fiyat farkı (₺)</span><input class="input" type="text" inputmode="numeric" name="fark" value="${m.fark || ''}" placeholder="0"></label>
            <label class="field"><span class="field__label">Not (sadece siz görürsünüz)</span><input class="input" type="text" name="not" maxlength="300" value="${m.not}" placeholder="ör. stokta yok"></label>
          </div>
          <label class="field"><span class="field__label">"Masamda gör" kapak düzeni</span><select class="input" name="kapak">${Object.entries(require('../katalog').KAPAKLAR).map(([k, v]) => h`<option value="${k}"${m.kapak === k ? raw(' selected') : ''}>${v}</option>`)}</select></label>
          ${m.renkler.map((r) => h`<input type="hidden" name="renk[]" value="${r.ad}" data-kt-on="r:${r.ad}"${r.aktif ? '' : raw(' disabled')}>`)}
          ${m.ebatlar.map((e) => h`<input type="hidden" name="ebat[]" value="${e.kod}" data-kt-on="e:${e.kod}"${e.aktif ? '' : raw(' disabled')}>`)}
        </form>

        <section class="kt-sec" id="renkler">
          <p class="kt-form__label">Renkler <span class="muted">· işaretli olanları çift görür</span></p>
          <div class="kt-swatches">
            ${m.renkler.map((r) => h`<div class="kt-sw"><label><input type="checkbox" data-kt-tog="r:${r.ad}"${r.aktif ? ' checked' : ''}><img src="${r.doku}" alt="" width="96" height="96"><span>${r.ad}</span></label>${act('renk-sil', h`<input type="hidden" name="renk_ad" value="${r.ad}">`, `${r.ad} rengini kaldır`)}</div>`)}
          </div>
          ${m.renkler.length ? '' : h`<p class="muted">Henüz renk yok.</p>`}
          <details class="kt-add">
            <summary>${icon('plus')}Renk ekle</summary>
            ${free.length ? h`<form class="kt-add__row" method="post" action="/admin/albumler/${m.no}">${hid}<input type="hidden" name="islem" value="renk-ekle">
              <select class="input" name="renk_ad">${free.map((k) => h`<option value="${k.ad}">${k.ad}</option>`)}</select>
              <button class="btn btn--ghost" type="submit">Katalogdaki renkten ekle</button></form>` : ''}
            <div class="kt-add__row">
              <input class="input" type="text" id="kt-newcolor" maxlength="40" placeholder="Yeni renk adı (ör. Kadife Zümrüt)">
              <label class="btn btn--ghost">${icon('upload')}Malzeme fotoğrafı seç<input type="file" accept="image/*" data-kt-up="renk" hidden></label>
            </div>
            <p class="muted kt-hint">Kumaşın/derinin yakın, düz ışıkta fotoğrafı. Kare kırpılır.</p>
          </details>
        </section>

        <section class="kt-sec" id="ebatlar">
          <p class="kt-form__label">Ebatlar <span class="muted">· kapalı ölçü (katalogdaki açık ölçü)</span></p>
          <div class="kt-sizes-pick">
            ${m.ebatlar.map((e) => h`<div class="kt-size"><label><input type="checkbox" data-kt-tog="e:${e.kod}"${e.aktif ? ' checked' : ''}><span><b>${e.ad}</b><small>${e.kod}</small></span></label>${act('ebat-sil', h`<input type="hidden" name="kod" value="${e.kod}">`, `${e.ad} ebatını kaldır`)}</div>`)}
          </div>
          <form class="kt-add__row" method="post" action="/admin/albumler/${m.no}">${hid}<input type="hidden" name="islem" value="ebat-ekle">
            <input class="input kt-size-in" type="text" name="kod" placeholder="ör. 35x70" required>
            <button class="btn btn--ghost" type="submit">${icon('plus')}Ebat ekle</button>
          </form>
        </section>

        <div class="kt-actions">
          <button class="btn btn--primary" type="submit" form="kt-main">${icon('check')}Kaydet</button>
          <form method="post" action="/admin/albumler/${m.no}" data-kt-confirm="${m.ad} modeli katalogdan silinsin mi?">${hid}<input type="hidden" name="islem" value="sil"><button class="btn btn--ghost btn--danger-text" type="submit">${icon('trash')}Modeli sil</button></form>
        </div>
      </div>
    </div>
  </div>`;
  return layout(c, m.ad, csrf, demoAdmin, body, ['/js/katalog.js?v=2']);
}

// ───────── Çift tarafı ─────────
const shell = (c, o, body, scripts = []) => require('./panel').coupleShell(c, { couple: o.couple, page: 'album', csrf: o.csrf, flash: o.flash, body, scripts });
const qs = (o) => new URLSearchParams(o).toString();

function choiceBox(ch, locked) {
  if (!ch) return '';
  return h`<section class="ak-chosen">
    <p class="ak-eyebrow">${locked ? 'Seçiminiz tasarıma alındı' : 'Seçiminiz stüdyoya iletildi'}</p>
    <h2>${ch.model}</h2>
    <p>${ch.renk} · ${ch.boy}</p>
    <p class="ak-cover-line">Kapak: <b>${ch.isim}</b>${ch.tarih ? ` · ${ch.tarih}` : ''}</p>
    ${locked ? h`<p class="muted">Değişiklik için stüdyomuza yazın.</p>` : h`<a class="btn btn--ghost" href="/panel/albumum/${ch.no}">Seçimi değiştir</a>`}
  </section>`;
}

function coupleList(c, o) {
  const { items, malzeme, choice, locked } = o;
  const fams = [...new Set(items.flatMap((m) => m.malzeme))];
  const shown = items.filter((m) => !malzeme || m.malzeme.includes(malzeme));
  const body = h`<div class="ak">
    <h1 class="page-title">Albümünüzü seçin</h1>
    <p class="muted ak-lead">Modele dokunun, rengini ve boyunu seçin. Kalbe basarak beğendiklerinizi ayırabilirsiniz.</p>
    ${choiceBox(choice, locked)}
    ${locked ? '' : h`
    <nav class="kt-filters ak-filters" aria-label="Malzeme">
      <a class="kt-chip${!malzeme ? ' is-on' : ''}" href="/panel/albumum">Tümü</a>
      <button class="kt-chip ak-favchip" type="button" data-ak-favs hidden>${icon('heart')}Favoriler</button>
      ${fams.map((x) => h`<a class="kt-chip${malzeme === x ? ' is-on' : ''}" href="/panel/albumum?${qs({ m: x })}">${x}</a>`)}
    </nav>
    <div class="ak-grid">${shown.map((m) => h`<article class="ak-card${choice && choice.no === m.no ? ' is-chosen' : ''}" data-ak-no="${m.no}">
      <a href="/panel/albumum/${m.no}"><img src="${m.foto}" alt="${m.ad}" loading="lazy" decoding="async" width="400" height="400"></a>
      <button class="ak-heart" type="button" data-ak-heart="${m.no}" aria-label="${m.ad} favorilere ekle" aria-pressed="false">${icon('heart')}</button>
      <a class="ak-card__body" href="/panel/albumum/${m.no}"><b>${m.ad}</b><span>${m.renkler.slice(0, 6).map((r) => h`<img src="${r.doku}" alt="" width="16" height="16" loading="lazy">`)}${m.renkler.length > 6 ? h`<small>+${m.renkler.length - 6}</small>` : ''}</span></a>
    </article>`)}</div>
    <p class="muted ak-empty" data-ak-empty hidden>Henüz favori yok.</p>`}
  </div>`;
  return shell(c, o, body, ['/js/albumum.js?v=4']);
}

function coupleDetail(c, o) {
  const { item: m, pick, locked } = o;
  const renk = m.renkler.find((r) => r.ad === pick.renk) || m.renkler[0];
  const boy = m.ebatlar.find((e) => e.kod === pick.boy) || m.ebatlar[0];
  const body = h`<div class="ak ak-detail">
    <p class="ed__kicker"><a href="/panel/albumum">Katalog</a></p>
    <div class="ak-detail__grid">
      <figure class="ak-detail__img"><img src="${m.foto}" alt="${m.ad}" width="800" height="800"></figure>
      <form class="ak-detail__form" method="get" action="/panel/albumum/${m.no}/onay" data-ak-form="${m.no}" data-ak-isim="${o.names}" data-ak-tarih="${o.date || ''}" data-ak-model="${m.ad}" data-ak-kapak="${m.kapak || 'duz'}" data-ak-foto="${o.photo || ''}">
        <h1 class="page-title">${m.ad}</h1>
        <p class="muted">${m.malzeme.join(' · ')}</p>
        <p class="kt-form__label">Renk · <span data-ak-renkad>${renk.ad}</span></p>
        <div class="ak-swatches">${m.renkler.map((r) => h`<label class="ak-sw" title="${r.ad}"><input type="radio" name="renk" value="${r.ad}"${r === renk ? ' checked' : ''}><img src="${r.doku}" alt="${r.ad}" width="96" height="96"></label>`)}</div>
        <p class="kt-form__label">Boy</p>
        <div class="ak-sizes">${m.ebatlar.map((e) => h`<label class="ak-size"><input type="radio" name="boy" value="${e.kod}"${e === boy ? ' checked' : ''}><span>${e.ad}</span></label>`)}</div>
        <div class="ak-ctas">
          <a class="btn btn--ghost ak-ar" data-ak-ar="ios" rel="ar" href="#" hidden aria-disabled="true"><img class="ak-arimg" src="${m.foto}" alt="">${icon('camera')}<span>Masamda gör</span></a>
          <a class="btn btn--ghost ak-ar" data-ak-ar="android" href="#" hidden aria-disabled="true">${icon('camera')}<span>Masamda gör</span></a>
          ${locked ? h`<p class="muted">Albümünüz tasarıma alındı; seçim kilitli.</p>` : h`<button class="btn btn--primary" type="submit">${icon('check')}Bunu seçiyorum</button>`}
        </div>
        <p class="muted ak-arnote" data-ak-arnote hidden>"Masamda gör" telefonda çalışır: bu sayfayı iPhone'da ya da Android'de açın.</p>
        <p class="muted ak-arnote" data-ak-arsafari hidden>iPhone ve iPad'de "Masamda gör"ü Safari ile açın; diğer tarayıcılarda görüntüden çıkış düğmesi çıkmayabilir.</p>
        <p class="muted ak-arnote" data-ak-arhint hidden>Albüm seçtiğiniz renk ve boyda, kapağında isimlerinizle masanıza yerleşir.</p>
      </form>
    </div>
  </div>`;
  return shell(c, o, body, ['/js/albumum.js?v=4']);
}

function coupleConfirm(c, o) {
  const { item: m, renk, boy, names, date, note, csrf } = o;
  const body = h`<div class="ak ak-confirm">
    <p class="ed__kicker"><a href="/panel/albumum/${m.no}?${qs({ renk: renk.ad, boy: boy.kod })}">${m.ad}</a></p>
    <h1 class="page-title">Seçiminizi onaylayın</h1>
    <div class="ak-sum"><img src="${m.foto}" alt="" width="120" height="120"><div><b>${m.ad}</b><span>${renk.ad}</span><span>${boy.ad}</span></div></div>
    <form method="post" action="/panel/albumum/onay" class="ak-form">
      <input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="no" value="${m.no}"><input type="hidden" name="renk" value="${renk.ad}"><input type="hidden" name="boy" value="${boy.kod}">
      <p class="kt-form__label">Kapak yazısı</p>
      <div class="ak-cover" aria-hidden="true"><img src="${renk.doku}" alt="" width="512" height="512"><div class="ak-cover__txt"><span data-ak-pv="isim">${names}</span><small data-ak-pv="tarih">${date}</small></div></div>
      <label class="field"><span class="field__label">İsimler</span><input class="input" type="text" name="isim" maxlength="40" value="${names}" data-ak-in="isim" required></label>
      <label class="field"><span class="field__label">Tarih</span><input class="input" type="text" name="tarih" maxlength="12" value="${date}" placeholder="gg.aa.yyyy" data-ak-in="tarih"></label>
      <label class="field"><span class="field__label">Not (isteğe bağlı)</span><textarea class="input" name="not" maxlength="300" rows="3" placeholder="ör. tarih yazmasın, sadece isimler">${note}</textarea></label>
      <p class="muted ak-hint">Tasarım başlayana kadar seçiminizi değiştirebilirsiniz.</p>
      <button class="btn btn--primary btn--block" type="submit">${icon('check')}Onayla ve gönder</button>
    </form>
  </div>`;
  return shell(c, o, body, ['/js/albumum.js?v=4']);
}
module.exports = { listPage, editPage, coupleList, coupleDetail, coupleConfirm };
