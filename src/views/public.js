'use strict';
// Herkese açık sayfalar: Anasayfa, Portfolyo, Hakkımızda, İletişim, 404.
const { h, raw } = require('./html');
const {
  links, publicLayout, button, sectionHead, placeholder, portfolioGrid, icon,
} = require('./components');

function heroMedia(c, heroUrl) {
  if (c.hero.video) {
    return h`<video class="hero__media" autoplay muted loop playsinline preload="metadata"${heroUrl ? raw(` poster="${heroUrl}"`) : ''}>
      <source src="${c.hero.video}" type="video/mp4"></video>`;
  }
  if (heroUrl) return h`<img class="hero__media" src="${heroUrl}" alt="" fetchpriority="high" decoding="async">`;
  return h`<div class="hero__media hero__media--empty" aria-hidden="true"><span>${icon('image')}Kapak fotoğrafı — Admin › Portfolyo'dan seçin</span></div>`;
}

function home(c, { portfolio, heroUrl }) {
  const body = h`
  <section class="hero" aria-labelledby="hero-title">
    ${heroMedia(c, heroUrl)}
    <div class="hero__shade" aria-hidden="true"></div>
    <div class="container hero__content">
      <p class="eyebrow eyebrow--light">${c.hero.eyebrow}</p>
      <h1 class="hero__title" id="hero-title">${c.hero.title}</h1>
      <p class="hero__text">${c.hero.text}</p>
      <div class="btn-row">
        ${button('/portfolyo', c.hero.primaryButton, 'light')}
        ${button('/iletisim', c.hero.secondaryButton, 'ghost-light')}
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container intro">
      <div class="intro__copy">
        <p class="eyebrow">${c.brand.tagline}</p>
        <h2 class="section-title">${c.intro.title}</h2>
        <p class="section-text">${c.intro.text}</p>
      </div>
      <ul class="services">
        ${c.services.map((s, i) => h`
        <li class="services__item">
          <span class="services__num">${String(i + 1).padStart(2, '0')}</span>
          <div><h3>${s.title}</h3><p>${s.text}</p></div>
        </li>`)}
      </ul>
    </div>
  </section>

  <section class="section section--tint" aria-labelledby="pf-title">
    <div class="container">
      <div class="section-head-row">
        <div class="section-head">
          <p class="eyebrow">Seçilmiş kareler</p>
          <h2 class="section-title" id="pf-title">${c.portfolio.title}</h2>
        </div>
        <a class="text-link" href="/portfolyo">Tümünü gör ${icon('arrow')}</a>
      </div>
      ${portfolio.length
        ? portfolioGrid(portfolio, { limit: 8 })
        : h`<div class="gallery gallery--placeholder">${[1, 2, 3, 4].map(() => placeholder('Örnek fotoğraf alanı'))}</div>`}
      <div class="btn-row btn-row--center">
        ${button('/portfolyo', c.hero.primaryButton, 'primary')}
        <a class="btn btn--outline" href="${links.instagram(c)}" target="_blank" rel="noopener">${icon('instagram')}Instagram</a>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container split">
      <div class="split__media">
        ${c.about.image ? h`<img src="${c.about.image}" alt="${c.brand.name} ekibi" loading="lazy" decoding="async">` : placeholder('Ekip / stüdyo fotoğrafı')}
      </div>
      <div class="split__copy">
        <p class="eyebrow">${c.about.title}</p>
        <h2 class="section-title">${c.about.lead}</h2>
        <p class="section-text">${c.about.paragraphs[0] || ''}</p>
        ${button('/hakkimizda', 'Bizi tanıyın', 'outline', 'arrow')}
      </div>
    </div>
  </section>

  ${contactBand(c)}`;

  return publicLayout(c, { active: 'home', overlayHeader: true, body });
}

function contactBand(c) {
  return h`
  <section class="band" aria-labelledby="band-title">
    <div class="container band__inner">
      <div>
        <h2 class="band__title" id="band-title">Tarihiniz belli mi?</h2>
        <p class="band__text">Uygunluk için bize yazın; gününüzü birlikte planlayalım.</p>
      </div>
      <div class="btn-row">
        <a class="btn btn--light" href="${links.whatsapp(c)}" target="_blank" rel="noopener">${icon('whatsapp')}WhatsApp'tan Yaz</a>
        ${button('/iletisim', 'İletişim bilgileri', 'ghost-light')}
      </div>
    </div>
  </section>`;
}

function pageHero(eyebrow, title, text) {
  return h`
  <section class="page-hero">
    <div class="container">
      <p class="eyebrow">${eyebrow}</p>
      <h1 class="page-title">${title}</h1>
      ${text ? h`<p class="page-lead">${text}</p>` : ''}
    </div>
  </section>`;
}

function portfolioPage(c, { portfolio, instagram }) {
  const used = new Set(portfolio.map((p) => p.category).filter(Boolean));
  const cats = c.portfolio.categories.filter((k) => used.has(k));
  const body = h`
  ${pageHero(c.brand.tagline, c.portfolio.title, c.portfolio.text)}
  <section class="section section--flush-top">
    <div class="container">
      ${cats.length > 1 ? h`
      <div class="filters" role="group" aria-label="Kategoriye göre süz" data-filters>
        <button type="button" class="chip is-active" data-filter="" aria-pressed="true">Tümü</button>
        ${cats.map((k) => h`<button type="button" class="chip" data-filter="${k}" aria-pressed="false">${k}</button>`)}
      </div>` : ''}
      ${portfolio.length
        ? portfolioGrid(portfolio)
        : h`<div class="empty">
             <p>${c.portfolio.emptyText}</p>
             <div class="gallery gallery--placeholder">${[1, 2, 3, 4, 5, 6, 7, 8].map(() => placeholder('Örnek fotoğraf alanı'))}</div>
           </div>`}
    </div>
  </section>

  <section class="section section--tint" aria-labelledby="ig-title">
    <div class="container">
      <div class="section-head-row">
        ${sectionHead({ eyebrow: `@${c.contact.instagram}`, title: 'Instagram’da bizi takip edin' })}
        <a class="btn btn--primary" href="${links.instagram(c)}" target="_blank" rel="noopener">${icon('instagram')}Profili Aç</a>
      </div>
      ${instagram.length ? h`
      <ul class="ig-grid">
        ${instagram.map((p) => h`<li><a href="${p.link}" target="_blank" rel="noopener" aria-label="Instagram gönderisini aç">
          <img src="${p.image}" alt="${p.caption || 'Instagram gönderisi'}" loading="lazy" decoding="async"></a></li>`)}
      </ul>` : h`<p class="muted">En yeni paylaşımlarımız ve hikâyelerimiz Instagram profilimizde.</p>`}
    </div>
  </section>

  ${contactBand(c)}`;

  return publicLayout(c, { title: c.portfolio.title, active: 'portfolio', body });
}

function aboutPage(c) {
  const body = h`
  ${pageHero(c.brand.name, c.about.title, c.about.lead)}
  <section class="section section--flush-top">
    <div class="container split split--top">
      <div class="split__media">
        ${c.about.image ? h`<img src="${c.about.image}" alt="${c.brand.name} ekibi" loading="lazy" decoding="async">` : placeholder('Ekip / stüdyo fotoğrafı')}
      </div>
      <div class="split__copy prose">
        ${c.about.paragraphs.map((p) => h`<p>${p}</p>`)}
      </div>
    </div>
  </section>

  <section class="section section--tint" aria-labelledby="approach-title">
    <div class="container">
      ${sectionHead({ eyebrow: 'Nasıl çalışıyoruz', title: 'Tanışmadan teslime' })}
      <ol class="steps">
        ${c.about.approach.map((s, i) => h`
        <li class="steps__item">
          <span class="steps__num">${String(i + 1).padStart(2, '0')}</span>
          <h3>${s.title}</h3>
          <p>${s.text}</p>
        </li>`)}
      </ol>
    </div>
  </section>

  ${contactBand(c)}`;

  return publicLayout(c, { title: c.about.title, active: 'about', body });
}

function contactPage(c) {
  const cards = [
    { icon: 'phone', title: 'Telefon', value: c.contact.phoneDisplay, href: links.tel(c) },
    { icon: 'whatsapp', title: 'WhatsApp', value: 'Mesaj gönderin', href: links.whatsapp(c), external: true },
    { icon: 'mail', title: 'E-posta', value: c.contact.email, href: links.mail(c) },
    { icon: 'instagram', title: 'Instagram', value: `@${c.contact.instagram}`, href: links.instagram(c), external: true },
  ];
  const body = h`
  ${pageHero(c.brand.tagline, c.contact.title, c.contact.text)}
  <section class="section section--flush-top">
    <div class="container">
      <div class="btn-row">
        <a class="btn btn--primary" href="${links.whatsapp(c)}" target="_blank" rel="noopener">${icon('whatsapp')}WhatsApp'tan Yaz</a>
        <a class="btn btn--outline" href="${links.instagram(c)}" target="_blank" rel="noopener">${icon('instagram')}Instagram Profilini Aç</a>
      </div>
      <ul class="contact-grid">
        ${cards.map((k) => h`
        <li>
          <a class="contact-card" href="${k.href}"${k.external ? raw(' target="_blank" rel="noopener"') : ''}>
            <span class="contact-card__icon">${icon(k.icon)}</span>
            <span class="contact-card__title">${k.title}</span>
            <span class="contact-card__value">${k.value}</span>
          </a>
        </li>`)}
      </ul>
      <div class="info-row">
        <div class="info-block">
          <h2 class="info-block__title">${icon('pin')}Çalışma bölgeleri</h2>
          <ul class="plain-list">${c.contact.regions.map((r) => h`<li>${r}</li>`)}</ul>
        </div>
        <div class="info-block">
          <h2 class="info-block__title">${icon('clock')}Çalışma saatleri</h2>
          <p>${c.contact.hours}</p>
          <p class="muted">Çekim günleri hafta sonu dahil her gündür.</p>
        </div>
      </div>
    </div>
  </section>`;

  return publicLayout(c, { title: c.contact.title, active: 'contact', body });
}

function notFound(c) {
  const body = h`
  <section class="section page-hero page-hero--center">
    <div class="container">
      <p class="eyebrow">404</p>
      <h1 class="page-title">Bu sayfa bulunamadı</h1>
      <p class="page-lead">Aradığınız sayfa taşınmış ya da hiç var olmamış olabilir.</p>
      <div class="btn-row btn-row--center">${button('/', 'Anasayfaya dön', 'primary')}</div>
    </div>
  </section>`;
  return publicLayout(c, { title: 'Sayfa bulunamadı', body });
}

module.exports = { home, portfolioPage, aboutPage, contactPage, notFound };
