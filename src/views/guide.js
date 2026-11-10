'use strict';
// Panel rehberi sayfası ve sayfa ipuçları ("Bu sayfa ne işe yarar?")
const { h, raw } = require('./html');
const { panelLayout, icon } = require('./components');
const admin = require('./admin');
const G = require('../guide');

function stepCard(s, n) {
  return h`<article class="gstep" id="adim-${n}">
    <div class="gstep__main">
      <p class="gk">Adım ${n}</p>
      <h2 class="gstep__t">${s.title}</h2>
      <p class="gwhere" aria-label="Nerede">${s.where.map((w, i) => h`${i ? h`<span class="gwhere__sep" aria-hidden="true">›</span>` : ''}<span class="gwhere__c">${w}</span>`)}</p>
      <ol class="gdo">${s.do.map((d) => h`<li>${d}</li>`)}</ol>
      <a class="btn btn--primary btn--sm" href="${s.href}">${s.btn}${icon('right')}</a>
    </div>
    <div class="gstep__side">
      <div class="gauto"><p class="gk">Sistem kendiliğinden</p><ul>${s.auto.map((a) => h`<li>${a}</li>`)}</ul></div>
      ${s.tip ? h`<p class="gtip"><b>İpucu:</b> ${s.tip}</p>` : ''}
    </div>
  </article>`;
}

function page(c, { step, csrf, demoAdmin }) {
  const cur = step >= 1 && step <= G.STEPS.length ? step : 1;
  const body = h`
  <div class="container guide">
    <p class="gk">Panel rehberi</p>
    <h1 class="page-title">Bir çiftin panelde yolculuğu</h1>
    <p class="muted guide__lead">Her iş aynı sırayla ilerler. Bir adıma dokunun: ne yapılır, nerede yapılır, sistem kendiliğinden ne yapar.</p>
    <div class="gsearch">
      <label class="sr-only" for="g-q">Rehberde ara</label>
      ${icon('search')}<input id="g-q" type="search" placeholder="Ne arıyorsunuz? Ör. kapora, kapak, sipariş" autocomplete="off" data-guide-q>
      <ul class="gsearch__res" data-guide-res hidden></ul>
    </div>
    <ol class="groad" aria-label="Adımlar">
      ${G.STEPS.map((s, i) => h`<li class="groad__i${i + 1 === cur ? ' is-on' : ''}" data-keys="${`${s.title} ${s.keys} ${s.where.join(' ')}`.toLocaleLowerCase('tr-TR')}" data-n="${i + 1}" data-title="${s.title}">
        <a href="/admin/rehber?adim=${i + 1}#adim"${i + 1 === cur ? raw(' aria-current="step"') : ''}><span class="groad__n">${i + 1}</span><span class="groad__t">${s.title}</span></a>
        ${i + 1 === cur ? h`<div class="groad__card">${stepCard(s, i + 1)}</div>` : ''}
      </li>`)}
    </ol>
    <div class="gdetail" id="adim">${stepCard(G.STEPS[cur - 1], cur)}</div>
    <div class="gnav">
      ${cur > 1 ? h`<a class="btn btn--outline btn--sm" href="/admin/rehber?adim=${cur - 1}#adim">${icon('left')}${G.STEPS[cur - 2].title}</a>` : h`<span></span>`}
      ${cur < G.STEPS.length ? h`<a class="btn btn--outline btn--sm" href="/admin/rehber?adim=${cur + 1}#adim">${G.STEPS[cur].title}${icon('right')}</a>` : ''}
    </div>

    <h2 class="gh2">Her gün baktığınız üç yer</h2>
    <div class="gdaily">${G.DAILY.map((d) => h`<a class="gtile" href="${d.href}"><span class="gtile__w">${d.when}</span><b>${d.title}</b><span>${d.text}</span></a>`)}</div>

    <h2 class="gh2">Ayarlar haritası</h2>
    <p class="muted">Bir kez kurulur, nadiren değişir.</p>
    <div class="gsets">${G.SETTINGS.map((g) => h`<div class="gsets__g"><b>${g.title}</b><ul>${g.items.map(([t, href]) => h`<li><a href="${href}">${t}</a></li>`)}</ul></div>`)}</div>
  </div>`;
  return panelLayout(c, { title: 'Panel rehberi', csrf, nav: admin.adminNav('help', csrf, demoAdmin), home: '/admin', tabs: admin.adminTabs('help', demoAdmin), body, scripts: ['/js/guide.js?v=1'] });
}

// Sayfa başında, bir kez kapatılınca bu cihazda bir daha görünmeyen ipucu
function hint(key) {
  const x = G.HINTS[key];
  if (!x) return '';
  return h`<aside class="ghint" data-hint="${key}" hidden>
    <span class="ghint__i" aria-hidden="true">?</span>
    <p><b>Bu sayfa ne işe yarar?</b> ${x.text} <a href="/admin/rehber?adim=${x.step}#adim">Rehberde: Adım ${x.step}${icon('right')}</a></p>
    <button type="button" class="btn btn--text btn--sm" data-hint-close>Anladım</button>
  </aside><script src="/js/guide.js?v=1" defer></script>`;
}

module.exports = { page, hint };
