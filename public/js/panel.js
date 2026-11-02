/* HM4 Studio — favori seçimi (çift paneli ve admin panelinde ortak). */
(function () {
  'use strict';
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const countEl = document.querySelector('[data-fav-count]');
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
      btn.setAttribute('aria-label', data.on ? 'Favorilerden çıkar' : 'Favorilere ekle');
      tile?.classList.toggle('is-fav', data.on);
      if (countEl) countEl.textContent = data.count;
      // Favoriler görünümündeyken çıkarılan fotoğrafı gizle (lightbox kapalıysa)
      if (onlyFavView && !data.on && !document.querySelector('.lb.is-open')) tile?.remove();
      document.dispatchEvent(new CustomEvent('hm4:fav'));
    } catch (err) {
      alert(`${err.message}. Lütfen sayfayı yenileyip tekrar deneyin.`);
    } finally {
      btn.classList.remove('is-busy');
    }
  });

  document.querySelectorAll('[data-fav]').forEach((b) => {
    b.setAttribute('aria-label', b.getAttribute('aria-pressed') === 'true' ? 'Favorilerden çıkar' : 'Favorilere ekle');
  });
})();
