/* HM4 Studio — ortak arayüz: mobil menü, kapak üstü menü, kategori süzgeci,
   büyük görüntüleme (lightbox), onay pencereleri, durum çubuğu. */
(function () {
  'use strict';

  const ICONS = {
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    left: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
    right: '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
  };
  const svg = (n) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;

  // ── Mobil menü ──
  const toggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-nav]');
  if (toggle && nav) {
    const setOpen = (open) => {
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

  // ── Portfolyo kategori süzgeci ──
  const filters = document.querySelector('[data-filters]');
  if (filters) {
    filters.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      const cat = btn.dataset.filter;
      filters.querySelectorAll('[data-filter]').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      document.querySelectorAll('.gallery__item').forEach((li) => {
        li.hidden = Boolean(cat) && li.dataset.category !== cat;
      });
    });
  }

  // ── Büyük görüntüleme (lightbox) ──
  let lb, imgEl, countEl, favBtn, items = [], index = 0, lastFocus = null;

  function buildLightbox() {
    lb = document.createElement('div');
    lb.className = 'lb';
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.setAttribute('aria-label', 'Fotoğraf görüntüleyici');
    lb.innerHTML = `
      <img class="lb__img" alt="">
      <button type="button" class="lb__btn lb__close" aria-label="Kapat">${svg('close')}</button>
      <button type="button" class="lb__btn lb__prev" aria-label="Önceki">${svg('left')}</button>
      <button type="button" class="lb__btn lb__next" aria-label="Sonraki">${svg('right')}</button>
      <div class="lb__bar"><button type="button" class="lb__btn lb__fav" aria-pressed="false" aria-label="Favorilere ekle" hidden>${svg('heart')}</button><span class="lb__count"></span></div>`;
    document.body.appendChild(lb);
    imgEl = lb.querySelector('.lb__img');
    countEl = lb.querySelector('.lb__count');
    favBtn = lb.querySelector('.lb__fav');
    lb.querySelector('.lb__close').addEventListener('click', close);
    lb.querySelector('.lb__prev').addEventListener('click', () => show(index - 1));
    lb.querySelector('.lb__next').addEventListener('click', () => show(index + 1));
    lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
    imgEl.addEventListener('load', () => imgEl.classList.remove('is-loading'));
    favBtn.addEventListener('click', () => {
      const tileFav = tileFavFor(items[index]);
      if (tileFav) tileFav.click();
    });
    document.addEventListener('hm4:fav', syncFav);

    // Kaydırma (swipe) ile geçiş
    let startX = null;
    lb.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', (e) => {
      if (startX === null) return;
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
      startX = null;
    });

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
  }

  function tileFavFor(link) {
    const tile = link && link.closest('[data-tile]');
    return tile ? tile.querySelector('[data-fav]') : null;
  }

  function syncFav() {
    if (!lb || !lb.classList.contains('is-open')) return;
    const tileFav = tileFavFor(items[index]);
    favBtn.hidden = !tileFav;
    if (tileFav) {
      const on = tileFav.getAttribute('aria-pressed') === 'true';
      favBtn.setAttribute('aria-pressed', String(on));
      favBtn.setAttribute('aria-label', on ? 'Favorilerden çıkar' : 'Favorilere ekle');
    }
  }

  function show(i) {
    if (!items.length) return;
    index = (i + items.length) % items.length;
    const a = items[index];
    imgEl.classList.add('is-loading');
    imgEl.src = a.getAttribute('href');
    imgEl.alt = a.dataset.caption || a.querySelector('img')?.alt || '';
    countEl.textContent = `${index + 1} / ${items.length}`;
    syncFav();
    // Bir sonrakini önceden yükle
    const next = items[(index + 1) % items.length];
    if (next) { const pre = new Image(); pre.src = next.getAttribute('href'); }
  }

  function open(link) {
    if (!lb) buildLightbox();
    const gallery = link.closest('[data-gallery]') || document;
    items = [...gallery.querySelectorAll('[data-lb]')].filter((a) => !a.closest('[hidden]'));
    lastFocus = document.activeElement;
    lb.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    show(items.indexOf(link));
    lb.querySelector('.lb__close').focus();
  }

  function close() {
    lb.classList.remove('is-open');
    imgEl.removeAttribute('src');
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-lb]');
    if (!link || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    open(link);
  });
})();
