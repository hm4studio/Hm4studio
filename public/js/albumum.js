'use strict';
// Çift › albüm kataloğu: favoriler (bu cihazda), seçilen rengin adı, kapak yazısı önizlemesi
(() => {
  const KEY = 'hm4-album-fav';
  const read = () => { try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return new Set(); } };
  const write = (s) => { try { localStorage.setItem(KEY, JSON.stringify([...s])); } catch { /* özel mod */ } };
  let favs = read();
  const chip = document.querySelector('[data-ak-favs]');
  const empty = document.querySelector('[data-ak-empty]');
  let only = false;
  function paint() {
    for (const b of document.querySelectorAll('[data-ak-heart]')) {
      const on = favs.has(b.dataset.akHeart);
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('is-on', on);
    }
    if (chip) { chip.hidden = favs.size === 0 && !only; chip.classList.toggle('is-on', only); }
    let shown = 0;
    for (const card of document.querySelectorAll('[data-ak-no]')) {
      const vis = !only || favs.has(card.dataset.akNo);
      card.hidden = !vis; if (vis) shown += 1;
    }
    if (empty) empty.hidden = !(only && shown === 0);
  }
  for (const b of document.querySelectorAll('[data-ak-heart]')) {
    b.addEventListener('click', () => { const k = b.dataset.akHeart; if (favs.has(k)) favs.delete(k); else favs.add(k); write(favs); paint(); });
  }
  chip?.addEventListener('click', () => { only = !only; paint(); });
  paint();

  const name = document.querySelector('[data-ak-renkad]');
  for (const r of document.querySelectorAll('.ak-sw input')) r.addEventListener('change', () => { if (name) name.textContent = r.value; });

  for (const inp of document.querySelectorAll('[data-ak-in]')) {
    const out = document.querySelector(`[data-ak-pv="${inp.dataset.akIn}"]`);
    inp.addEventListener('input', () => { if (out) out.textContent = inp.value; });
  }
})();
