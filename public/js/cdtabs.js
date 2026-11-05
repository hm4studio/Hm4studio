/* HM4 Studio — çift sayfasını sekmelere böler (Özet, Ödeme ve sözleşme, Fotoğraflar, Video, Gün planı, Giriş ve dosyalar).
   JavaScript kapalıysa tüm bölümler alt alta görünür. */
(function () {
  'use strict';
  const nav = document.querySelector('[data-cd-tabs]');
  if (!nav) return;
  const panes = [...document.querySelectorAll('[data-pane]')];
  const tabs = [...nav.querySelectorAll('[data-tab]')];
  const names = panes.map((p) => p.dataset.pane);
  const key = `hm4-cdtab-${location.pathname}`;

  function show(name, focusEl) {
    if (!names.includes(name)) name = 'ozet';
    panes.forEach((p) => { p.hidden = p.dataset.pane !== name; });
    tabs.forEach((t) => { const on = t.dataset.tab === name; t.classList.toggle('is-on', on); if (on) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current'); });
    try { sessionStorage.setItem(key, name); } catch { /* yok say */ }
    const active = tabs.find((t) => t.dataset.tab === name);
    active?.scrollIntoView({ block: 'nearest', inline: 'center' });
    if (focusEl) setTimeout(() => focusEl.scrollIntoView({ block: 'start' }), 0);
  }

  // Hangi sekme açılsın: adres çubuğundaki #bölüm, yoksa aynı sayfadan dönülüyorsa (form kaydı) son sekme, yoksa Özet
  function initial() {
    const hash = decodeURIComponent(location.hash.slice(1));
    if (hash) {
      if (names.includes(hash)) return [hash];
      const el = document.getElementById(hash);
      const pane = el?.closest('[data-pane]');
      if (pane) return [pane.dataset.pane, el];
    }
    let same = false;
    try { same = document.referrer && new URL(document.referrer).pathname === location.pathname; } catch { /* yok say */ }
    if (same || document.querySelector('.flash')) { try { return [sessionStorage.getItem(key) || 'ozet']; } catch { /* yok say */ } }
    return ['ozet'];
  }

  nav.hidden = false;
  const header = document.querySelector('.panel-header');
  const stick = () => { nav.style.top = `${header && getComputedStyle(header).position === 'sticky' ? header.offsetHeight : 0}px`; };
  stick(); window.addEventListener('resize', stick);
  document.body.classList.add('has-cdtabs');
  nav.addEventListener('click', (e) => {
    const a = e.target.closest('[data-tab]');
    if (!a) return;
    e.preventDefault();
    show(a.dataset.tab);
    history.replaceState(null, '', `#${a.dataset.tab}`);
    const top = nav.parentElement.offsetTop + nav.offsetTop - parseFloat(nav.style.top || 0) - 8;
    if (window.scrollY > top) window.scrollTo({ top });
  });
  window.addEventListener('hashchange', () => { const [n, el] = initial(); show(n, el); });
  const [n, el] = initial();
  show(n, el);
})();
