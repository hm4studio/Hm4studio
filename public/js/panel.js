/* HM4 Studio — favori seçimi (çift paneli ve admin panelinde ortak). */
(function () {
  'use strict';
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const countEl = document.querySelector('[data-fav-count]');
  const album = document.querySelector('[data-album]');

  // Kısa bilgi mesajı (alert yerine)
  let toastEl, toastTimer;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast'; toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg; toastEl.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3200);
  }

  function updateAlbum(count) {
    if (!album) return;
    const limit = Number(album.dataset.limit) || 1;
    document.querySelectorAll('[data-album-count]').forEach((c) => { c.textContent = count; });
    const fill = album.querySelector('.album-bar__fill'); if (fill) fill.style.width = Math.min(100, Math.round(count / limit * 100)) + '%';
    const bar = album.querySelector('[role="progressbar"]'); if (bar) bar.setAttribute('aria-valuenow', count);
    const lock = album.querySelector('[data-album-lock]'); if (lock) lock.disabled = count === 0;
    const done = document.querySelector('[data-selpill-done]'); if (done) done.hidden = count < limit;
  }
  // Galeri görünürken altta sabit seçim sayacı
  const pill = document.querySelector('[data-selpill]');
  const gallery = document.querySelector('[data-gallery]');
  if (pill && gallery && 'IntersectionObserver' in window) {
    new IntersectionObserver((entries) => { pill.hidden = !entries[0].isIntersecting; }, { rootMargin: '0px 0px -30% 0px' }).observe(gallery);
  }
  const onlyFavView = new URLSearchParams(location.search).get('g') === 'fav';

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-fav]');
    if (!btn || btn.classList.contains('is-busy')) return;
    const on = btn.getAttribute('aria-pressed') !== 'true';
    const tile = btn.closest('[data-tile]');
    btn.classList.add('is-busy');
    try {
      const res = await fetch(btn.dataset.fav, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ photoId: Number(btn.dataset.photo), on }),
        credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'İşlem başarısız');
      btn.setAttribute('aria-pressed', String(data.on));
      btn.setAttribute('aria-label', data.on ? 'Albümden çıkar' : 'Albüme ekle');
      tile?.classList.toggle('is-fav', data.on);
      if (countEl) countEl.textContent = data.count;
      updateAlbum(data.count);
      // Favoriler görünümündeyken çıkarılan fotoğrafı gizle (lightbox kapalıysa)
      if (onlyFavView && !data.on && !document.querySelector('.lb.is-open')) tile?.remove();
      document.dispatchEvent(new CustomEvent('hm4:fav'));
    } catch (err) {
      toast(err.message);
    } finally {
      btn.classList.remove('is-busy');
    }
  });

  document.querySelectorAll('[data-fav]').forEach((b) => {
    b.setAttribute('aria-label', b.getAttribute('aria-pressed') === 'true' ? 'Albümden çıkar' : 'Albüme ekle');
  });
})();
