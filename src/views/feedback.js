'use strict';
// Görüş formu ve admin görüşler sayfası.
const { h, raw } = require('./html');
const { publicLayout, panelLayout, flash, icon } = require('./components');
const { adminNav, adminTabs } = require('./admin');

function form(c, { roles, areas, error, values = {}, thanks, preArea }) {
  const sel = (a, b) => (a === b ? raw(' selected') : '');
  const area = values.area || preArea;
  const body = h`
  <section class="page-hero">
    <div class="container container--narrow">
      <p class="eyebrow">Demo · Görüşleriniz</p>
      <h1 class="page-title">Nasıl buldunuz?</h1>
      <p class="page-lead">Siteyi ve panelleri denediyseniz birkaç cümleyle düşüncelerinizi yazın. Neyi beğendiniz, nerede zorlandınız, ne eksik?</p>
    </div>
  </section>
  <section class="section section--flush-top">
    <div class="container container--narrow">
      ${thanks ? h`
      <div class="card thanks">
        <span class="auth__icon">${icon('check')}</span>
        <h2 class="card__title">Teşekkür ederiz!</h2>
        <p class="muted">Görüşünüz bize ulaştı. İsterseniz demoyu denemeye devam edebilir ya da bir görüş daha yazabilirsiniz.</p>
        <div class="btn-row">
          <a class="btn btn--primary" href="/">Siteye dön</a>
          <a class="btn btn--outline" href="/gorus">Yeni görüş yaz</a>
        </div>
      </div>` : h`
      ${flash(error, 'error')}
      <form class="card form" method="post" action="/gorus">
        <div class="hp" aria-hidden="true"><label for="website">Bu alanı boş bırakın</label><input id="website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
        <fieldset class="rating">
          <legend>Genel olarak kaç puan verirsiniz?</legend>
          <div class="rating__row">
            ${[1, 2, 3, 4, 5].map((n) => h`<label class="rating__opt"><input type="radio" name="rating" value="${n}"${String(values.rating) === String(n) ? raw(' checked') : ''}><span>${n}</span></label>`)}
          </div>
          <p class="hint">1 = hiç beğenmedim · 5 = çok beğendim</p>
        </fieldset>
        <div class="field">
          <label for="area">Hangi bölümle ilgili?</label>
          <select id="area" name="area">
            <option value="">Seçin (isteğe bağlı)</option>
            ${areas.map((a) => h`<option value="${a}"${sel(a, area)}>${a}</option>`)}
          </select>
        </div>
        <div class="field">
          <label for="message">Görüşünüz</label>
          <textarea id="message" name="message" rows="6" maxlength="3000" required placeholder="Örn. Favori seçmek çok kolaydı ama indirme butonunu ilk bakışta fark etmedim.">${values.message || ''}</textarea>
        </div>
        <div class="field">
          <label for="role">Sizi en iyi ne tanımlar?</label>
          <select id="role" name="role">
            <option value="">Seçin (isteğe bağlı)</option>
            ${roles.map((r) => h`<option value="${r}"${sel(r, values.role)}>${r}</option>`)}
          </select>
        </div>
        <div class="field">
          <label for="fname">Adınız <span class="muted">(isteğe bağlı)</span></label>
          <input id="fname" name="name" type="text" maxlength="80" autocomplete="given-name" value="${values.name || ''}">
        </div>
        <p class="hint">Görüşleriniz yalnızca HM4 Studio tarafından okunur ve siteyi geliştirmek için kullanılır.</p>
        <button class="btn btn--primary" type="submit">Gönder</button>
      </form>`}
    </div>
  </section>`;
  return publicLayout(c, { title: 'Görüş bildir', body });
}

function stars(n) {
  if (!n) return h`<span class="muted">Puan yok</span>`;
  return h`<span class="score" aria-label="${n} / 5">${n}<span class="muted">/5</span></span>`;
}

function adminList(c, { items, areas, csrf, flash: f }) {
  const rated = items.filter((i) => i.rating);
  const avg = rated.length ? (rated.reduce((s, i) => s + i.rating, 0) / rated.length).toFixed(1) : '—';
  const byArea = areas.map((a) => ({ a, n: items.filter((i) => i.area === a).length })).filter((x) => x.n);
  const body = h`
  <div class="container">
    <div class="panel-title-row">
      <h1 class="page-title">Görüşler</h1>
      ${items.length ? h`<a class="btn btn--outline btn--sm" href="/admin/gorusler.csv">${icon('download')}Excel için indir (CSV)</a>` : ''}
    </div>
    ${f ? flash(f.message, f.type) : ''}
    <div class="stats">
      <div class="stat"><span class="stat__num">${items.length}</span><span class="stat__label">Toplam görüş</span></div>
      <div class="stat"><span class="stat__num">${avg}</span><span class="stat__label">Ortalama puan (${rated.length} oy)</span></div>
      <div class="stat stat--wide"><span class="stat__label">Bölümlere göre</span>
        ${byArea.length ? h`<ul class="stat__list">${byArea.map((x) => h`<li><span>${x.a}</span><strong>${x.n}</strong></li>`)}</ul>` : h`<span class="muted">—</span>`}
      </div>
    </div>
    <p class="muted">Paylaşılacak bağlantı: <code>/gorus</code> — demo sayfalarının üstündeki bantta da yer alır.</p>
    ${items.length ? h`
    <ul class="fb-list">
      ${items.map((i) => h`
      <li class="fb">
        <div class="fb__head">
          ${stars(i.rating)}
          <span class="fb__meta">${[i.name || 'İsimsiz', i.role, i.area, i.device].filter(Boolean).join(' · ')}</span>
          <time class="fb__time" datetime="${i.created_at}">${new Date(`${i.created_at.replace(' ', 'T')}Z`).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
        </div>
        <p class="fb__msg">${i.message}</p>
        <form method="post" action="/admin/gorusler/${i.id}/sil" data-confirm="Bu görüş silinsin mi?">
          <input type="hidden" name="csrf" value="${csrf}">
          <button class="btn btn--text btn--sm btn--danger-text" type="submit">${icon('trash')}Sil</button>
        </form>
      </li>`)}
    </ul>` : h`<div class="empty-box">${icon('star')}<p>Henüz görüş gelmedi. Demo bağlantısını paylaştığınızda gelen yorumlar burada görünür.</p></div>`}
  </div>`;
  return panelLayout(c, { title: 'Görüşler', csrf, nav: adminNav('feedback', csrf, false), tabs: adminTabs('feedback'), body });
}

module.exports = { form, adminList };
