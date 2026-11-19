'use strict';
// Editör: fotoğrafla ilgili bütün işler tek ekranda — akış (aşamalar), sıradaki işler, araçlar
const { h } = require('./html');
const { panelLayout, icon } = require('./components');
const admin = require('./admin');

const STAGES = [
  { key: 'yukle', label: 'Yükleme', tag: 'Yükleme bekliyor', tone: 'warn' },
  { key: 'secim', label: 'Seçimde', tag: 'Seçim sürüyor' },
  { key: 'secildi', label: 'Seçim bitti', tag: 'Seçim bitti', tone: 'go' },
  { key: 'duzen', label: 'Düzenleniyor', tag: 'Düzenleniyor' },
  { key: 'album', label: 'Albüm', tag: 'Albüm tasarımı' },
  { key: 'baski', label: 'Baskıda', tag: 'Matbaada' },
];
// Liste sırası: önce elinizdeki işler, sonra beklenenler
const ORDER = ['secildi', 'yukle', 'duzen', 'album', 'baski', 'secim'];

const trDay = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }) : '');

function action(j) {
  const c = j.couple;
  const base = `/admin/ciftler/${c.id}`;
  switch (j.stage) {
    case 'yukle': return { href: `${base}#foto`, icon: 'upload', text: 'Seçim için fotoğraf yükle' };
    case 'secim': return { href: `${base}#album`, icon: 'eye', text: 'Seçimi gör', quiet: true };
    case 'secildi': return { href: `${base}/arw`, icon: 'search', text: 'Seçilen ARW’leri bul', gold: true,
      note: 'ya da Lightroom › Eklenti Ekstraları › “HM4: Çiftin seçimini çek”' };
    case 'duzen': return { href: `${base}#foto`, icon: 'upload', text: 'Düzenlenmişleri yükle' };
    case 'album': return { href: `/admin/album?cift=${c.id}`, icon: 'grid', text: 'Albümü tasarla' };
    case 'baski': return { href: `${base}/siparis`, icon: 'book', text: 'Siparişi aç', quiet: true };
    default: return null;
  }
}

function sub(j) {
  const c = j.couple;
  switch (j.stage) {
    case 'yukle': return `${j.typeLabel || 'Çekim'} ${trDay(j.date)} · henüz fotoğraf yok`;
    case 'secim': return `${j.secim} fotoğraf yüklendi · ${j.fav} kare seçti`;
    case 'secildi': return `${j.fav} kare seçti · düzenlenmiş yok`;
    case 'duzen': return `Düzenlenmiş ${j.duzenli} / ${j.fav}`;
    case 'album': return c.album_design_state === 'degisiklik' ? 'Çift değişiklik istedi' : c.album_design_state === 'hazir' ? 'Tasarım çiftin onayında' : c.album_design_state === 'onaylandi' ? 'Tasarım onaylandı · baskıya gönderin' : `${j.duzenli} düzenlenmiş kare hazır`;
    case 'baski': return `Laba gönderildi · ${trDay(j.order.lab_at)}`;
    default: return '';
  }
}

function card(j) {
  const st = STAGES.find((s) => s.key === j.stage);
  const a = action(j);
  const pct = j.stage === 'duzen' && j.fav ? Math.min(100, Math.round((j.duzenli / j.fav) * 100)) : 0;
  return h`<article class="ed-job">
    <div class="ed-job__top">
      <a class="ed-job__name" href="/admin/ciftler/${j.couple.id}">${j.couple.name}</a>
      <span class="ed-tag${st.tone ? ` ed-tag--${st.tone}` : ''}">${st.tag}</span>
    </div>
    <p class="ed-job__sub">${sub(j)}</p>
    ${pct ? h`<div class="ed-bar" role="img" aria-label="Yüzde ${pct}"><i data-w="${pct}"></i></div>` : ''}
    ${a ? h`<a class="btn ${a.gold ? 'btn--gold' : a.quiet ? 'btn--outline' : 'btn--primary'} btn--sm ed-job__go" href="${a.href}">${icon(a.icon)}${a.text}</a>` : ''}
    ${a && a.note ? h`<p class="ed-job__note">${a.note}</p>` : ''}
  </article>`;
}

function editorPage(c, { jobs, stage, csrf, demoAdmin, tools }) {
  const counts = Object.fromEntries(STAGES.map((s) => [s.key, jobs.filter((j) => j.stage === s.key).length]));
  const shown = jobs.filter((j) => !stage || j.stage === stage)
    .sort((a, b) => ORDER.indexOf(a.stage) - ORDER.indexOf(b.stage) || String(b.date || '').localeCompare(String(a.date || '')));
  const toolList = [
    { href: '/admin/ciftler', icon: 'upload', name: 'Fotoğraf yükle', sub: 'Çifti seçip Fotoğraf sekmesi' },
    { href: '/admin/arw', icon: 'search', name: 'ARW Bulucu', sub: 'Eski listeler için de' },
    { href: '/admin/photoshop#lightroom', icon: 'camera', name: 'Lightroom', sub: tools.connected ? 'Bağlı · eklenti' : 'Kurulum' },
    { href: '/admin/photoshop', icon: 'sparkle', name: 'Photoshop rötuş', sub: tools.connected ? 'Bağlı · HM4 paneli' : 'Kurulum' },
    { href: '/admin/album', icon: 'grid', name: 'Albüm tasarımı', sub: counts.album ? `${counts.album} albüm bekliyor` : 'Tasarımcı' },
    { href: '/admin/siparisler', icon: 'book', name: 'Baskı / sipariş', sub: counts.baski ? `${counts.baski} matbaada` : 'Albüm siparişleri' },
  ];
  const body = h`
  <div class="container ed">
    <p class="ed__kicker">Fotoğraf işleri</p>
    <h1 class="page-title">Editör</h1>

    <p class="ed__label">Akış</p>
    <nav class="ed-flow" aria-label="Aşamalar">
      ${STAGES.map((s) => h`<a class="ed-flow__step${stage === s.key ? ' is-on' : ''}${!counts[s.key] ? ' is-zero' : ''}" href="${stage === s.key ? '/admin/editor' : `/admin/editor?asama=${s.key}`}"><b>${counts[s.key]}</b><span>${s.label}</span></a>`)}
    </nav>

    <div class="ed-grid">
      <section>
        <p class="ed__label">${stage ? h`${STAGES.find((s) => s.key === stage).label} · <a href="/admin/editor">tümü</a>` : 'Sıradaki işler'}</p>
        ${shown.length ? h`<div class="ed-jobs">${shown.map(card)}</div>` : h`<p class="muted ed-empty">${stage ? 'Bu aşamada çift yok.' : 'Bekleyen fotoğraf işi yok.'}</p>`}
      </section>
      <section>
        <p class="ed__label">Araçlar</p>
        <div class="ed-tools">
          ${toolList.map((t) => h`<a class="ed-tool" href="${t.href}"><i>${icon(t.icon)}</i><b>${t.name}</b><span>${t.sub}</span></a>`)}
        </div>
      </section>
    </div>
  </div>`;
  return panelLayout(c, { title: 'Editör', csrf, nav: admin.adminNav('editor', csrf, demoAdmin), home: '/admin', tabs: admin.adminTabs('editor', demoAdmin), body, scripts: ['/js/editor.js?v=1'] });
}

module.exports = { editorPage, STAGES };
