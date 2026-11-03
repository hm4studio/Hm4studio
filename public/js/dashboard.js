/* HM4 Studio — panel: çift kartlarında arama/süzgeç, randevu formunda kalan bakiye. */
(function () {
  'use strict';
  const tl = (n) => `${n.toLocaleString('tr-TR')} ₺`;
  const num = (v) => Number(String(v || '').split(',')[0].replace(/\D/g, '')) || 0;

  // ── Çift kartları ──
  const list = document.querySelector('[data-cards]');
  const box = document.querySelector('[data-card-filters]');
  if (list && box) {
    const cards = [...list.querySelectorAll('[data-card]')];
    const original = cards.slice();
    const $ = (s) => box.querySelector(s);
    const count = document.querySelector('[data-card-count]');
    const empty = document.querySelector('[data-cards-empty]');
    const key = 'hm4-card-filters';
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || '{}');
      for (const [sel, v] of Object.entries(saved)) if ($(sel)) $(sel).value = v;
    } catch { /* depolama kapalı olabilir */ }

    function apply() {
      const q = $('[data-f-q]').value.trim().toLocaleLowerCase('tr-TR');
      const st = $('[data-f-stage]').value, ty = $('[data-f-type]').value, pay = $('[data-f-pay]').value, sort = $('[data-f-sort]').value;
      let shown = 0;
      for (const c of cards) {
        const ok = (!q || c.dataset.search.includes(q)) && (!st || c.dataset.stage === st)
          && (!ty || c.dataset.type === ty) && (!pay || c.dataset.pay === pay);
        c.hidden = !ok;
        if (ok) shown++;
      }
      const order = sort === 'date'
        ? cards.slice().sort((a, b) => (a.dataset.date || '9999').localeCompare(b.dataset.date || '9999'))
        : original;
      order.forEach((c) => list.appendChild(c));
      if (count) count.textContent = `(${shown})`;
      if (empty) empty.hidden = shown > 0;
      try {
        sessionStorage.setItem(key, JSON.stringify({ '[data-f-q]': $('[data-f-q]').value, '[data-f-stage]': st, '[data-f-type]': ty, '[data-f-pay]': pay, '[data-f-sort]': sort }));
      } catch { /* yok say */ }
    }
    box.addEventListener('input', apply);
    box.addEventListener('change', apply);
    apply();
  }

  // ── Randevu formu: kalan bakiye ──
  const bal = document.querySelector('[data-balance]');
  if (bal) {
    const form = bal.closest('form');
    const total = form.querySelector('[name="total"]');
    const dep = form.querySelector('[name="deposit"]');
    const full = form.querySelector('[name="paidFull"]');
    const fmt = (el) => { const n = num(el.value); el.value = n ? n.toLocaleString('tr-TR') : ''; };
    function update() {
      const t = num(total.value), d = num(dep.value);
      if (!t) { bal.textContent = ''; return; }
      if (d > t) { bal.textContent = 'Kapora toplam tutardan büyük olamaz.'; bal.className = 'appt-balance is-error'; return; }
      const rest = full.checked ? 0 : t - d;
      bal.className = 'appt-balance';
      bal.textContent = rest === 0 ? 'Ödeme tamamlandı' : `Kalan bakiye: ${tl(rest)}`;
    }
    [total, dep].forEach((el) => { el.addEventListener('input', update); el.addEventListener('blur', () => { fmt(el); update(); }); fmt(el); });
    full.addEventListener('change', update);
    update();
  }
})();
