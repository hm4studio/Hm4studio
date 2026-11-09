/* HM4 Studio — ortak arayüz: mobil menü, kapak üstü menü, kategori süzgeci,
   büyük görüntüleme (lightbox), onay pencereleri, durum çubuğu. */
(function () {
  'use strict';

  const ICONS = {
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    book: '<path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5c-3.5-.5-6.5 0-8.5 1.5z"/><path d="M12 6.5v13"/>',
    download: '<path d="M12 4v11"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19.5h14"/>',
    left: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
    right: '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
  };
  // ── Kaydırınca belirme ve söz bandında derinlik ──
  (function reveal() {
    const els = [...document.querySelectorAll('.rv, .mask, .flow')];
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (els.length && 'IntersectionObserver' in window && !reduce) {
      // Ekranda zaten görünenler yanıp sönmesin: önce "in", sonra js sınıfı
      const vh = window.innerHeight;
      els.forEach((el) => { const r = el.getBoundingClientRect(); if (r.top < vh * 0.92 && r.bottom > 0) el.classList.add('in'); });
      document.documentElement.classList.add('js');
      const io = new IntersectionObserver((es) => es.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
      els.filter((el) => !el.classList.contains('in')).forEach((el) => io.observe(el));
    }
    const par = document.querySelector('[data-parallax]');
    if (par && !reduce) {
      let ticking = false;
      const move = () => {
        const r = par.parentElement.getBoundingClientRect();
        if (r.bottom > 0 && r.top < window.innerHeight) par.style.transform = `translateY(${((r.top + r.height / 2 - window.innerHeight / 2) * -0.12).toFixed(1)}px)`;
        ticking = false;
      };
      window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(move); } }, { passive: true });
      move();
    }
  })();

  const svg = (n) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;

  // ── Mobil menü ──
  const toggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-nav]');
  if (toggle && nav) {
    const header = toggle.closest('.site-header');
    const setOpen = (open) => {
      // Menü, üstteki bantlardan bağımsız olarak başlığın hemen altından başlasın; kapatma düğmesi hep görünsün
      if (open && header) nav.style.setProperty('--nav-top', `${Math.max(0, header.getBoundingClientRect().bottom)}px`);
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.querySelector('.sr-only').textContent = open ? 'Menüyü kapat' : 'Menüyü aç';
      document.body.classList.toggle('nav-open', open);
    };
    toggle.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('is-open')) { setOpen(false); toggle.focus(); } });
    window.matchMedia('(min-width: 900px)').addEventListener('change', () => setOpen(false));
  }

  // ── Kapak üzerindeki şeffaf menü, kaydırınca dolar ──
  const plainHeader = document.querySelector('.site-header:not(.site-header--overlay)');
  if (plainHeader) {
    const upd = () => plainHeader.classList.toggle('is-scrolled', window.scrollY > 8);
    upd();
    window.addEventListener('scroll', upd, { passive: true });
  }
  const header = document.querySelector('.site-header--overlay');
  if (header) {
    const update = () => header.classList.toggle('is-solid', window.scrollY > window.innerHeight * 0.6);
    update();
    window.addEventListener('scroll', update, { passive: true });
  }

  // ── Durum çubuğu ──
  document.querySelectorAll('[data-pct]').forEach((el) => {
    requestAnimationFrame(() => { el.style.width = `${Number(el.dataset.pct) || 0}%`; });
  });

  // ── Onay isteyen formlar (silme vb.) ──
  document.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-confirm]');
    if (form && !window.confirm(form.dataset.confirm)) e.preventDefault();
  });

  // ── Portfolyo etiketleri: sayfa yenilenmeden süzer, adres çubuğu etiket bağlantısını gösterir ──
  const tagNav = document.querySelector('[data-pf-tags]');
  if (tagNav) {
    const grid = document.querySelector('[data-pf-grid]');
    const title = document.querySelector('.page-hero .page-title');
    const lead = document.querySelector('.page-hero .page-lead');
    const ask = document.querySelector('[data-pf-ask]');
    const brand = tagNav.dataset.base;
    const allTitle = 'Portfolyo';
    const allLead = tagNav.dataset.lead;
    const esc = (t) => t.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
    const keepActiveInView = (a) => {
      const track = tagNav.querySelector('.pf-tags__track');
      const x = a.offsetLeft - (track.clientWidth - a.clientWidth) / 2;
      track.scrollTo({ left: Math.max(0, x), behavior: 'smooth' });
    };
    const show = (a, push) => {
      const tag = a.dataset.tag;
      tagNav.querySelectorAll('.pf-tag').forEach((x) => {
        const on = x === a;
        x.classList.toggle('is-active', on);
        if (on) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current');
      });
      grid?.classList.add('is-switching');
      setTimeout(() => {
        let n = 0;
        document.querySelectorAll('.gallery__item').forEach((li) => {
          const hit = !tag || (li.dataset.tags || '').split('|').includes(tag);
          li.hidden = !hit;
          if (hit) n += 1;
        });
        if (title) title.innerHTML = tag ? `${esc(tag)}<span class="pf-hero-sub"> · Portfolyo</span>` : allTitle;
        if (lead) lead.textContent = tag ? `${n} fotoğraf. Diğer mekan ve tarzlara aşağıdan göz atabilirsiniz.` : (allLead || lead.textContent);
        if (ask) {
          ask.hidden = !tag;
          ask.querySelector('[data-pf-ask-text]').textContent = tag ? `${tag} gibi bir çekim mi düşünüyorsunuz?` : '';
          const link = ask.querySelector('[data-pf-ask-link]');
          link.href = `https://wa.me/${link.dataset.wa}?text=${encodeURIComponent(`Merhaba, ${tag} çekimleriniz hakkında bilgi almak istiyorum.`)}`;
        }
        document.title = tag ? `${tag} fotoğrafları — ${brand}` : `Portfolyo — ${brand}`;
        grid?.classList.remove('is-switching');
      }, 180);
      if (push) history.pushState({ pfTag: tag }, '', a.getAttribute('href'));
      keepActiveInView(a);
    };
    // İlk açılışta seçili etiket görünür alana kaydırılır
    const cur = tagNav.querySelector('.pf-tag.is-active');
    if (cur) requestAnimationFrame(() => keepActiveInView(cur));
    tagNav.addEventListener('click', (e) => {
      const a = e.target.closest('.pf-tag');
      if (!a || e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      if (!a.classList.contains('is-active')) show(a, true);
    });
    window.addEventListener('popstate', () => {
      const path = location.pathname.replace(/\/$/, '') || '/portfolyo';
      const a = [...tagNav.querySelectorAll('.pf-tag')].find((x) => x.getAttribute('href') === path);
      if (a) show(a, false);
    });
  }

  // ── Galeri: fotoğraflar kendi oranında dizilir ──
  document.querySelectorAll('[data-gallery]').forEach((g) => {
    g.querySelectorAll('[data-tile]').forEach((li) => {
      const set = (r) => { if (r > 0.2 && r < 5) li.style.setProperty('--r', r.toFixed(3)); };
      if (li.dataset.r) set(Number(li.dataset.r));
      else {
        const img = li.querySelector('img');
        const fit = () => img.naturalWidth && set(img.naturalWidth / img.naturalHeight);
        if (img?.complete) fit(); else img?.addEventListener('load', fit, { once: true });
      }
    });
    if (!g.hasAttribute('data-wall')) g.classList.add('is-flow');
  });

  // ── Büyük görüntüleme (lightbox) ──
  // Yalnızca X düğmesi, Esc ya da telefonun geri tuşu kapatır; kaydırırken yanlışlıkla kapanmaz.
  let lb, imgEl, countEl, favBtn, items = [], index = 0, lastFocus = null, pushed = false;
  let zoom = 1, panX = 0, panY = 0;

  function buildLightbox() {
    lb = document.createElement('div');
    lb.className = 'lb';
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.setAttribute('aria-label', 'Fotoğraf görüntüleyici');
    lb.innerHTML = `
      <div class="lb__stage"><img class="lb__img" alt="" draggable="false"></div>
      <button type="button" class="lb__btn lb__close" aria-label="Kapat">${svg('close')}</button>
      <button type="button" class="lb__btn lb__prev" aria-label="Önceki">${svg('left')}</button>
      <button type="button" class="lb__btn lb__next" aria-label="Sonraki">${svg('right')}</button>
      <div class="lb__bar"><span class="lb__count"></span><a class="lb__btn lb__dl" hidden aria-label="Bu fotoğrafı indir">${svg('download')}</a><button type="button" class="lb__btn lb__fav lb__acov" aria-pressed="false" hidden>${svg('book')}<span>Kapak yap</span></button><button type="button" class="lb__btn lb__fav lb__favh" aria-pressed="false" hidden>${svg('heart')}<span class="lb__fav-text"></span></button></div>`;
    document.body.appendChild(lb);
    imgEl = lb.querySelector('.lb__img');
    countEl = lb.querySelector('.lb__count');
    favBtn = lb.querySelector('.lb__favh');
    lb.querySelector('.lb__close').addEventListener('click', () => close());
    lb.querySelector('.lb__prev').addEventListener('click', () => show(index - 1));
    lb.querySelector('.lb__next').addEventListener('click', () => show(index + 1));
    imgEl.addEventListener('load', () => imgEl.classList.remove('is-loading'));
    favBtn.addEventListener('click', () => { const t = tileFavFor(items[index]); if (t) t.click(); });
    const covBtn = lb.querySelector('.lb__acov');
    covBtn?.addEventListener('click', () => { const t = items[index]?.closest('[data-tile]')?.querySelector('[data-acov]'); if (t) t.click(); });
    document.addEventListener('hm4:fav', () => setTimeout(syncFav, 60));
    document.addEventListener('hm4:fav', syncFav);

    // Parmakla kaydırma: fotoğraf parmağı izler; yeterince kaydırılınca sonrakine geçer, yoksa yerine döner.
    // Yakınlaştırılmışken parmak fotoğrafı gezdirir. İki parmakla ya da çift dokunuşla yakınlaştırılır.
    const pts = new Map();
    let sx = 0, sy = 0, st = 0, moved = false, pinch0 = 0, zoom0 = 1, lastTap = 0, basePan = [0, 0];
    const stage = lb.querySelector('.lb__stage');
    stage.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      stage.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) { sx = e.clientX; sy = e.clientY; st = Date.now(); moved = false; basePan = [panX, panY]; lb.classList.add('is-dragging'); }
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); zoom0 = zoom; }
    });
    stage.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2 && pinch0) {
        const [a, b] = [...pts.values()];
        zoom = Math.min(4, Math.max(1, zoom0 * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch0));
        if (zoom === 1) { panX = 0; panY = 0; }
        moved = true; apply(); return;
      }
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
      if (zoom > 1) { panX = basePan[0] + dx; panY = basePan[1] + dy; apply(); }
      else apply(dx);
    });
    const end = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size) { const [p] = [...pts.values()]; sx = p[0]; sy = p[1]; basePan = [panX, panY]; pinch0 = 0; return; }
      lb.classList.remove('is-dragging');
      const dx = e.clientX - sx, dy = e.clientY - sy, dt = Date.now() - st;
      if (!moved) { // dokunuş: çift dokunuşta yakınlaştır / uzaklaştır
        if (Date.now() - lastTap < 300) { zoom = zoom > 1 ? 1 : 2.5; panX = 0; panY = 0; anim(); lastTap = 0; }
        else lastTap = Date.now();
        return;
      }
      if (zoom > 1) return;
      const fast = Math.abs(dx) > 25 && dt < 250;
      if (Math.abs(dx) > Math.abs(dy) && (Math.abs(dx) > window.innerWidth * 0.18 || fast)) slide(dx < 0 ? 1 : -1);
      else anim();
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    stage.addEventListener('wheel', (e) => { e.preventDefault(); }, { passive: false });

    document.addEventListener('keydown', (e) => {
      if (!lb.classList.contains('is-open')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') show(index + 1);
      else if (e.key === 'ArrowLeft') show(index - 1);
      else if (e.key === 'Tab') {
        const focusables = [...lb.querySelectorAll('button:not([hidden])')];
        const i = focusables.indexOf(document.activeElement);
        e.preventDefault();
        focusables[(i + (e.shiftKey ? -1 : 1) + focusables.length) % focusables.length].focus();
      }
    });
    // Telefonun geri tuşu sayfadan çıkmak yerine görüntüleyiciyi kapatır
    window.addEventListener('popstate', () => { if (lb.classList.contains('is-open')) { pushed = false; close(true); } });
  }

  function apply(dx = 0) { imgEl.style.transform = `translate(${dx + panX}px, ${panY}px) scale(${zoom})`; }
  function anim() { imgEl.classList.add('is-anim'); apply(); setTimeout(() => imgEl.classList.remove('is-anim'), 260); }
  function slide(dir) {
    imgEl.classList.add('is-anim');
    imgEl.style.transform = `translate(${-dir * window.innerWidth}px, 0)`;
    imgEl.style.opacity = '0';
    setTimeout(() => {
      imgEl.classList.remove('is-anim');
      show(index + dir, dir);
    }, 180);
  }

  function tileFavFor(link) {
    const tile = link && link.closest('[data-tile]');
    return tile ? tile.querySelector('[data-fav]') : null;
  }

  function syncFav() {
    if (!lb || !lb.classList.contains('is-open')) return;
    const tileFav = tileFavFor(items[index]);
    favBtn.hidden = !tileFav || tileFav.disabled;
    const tileCov = items[index]?.closest('[data-tile]')?.querySelector('[data-acov]');
    const covBtn = lb.querySelector('.lb__acov');
    if (covBtn) {
      covBtn.hidden = !tileCov || tileCov.disabled;
      const con = tileCov?.getAttribute('aria-pressed') === 'true';
      covBtn.classList.toggle('is-on', Boolean(con));
      covBtn.setAttribute('aria-pressed', String(Boolean(con)));
      covBtn.querySelector('span').textContent = con ? 'Albüm kapağı' : 'Kapak yap';
    }
    if (tileFav) {
      const on = tileFav.getAttribute('aria-pressed') === 'true';
      const n = document.querySelector('[data-album-count]')?.textContent;
      const limit = document.querySelector('[data-album]')?.dataset.limit;
      favBtn.setAttribute('aria-pressed', String(on));
      favBtn.setAttribute('aria-label', on ? 'Albümden çıkar' : 'Albüme ekle');
      favBtn.querySelector('.lb__fav-text').textContent = `${on ? 'Albümde' : 'Albüme ekle'}${n && limit ? ` · ${n}/${limit}` : ''}`;
    }
  }

  function show(i, from = 0) {
    if (!items.length) return;
    index = (i + items.length) % items.length;
    const a = items[index];
    zoom = 1; panX = 0; panY = 0;
    imgEl.classList.add('is-loading');
    imgEl.style.opacity = '';
    // Yeni fotoğraf kaydırma yönünden gelir
    imgEl.style.transform = from ? `translate(${from * window.innerWidth * 0.3}px, 0)` : '';
    imgEl.src = a.getAttribute('href');
    imgEl.alt = a.dataset.caption || a.querySelector('img')?.alt || '';
    if (from) requestAnimationFrame(() => anim());
    countEl.textContent = `${index + 1} / ${items.length}`;
    const dl = lb.querySelector('.lb__dl');
    if (a.dataset.dl) { dl.href = a.dataset.dl; dl.hidden = false; } else dl.hidden = true;
    syncFav();
    // Öncekini ve sonrakini önceden yükle
    for (const d of [1, -1]) { const n = items[(index + d + items.length) % items.length]; if (n) { const pre = new Image(); pre.src = n.getAttribute('href'); } }
  }

  function open(link) {
    if (!lb) buildLightbox();
    const gallery = link.closest('[data-gallery]') || document;
    items = [...gallery.querySelectorAll('[data-lb]')].filter((a) => !a.closest('[hidden]'));
    lastFocus = document.activeElement;
    lb.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    try { history.pushState({ lb: 1 }, ''); pushed = true; } catch { pushed = false; }
    show(items.indexOf(link));
    lb.querySelector('.lb__close').focus();
  }

  function close(fromHistory) {
    lb.classList.remove('is-open');
    imgEl.removeAttribute('src');
    imgEl.style.transform = '';
    document.body.style.overflow = '';
    if (pushed && !fromHistory) { pushed = false; history.back(); }
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-lb]');
    if (!link || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    open(link);
  });

  // ── Talep formu: seçilen tarihin doluluğu ──
  const dateIn = document.querySelector('[data-availability]');
  const note = document.querySelector('[data-avail-note]');
  if (dateIn && note) {
    const msg = {
      free: 'Bu tarih şu an boş görünüyor. Formu gönderin, hemen teyit edelim.',
      some: 'Bu tarihte başka bir çekimimiz var ama hâlâ yerimiz olabilir. Formu gönderin, kontrol edelim.',
      full: 'Bu tarih dolu görünüyor. Yine de yazın; ekibimiz sizinle alternatifleri konuşsun.',
      past: 'Geçmiş bir tarih seçtiniz.',
    };
    const check = async () => {
      if (!dateIn.value) { note.hidden = true; return; }
      try {
        const r = await fetch(`/talep/uygunluk?tarih=${encodeURIComponent(dateIn.value)}`, { headers: { Accept: 'application/json' } });
        const d = await r.json();
        if (!d.ok) { note.hidden = true; return; }
        note.textContent = msg[d.state] || '';
        note.className = `avail avail--${d.state}`;
        note.hidden = !note.textContent;
      } catch { note.hidden = true; }
    };
    dateIn.addEventListener('change', check);
    if (dateIn.value) check();
  }
})();
