'use strict';
// Yönetim paneli sayfaları.
const { h, raw } = require('./html');
const { panelLayout, statusBar, flash, icon } = require('./components');
const { photoTile, galleryTabs, logoutForm, formatDate } = require('./panel');

function adminNav(active, csrf, demoAdmin = false) {
  const items = [
    { href: '/admin', label: 'Çiftler', key: 'couples', icon: 'users' },
    { href: '/admin/portfolyo', label: 'Portfolyo', key: 'portfolio', icon: 'image' },
    // Görüşler ziyaretçilerin özel yorumlarıdır; demo stüdyo hesabına gösterilmez
    ...(demoAdmin ? [] : [{ href: '/admin/gorusler', label: 'Görüşler', key: 'feedback', icon: 'star' }]),
    { href: '/admin/hesap', label: 'Hesap', key: 'account', icon: 'settings' },
  ];
  return h`<nav class="panel-nav" aria-label="Yönetim menüsü">
    ${items.map((i) => h`<a class="panel-nav__link" href="${i.href}"${i.key === active ? raw(' aria-current="page"') : ''}>${icon(i.icon)}<span>${i.label}</span></a>`)}
    ${logoutForm(csrf)}
  </nav>`;
}

// Telefonda alttaki sekme menüsü
function adminTabs(active, demoAdmin = false) {
  return [
    { href: '/admin', label: 'Çiftler', icon: 'users', active: active === 'couples' },
    { href: '/admin/portfolyo', label: 'Portfolyo', icon: 'image', active: active === 'portfolio' },
    ...(demoAdmin ? [] : [{ href: '/admin/gorusler', label: 'Görüşler', icon: 'star', active: active === 'feedback' }]),
    { href: '/admin/hesap', label: 'Hesap', icon: 'settings', active: active === 'account' },
  ];
}

const csrfField = (csrf) => h`<input type="hidden" name="csrf" value="${csrf}">`;

function flashBlock(f) {
  if (!f) return '';
  return h`
  ${flash(f.message, f.type)}
  ${f.credentials ? h`
  <div class="credentials" role="status">
    <p class="credentials__title">${icon('lock')}Çiftle paylaşacağınız giriş bilgileri</p>
    <dl>
      <div><dt>Giriş adresi</dt><dd>${f.credentials.url}</dd></div>
      <div><dt>Erişim kodu</dt><dd><code>${f.credentials.code}</code></dd></div>
      <div><dt>Şifre</dt><dd><code>${f.credentials.password}</code></dd></div>
    </dl>
    <p class="muted">Şifre güvenlik nedeniyle yalnızca şimdi gösterilir. Kaybolursa "Şifre yenile" ile yenisini oluşturun.</p>
  </div>` : ''}`;
}

function dashboard(c, { couples, csrf, flash: f, demoAdmin }) {
  const body = h`
  <div class="container">
    <div class="panel-title-row">
      <h1 class="page-title">Çiftler</h1>
    </div>
    ${flashBlock(f)}

    <div class="admin-grid">
      <section class="card" aria-labelledby="new-couple">
        <h2 class="card__title" id="new-couple">Yeni çift ekle</h2>
        <form class="form" method="post" action="/admin/ciftler">
          ${csrfField(csrf)}
          <div class="field">
            <label for="name">Çiftin adı</label>
            <input id="name" name="name" type="text" required maxlength="120" placeholder="Ayşe & Mehmet">
          </div>
          <div class="field">
            <label for="code">Erişim kodu <span class="muted">(boş bırakırsanız otomatik)</span></label>
            <input id="code" name="code" type="text" maxlength="40" pattern="[a-z0-9-]{3,40}" placeholder="ayse-mehmet" autocapitalize="none" spellcheck="false">
            <p class="hint">Küçük harf, rakam ve tire. Çift bu kodla giriş yapar.</p>
          </div>
          <div class="field">
            <label for="date">Çekim tarihi</label>
            <input id="date" name="eventDate" type="date">
          </div>
          <div class="field">
            <label for="pw">Şifre <span class="muted">(boş bırakırsanız güçlü bir şifre üretilir)</span></label>
            <input id="pw" name="password" type="text" minlength="8" maxlength="100" autocomplete="off">
          </div>
          <button class="btn btn--primary" type="submit">Çifti ekle</button>
        </form>
      </section>

      <section class="card card--wide" aria-labelledby="couple-list">
        <h2 class="card__title" id="couple-list">Tüm çiftler <span class="muted">(${couples.length})</span></h2>
        ${couples.length ? h`
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th scope="col">Çift</th><th scope="col">Tarih</th><th scope="col">Aşama</th><th scope="col">Fotoğraf</th><th scope="col">Favori</th><th scope="col"><span class="sr-only">İşlem</span></th></tr></thead>
            <tbody>
              ${couples.map((k) => h`
              <tr>
                <td><a class="strong-link" href="/admin/ciftler/${k.id}">${k.name}</a><br><code class="muted">${k.access_code}</code></td>
                <td>${formatDate(k.event_date) || '—'}</td>
                <td><span class="badge${k.stage >= c.stages.length - 1 ? ' badge--done' : ''}">${c.stages[k.stage] || c.stages[0]}</span></td>
                <td>${k.photo_count}</td>
                <td>${k.fav_count}</td>
                <td><a class="btn btn--outline btn--sm" href="/admin/ciftler/${k.id}">Aç</a></td>
              </tr>`)}
            </tbody>
          </table>
        </div>` : h`<p class="muted">Henüz çift eklenmedi. Soldaki formdan ilk çifti ekleyin.</p>`}
      </section>
    </div>
  </div>`;
  return panelLayout(c, { title: 'Çiftler', csrf, nav: adminNav('couples', csrf, demoAdmin), tabs: adminTabs('couples', demoAdmin), body, scripts: ['/js/admin.js?v=1'] });
}

function coupleDetail(c, { couple, photos, totalCount, favCount, view, csrf, flash: f, loginUrl, demoAdmin }) {
  const base = `/admin/ciftler/${couple.id}`;
  const body = h`
  <div class="container">
    <a class="back-link" href="/admin">${icon('left')}Tüm çiftler</a>
    <div class="panel-title-row">
      <div>
        <h1 class="page-title">${couple.name}</h1>
        <p class="muted">${couple.event_date ? formatDate(couple.event_date) + ' · ' : ''}Erişim kodu: <code>${couple.access_code}</code></p>
      </div>
    </div>
    ${flashBlock(f)}

    ${statusBar(c.stages, couple.stage, couple.stage_note, 'İş durumu (çiftin gördüğü)')}

    <div class="admin-grid admin-grid--3">
      <section class="card" aria-labelledby="stage-title">
        <h2 class="card__title" id="stage-title">İş aşamasını güncelle</h2>
        <form class="form" method="post" action="${base}/asama">
          ${csrfField(csrf)}
          <div class="field">
            <label for="stage">Aşama</label>
            <select id="stage" name="stage">
              ${c.stages.map((s, i) => h`<option value="${i}"${i === couple.stage ? raw(' selected') : ''}>${i + 1}. ${s}</option>`)}
            </select>
          </div>
          <div class="field">
            <label for="note">Çifte not <span class="muted">(isteğe bağlı)</span></label>
            <textarea id="note" name="note" rows="3" maxlength="500" placeholder="Örn. Video kurgusu bu hafta tamamlanacak.">${couple.stage_note}</textarea>
          </div>
          <button class="btn btn--primary" type="submit">Kaydet</button>
        </form>
      </section>

      <section class="card" aria-labelledby="info-title">
        <h2 class="card__title" id="info-title">Bilgiler</h2>
        <form class="form" method="post" action="${base}/bilgi">
          ${csrfField(csrf)}
          <div class="field">
            <label for="name">Çiftin adı</label>
            <input id="name" name="name" type="text" required maxlength="120" value="${couple.name}">
          </div>
          <div class="field">
            <label for="date">Çekim tarihi</label>
            <input id="date" name="eventDate" type="date" value="${couple.event_date || ''}">
          </div>
          <button class="btn btn--outline" type="submit">Güncelle</button>
        </form>
      </section>

      <section class="card" aria-labelledby="access-title">
        <h2 class="card__title" id="access-title">Giriş</h2>
        <p class="muted">Giriş adresi: <code>${loginUrl}</code></p>
        <p class="muted">Erişim kodu: <code>${couple.access_code}</code></p>
        <form method="post" action="${base}/sifre" data-confirm="Yeni şifre oluşturulsun mu? Eski şifre çalışmayı bırakır.">
          ${csrfField(csrf)}
          <button class="btn btn--outline" type="submit">Şifre yenile</button>
        </form>
      </section>
    </div>

    <section class="panel-section" aria-labelledby="upload-title">
      <div class="panel-section__head">
        <h2 class="panel-section__title" id="upload-title">Fotoğraf yükle</h2>
        <p class="muted">Fotoğraflar tarayıcınızda web için küçültülür, sonra yüklenir. Dosyalar gizli klasörde saklanır; yalnızca bu çift ve siz görebilirsiniz.</p>
      </div>
      <form class="uploader" data-uploader data-endpoint="${base}/fotograflar">
        <label class="uploader__drop">
          ${icon('upload')}
          <span><strong>Fotoğraf seçin</strong> veya buraya sürükleyin</span>
          <span class="muted">JPG, PNG veya WEBP · çoklu seçim</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple data-files>
        </label>
        <label class="check">
          <input type="checkbox" data-keep-original checked>
          <span>Orijinal dosyaları da sakla (çift tam çözünürlükte indirebilsin)</span>
        </label>
        <ul class="uploader__list" data-list aria-live="polite"></ul>
      </form>
    </section>

    <section class="panel-section" aria-labelledby="gallery-title">
      <div class="panel-section__head">
        <h2 class="panel-section__title" id="gallery-title">Galeri ve favoriler</h2>
        <p class="muted">Kalbe dokunarak çiftin favori listesini düzenleyebilirsiniz.</p>
      </div>
      ${galleryTabs(base, view, totalCount, favCount)}
      ${photos.length ? h`
      <ul class="tiles" data-gallery>
        ${photos.map((p) => photoTile(p, { favEndpoint: `${base}/favori`, canDelete: true, csrf, deleteAction: `${base}/fotograflar/${p.id}/sil` }))}
      </ul>` : h`<div class="empty-box">${icon('image')}<p>${view === 'fav' ? 'Bu çift henüz favori seçmedi.' : 'Henüz fotoğraf yüklenmedi.'}</p></div>`}
    </section>

    <section class="danger-zone" aria-labelledby="danger-title">
      <h2 class="card__title" id="danger-title">Çifti sil</h2>
      <p class="muted">Çift, tüm fotoğrafları ve favorileri kalıcı olarak silinir.</p>
      <form method="post" action="${base}/sil" data-confirm="${couple.name} ve tüm fotoğrafları kalıcı olarak silinsin mi? Bu işlem geri alınamaz.">
        ${csrfField(csrf)}
        <button class="btn btn--danger" type="submit">${icon('trash')}Çifti sil</button>
      </form>
    </section>
  </div>`;
  return panelLayout(c, { title: couple.name, csrf, nav: adminNav('couples', csrf, demoAdmin), tabs: adminTabs('couples', demoAdmin), body, scripts: ['/js/panel.js?v=1', '/js/admin.js?v=1'] });
}

function portfolioAdmin(c, { items, heroId, csrf, flash: f, demoAdmin }) {
  const catOptions = (selected) => h`<option value="">Kategori yok</option>${c.portfolio.categories.map((k) => h`<option value="${k}"${k === selected ? raw(' selected') : ''}>${k}</option>`)}`;
  const body = h`
  <div class="container">
    <div class="panel-title-row">
      <h1 class="page-title">Portfolyo</h1>
      <a class="btn btn--outline btn--sm" href="/portfolyo" target="_blank" rel="noopener">Sitede gör ${icon('arrow')}</a>
    </div>
    ${flashBlock(f)}

    <section class="panel-section" aria-labelledby="pf-upload">
      <div class="panel-section__head">
        <h2 class="panel-section__title" id="pf-upload">Portfolyoya fotoğraf ekle</h2>
        <p class="muted">Instagram'da paylaştığınız fotoğrafları buraya yükleyin. Bu fotoğraflar herkese açık sitede görünür.</p>
      </div>
      <form class="uploader" data-uploader data-endpoint="/admin/portfolyo">
        <div class="field field--inline">
          <label for="pf-cat">Kategori</label>
          <select id="pf-cat" data-category>${catOptions('')}</select>
        </div>
        <label class="uploader__drop">
          ${icon('upload')}
          <span><strong>Fotoğraf seçin</strong> veya buraya sürükleyin</span>
          <span class="muted">JPG, PNG veya WEBP · çoklu seçim</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple data-files>
        </label>
        <ul class="uploader__list" data-list aria-live="polite"></ul>
      </form>
    </section>

    <section class="panel-section" aria-labelledby="pf-list">
      <div class="panel-section__head">
        <h2 class="panel-section__title" id="pf-list">Yüklü fotoğraflar <span class="muted">(${items.length})</span></h2>
        <p class="muted">"Kapak yap" ile anasayfadaki büyük fotoğrafı seçin.</p>
      </div>
      ${items.length ? h`
      <ul class="pf-admin">
        ${items.map((p) => h`
        <li class="pf-admin__item${p.id === heroId ? ' is-hero' : ''}">
          <a class="pf-admin__img" href="${p.display}" data-lb><img src="${p.thumb}" alt="${p.alt || p.category || 'Portfolyo fotoğrafı'}" loading="lazy"></a>
          ${p.id === heroId ? h`<span class="badge badge--done pf-admin__badge">Kapak</span>` : ''}
          <form class="form form--compact" method="post" action="/admin/portfolyo/${p.id}">
            ${csrfField(csrf)}
            <label class="sr-only" for="cat-${p.id}">Kategori</label>
            <select id="cat-${p.id}" name="category">${catOptions(p.category)}</select>
            <label class="sr-only" for="alt-${p.id}">Açıklama</label>
            <input id="alt-${p.id}" name="alt" type="text" maxlength="160" placeholder="Kısa açıklama (erişilebilirlik)" value="${p.alt}">
            <button class="btn btn--outline btn--sm" type="submit">Kaydet</button>
          </form>
          <div class="pf-admin__actions">
            <form method="post" action="/admin/portfolyo/${p.id}/kapak">${csrfField(csrf)}<button class="btn btn--text btn--sm" type="submit">${icon('star')}Kapak yap</button></form>
            <form method="post" action="/admin/portfolyo/${p.id}/sil" data-confirm="Bu fotoğraf portfolyodan silinsin mi?">${csrfField(csrf)}<button class="btn btn--text btn--sm btn--danger-text" type="submit">${icon('trash')}Sil</button></form>
          </div>
        </li>`)}
      </ul>` : h`<div class="empty-box">${icon('image')}<p>Henüz portfolyo fotoğrafı yok.</p></div>`}
    </section>
  </div>`;
  return panelLayout(c, { title: 'Portfolyo', csrf, nav: adminNav('portfolio', csrf, demoAdmin), tabs: adminTabs('portfolio', demoAdmin), body, scripts: ['/js/admin.js?v=1'] });
}

function account(c, { admin, csrf, flash: f, demoAdmin }) {
  const body = h`
  <div class="container container--narrow">
    <h1 class="page-title">Hesap</h1>
    ${flashBlock(f)}
    <section class="card">
      <h2 class="card__title">Şifre değiştir</h2>
      <p class="muted">Kullanıcı adı: <strong>${admin.username}</strong></p>
      <form class="form" method="post" action="/admin/hesap">
        ${csrfField(csrf)}
        <div class="field"><label for="cur">Mevcut şifre</label><input id="cur" name="current" type="password" autocomplete="current-password" required></div>
        <div class="field"><label for="new">Yeni şifre <span class="muted">(en az 10 karakter)</span></label><input id="new" name="next" type="password" autocomplete="new-password" minlength="10" required></div>
        <button class="btn btn--primary" type="submit">Şifreyi değiştir</button>
      </form>
    </section>
  </div>`;
  return panelLayout(c, { title: 'Hesap', csrf, nav: adminNav('account', csrf, demoAdmin), tabs: adminTabs('account', demoAdmin), body });
}

module.exports = { adminNav, adminTabs, dashboard, coupleDetail, portfolioAdmin, account };
