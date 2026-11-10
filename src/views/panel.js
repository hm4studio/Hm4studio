'use strict';
// Giriş sayfaları ve çift paneli.
const { h, raw } = require('./html');
const { publicLayout, panelLayout, statusBar, flash, icon } = require('./components');
const config = require('../config');
const { PLAN_FIELDS, parsePlan } = require('../jobs');

// Demo modunda giriş ekranındaki "tek tıkla dene" kutusu
function demoTry(kind) {
  if (!config.demoMode) return '';
  return h`
  <div class="demo-try">
    <p class="demo-try__title">Demoyu deneyin</p>
    <p class="muted">Şifre gerekmez. Örnek verilerle açılır.</p>
    <div class="demo-try__actions">
      <form method="post" action="/demo/cift"><button class="btn ${kind === 'couple' ? 'btn--primary' : 'btn--outline'} btn--block" type="submit">Çift olarak gir</button></form>
      <form method="post" action="/demo/admin"><button class="btn ${kind === 'admin' ? 'btn--primary' : 'btn--outline'} btn--block" type="submit">Stüdyo (admin) olarak gir</button></form>
    </div>
  </div>`;
}

function loginForm({ action, title, lead, codeLabel, codeName, error, values = {}, note, demoKind }) {
  return h`
  <section class="auth pui">
    <div class="auth__card">
      <span class="auth__icon">${icon('lock')}</span>
      <h1 class="auth__title">${title}</h1>
      <p class="auth__lead">${lead}</p>
      ${demoTry(demoKind)}
      ${flash(error, 'error')}
      ${note ? h`<p class="auth__note">${note}</p>` : h`
      <form class="form" method="post" action="${action}" novalidate>
        <div class="field">
          <label for="code">${codeLabel}</label>
          <input id="code" name="${codeName}" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required value="${values.code || ''}">
        </div>
        <div class="field">
          <label for="password">Şifre</label>
          <input id="password" name="password" type="password" autocomplete="current-password" required>
        </div>
        <button class="btn btn--primary btn--block" type="submit">Giriş yap</button>
      </form>
      ${action === '/giris' ? h`<p class="auth__legal"><a href="/kvkk">KVKK aydınlatma metni</a></p>` : ''}`}
    </div>
  </section>`;
}

function coupleLogin(c, { error, values } = {}) {
  const body = h`${loginForm({
    action: '/giris',
    title: 'Çift Girişi',
    lead: 'Size verilen erişim kodu ve şifreyle fotoğraflarınızı görün, favorilerinizi seçin ve işinizin durumunu takip edin.',
    codeLabel: 'Erişim kodu',
    codeName: 'code',
    error,
    values,
    demoKind: 'couple',
  })}
  <p class="auth__help">Erişim kodunuzu ya da şifrenizi mi unuttunuz?
    <a href="https://wa.me/${String(c.contact.whatsapp || '').replace(/\D/g, '')}?text=${encodeURIComponent('Merhaba, panel giriş bilgilerimi unuttum. Adımız: ')}" target="_blank" rel="noopener">WhatsApp’tan yenisini isteyin</a>.</p>`;
  return publicLayout(c, { title: 'Çift Girişi', description: `${c.brand.name} çiftlerine özel panel: fotoğraflarınızı görün, albüm karelerinizi seçin, sözleşmenizi ve teslim durumunu takip edin.`, body });
}

function adminLogin(c, { error, values, noAdmin } = {}) {
  const body = loginForm({
    action: '/admin/giris',
    title: 'Yönetim Paneli',
    lead: 'Stüdyo yöneticisi girişi.',
    codeLabel: 'Kullanıcı adı',
    codeName: 'username',
    error,
    values,
    note: noAdmin && !config.demoMode ? 'Henüz yönetici hesabı yok. Sunucuda "npm run admin" komutunu çalıştırarak oluşturun.' : null,
    demoKind: 'admin',
  });
  return publicLayout(c, { title: 'Yönetim Paneli', description: `${c.brand.name} stüdyo yönetim paneli.`, body });
}

function logoutForm(csrf, label = 'Çıkış') {
  return h`<form method="post" action="/cikis" class="inline-form">
    <input type="hidden" name="csrf" value="${csrf}">
    <button class="btn btn--text" type="submit">${icon('logout')}<span>${label}</span></button>
  </form>`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Çift ve admin galerilerinde ortak fotoğraf kutusu
function photoTile(p, { favEndpoint, canDelete, csrf, deleteAction, locked, noFav, noDownload, coverAction, isCover, albumCover = null, albumCoverEndpoint = '' }) {
  const fav = Boolean(p.is_fav);
  return h`
  <li class="tile${fav ? ' is-fav' : ''}${isCover ? ' is-cover' : ''}${albumCover === p.id ? ' is-acover' : ''}" data-tile data-r="${p.w && p.h ? (p.w / p.h).toFixed(3) : ''}">
    <a class="tile__img" href="/m/${p.id}/display" data-lb data-caption="${p.original_name || ''}" data-dl="/m/${p.id}/${p.original_ext ? 'original' : 'display'}?indir=1">
      <img src="/m/${p.id}/thumb" alt="${p.original_name || 'Fotoğraf'}" loading="lazy" decoding="async" width="${p.w || 640}" height="${p.h || 640}">
    </a>
    <div class="tile__bar">
      ${noFav ? h`<span></span>` : h`<button type="button" class="tile__fav" data-fav="${favEndpoint}" data-photo="${p.id}" aria-pressed="${fav ? 'true' : 'false'}" aria-label="${fav ? 'Albümden çıkar' : 'Albüme ekle'}"${locked ? raw(' disabled') : ''}>
        ${icon('heart')}
      </button>`}
      ${albumCoverEndpoint ? h`<button type="button" class="tile__acov${albumCover === p.id ? ' is-on' : ''}" data-acov="${albumCoverEndpoint}" data-photo="${p.id}" aria-pressed="${albumCover === p.id ? 'true' : 'false'}" aria-label="${albumCover === p.id ? 'Albüm kapağından çıkar' : 'Albüm kapağı yap'}"${locked ? raw(' disabled') : ''}>${icon('book')}<span>Kapak</span></button>` : albumCover === p.id ? h`<span class="tile__acov is-on is-static">${icon('book')}<span>Albüm kapağı</span></span>` : ''}
      ${isCover ? h`<span class="tile__cover">Galeri kapağı</span>` : ''}
      ${coverAction ? h`<form method="post" action="${coverAction}" class="inline-form">
        <input type="hidden" name="csrf" value="${csrf}">
        <button type="submit" class="tile__btn${isCover ? ' is-on' : ''}" aria-label="${isCover ? 'Kapaktan kaldır' : 'Çiftin galerisine kapak yap'}" title="${isCover ? 'Kapaktan kaldır' : 'Kapak yap'}">${icon('star')}</button>
      </form>` : ''}
      ${noDownload ? '' : h`<a class="tile__btn" href="/m/${p.id}/${p.original_ext ? 'original' : 'display'}?indir=1" aria-label="İndir">${icon('download')}</a>`}
      ${canDelete ? h`<form method="post" action="${deleteAction}" class="inline-form" data-confirm="Bu fotoğraf kalıcı olarak silinsin mi?">
        <input type="hidden" name="csrf" value="${csrf}">
        <button type="submit" class="tile__btn tile__btn--danger" aria-label="Sil">${icon('trash')}</button>
      </form>` : ''}
    </div>
  </li>`;
}

function galleryTabs(base, view, total, favs) {
  return h`
  <div class="tabs" role="tablist" aria-label="Galeri görünümü">
    <a class="tab${view !== 'fav' ? ' is-active' : ''}" href="${base}${base === '/panel/fotograflar' ? '?g=secim' : ''}" ${view !== 'fav' ? raw('aria-current="page"') : ''}>Tüm fotoğraflar <span class="tab__count">${total}</span></a>
    <a class="tab${view === 'fav' ? ' is-active' : ''}" href="${base}?g=fav" ${view === 'fav' ? raw('aria-current="page"') : ''}>${icon('heart')}Albüm seçimi <span class="tab__count" data-fav-count>${favs}</span></a>
  </div>`;
}

// Albüm seçimi: sayaç, ilerleme ve "Seçimi tamamladım"
function albumBar(couple, favCount, { admin, csrf, base }) {
  const cov = couple.album_cover_id || null;
  const limit = couple.album_limit || 35;
  const locked = Boolean(couple.album_locked);
  const pct = Math.min(100, Math.round((favCount / limit) * 100));
  let action;
  if (locked) {
    action = h`<span class="badge badge--done">${icon('check')}Seçim tamamlandı</span>${admin ? h`
      <form method="post" action="${base}/album-kilit" class="inline-form">
        <input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="locked" value="0">
        <button class="btn btn--text btn--sm" type="submit">Kilidi aç</button>
      </form>` : ''}`;
  } else if (admin) {
    action = h`<span class="muted">Çift seçim yapıyor</span>`;
  } else {
    action = h`<form method="post" action="/panel/album-tamamla" class="inline-form" data-confirm="Seçiminiz HM4 Studio'ya gönderilsin mi? Sonrasında değişiklik için bize yazmanız gerekir.">
      <input type="hidden" name="csrf" value="${csrf}">
      <button class="btn btn--primary btn--sm" type="submit" data-album-lock${favCount ? '' : raw(' disabled')}>Seçimi tamamladım</button>
    </form>`;
  }
  return h`
  <div class="album-bar" data-album data-limit="${limit}">
    <a class="album-bar__cov${cov ? ' is-on' : ''}" data-acov-state href="${admin ? `${base}?g=fav#foto` : '/panel/fotograflar?g=fav#galeri'}" title="Albüm kapağı">
      <span class="album-bar__covimg">${cov ? h`<img src="/m/${cov}/thumb" alt="">` : icon('book')}</span>
      <span><b>+1 kapak</b><small data-acov-text>${cov ? 'seçildi' : admin ? 'henüz seçilmedi' : 'kitap simgesiyle seçin'}</small></span>
    </a>
    <div class="album-bar__info">
      <p class="album-bar__title">Albüm seçimi</p>
      <p class="album-bar__count"><strong data-album-count>${favCount}</strong> / ${limit} kare</p>
      <div class="album-bar__track" role="progressbar" aria-valuemin="0" aria-valuemax="${limit}" aria-valuenow="${favCount}" aria-label="Albüm seçimi"><span class="album-bar__fill" data-pct="${pct}"></span></div>
    </div>
    <div class="album-bar__action">${action}</div>
  </div>
  ${locked && !admin ? h`<p class="album-note">Seçiminiz HM4 Studio’ya iletildi. Değiştirmek isterseniz bize yazın.</p>` : ''}`;
}

function planSection(couple, csrf) {
  const plan = parsePlan(couple);
  const field = (f) => h`
    <div class="field">
      <label for="pl-${f.key}">${f.label}</label>
      ${f.area
        ? h`<textarea id="pl-${f.key}" name="${f.key}" rows="4" maxlength="${f.max}" placeholder="${f.placeholder}">${plan[f.key] || ''}</textarea>`
        : h`<input id="pl-${f.key}" name="${f.key}" type="text" maxlength="${f.max}" placeholder="${f.placeholder}" value="${plan[f.key] || ''}">`}
    </div>`;
  return h`
  <section class="panel-section cpage" id="plan" aria-labelledby="plan-title">
    <div class="panel-section__head">
      <h1 class="panel-section__title" id="plan-title">Çekim günü planı</h1>
      <p class="muted">Günün akışını ve adresleri buraya yazın; ekibimiz çekimden önce bu planla hazırlanır. İstediğiniz zaman güncelleyebilirsiniz.</p>
    </div>
    <form class="card form" method="post" action="/panel/plan">
      <input type="hidden" name="csrf" value="${csrf}">
      <div class="plan-grid">${PLAN_FIELDS.filter((f) => !f.area).map(field)}</div>
      ${PLAN_FIELDS.filter((f) => f.area).map(field)}
      <div class="plan-foot">
        <button class="btn btn--primary" type="submit">Planı kaydet</button>
        ${plan.saved ? h`<span class="muted">Son kayıt: ${formatDate(plan.saved)}</span>` : ''}
      </div>
    </form>
  </section>`;
}

// Admin tarafında planın okunur hâli
function planView(couple) {
  const plan = parsePlan(couple);
  const rows = PLAN_FIELDS.filter((f) => plan[f.key]);
  return h`
  <section class="panel-section" aria-labelledby="planv-title">
    <div class="panel-section__head">
      <h2 class="panel-section__title" id="planv-title">Çekim günü planı</h2>
      <p class="muted">${plan.saved ? `Çiftin doldurduğu plan · son güncelleme ${formatDate(plan.saved)}` : 'Çift henüz planı doldurmadı.'}</p>
    </div>
    ${rows.length ? h`<dl class="plan-view">${rows.map((f) => h`<div><dt>${f.short}</dt><dd>${plan[f.key]}</dd></div>`)}</dl>` : ''}
  </section>`;
}

// Çift paneli: ayrı sayfalar (Durum, Fotoğraflar, Video, Plan)
const COUPLE_PAGES = [
  { key: 'durum', href: '/panel', label: 'Durum', icon: 'clock' },
  { key: 'foto', href: '/panel/fotograflar', label: 'Fotoğraflar', icon: 'image' },
  { key: 'album', href: '/panel/album', label: 'Albüm', icon: 'book' },
  { key: 'video', href: '/panel/video', label: 'Video', icon: 'play' },
  { key: 'plan', href: '/panel/plan', label: 'Plan', icon: 'pin' },
];

// Menüde yalnızca o an işe yarayan sayfalar. Sözleşme onay bekliyorsa Durum'dan sonra, onaylandıysa en sonda.
// Plan çekimler bitince, Video da video işi yoksa gizlenir (sayfalar adresle yine açılır).
function pagesFor(couple) {
  const ct = { key: 'sozlesme', href: '/panel/sozlesme', label: 'Sözleşme', icon: 'check' };
  const base = COUPLE_PAGES.filter((p) => (p.key !== 'plan' || couple.show_plan !== false) && (p.key !== 'video' || couple.show_video !== false) && (p.key !== 'album' || Boolean(couple.album_design_state)));
  if (couple.contract_state === 'bekliyor') return [base[0], ct, ...base.slice(1)];
  if (couple.contract_state === 'imzali') return [...base, ct];
  return base;
}

// Sağ alttaki yapay zekâ asistanı
function aiBot(c) {
  const wa = c.contact?.whatsapp ? `https://wa.me/${String(c.contact.whatsapp).replace(/\D/g, '')}` : '';
  const chips = ['Albüm seçimini nasıl yaparım?', 'Fotoğraflarım ne zaman hazır olur?', 'Sözleşmeyi nasıl onaylarım?', 'Fotoğrafları nasıl indiririm?'];
  return h`<div class="aibot" data-aibot>
    <button class="aibot__fab" type="button" data-aibot-toggle aria-expanded="false" aria-controls="aibot-panel">${icon('chat')}<span class="sr-only">Asistana sor</span></button>
    <section class="aibot__panel" id="aibot-panel" data-aibot-panel role="dialog" aria-label="Asistan" hidden>
      <header class="aibot__head">
        <div><strong>${c.brand?.name || 'HM4 Studio'} asistan</strong><span>Randevunuz, fotoğraflarınız ve panel hakkında</span></div>
        <button class="aibot__close" type="button" data-aibot-toggle aria-label="Kapat">${icon('close')}</button>
      </header>
      <div class="aibot__log" data-aibot-log aria-live="polite">
        <div class="aibot__msg is-bot">Merhaba! Randevunuz, fotoğraflarınız ya da paneli kullanmak hakkında sorabilirsiniz.</div>
      </div>
      <div class="aibot__chips" data-aibot-chips>${chips.map((x) => h`<button type="button" data-aibot-chip>${x}</button>`)}</div>
      <form class="aibot__form" data-aibot-form>
        <label class="sr-only" for="aibot-q">Sorunuz</label>
        <input id="aibot-q" type="text" maxlength="800" autocomplete="off" placeholder="Sorunuzu yazın…" required>
        <button class="aibot__send" type="submit" aria-label="Gönder">${icon('send')}</button>
      </form>
      <p class="aibot__foot">Yapay zekâ (OpenAI) ile yanıtlanır, hata yapabilir. Kimlik no veya kart bilgisi yazmayın. <a href="/kvkk">KVKK</a>${wa ? h` <a href="${wa}" target="_blank" rel="noopener">Stüdyoya yazın</a>` : ''}</p>
    </section>
  </div>`;
}

function coupleShell(c, { couple, page, csrf, flash: f, body, scripts = [] }) {
  const nav = h`<div class="panel-nav">${pagesFor(couple).map((p) => h`<a class="panel-nav__link panel-nav__page" href="${p.href}"${p.key === page ? raw(' aria-current="page"') : ''}><span>${p.label}</span></a>`)}<span class="panel-nav__who">${couple.name}</span>${config.demoMode ? h`<a class="panel-nav__link" href="/gorus?alan=${encodeURIComponent('Çift paneli')}">${icon('star')}<span>Görüş bildir</span></a>` : ''}${logoutForm(csrf)}</div>`;
  const content = h`
  <div class="container">
    <nav class="cpages" aria-label="Panel sayfaları">
      ${pagesFor(couple).map((p) => h`<a class="cpages__link" href="${p.href}"${p.key === page ? raw(' aria-current="page"') : ''}>${p.label}</a>`)}
    </nav>
    ${f ? flash(f.message, f.type) : ''}
    ${body}
  </div>
  ${config.openaiKey ? aiBot(c) : ''}`;
  const tabs = pagesFor(couple).map((p) => ({ href: p.href, label: p.label, icon: p.icon, active: p.key === page }));
  const title = (pagesFor(couple).find((p) => p.key === page) || {}).label || 'Panelim';
  return panelLayout(c, { title, csrf, nav, body: content, scripts: config.openaiKey ? [...scripts, '/js/assistant.js?v=1'] : scripts, tabs, home: '/panel' });
}

// Durum sayfasının en üstündeki "sıradaki adım" kartı: çiftin şu an yapması gereken tek şey
function nextStep(couple, { events, totalCount, favCount, editedCount, videoCount, stages, keepUntil = '' }) {
  const day = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
  if (couple.delivered_at) {
    const has = editedCount || totalCount || videoCount;
    return { done: true, eyebrow: 'Teslim edildi', title: 'Hepsi sizde 🤍',
      text: has ? `Fotoğraflarınız${videoCount ? ' ve videonuz' : ''} panelinizde. Dosyalar teslimden sonra bir süre sunucumuzda kalır; lütfen indirip yedekleyin${keepUntil ? ` (son gün: ${formatDate(keepUntil)})` : ''}.` : 'Bizi tercih ettiğiniz için teşekkür ederiz. Mutluluklar!',
      href: editedCount ? '/panel/indir?g=duzenli' : totalCount ? '/panel/indir' : '', btn: 'Tümünü indir', download: true };
  }
  const upcoming = events.filter((e) => e.event_date && e.event_date >= day).sort((x, y) => x.event_date.localeCompare(y.event_date))[0];
  const limit = couple.album_limit || 35;
  if (couple.contract_state === 'bekliyor') return { title: 'Sözleşmenizi onaylayın', text: 'Okuyup birkaç dakikada onaylayabilirsiniz.', href: '/panel/sozlesme', btn: 'Sözleşmeyi aç' };
  if (upcoming && !parsePlan(couple).saved) return { title: 'Çekim günü planınızı doldurun', text: 'Saatleri ve adresleri yazın; ekibimiz hazırlığını bu plana göre yapar.', href: '/panel/plan', btn: 'Planı doldur' };
  if (totalCount && !couple.album_locked) return { title: 'Albüm fotoğraflarınızı seçin', text: favCount ? `${favCount} / ${limit} kare seçtiniz. Bitirince “Seçimi tamamladım”a basın.` : `Albümünüz için ${limit} kare seçin: beğendiğiniz fotoğrafın kalbine dokunun.`, href: '/panel/fotograflar?g=secim', btn: favCount ? 'Seçime devam et' : 'Seçime başla', ring: [favCount, limit] };
  const ao = couple.album_design_state ? require('../db').getOrder(couple.id) : null;
  if (ao && ao.state === 'onay') return { title: 'Albüm siparişinizi onaylayın', text: 'Paket, boyut, sayfa, model ve rengi kontrol edin; onayınızdan sonra albümünüz baskıya gider.', href: '/panel/siparis', btn: 'Siparişi aç' };
  if (couple.album_design_state === 'hazir') return { title: 'Albüm tasarımınızı inceleyin', text: 'Sayfaları tek tek görüp beğendiklerinizi onaylayın, değişiklik istediğiniz sayfaya not bırakın.', href: '/panel/album', btn: 'Albümü aç' };
  if (editedCount) return { title: 'Fotoğraflarınız teslim edildi', text: `${editedCount} düzenlenmiş fotoğrafınızı görüntüleyip indirebilirsiniz.`, href: '/panel/fotograflar?g=duzenli', btn: 'Fotoğraflara git' };
  if (videoCount) return { title: 'Videonuz hazır', text: 'İzleyip indirebilirsiniz.', href: '/panel/video', btn: 'Videoyu aç' };
  if (upcoming) {
    const n = Math.round((new Date(`${upcoming.event_date}T12:00:00Z`) - new Date(`${day}T12:00:00Z`)) / 86400000);
    return { title: n === 0 ? 'Çekiminiz bugün' : n === 1 ? 'Çekiminiz yarın' : `Çekiminize ${n} gün kaldı`, text: `${upcoming.event_type || 'Çekim'} · ${formatDate(upcoming.event_date)}${upcoming.start_time ? `, ${upcoming.start_time}` : ''}. Sizden şu an bir şey beklemiyoruz.` };
  }
  return { title: 'Her şey yolunda', text: `Çalışmanız “${stages?.[couple.stage] || '-'}” aşamasında. Hazır olduğunda size haber vereceğiz.` };
}

// Durum: sıradaki adım, iş durumu, randevular, ödeme; en altta bildirim ayarları ve çıkış
function couplePanel(c, { couple, cover = null, strip = [], card = null, events = [], totalCount = 0, favCount = 0, editedCount = 0, videoCount = 0, gifts = null, deliveries = [], reviewLink = '', csrf, flash: f }) {
  const journey = require('./journey');
  const step = nextStep(couple, { events, totalCount, favCount, editedCount, videoCount, stages: c.stages, keepUntil: journey.keepUntil(c, couple) });
  const road = journey.forCouple(c, { couple, events, totalCount, favCount });
  const dt = (iso) => new Date(`${String(iso).replace(' ', 'T')}Z`).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', year: 'numeric' });
  const ct = couple.contract_state ? require('../db').activeContract(couple.id) : null;
  const docs = [
    ...deliveries.map((d) => ({ title: 'Teslim tutanağı', sub: `İmzalandı · ${dt(d.created_at)}`, ok: true, href: `/panel/teslim/${d.id}`, ic: 'gift', k: 'tes' })),
    ...(ct ? [{ title: 'Sözleşme', sub: ct.signed_at ? `Onaylandı · ${dt(ct.signed_at)}` : 'Onayınızı bekliyor', ok: Boolean(ct.signed_at), href: '/panel/sozlesme', btn: ct.signed_at ? 'Aç' : 'Onayla', ic: 'sign', k: 'soz' }] : []),
    ...((() => {
      const ao = couple.album_design_state ? require('../db').getOrder(couple.id) : null;
      if (!ao || !['onay', 'onaylandi', 'degisiklik'].includes(ao.state)) return [];
      return [{ title: 'Albüm siparişi', sub: ao.state === 'onaylandi' ? `Onaylandı · ${dt(ao.approved_at)}` : ao.state === 'onay' ? 'Onayınızı bekliyor' : 'Değişiklik isteğiniz iletildi', ok: ao.state === 'onaylandi', href: '/panel/siparis', btn: ao.state === 'onay' ? 'Onayla' : 'Aç', ic: 'book', k: 'alb' }];
    })()),
    ...(events.length ? [{ title: 'Randevu belgesi', sub: 'Etkinlikler ve paketler', href: '/panel/belge', ic: 'calendar', k: 'cek' }] : []),
  ];
  const pushbox = h`<div class="pushbox" data-push data-push-quiet data-off-text="Fotoğraflarınız ve videonuz hazır olunca telefonunuza haber verelim." hidden><span class="pushbox__icon" aria-hidden="true">${icon('bell')}</span><p class="pushbox__text" data-push-text></p><button type="button" class="btn btn--primary btn--sm" data-push-btn hidden></button></div>`;
  const evDates = events.map((e) => e.event_date).filter(Boolean).sort();
  const mainEv = events.find((e) => /düğün/i.test(e.event_type || '')) || events.find((e) => e.event_date === evDates[0]) || null;
  const place = mainEv ? (mainEv.city || mainEv.venue || '') : '';
  const [n1, n2] = String(couple.name).split('&').map((x) => x.trim());
  const body = h`
    <section class="chero${cover ? '' : ' chero--plain'}" aria-label="Hoş geldiniz">
      ${cover ? h`<img class="chero__img" src="/m/${cover.id}/display" alt="" decoding="async" fetchpriority="high">` : ''}
      <div class="chero__t">
        <p class="chero__eyebrow">Hoş geldiniz</p>
        <p class="chero__name">${n2 ? h`${n1} <em>&amp;</em> ${n2}` : couple.name}</p>
        ${mainEv ? h`<p class="chero__meta"><b>${formatDate(mainEv.event_date)}</b>${place ? ` · ${place}` : ''}${couple.delivered_at ? ' · Teslim edildi' : ''}</p>` : ''}
      </div>
    </section>
    <section class="now${step.href || step.done ? ' now--todo' : ''}" aria-labelledby="now-title">
      ${step.ring ? (() => {
        const [n, of] = step.ring;
        const C = 201.06;
        return h`<div class="ring" role="img" aria-label="${n} / ${of} kare seçildi"><svg viewBox="0 0 74 74" aria-hidden="true"><circle class="ring__bg" cx="37" cy="37" r="32"/><circle class="ring__fg" cx="37" cy="37" r="32" stroke-dasharray="${C}" stroke-dashoffset="${(C * (1 - Math.min(n / (of || 1), 1))).toFixed(1)}"/></svg><b>${n}/${of}</b></div>`;
      })() : h`<span class="now__ic" aria-hidden="true">${icon(step.done ? 'gift' : step.href ? 'right' : 'check')}</span>`}
      <div class="now__body">
        <p class="now__eyebrow">${step.eyebrow || (step.href ? 'Sıradaki adım' : 'Durum')}</p>
        <h1 class="now__title" id="now-title">${step.title}</h1>
        <p class="now__text">${step.text}</p>
      </div>
      ${step.href ? h`<a class="btn btn--primary" href="${step.href}"${step.download ? raw(' download') : ''}>${step.download ? icon('download') : ''}${step.btn}${step.download ? '' : icon('right')}</a>` : ''}
    </section>

    <section class="panel-section croad" id="durum" aria-labelledby="road-title">
      <div class="panel-section__head"><h2 class="panel-section__title" id="road-title">${road.finished ? 'Tamamlandı' : 'Yolculuğunuz'}</h2>${road.finished ? '' : h`<span class="panel-section__note">${road.list.filter((x) => x.state === 'done').length} / ${road.list.length} adım tamam</span>`}</div>
      ${journey.road(road, { title: 'İşinizin yolu' })}
      ${(couple.video_status && !road.finished) || couple.due_date || couple.stage_note ? h`<p class="croad__note">${[
        couple.video_status && !road.finished ? h`Video: <strong>${couple.video_status}</strong>` : '',
        couple.due_date && !road.finished ? h`Tahmini teslim: <strong>${formatDate(couple.due_date)}</strong>` : '',
      ].filter(Boolean).map((x, i) => h`${i ? ' · ' : ''}${x}`)}${couple.stage_note ? h`<span class="croad__msg">${couple.stage_note}</span>` : ''}</p>` : ''}
    </section>

    ${totalCount || editedCount ? h`<section class="panel-section cstrip" aria-labelledby="ph-title">
      <div class="panel-section__head"><h2 class="panel-section__title" id="ph-title">Fotoğraflarınız</h2></div>
      ${strip.length ? h`<a class="cstrip__row" href="/panel/fotograflar">${strip.map((id, i) => h`<span class="cstrip__ph"><img src="/m/${id}/thumb" alt="" loading="lazy" decoding="async">${i === strip.length - 1 && (editedCount || totalCount) > strip.length + 1 ? h`<b>+${(editedCount || totalCount) - strip.length - 1}</b>` : ''}</span>`)}</a>` : ''}
      <div class="cstrip__foot">
        ${editedCount ? h`<a class="cstrip__n" href="/panel/fotograflar?g=duzenli"><b>${editedCount}</b>düzenlenmiş</a>` : ''}
        ${totalCount ? h`<a class="cstrip__n" href="/panel/fotograflar?g=secim"><b>${totalCount}</b>seçim fotoğrafı</a>` : ''}
        ${totalCount ? h`<a class="cstrip__n" href="/panel/fotograflar?g=fav"><b>${favCount}</b>albüme seçildi</a>` : ''}
        ${videoCount ? h`<a class="cstrip__n" href="/panel/video"><b>${videoCount}</b>video</a>` : ''}
        <a class="cstrip__go" href="/panel/fotograflar">Galeriyi aç${icon('right')}</a>
      </div>
    </section>` : videoCount ? h`<div class="cquick"><a class="cquick__item cq--vid" href="/panel/video"><span class="ic">${icon('play')}</span><span class="cquick__num">${videoCount}</span><span>video</span></a></div>` : ''}

    <div class="ctwo">
    ${events.length ? h`<section class="panel-section" id="randevular" aria-labelledby="ev-title">
      <div class="panel-section__head"><h2 class="panel-section__title" id="ev-title">Randevularınız</h2></div>
      <ul class="jobs">${events.map((e) => {
        const dt = e.event_date ? new Date(`${e.event_date}T12:00:00`) : null;
        return h`<li class="job${e.event_date && e.event_date < new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10) ? ' is-past' : ''}">
          <div class="job__date" aria-hidden="true">${dt ? h`<span class="job__day">${dt.getDate()}</span><span class="job__mon">${dt.toLocaleDateString('tr-TR', { month: 'short' })}</span>` : h`<span class="job__day">—</span>`}</div>
          <div class="job__main"><strong>${e.event_type || 'Etkinlik'}${e.start_time ? ` · ${e.start_time}` : ''}</strong>
            <span class="muted">${[e.venue, e.city].filter(Boolean).join(', ')}</span></div>
        </li>`;
      })}</ul>
    </section>` : ''}

    ${card && card.total ? (() => {
      const kalan = Math.max(card.total - card.paid, 0);
      const tl = (n) => `${Number(n || 0).toLocaleString('tr-TR')} ₺`;
      return h`<section class="panel-section" id="odeme" aria-labelledby="pay-title">
        <div class="panel-section__head"><h2 class="panel-section__title" id="pay-title">Ödeme</h2></div>
        <dl class="cpay">
          <div><dt>Toplam</dt><dd>${tl(card.total)}</dd></div>
          <div><dt>Ödenen</dt><dd>${tl(card.paid)}</dd></div>
          <div><dt>Kalan</dt><dd class="${kalan ? 'is-due' : 'is-done'}">${kalan ? tl(kalan) : 'Ödendi'}</dd></div>
        </dl>
      </section>`;
    })() : ''}

    ${docs.length ? h`<section class="panel-section" id="belgeler" aria-labelledby="docs-title">
      <div class="panel-section__head"><h2 class="panel-section__title" id="docs-title">Belgeleriniz</h2></div>
      <ul class="docs">${docs.map((d) => h`<li>
        <span class="dic dic--${d.k}">${icon(d.ic)}</span>
        <span class="docs__main"><strong>${d.title}</strong><span class="${d.ok ? 'docs__ok' : 'muted'}">${d.sub}</span></span>
        <a class="btn btn--outline btn--sm" href="${d.href}">${d.btn || h`${icon('download')}İndir`}</a>
      </li>`)}</ul>
    </section>` : ''}
    </div>

    ${c.contact?.whatsapp && String(c.contact.whatsapp).replace(/\D/g, '').length > 9 ? h`<section class="chelp"><div><b>Bir sorunuz mu var?</b><span>Stüdyoya doğrudan yazabilirsiniz.</span></div><a class="btn" href="https://wa.me/${String(c.contact.whatsapp).replace(/\D/g, '')}?text=${encodeURIComponent(`Merhaba, ben ${couple.name}. `)}" target="_blank" rel="noopener">${icon('whatsapp')}WhatsApp'tan yazın</a></section>` : ''}

    ${gifts ? h`<section class="panel-section gift-share" id="hediye" aria-labelledby="gift-title">
      <div class="panel-section__head"><h2 class="panel-section__title" id="gift-title">Sevdiklerinize hediyeniz</h2></div>
      <p>Yakında evlenecek arkadaşlarınıza bizden bir hediye gönderin: <strong>${gifts.settings.gift}</strong>. Her kupon tek kişi içindir.</p>
      <ul class="gift-list">${gifts.codes.map((g) => h`<li>
        <span class="gift-list__code">${g.code}</span>
        ${g.used_couple_id ? h`<span class="muted">Kullanıldı · teşekkür ederiz!</span>`
          : g.expires_on < gifts.today ? h`<span class="muted">Süresi doldu</span>`
          : h`<a class="btn btn--primary btn--sm" href="${gifts.wa(g.code)}" target="_blank" rel="noopener">${icon('whatsapp')}Gönder</a>`}
      </li>`)}</ul>
      ${gifts.settings.reward ? h`<p class="muted">Kuponunuzla gelen çift rezervasyon yaptığında size de bizden teşekkür hediyesi: ${gifts.settings.reward}.</p>` : ''}
    </section>` : ''}

    ${couple.delivered_at && reviewLink ? h`<section class="panel-section" id="yorum" aria-labelledby="rv-title">
      <div class="panel-section__head"><h2 class="panel-section__title" id="rv-title">Bizi değerlendirin</h2></div>
      <p class="muted">Birkaç cümleniz, yeni evlenecek çiftlere çok yardımcı olur.</p>
      <a class="btn btn--outline" href="${reviewLink}" target="_blank" rel="noopener">${icon('star')}Google’da yorum yaz</a>
    </section>` : ''}

    <div class="install" data-install hidden>
      <img class="install__icon" src="/images/icon-192.png" alt="" width="48" height="48">
      <div class="install__copy"><p class="install__title">HM4 Studio’yu telefonunuza ekleyin</p><p class="install__text" data-install-text></p></div>
      <button type="button" class="btn btn--primary btn--sm" data-install-btn hidden>Ekle</button>
      <button type="button" class="install__close" data-install-close aria-label="Kapat">${icon('close')}</button>
    </div>

    ${couple.phone ? h`<section class="panel-section" id="izinler" aria-labelledby="wa-title">
      <div class="panel-section__head"><h2 class="panel-section__title" id="wa-title">Bildirimler</h2></div>
      ${pushbox}
      <form class="form wa-pref" method="post" action="/panel/whatsapp">
        <input type="hidden" name="csrf" value="${csrf}">
        <label class="check"><input type="checkbox" name="waConsent" value="1"${couple.wa_optin ? raw(' checked') : ''}><span>${require('../kvkk').WA_CONSENT}</span></label>
        <p class="muted">Kapalıyken fotoğraflarınız hazır olduğunda size WhatsApp mesajı gitmez; durumu buradan takip edersiniz. <a href="/kvkk">Aydınlatma metni</a></p>
        <button class="btn btn--outline btn--sm" type="submit">Kaydet</button>
      </form>
    </section>` : pushbox}

    <div class="cout">${logoutForm(csrf, 'Çıkış yap')}</div>`;
  return coupleShell(c, { couple, page: 'durum', csrf, flash: f, body, scripts: ['/js/panel.js?v=6', '/js/push.js?v=2'] });
}

// Fotoğraflar: galeri, albüm seçimi, indirme
function couplePhotos(c, { couple, photos, totalCount, editedCount = 0, favCount, view, cover = null, events = [], galleries = [], gal = null, csrf, flash: f }) {
  const multi = galleries.length > 1;
  const isEdited = view === 'edited';
  const first = events.map((e) => e.event_date).filter(Boolean).sort()[0];
  const place = [couple.venue, couple.city].filter(Boolean)[0] || (events.find((e) => e.venue || e.city) || {}).venue || '';
  const coverBlock = cover ? h`<section class="gcover" aria-label="Kapak">
      <img class="gcover__img" src="/m/${cover.id}/display" alt="" decoding="async" fetchpriority="high">
      <div class="gcover__text">
        ${first || place ? h`<p class="gcover__meta">${[first ? formatDate(first) : '', place].filter(Boolean).join(' · ')}</p>` : ''}
        <h1 class="gcover__name">${couple.name}</h1>
        <a class="gcover__btn" href="#galeri">Galeriyi gör</a>
      </div>
    </section>` : '';
  const sets = editedCount && totalCount ? h`<nav class="sets" aria-label="Fotoğraf grupları">
      <a class="sets__link" href="/panel/fotograflar?g=duzenli"${isEdited ? raw(' aria-current="page"') : ''}><span>Düzenlenmiş fotoğraflar</span><span class="sets__count">${editedCount}</span></a>
      <a class="sets__link" href="/panel/fotograflar?g=secim"${!isEdited ? raw(' aria-current="page"') : ''}><span>Seçim fotoğrafları</span><span class="sets__count">${totalCount}</span></a>
    </nav>` : '';
  const body = isEdited ? h`
    ${coverBlock}
    <section class="panel-section cpage cpage--gal" id="fotograflar" aria-labelledby="gallery-title">
      <div class="panel-section__head" id="galeri">
        <h${cover ? '2' : '1'} class="panel-section__title" id="gallery-title">Fotoğraflarınız</h${cover ? '2' : '1'}>
        <p class="muted">Renk ve ışık düzenlemesi yapılmış, teslim edilen fotoğraflarınız.</p>
        <div class="dl-row"><a class="btn btn--primary btn--sm" href="/panel/indir?g=duzenli" download>${icon('download')}Tümünü indir (${editedCount})</a></div>
      </div>
      ${sets}
      <ul class="tiles tiles--wall" data-gallery data-wall>
        ${photos.map((p) => photoTile(p, { csrf, locked: true, noFav: true }))}
      </ul>
    </section>` : h`
    ${coverBlock}
    <section class="panel-section cpage cpage--gal" id="fotograflar" aria-labelledby="gallery-title">
      <div class="panel-section__head" id="galeri">
        ${gal && multi ? h`<a class="galback" href="/panel/fotograflar?g=secim#galeri">${icon('left')}Galeriler</a>` : ''}
        <h${cover ? '2' : '1'} class="panel-section__title" id="gallery-title">${gal && multi ? gal.name : view === 'galleries' ? 'Galerileriniz' : editedCount ? 'Seçim fotoğrafları' : 'Fotoğraflarınız'}</h${cover ? '2' : '1'}>
        ${totalCount ? h`<p class="muted">${couple.album_locked ? 'Seçtiğiniz kareleri “Albüm seçimi” sekmesinde görebilirsiniz.' : `Albümünüz için ${couple.album_limit || 35} kare seçin: beğendiğiniz fotoğrafın üzerindeki kalbe dokunun.${multi ? ' Tüm galerilerden seçtikleriniz tek albüm listesinde toplanır.' : ''}`}</p>` : ''}
      </div>
      ${sets}
      ${totalCount ? (multi ? h`<div class="tabs" role="tablist" aria-label="Galeri görünümü">
        <a class="tab${view !== 'fav' ? ' is-active' : ''}" href="/panel/fotograflar?g=secim#galeri"${view !== 'fav' ? raw(' aria-current="page"') : ''}>Galeriler <span class="tab__count">${galleries.length}</span></a>
        <a class="tab${view === 'fav' ? ' is-active' : ''}" href="/panel/fotograflar?g=fav#galeri"${view === 'fav' ? raw(' aria-current="page"') : ''}>${icon('heart')}Albüm seçimi <span class="tab__count" data-fav-count>${favCount}</span></a>
      </div>` : galleryTabs('/panel/fotograflar', view, totalCount, favCount)) : ''}
      ${view === 'galleries' ? h`<ul class="galcards">${galleries.map((g) => h`
        <li><a class="galcard" href="/panel/fotograflar?gal=${g.id}#galeri">
          <span class="galcard__img">${g.first_photo_id ? h`<img src="/m/${g.cover_id || g.first_photo_id}/display" alt="" loading="lazy" decoding="async">` : ''}</span>
          <span class="galcard__name">${g.name}</span>
          <span class="galcard__n">${g.photo_count} fotoğraf${g.fav_count ? ` · ${g.fav_count} seçili` : ''}</span>
        </a></li>`)}</ul>` : photos.length ? h`
      <ul class="tiles tiles--wall" data-gallery data-wall>
        ${photos.map((p) => photoTile(p, { favEndpoint: '/panel/favori', csrf, locked: Boolean(couple.album_locked), noDownload: true, albumCover: couple.album_cover_id, albumCoverEndpoint: '/panel/kapak' }))}
      </ul>` : h`<div class="empty-box">${icon('image')}<p>${view === 'fav'
          ? 'Henüz albüm için kare seçmediniz. “Tüm fotoğraflar” sekmesinden kalbe dokunarak ekleyebilirsiniz.'
          : couple.archived_at ? 'Fotoğraflarınız teslim edildi ve sunucumuzdan kaldırıldı. Yeniden ihtiyacınız olursa bize yazın.' : 'Fotoğraflarınız hazırlandığında burada görünecek.'}</p></div>`}
      ${totalCount ? h`<div class="gal-foot">
        ${albumBar(couple, favCount, { admin: false, csrf })}
        <div class="dl-row">
          ${gal && multi ? h`<a class="btn btn--text btn--sm" href="/panel/indir?gal=${gal.id}" download>${icon('download')}Bu galeriyi indir (${gal.photo_count})</a>` : ''}
          <a class="btn btn--text btn--sm" href="/panel/indir" download>${icon('download')}Tümünü indir (${totalCount})</a>
          ${favCount ? h`<a class="btn btn--text btn--sm" href="/panel/indir?g=fav" download>${icon('download')}Seçimimi indir (${favCount})</a>` : ''}
        </div>
      </div>` : ''}
      ${totalCount && !couple.album_locked ? h`<div class="selpill" data-selpill hidden>
        <a class="selpill__count" href="/panel/fotograflar?g=fav"><span class="selpill__icon">${icon('heart')}</span><strong data-album-count>${favCount}</strong>&nbsp;/ ${couple.album_limit || 35} seçildi</a>
        <form method="post" action="/panel/album-tamamla" class="inline-form" data-selpill-done data-confirm="Seçiminiz HM4 Studio'ya gönderilsin mi? Sonrasında değişiklik için bize yazmanız gerekir."${favCount >= (couple.album_limit || 35) ? '' : raw(' hidden')}>
          <input type="hidden" name="csrf" value="${csrf}">
          <button class="selpill__done" type="submit">Tamamla</button>
        </form>
      </div>` : ''}
    </section>`;
  return coupleShell(c, { couple, page: 'foto', csrf, flash: f, body, scripts: ['/js/panel.js?v=6'] });
}

// Video: klip, film, reels — izle ve indir
// Albüm tasarımı: sayfa sayfa "beğendim" / "değişiklik istiyorum + not", sonunda onay ya da değişiklikleri gönder
function coupleAlbum(c, { couple, pages, csrf, flash: f }) {
  const st = couple.album_design_state;
  const open = st === 'hazir';
  const reviewed = pages.filter((p) => p.status !== 'bekliyor').length;
  const head = {
    hazir: 'Her sayfayı inceleyin: beğendiyseniz “Beğendim”e, değiştirmek istediğiniz bir şey varsa “Değişiklik istiyorum”a basıp kısaca yazın. Bitince sayfanın altından onaylayın ya da değişiklikleri gönderin.',
    degisiklik: 'Değişiklik isteklerinizi aldık. Düzeltilmiş sayfalar hazır olunca size haber vereceğiz.',
    onaylandi: 'Albüm tasarımınızı onayladınız, teşekkür ederiz. Albümünüz baskıya hazırlanıyor.',
  }[st] || '';
  const body = h`
    <section class="panel-section cpage" aria-labelledby="alb-title">
      <div class="panel-section__head">
        <h1 class="panel-section__title" id="alb-title">Albüm tasarımı</h1>
        <p class="muted">${head}</p>
      </div>
      ${open ? h`<p class="alb-progress" data-alb-progress>${reviewed} / ${pages.length} sayfa incelendi</p>` : ''}
      <ol class="alb-pages" data-album data-total="${pages.length}">
        ${pages.map((p, i) => h`<li class="alb-page" data-alb-page="${p.id}" data-status="${p.status}">
          <a class="alb-page__img" href="/m/a/${p.id}/display?v=${p.version}" data-lb data-caption="Sayfa ${i + 1}"><img src="/m/a/${p.id}/display?v=${p.version}" alt="Albüm sayfası ${i + 1}" loading="lazy" decoding="async"></a>
          <div class="alb-page__bar">
            <span class="alb-page__num">Sayfa ${i + 1}${p.version > 1 && p.status === 'bekliyor' ? h` <span class="alb-page__new">Düzeltildi</span>` : ''}</span>
            ${open ? h`<div class="alb-page__btns" role="group" aria-label="Sayfa ${i + 1}">
              <button type="button" class="alb-btn" data-alb-set="onay" aria-pressed="${p.status === 'onay'}">${icon('check')}Beğendim</button>
              <button type="button" class="alb-btn" data-alb-set="degisiklik" aria-pressed="${p.status === 'degisiklik'}">Değişiklik istiyorum</button>
            </div>` : h`<span class="alb-page__state">${{ onay: 'Beğendiniz', degisiklik: 'Değişiklik istediniz', bekliyor: '' }[p.status]}</span>`}
          </div>
          ${open ? h`<div class="alb-page__note" data-alb-note${p.status === 'degisiklik' ? '' : raw(' hidden')}>
            <label class="sr-only" for="n-${p.id}">Sayfa ${i + 1} için not</label>
            <textarea id="n-${p.id}" rows="2" maxlength="500" placeholder="Ne değişsin? Örn. soldaki fotoğraf yerine başka bir kare">${p.note}</textarea>
            <button type="button" class="btn btn--outline btn--sm" data-alb-save>Notu kaydet</button>
          </div>` : p.note ? h`<p class="alb-page__said">Notunuz: “${p.note}”</p>` : ''}
          ${open && p.note && p.version > 1 && p.status === 'bekliyor' ? h`<p class="alb-page__said">Önceki notunuz: “${p.note}”</p>` : ''}
        </li>`)}
      </ol>
      ${open ? h`<div class="alb-finish">
        <form method="post" action="/panel/album/gonder" data-confirm="Albüm tasarımını onaylıyor musunuz? Onaydan sonra baskıya hazırlanır.">
          <input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="karar" value="onay">
          <button class="btn btn--primary" type="submit" data-alb-approve disabled>${icon('check')}Albümü onaylıyorum</button>
        </form>
        <form method="post" action="/panel/album/gonder">
          <input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="karar" value="degisiklik">
          <button class="btn btn--outline" type="submit" data-alb-changes disabled>Değişiklikleri gönder</button>
        </form>
        <p class="muted" data-alb-hint>Onaylamak için tüm sayfaları “Beğendim” olarak işaretleyin; değişiklik istediğiniz sayfa varsa hepsini inceledikten sonra “Değişiklikleri gönder”e basın.</p>
      </div>` : ''}
    </section>`;
  return coupleShell(c, { couple, page: 'album', csrf, flash: f, body, scripts: ['/js/panel.js?v=6', '/js/album.js?v=1'] });
}

function coupleVideos(c, { couple, videos, csrf, flash: f }) {
  const wide = videos.filter((v) => v.kind !== 'Reels');
  const reels = videos.filter((v) => v.kind === 'Reels');
  const item = (v) => h`
    <li class="vid${v.kind === 'Reels' ? ' vid--reel' : ''}">
      ${v.file_key ? h`<video class="vid__player" src="/v/${v.id}" controls playsinline preload="metadata"></video>`
        : h`<a class="vid__link" href="${v.link}" target="_blank" rel="noopener">${icon('play')}<span>İzlemek için dokunun</span></a>`}
      <div class="vid__meta">
        <div><p class="vid__title">${v.title || v.kind}</p><p class="vid__sub">${v.kind}${v.size ? ` · ${Math.max(1, Math.round(v.size / 1024 / 1024))} MB` : ''}</p></div>
        ${v.file_key ? h`<a class="btn btn--outline btn--sm" href="/v/${v.id}?indir=1" download>${icon('download')}İndir</a>`
          : h`<a class="btn btn--outline btn--sm" href="${v.link}" target="_blank" rel="noopener">Aç</a>`}
      </div>
    </li>`;
  const body = h`
    <section class="panel-section cpage" aria-labelledby="video-title">
      <div class="panel-section__head">
        <h1 class="panel-section__title" id="video-title">Videolarınız</h1>
        ${couple.video_status ? h`<p class="muted">Video durumu: ${couple.video_status}</p>` : ''}
      </div>
      ${videos.length ? h`
        ${wide.length ? h`<ul class="vids">${wide.map(item)}</ul>` : ''}
        ${reels.length ? h`<h2 class="vids__head">Reels</h2><ul class="vids vids--reels">${reels.map(item)}</ul>` : ''}`
        : h`<div class="empty-box">${icon('play')}<p>${couple.video_status ? 'Videonuz hazırlanıyor. Hazır olduğunda burada izleyip indirebileceksiniz.' : 'Videolarınız hazır olduğunda burada görünecek.'}</p></div>`}
    </section>`;
  return coupleShell(c, { couple, page: 'video', csrf, flash: f, body });
}

// Plan: çekim günü planı
function couplePlan(c, { couple, csrf, flash: f }) {
  return coupleShell(c, { couple, page: 'plan', csrf, flash: f, body: planSection(couple, csrf), scripts: ['/js/panel.js?v=6'] });
}

module.exports = { coupleAlbum, coupleShell, couplePhotos, coupleVideos, couplePlan, coupleLogin, adminLogin, couplePanel, photoTile, galleryTabs, logoutForm, formatDate, albumBar, planView };
