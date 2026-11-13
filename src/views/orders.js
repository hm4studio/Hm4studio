'use strict';
// Albüm siparişi sayfaları: Siparişler listesi, sipariş formu, Ayarlar › Albüm seçenekleri, çiftin onay sayfası, belge.
const { h, raw } = require('./html');
const { panelLayout, icon } = require('./components');
const admin = require('./admin');
const { formatDate } = require('./panel');
const orders = require('../orders');

const trDate = (iso) => (iso ? new Date(`${String(iso).replace(' ', 'T')}Z`).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', year: 'numeric' }) : '');
const tag = (st) => h`<span class="otag otag--${st.tone}">${st.label}</span>`;
const layout = (c, { title, csrf, demoAdmin, body, active = 'orders', scripts = [] }) => panelLayout(c, { title, csrf, nav: admin.adminNav(active, csrf, demoAdmin), home: '/admin', tabs: admin.adminTabs('list', demoAdmin), body, scripts });

// Çiftler | Siparişler geçişi (telefonda alt menü 5 sekmede kalsın diye)
const seg = (on) => h`<nav class="oseg" aria-label="Çiftler ve siparişler"><a href="/admin/ciftler"${on === 'list' ? raw(' aria-current="page"') : ''}>Çiftler</a><a href="/admin/siparisler"${on === 'orders' ? raw(' aria-current="page"') : ''}>Albüm siparişleri</a></nav>`;

const GROUPS = [
  ['tamamla', 'Siparişi tamamlanacak', 'Albüm tasarımını onayladılar; formu doldurup çifte gönderin.'],
  ['degisiklik', 'Çift değişiklik istedi', ''],
  ['onay', 'Çiftin onayında', ''],
  ['lab-bekliyor', 'Laba gönderilecek', 'Çift onayladı.'],
  ['lab', 'Labda', ''],
  ['plan', 'Randevuda not alınanlar', 'Tasarım onaylanınca forma hazır gelir.'],
  ['geldi', 'Gelen albümler', ''],
];

function listPage(c, { rows, csrf, flash: f, demoAdmin }) {
  const n = (k) => rows.filter((r) => r.st.key === k).length;
  const row = (r) => {
    const o = r.order;
    const sum = orders.summary(o);
    const act = ['tamamla', 'degisiklik'].includes(r.st.key) ? 'Formu aç' : 'Aç';
    return h`<li class="orow">
      <span class="av av--alb" aria-hidden="true">${admin.initials(r.couple.name)}</span>
      <a class="orow__m" href="/admin/ciftler/${r.couple.id}/siparis"><b>${r.couple.name}</b><span>${sum || 'Henüz seçim yok'}${r.st.key === 'degisiklik' && o.change_note ? h` · “${o.change_note}”` : ''}</span></a>
      ${tag(r.st)}
      ${r.st.key === 'lab-bekliyor' || r.st.key === 'lab' ? h`<form method="post" action="/admin/ciftler/${r.couple.id}/siparis/durum" class="inline-form">${admin.csrfField(csrf)}<input type="hidden" name="alan" value="${r.st.key === 'lab' ? 'geldi' : 'lab'}"><input type="hidden" name="back" value="/admin/siparisler"><button class="btn btn--outline btn--sm" type="submit">${icon('check')}${r.st.key === 'lab' ? 'Geldi' : 'Laba gönderildi'}</button></form>`
        : h`<a class="btn ${['tamamla', 'degisiklik'].includes(r.st.key) ? 'btn--primary' : 'btn--outline'} btn--sm" href="/admin/ciftler/${r.couple.id}/siparis">${act}</a>`}
    </li>`;
  };
  const body = h`
  <div class="container">
    ${seg('orders')}
    <div class="panel-title-row"><h1 class="page-title">Albüm siparişleri</h1><a class="btn btn--text btn--sm" href="/admin/album-secenekleri">${icon('settings')}Seçenekler</a></div>
    ${require('./guide').hint('orders')}
    ${admin.flashBlock(f)}
    <div class="ostats">
      <div><b>${n('tamamla') + n('degisiklik')}</b><span>Tamamlanacak</span></div>
      <div><b>${n('onay')}</b><span>Çiftte onay</span></div>
      <div><b>${n('lab-bekliyor')}</b><span>Laba gönderilecek</span></div>
      <div><b>${n('lab')}</b><span>Labda</span></div>
    </div>
    ${rows.length ? GROUPS.map(([key, title, note]) => {
      const list = rows.filter((r) => r.st.key === key);
      if (!list.length) return '';
      const body = h`<ul class="tasks__list">${list.map(row)}</ul>`;
      return key === 'geldi' ? h`<details class="tasks__done"><summary>${title} (${list.length})</summary>${body}</details>`
        : h`<section class="tasks__grp${['tamamla', 'degisiklik'].includes(key) ? ' is-late' : ''}"><p class="tasks__h">${title}<span>${list.length}</span></p>${note ? h`<p class="muted ogrp__note">${note}</p>` : ''}${body}</section>`;
    }) : h`<p class="sec-empty">Henüz sipariş yok. Randevu formundaki “Albüm siparişi” bölümünden ya da çift albüm tasarımını onaylayınca burada görünür.</p>`}
  </div>`;
  return layout(c, { title: 'Albüm siparişleri', csrf, demoAdmin, body });
}

// Beş alan: liste ayarlardan gelir
function fieldSelects(options, values, { prefix = '', required = false, hint = {} } = {}) {
  return orders.FIELDS.map(([k, label]) => {
    const list = options[k] || [];
    const v = values[k] || '';
    const extra = v && !list.includes(v) ? [v] : [];
    return h`<div class="field"><label for="${prefix}${k}">${label}${hint[k] ? h` <span class="muted">${hint[k]}</span>` : ''}</label>
      <select id="${prefix}${k}" name="${prefix}${k}" data-pv="${k}"${required ? raw(' data-req') : ''}><option value="">${prefix ? 'Sonra belirlenecek' : 'Seçin'}</option>${[...list, ...extra].map((x) => h`<option${x === v ? raw(' selected') : ''}>${x}</option>`)}</select></div>`;
  });
}

// Randevu formundaki isteğe bağlı bölüm (yeni randevu ve düzenleme)
function planFields(values, options, order) {
  if (order && ['onay', 'onaylandi', 'degisiklik'].includes(order.state)) {
    return h`<div class="oplan oplan--locked"><p><b>Albüm siparişi</b> · ${orders.summary(order)}</p><a class="btn btn--text btn--sm" href="${values.__coupleId ? `/admin/ciftler/${values.__coupleId}/siparis` : '/admin/siparisler'}">Siparişi aç${icon('right')}</a></div>`;
  }
  const any = orders.FIELDS.some(([k]) => values[`al_${k}`]) || values.al_note;
  return h`<details class="oplan"${any ? raw(' open') : ''}>
    <summary><span class="oplan__t">${icon('book')}Albüm siparişi</span><span class="muted">İsteğe bağlı · bilinenleri seçin, gerisi tasarım onaylanınca</span></summary>
    <div class="oplan__grid">${fieldSelects(options, Object.fromEntries(orders.FIELDS.map(([k]) => [k, values[`al_${k}`]])), { prefix: 'al_' })}</div>
    <div class="field"><label for="al_note">Ek albüm ve kararsız kalınanlar <span class="muted">(sipariş formunda karşınıza çıkar)</span></label><textarea id="al_note" name="al_note" rows="2" maxlength="600" placeholder="Ör. 2 cep albüm istiyorlar ama emin değiller">${values.al_note || ''}</textarea></div>
  </details>`;
}

function formPage(c, { couple, order, pages, options, csrf, flash: f, demoAdmin }) {
  const st = orders.stage(order.id ? order : null, couple);
  const locked = order.state === 'onaylandi';
  const pv = (k) => order[k] || '—';
  const body = h`
  <div class="container">
    <a class="back-link" href="/admin/ciftler/${couple.id}">${icon('left')}${couple.name}</a>
    <div class="panel-title-row"><h1 class="page-title">Albüm sipariş formu</h1>${tag(st)}</div>
    ${admin.flashBlock(f)}
    <div class="otags">
      ${couple.album_design_state === 'onaylandi' ? h`<span class="otag otag--o">Tasarım onaylandı${couple.album_design_at ? ` · ${trDate(couple.album_design_at)}` : ''}</span>` : h`<span class="otag otag--n">Tasarım henüz onaylanmadı</span>`}
      ${pages ? h`<span class="otag otag--n">Tasarım ${pages} sayfa</span>` : ''}
    </div>
    ${order.plan_note ? h`<p class="pre-note">${icon('calendar')}<span><b>Randevuda not alındı:</b> ${order.plan_note}</span></p>` : ''}
    ${order.state === 'degisiklik' && order.change_note ? h`<p class="pre-note pre-note--warn">${icon('alert')}<span><b>Çiftin isteği:</b> ${order.change_note}</span></p>` : ''}
    <div class="oform" data-order-form>
      <div class="oform__main">
        <form method="post" action="/admin/ciftler/${couple.id}/siparis" id="ofrm" class="ocard">
          ${admin.csrfField(csrf)}
          <h2 class="ocard__t">Albüm</h2>
          <div class="oform__grid">${fieldSelects(options, order, { required: true, hint: pages ? { sayfa: `(tasarım ${pages} sayfa)` } : {} })}</div>
          <div class="field"><label for="o-note">Ek albümler ve not <span class="muted">(çift de görür)</span></label><textarea id="o-note" name="note" rows="3" maxlength="1500" data-pv="note" placeholder="Ör. 2 adet 15×21 cep albüm · kapakta isimler">${order.note || ''}</textarea></div>
        </form>
        ${locked ? h`<section class="ocard">
          <h2 class="ocard__t">Lab</h2>
          <div class="olab">
            <form method="post" action="/admin/ciftler/${couple.id}/siparis/durum" class="inline-form">${admin.csrfField(csrf)}<input type="hidden" name="alan" value="lab"><button class="btn ${order.lab_at ? 'btn--primary' : 'btn--outline'} btn--sm" type="submit">${icon('check')}Laba gönderildi${order.lab_at ? ` · ${trDate(order.lab_at)}` : ''}</button></form>
            <form method="post" action="/admin/ciftler/${couple.id}/siparis/durum" class="inline-form">${admin.csrfField(csrf)}<input type="hidden" name="alan" value="geldi"><button class="btn ${order.arrived_at ? 'btn--primary' : 'btn--outline'} btn--sm" type="submit">${icon('check')}Albüm geldi${order.arrived_at ? ` · ${trDate(order.arrived_at)}` : ''}</button></form>
          </div>
        </section>` : ''}
      </div>
      <aside class="ocard ocard--pv">
        <p class="ocard__k">Çiftin göreceği</p>
        <h2 class="ocard__t">Albüm siparişi</h2>
        <p class="muted">${couple.name}</p>
        <dl class="olist">${orders.FIELDS.map(([k, label]) => h`<div><dt>${label}</dt><dd data-pv-out="${k}">${k === 'sayfa' && order.sayfa ? `${order.sayfa} sayfa` : pv(k)}</dd></div>`)}
          <div><dt>Not</dt><dd data-pv-out="note">${order.note || '—'}</dd></div></dl>
        <div class="ocard__acts">
          <button class="btn btn--primary" type="submit" form="ofrm" name="karar" value="gonder">${order.state === 'onay' ? 'Yeniden gönder' : locked ? 'Değiştirip yeniden onaya gönder' : 'Çifte onaya gönder'}</button>
          <button class="btn btn--outline" type="submit" form="ofrm" name="karar" value="kaydet">${locked ? 'Notu kaydet' : 'Taslak kaydet'}</button>
          ${['onay', 'onaylandi', 'degisiklik'].includes(order.state) ? h`<a class="btn btn--text btn--sm" href="/admin/ciftler/${couple.id}/siparis/belge">${icon('download')}Sipariş belgesi</a>` : ''}
        </div>
        <p class="muted ocard__small">${order.state === 'onay' ? `Çifte gönderildi · ${trDate(order.sent_at)}` : order.state === 'onaylandi' ? `Çift onayladı · ${trDate(order.approved_at)}` : 'Gönderince çifte WhatsApp mesajı ve bildirim gider; çift panelinden onaylar.'}</p>
      </aside>
    </div>
  </div>`;
  return layout(c, { title: `${couple.name} · albüm siparişi`, csrf, demoAdmin, body, scripts: ['/js/dashboard.js?v=16'] });
}

function optionsPage(c, { options, csrf, flash: f, demoAdmin }) {
  const help = { paket: 'Ör. Klasik albüm, Premium albüm', boyut: 'Ör. 30×30, 30×40', sayfa: 'Ör. 20, 30, 40', model: 'Ör. Deri kapaklı, Kutulu', renk: 'Ör. Siyah, Krem, Lacivert' };
  const body = h`
  <div class="container container--form">
    <a class="back-link" href="/admin/hesap">${icon('left')}Ayarlar</a>
    <h1 class="page-title">Albüm seçenekleri</h1>
    ${admin.flashBlock(f)}
    <p class="muted">Randevu ve sipariş formundaki listeler. Her satıra bir seçenek yazın; sıralama burada nasılsa formda da öyle görünür.</p>
    <form class="form" method="post" action="/admin/album-secenekleri">
      ${admin.csrfField(csrf)}
      <div class="oopts">${orders.FIELDS.map(([k, label]) => h`<div class="field oopts__f"><label for="op-${k}">${label} <span class="muted">${help[k]}</span></label><textarea id="op-${k}" name="${k}" rows="6">${(options[k] || []).join('\n')}</textarea></div>`)}</div>
      <div class="form__actions"><button class="btn btn--primary" type="submit">Kaydet</button></div>
    </form>
  </div>`;
  return panelLayout(c, { title: 'Albüm seçenekleri', csrf, nav: admin.adminNav('settings', csrf, demoAdmin), home: '/admin', tabs: admin.adminTabs('settings', demoAdmin), body });
}

// Çiftin onay sayfası
function couplePage(c, { couple, order, csrf, flash: f }) {
  const { coupleShell } = require('./panel');
  const wait = order.state === 'onay';
  const body = h`
  <section class="panel-section osheet">
    <p class="now__eyebrow">${wait ? 'Onayınız bekleniyor' : order.state === 'onaylandi' ? `Onaylandı · ${trDate(order.approved_at)}` : 'Değişiklik isteğiniz iletildi'}</p>
    <h1 class="osheet__t">Albüm siparişiniz</h1>
    <p class="muted">${wait ? 'Baskıya göndermeden önce son kez kontrol edin.' : order.state === 'onaylandi' ? 'Albümünüz baskı sırasına alındı.' : 'Düzenleyip size yeniden göndereceğiz.'}</p>
    <dl class="olist olist--big">${orders.FIELDS.map(([k, label]) => h`<div><dt>${label}</dt><dd>${k === 'sayfa' ? `${order[k]} sayfa` : order[k]}</dd></div>`)}
      ${order.note ? h`<div><dt>Not</dt><dd>${order.note}</dd></div>` : ''}</dl>
    ${order.state === 'degisiklik' && order.change_note ? h`<p class="pre-note">${icon('alert')}<span>İsteğiniz: ${order.change_note}</span></p>` : ''}
    ${wait ? h`<form method="post" action="/panel/siparis" class="osheet__acts">
      <input type="hidden" name="csrf" value="${csrf}">
      <button class="btn btn--primary" type="submit" name="karar" value="onay">${icon('check')}Onaylıyorum</button>
    </form>
    <details class="osheet__chg" id="degisiklik"><summary class="btn btn--outline">Değişiklik istiyorum</summary>
      <form method="post" action="/panel/siparis" class="form">
        <input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="karar" value="degisiklik">
        <div class="field"><label for="o-chg">Neyi değiştirelim?</label><textarea id="o-chg" name="not" rows="3" maxlength="800" required placeholder="Ör. Rengi krem olsun, 2 cep albüm ekleyelim"></textarea></div>
        <button class="btn btn--primary btn--sm" type="submit">Gönder</button>
      </form>
    </details>` : h`<a class="btn btn--outline btn--sm" href="/panel/siparis/belge">${icon('download')}Sipariş belgesi</a>`}
  </section>`;
  return coupleShell(c, { couple, page: 'durum', csrf, flash: f, body });
}

// Yazdırılabilir sipariş belgesi (stüdyo ve çift)
function doc(c, { couple, order, back }) {
  const evDate = couple.event_date ? formatDate(couple.event_date) : '';
  return String(h`<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Albüm siparişi ${orders.orderNo(order)} — ${couple.name}</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="/css/style.css?v=91">
</head><body class="doc-body">
<div class="doc-tools">
  <a class="btn btn--text btn--sm" href="${back}">${icon('left')}Geri</a>
  <button class="btn btn--primary btn--sm" type="button" data-print>${icon('download')}Yazdır / PDF kaydet</button>
</div>
<main class="doc ct-doc">
  <header class="dl-head">
    <img class="doc-logo" src="/images/logo/hm4-dikey-lacivert.svg" alt="HM4 Studio" width="110" height="60">
    <h1 class="ct-title">Albüm Siparişi</h1>
    <p class="muted">${[`Sipariş no ${orders.orderNo(order)}`, couple.name, evDate].filter(Boolean).join(' · ')}</p>
  </header>
  <table class="ct-table">
    <tbody>${orders.FIELDS.map(([k, label]) => h`<tr><th scope="row">${label}</th><td>${k === 'sayfa' && order[k] ? `${order[k]} sayfa` : order[k] || '—'}</td></tr>`)}
    ${order.note ? h`<tr><th scope="row">Ek albümler ve not</th><td>${order.note}</td></tr>` : ''}</tbody>
  </table>
  <p class="muted">${order.state === 'onaylandi' ? `Çift onayladı: ${trDate(order.approved_at)}` : order.state === 'onay' ? `Çiftin onayına gönderildi: ${trDate(order.sent_at)}` : 'Çift değişiklik istedi.'}${order.lab_at ? ` · Laba gönderildi: ${trDate(order.lab_at)}` : ''}${order.arrived_at ? ` · Geldi: ${trDate(order.arrived_at)}` : ''}</p>
</main>
<script src="/js/dashboard.js?v=16" defer></script>
</body></html>`);
}

// Bugün sayfası: "Menderes Çelik albümü onayladı, siparişi tamamlayın"
function promptsBlock(rows) {
  if (!rows.length) return '';
  const text = (r) => r.st.key === 'degisiklik' ? 'albüm siparişinde değişiklik istedi' : r.st.key === 'lab-bekliyor' ? 'siparişi onayladı, laba gönderin' : 'albümü onayladı, siparişi tamamlayın';
  return h`<section class="oprompt" aria-label="Albüm siparişleri">${rows.map((r) => h`
    <a class="oprompt__row" href="/admin/ciftler/${r.couple.id}/siparis">
      <span class="av av--alb" aria-hidden="true">${admin.initials(r.couple.name)}</span>
      <span class="oprompt__t"><b>${r.couple.name}</b> ${text(r)}${r.order && r.order.plan_note && r.st.key === 'tamamla' ? h`<small>Randevu notu: ${r.order.plan_note}</small>` : ''}</span>
      <span class="btn btn--primary btn--sm">${r.st.key === 'lab-bekliyor' ? 'Aç' : 'Siparişi tamamla'}${icon('right')}</span>
    </a>`)}</section>`;
}

module.exports = { listPage, formPage, optionsPage, couplePage, doc, planFields, promptsBlock, seg };
