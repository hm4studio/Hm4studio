/* HM4 Studio — panel rehberi: arama ve sayfa ipuçları */
(function () {
  'use strict';
  if (window.__hm4Guide) return;
  window.__hm4Guide = true;

  // Sayfa ipucu: "Anladım" denince bu cihazda bir daha gösterme
  document.querySelectorAll('[data-hint]').forEach((box) => {
    const key = `hm4-hint-${box.dataset.hint}`;
    let seen = false;
    try { seen = localStorage.getItem(key) === '1'; } catch { /* göster */ }
    if (!seen) box.hidden = false;
    const btn = box.querySelector('[data-hint-close]');
    if (btn) btn.addEventListener('click', () => {
      box.hidden = true;
      try { localStorage.setItem(key, '1'); } catch { /* yok say */ }
    });
  });

  // Rehber araması: yazılan kelimenin geçtiği adımları listeler
  const q = document.querySelector('[data-guide-q]');
  const res = document.querySelector('[data-guide-res]');
  if (!q || !res) return;
  const steps = [...document.querySelectorAll('.groad__i')];
  const norm = (s) => s.toLocaleLowerCase('tr-TR').trim();
  const render = () => {
    const v = norm(q.value);
    res.textContent = '';
    if (v.length < 2) { res.hidden = true; return; }
    const hits = steps.filter((li) => li.dataset.keys.includes(v));
    if (!hits.length) {
      const li = document.createElement('li');
      li.className = 'gsearch__none';
      li.textContent = 'Bulunamadı. Başka bir kelime deneyin.';
      res.append(li);
    }
    hits.forEach((s) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `/admin/rehber?adim=${s.dataset.n}#adim`;
      a.textContent = `Adım ${s.dataset.n} · ${s.dataset.title}`;
      li.append(a);
      res.append(li);
    });
    res.hidden = false;
  };
  q.addEventListener('input', render);
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const a = res.querySelector('a'); if (a) { e.preventDefault(); location.href = a.href; } }
    if (e.key === 'Escape') { q.value = ''; render(); }
  });
})();
