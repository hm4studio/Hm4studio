'use strict';
// Herkese açık sayfalar: Anasayfa, Portfolyo, Hakkımızda, İletişim, 404.
const { h, raw } = require('./html');
const config = require('../config');
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

// Başlığı iki satıra böler; ikinci satır eğik ("Gününüz, / olduğu gibi.")
function heroTitle(t) {
  const m = /^(.{3,40}?[,.])\s+(.+)$/.exec(String(t || ''));
  if (!m) return h`<span class="line"><span>${t}</span></span>`;
  return h`<span class="line"><span>${m[1]}</span></span> <span class="line"><span><em>${m[2]}</em></span></span>`;
}
// Bir hizmete uygun portfolyo fotoğrafı (kategori adı eşleşirse o, yoksa sıradaki)
function pickFor(portfolio, title, i, used) {
  const key = String(title || '').toLocaleLowerCase('tr-TR').split(/[\s&]+/)[0];
  const hit = portfolio.find((p) => !used.has(p) && String(p.category || '').toLocaleLowerCase('tr-TR').includes(key))
    || portfolio.find((p, j) => !used.has(p) && j >= i) || portfolio.find((p) => !used.has(p));
  if (hit) used.add(hit);
  return hit;
}

// Süreç: ince çizgiyle bağlanan adımlar (çizgi kaydırınca dolar)
function processSteps(c, { link = false } = {}) {
  return h`
  <section class="section" aria-labelledby="steps-title">
    <div class="container">
      <div class="section-head-row">
        <div class="section-head rv"><p class="eyebrow eyebrow--line">Nasıl çalışıyoruz</p><h2 class="section-title" id="steps-title">Tanışmadan <em>teslime</em></h2></div>
        ${link ? h`<a class="text-link rv" href="/hakkimizda">Bizi tanıyın ${icon('arrow')}</a>` : ''}
      </div>
      <ol class="flow rv">
        ${(c.about.approach || []).map((x, i) => h`<li class="flow__step"><span class="flow__num">${i + 1}</span><h3>${x.title}</h3><p>${x.text}</p></li>`)}
      </ol>
    </div>
  </section>`;
}

function home(c, { portfolio, heroUrl }) {
  const used = new Set();
  const svc = c.services.map((x, i) => ({ ...x, photo: pickFor(portfolio, x.title, i, used) }));
  const rest = portfolio.filter((p) => !used.has(p));
  const pool = rest.length >= 5 ? rest : portfolio;
  const grid = pool.slice(0, 5);
  const introA = portfolio[0];
  const introB = portfolio.find((p) => p !== introA && (p.category || '') !== (introA?.category || '')) || portfolio[1];
  const bandImg = pool[5] || portfolio[portfolio.length - 1];
  const quote = c.quote || 'Yıllar sonra açıp baktığınızda, o günün sesini duyabilmelisiniz.';
  const body = h`
  <section class="hero hero--motion" aria-labelledby="hero-title">
    ${heroMedia(c, heroUrl)}
    <div class="hero__shade" aria-hidden="true"></div>
    <div class="container hero__content">
      <p class="eyebrow eyebrow--light hero__in">${c.hero.eyebrow}</p>
      <h1 class="hero__title" id="hero-title">${heroTitle(c.hero.title)}</h1>
      <p class="hero__text hero__in">${c.hero.text}</p>
      <div class="btn-row hero__in">
        ${button('/portfolyo', c.hero.primaryButton, 'light')}
        ${button('/iletisim', c.hero.secondaryButton, 'ghost-light')}
      </div>
    </div>
    <span class="hero__scroll" aria-hidden="true">Kaydırın</span>
  </section>

  <section class="section">
    <div class="container lead-split">
      <div class="lead-split__copy rv">
        <p class="eyebrow eyebrow--line">${c.brand.tagline}</p>
        <h2 class="lead-split__title">${c.intro.title}</h2>
        <p class="section-text">${c.intro.text}</p>
        <p class="lead-split__sign">— ${c.brand.name}</p>
      </div>
      ${introA ? h`<div class="lead-split__media rv">
        <div class="lead-split__a mask"><img src="${introA.display}" alt="${introA.alt || ''}" loading="lazy" decoding="async"></div>
        ${introB ? h`<div class="lead-split__b mask"><img src="${introB.thumb}" alt="${introB.alt || ''}" loading="lazy" decoding="async"></div>` : ''}
      </div>` : ''}
    </div>
  </section>

  <section class="section section--flush-top" aria-labelledby="svc-title">
    <div class="container">
      <div class="section-head rv"><p class="eyebrow eyebrow--line">Hizmetler</p><h2 class="section-title" id="svc-title">Her gün için <em>ayrı bir dil</em></h2></div>
      <ul class="svc-cards">
        ${svc.map((x, i) => h`<li class="svc-card rv d${i % 4}">
          <a href="/portfolyo">
            <span class="svc-card__ph mask">${x.photo ? h`<img src="${x.photo.thumb}" alt="${x.photo.alt || x.title}" loading="lazy" decoding="async">` : ''}<span class="svc-card__n">${String(i + 1).padStart(2, '0')}</span></span>
            <h3>${x.title}</h3><p>${x.text}</p>
          </a></li>`)}
      </ul>
    </div>
  </section>

  <section class="section section--tint" aria-labelledby="pf-title">
    <div class="container">
      <div class="section-head-row">
        <div class="section-head rv"><p class="eyebrow eyebrow--line">Seçilmiş kareler</p><h2 class="section-title" id="pf-title">${c.portfolio.title}</h2></div>
        <a class="btn btn--primary rv" href="/portfolyo">Tümünü gör</a>
      </div>
      ${grid.length >= 3 ? h`<ul class="mosaic" data-gallery>${grid.map((p, i) => h`
        <li class="mosaic__item mosaic__item--${i + 1} rv mask d${i % 3}">
          <a href="${p.display}" data-lb data-caption="${p.alt || p.category}"><img src="${i === 0 || i === 4 ? p.display : p.thumb}" alt="${p.alt || `${p.category || 'Düğün'} fotoğrafı`}" loading="lazy" decoding="async">${p.category ? h`<span class="mosaic__cap">${p.category}</span>` : ''}</a>
        </li>`)}</ul>`
        : portfolio.length ? portfolioGrid(portfolio, { limit: 8 })
        : h`<div class="gallery gallery--placeholder">${[1, 2, 3, 4].map(() => placeholder('Örnek fotoğraf alanı'))}</div>`}
      <p class="mosaic__more rv"><a class="text-link" href="${links.instagram(c)}" target="_blank" rel="noopener">${icon('instagram')}@${c.contact.instagram} ${icon('arrow')}</a></p>
    </div>
  </section>

  ${bandImg ? h`<section class="quote-band" aria-label="Söz">
    <img class="quote-band__img" src="${bandImg.display}" alt="" loading="lazy" decoding="async" data-parallax>
    <blockquote class="quote-band__q rv">“${quote}”<cite>${c.brand.name}</cite></blockquote>
  </section>` : ''}

  ${processSteps(c, { link: true })}

  ${contactBand(c)}`;

  return publicLayout(c, { active: 'home', overlayHeader: true, body, image: heroUrl ? new URL(heroUrl, config.siteUrl).href : '' });
}

function contactBand(c) {
  return h`
  <section class="band band--center" aria-labelledby="band-title">
    <div class="container rv">
      <p class="eyebrow eyebrow--light eyebrow--line">Tarihiniz belli mi?</p>
      <h2 class="band__title" id="band-title">Gününüzü <em>birlikte</em> planlayalım.</h2>
      <p class="band__text">Uygunluk için bize yazın; genellikle aynı gün dönüş yapıyoruz.</p>
      <div class="btn-row btn-row--center">
        <a class="btn btn--light" href="/talep">Uygunluk sorun</a>
        <a class="btn btn--ghost-light" href="${links.whatsapp(c)}" target="_blank" rel="noopener">${icon('whatsapp')}WhatsApp'tan Yaz</a>
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

  return publicLayout(c, { title: c.portfolio.title, description: c.portfolio.text, active: 'portfolio', body });
}

function aboutPage(c) {
  const body = h`
  ${pageHero(c.brand.name, c.about.title, c.about.lead)}
  <section class="section section--flush-top">
    <div class="container split split--top">
      <div class="split__media rv mask">
        ${c.about.image ? h`<img src="${c.about.image}" alt="${c.brand.name} ekibi" loading="lazy" decoding="async">` : placeholder('Ekip / stüdyo fotoğrafı')}
      </div>
      <div class="split__copy prose rv d1">
        ${c.about.paragraphs.map((p) => h`<p>${p}</p>`)}
      </div>
    </div>
  </section>

  ${processSteps(c)}

  ${contactBand(c)}`;

  return publicLayout(c, { title: c.about.title, description: c.about.lead, active: 'about', body });
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
        <a class="btn btn--primary" href="/talep">Uygunluk sorun</a>
        <a class="btn btn--outline" href="${links.whatsapp(c)}" target="_blank" rel="noopener">${icon('whatsapp')}WhatsApp'tan Yaz</a>
        <a class="btn btn--outline" href="${links.instagram(c)}" target="_blank" rel="noopener">${icon('instagram')}Instagram</a>
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

  return publicLayout(c, { title: c.contact.title, description: c.contact.text, active: 'contact', body });
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

function kvkkPage(c) {
  const body = h`
  ${pageHero('KVKK', 'Aydınlatma metni', 'Kişisel verilerinizi nasıl işlediğimizi ve haklarınızı açıklıyoruz.')}
  <section class="section section--flush-top">
    <div class="container container--narrow ct-text kvkk-text">${require('../kvkk').render(c)}</div>
  </section>`;
  return publicLayout(c, { title: 'KVKK aydınlatma metni', body, path: '/kvkk' });
}

// "Ankara'da", "Kastamonu'da", "İzmir'de", "Tokat'ta"
function locative(w) {
  const t = w.toLocaleLowerCase('tr-TR');
  const v = [...t].reverse().find((ch) => 'aeıioöuü'.includes(ch)) || 'a';
  const hard = 'fstkçşhp'.includes(t.slice(-1));
  return `${w}’${hard ? 't' : 'd'}${'eiöü'.includes(v) ? 'e' : 'a'}`;
}

// Şehir sayfası: "Ankara Düğün Fotoğrafçısı" gibi aramalar için (metinler Ayarlar › Şehir sayfaları'ndan)
function cityPage(c, { city, portfolio, heroUrl }) {
  const faq = (city.faq || []).filter((x) => x.q && x.a);
  const others = (c.cities || []).filter((x) => x.slug !== city.slug);
  const body = h`
  ${pageHero(`${city.city} · ${c.brand.tagline}`, city.title, city.lead)}
  <section class="section section--flush-top">
    <div class="container split split--top">
      <div class="split__media">
        ${heroUrl ? h`<img src="${heroUrl}" alt="${city.title} — ${c.brand.name}" loading="lazy" decoding="async">` : placeholder(`${city.city} düğün fotoğrafı`)}
      </div>
      <div class="split__copy prose">
        ${(city.paragraphs || []).map((p) => h`<p>${p}</p>`)}
        ${(city.areas || []).length ? h`<p><strong>Çekim yaptığımız yerler:</strong> ${city.areas.join(', ')} ve çevresi.</p>` : ''}
        <div class="btn-row"><a class="btn btn--primary" href="/talep">Tarihiniz için uygunluk sorun</a></div>
      </div>
    </div>
  </section>

  <section class="section section--tint" aria-labelledby="svc-title">
    <div class="container">
      ${sectionHead({ eyebrow: 'Hizmetler', title: `${locative(city.city)} neler çekiyoruz`, id: 'svc-title' })}
      <ul class="services">${c.services.map((x, i) => h`<li class="services__item"><span class="services__num">${String(i + 1).padStart(2, '0')}</span><div><h3>${x.title}</h3><p>${x.text}</p></div></li>`)}</ul>
    </div>
  </section>

  ${portfolio.length ? h`<section class="section" aria-labelledby="pf-title">
    <div class="container">
      ${sectionHead({ eyebrow: 'Portfolyo', title: 'Çalışmalarımızdan', id: 'pf-title' })}
      ${portfolioGrid(portfolio.slice(0, 12))}
      <div class="btn-row"><a class="btn btn--outline" href="/portfolyo">Tüm portfolyo</a></div>
    </div>
  </section>` : ''}

  ${faq.length ? h`<section class="section section--tint" aria-labelledby="faq-title">
    <div class="container container--narrow">
      ${sectionHead({ eyebrow: 'Sık sorulanlar', title: `${city.city} düğün çekimi hakkında`, id: 'faq-title' })}
      <div class="faq">${faq.map((x) => h`<details class="faq__item"><summary>${x.q}</summary><p>${x.a}</p></details>`)}</div>
    </div>
  </section>` : ''}

  ${others.length ? h`<section class="section section--flush-top"><div class="container"><p class="muted">Diğer hizmet bölgelerimiz: ${others.map((x, i) => h`${i ? ', ' : ''}<a href="/${x.slug}">${x.title}</a>`)}</p></div></section>` : ''}

  ${contactBand(c)}`;
  const url = `${config.siteUrl}/${city.slug}`;
  const ld = [
    { '@context': 'https://schema.org', '@type': 'Service', name: city.title, serviceType: 'Düğün fotoğrafçılığı ve video', url,
      provider: { '@id': `${config.siteUrl}/#isletme` }, areaServed: { '@type': 'City', name: city.city }, description: city.description },
    ...(faq.length ? [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })) }] : []),
  ];
  return publicLayout(c, { fullTitle: `${city.title} | ${c.brand.name}`, description: city.description, path: `/${city.slug}`, ld, body, image: heroUrl ? new URL(heroUrl, config.siteUrl).href : '' });
}

// Hediye kuponu sayfası: "Elif & Burak size HM4 Studio'dan bir hediye gönderdi"
function giftPage(c, { result, settings: gs, portfolio }) {
  const g = result.g;
  const ok = result.ok && gs.active;
  const body = h`
  <section class="page-hero gift-hero">
    <div class="container container--narrow">
      <p class="eyebrow">${c.brand.name} · Hediye</p>
      ${ok ? h`<h1 class="page-title">${g.owner} size bir hediye gönderdi</h1>
      <p class="page-lead">${gs.gift}</p>` : h`<h1 class="page-title">Bu hediye kuponu kullanılamıyor</h1>
      <p class="page-lead">${gs.active ? result.reason : 'Hediye kuponu programımız şu an aktif değil.'} Yine de tarihiniz için bize yazabilirsiniz.</p>`}
    </div>
  </section>
  <section class="section section--flush-top">
    <div class="container container--narrow">
      ${ok ? h`<div class="card gift-card">
        <p class="gift-card__code"><span class="muted">Kupon kodunuz</span><strong>${g.code}</strong></p>
        <p class="muted">${gs.rules} Son kullanma: ${new Date(`${g.expires_on}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
        <div class="btn-row">
          <a class="btn btn--primary" href="/talep?hediye=${g.code}">Tarihiniz için uygunluk sorun</a>
          <a class="btn btn--outline" href="${links.whatsapp(c)}" target="_blank" rel="noopener">${icon('whatsapp')}WhatsApp’tan yazın</a>
        </div>
        <p class="muted">Kuponunuz uygunluk formuna kendiliğinden eklenir. WhatsApp’tan yazarsanız kodu mesajınızda belirtin.</p>
      </div>` : h`<div class="btn-row"><a class="btn btn--primary" href="/talep">Uygunluk sorun</a></div>`}
    </div>
  </section>
  ${portfolio.length ? h`<section class="section" aria-labelledby="gp-title"><div class="container">
    ${sectionHead({ eyebrow: 'Portfolyo', title: 'Çalışmalarımızdan', id: 'gp-title' })}
    ${portfolioGrid(portfolio.slice(0, 8))}
    <div class="btn-row"><a class="btn btn--outline" href="/portfolyo">Tüm portfolyo</a></div>
  </div></section>` : ''}`;
  return publicLayout(c, { title: 'Hediye', body });
}

module.exports = { giftPage, cityPage, kvkkPage, home, portfolioPage, aboutPage, contactPage, notFound };
