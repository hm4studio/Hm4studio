/* HM4 Studio — panel: çift kartlarında arama/süzgeç; kişi kartı formunda etkinlik ekleme,
   toplam/kalan hesabı ve aynı gün çakışma uyarısı; randevu belgesini yazdırma. */
(function () {
  'use strict';
  // Seri numaralarını panoya kopyala
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    const old = btn.textContent;
    try { await navigator.clipboard.writeText(btn.dataset.copy); btn.textContent = 'Kopyalandı'; } catch { btn.textContent = 'Kopyalanamadı'; }
    setTimeout(() => { btn.textContent = old; }, 1600);
  });
  const tl = (n) => `${n.toLocaleString('tr-TR')} ₺`;
  const num = (v) => Number(String(v || '').split(',')[0].replace(/\D/g, '')) || 0;
  const fmt = (el) => { const n = num(el.value); el.value = n ? n.toLocaleString('tr-TR') : ''; };

  // ── Randevu belgesi: yazdır / PDF ──
  document.querySelector('[data-print]')?.addEventListener('click', () => window.print());

  // ── Tutar alanları: 25000 → 25.000 ──
  document.addEventListener('blur', (e) => { if (e.target.matches?.('[data-money]')) fmt(e.target); }, true);
  document.querySelectorAll('[data-money]').forEach(fmt);

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

    const bcards = [...document.querySelectorAll('[data-bcard]')];
    function apply() {
      const q = $('[data-f-q]').value.trim().toLocaleLowerCase('tr-TR');
      const st = $('[data-f-stage]').value, ty = $('[data-f-type]').value, pay = $('[data-f-pay]').value, sort = $('[data-f-sort]').value;
      const match = (c) => (!q || c.dataset.search.includes(q)) && (!st || c.dataset.stage === st)
        && (!ty || c.dataset.type.split(', ').includes(ty)) && (!pay || c.dataset.pay === pay);
      let shown = 0;
      for (const c of cards) {
        const ok = match(c);
        c.hidden = !ok;
        if (ok) shown++;
      }
      for (const c of bcards) c.hidden = !match(c);
      const order = sort === 'date'
        ? cards.slice().sort((a, b) => (a.dataset.date || '9999').localeCompare(b.dataset.date || '9999'))
        : original;
      order.forEach((c) => list.appendChild(c));
      if (count) count.textContent = String(shown);
      if (empty) empty.hidden = shown > 0;
      try {
        sessionStorage.setItem(key, JSON.stringify({ '[data-f-q]': $('[data-f-q]').value, '[data-f-stage]': st, '[data-f-type]': ty, '[data-f-pay]': pay, '[data-f-sort]': sort }));
      } catch { /* yok say */ }
    }
    // Görünüm: kartlar / aşama panosu
    const board = document.querySelector('[data-board]');
    const btns = [...document.querySelectorAll('[data-view]')];
    function setView(v) {
      btns.forEach((b) => { const on = b.dataset.view === v; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
      list.hidden = v === 'board';
      if (board) board.hidden = v !== 'board';
      try { localStorage.setItem('hm4-view', v); } catch { /* yok say */ }
    }
    btns.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
    try { if (localStorage.getItem('hm4-view') === 'board') setView('board'); } catch { /* yok say */ }

    box.addEventListener('input', apply);
    box.addEventListener('change', apply);
    apply();
  }

  // ── Kişi kartı formu ──
  const form = document.querySelector('[data-appt-form]');
  if (!form) return;
  const evList = form.querySelector('[data-ev-list]');
  const tpl = form.querySelector('[data-ev-template]');
  const sum = form.querySelector('[data-sum]');
  const dep = form.querySelector('[data-deposit]');
  let next = Math.max(-1, ...[...evList.querySelectorAll('[data-ev]')].map((b) => Number(b.dataset.evIndex))) + 1;

  function renumber() {
    const blocks = [...evList.querySelectorAll('[data-ev]')];
    blocks.forEach((b, i) => {
      b.querySelector('[data-ev-num]').textContent = i + 1;
      b.querySelector('[data-ev-remove]').hidden = blocks.length === 1;
    });
  }

  function updateSum() {
    const total = [...evList.querySelectorAll('[data-ev-price]')].reduce((s, el) => s + num(el.value), 0);
    const d = dep ? num(dep.value) : 0;
    if (!total) { sum.textContent = 'Etkinliklere tutar girdikçe toplam burada hesaplanır.'; sum.className = 'appt-sum muted'; return; }
    if (d > total) { sum.textContent = `Toplam ${tl(total)} · kapora toplamdan büyük olamaz.`; sum.className = 'appt-sum is-error'; return; }
    sum.className = 'appt-sum';
    sum.textContent = dep ? `Toplam ${tl(total)} · Kapora ${tl(d)} · Kalan ${tl(total - d)}` : `Toplam ${tl(total)}`;
  }

  // Aynı gün başka çekim var mı?
  async function checkDate(input) {
    const warn = input.closest('[data-ev]').querySelector('[data-ev-warn]');
    warn.hidden = true;
    if (!input.value) return;
    try {
      const r = await fetch(`/admin/cakisma?tarih=${input.value}&haric=${form.dataset.couple || 0}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const data = await r.json();
      const same = [...evList.querySelectorAll('[data-ev-date]')].filter((x) => x !== input && x.value === input.value).length;
      const items = data.items || [];
      if (items.length || same) {
        warn.textContent = 'Bu tarihte: ' + [...items.map((i) => `${i.name} (${i.type || 'etkinlik'}${i.time ? ' ' + i.time : ''})`), ...(same ? ['bu kişinin başka bir etkinliği'] : [])].join(', ');
        warn.hidden = false;
      }
    } catch { /* uyarı gösterilemezse kayıt yine yapılır */ }
  }

  form.querySelector('[data-ev-add]').addEventListener('click', () => {
    const i = next++;
    const html = tpl.innerHTML.replaceAll('__i__', String(i)).replaceAll('__n__', '');
    evList.insertAdjacentHTML('beforeend', html);
    const block = evList.lastElementChild;
    // Önceki etkinliğin şehrini öner
    const prev = block.previousElementSibling;
    if (prev) block.querySelector(`[name="ev${i}_city"]`).value = prev.querySelector('[name$="_city"]').value;
    renumber();
    block.querySelector('select').focus();
  });

  evList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ev-remove]');
    if (!btn) return;
    const block = btn.closest('[data-ev]');
    const filled = [...block.querySelectorAll('input:not([type=hidden]), select, textarea')].some((el) => el.value);
    if (filled && !window.confirm('Bu etkinlik formdan kaldırılsın mı? Kaydettiğinizde silinir.')) return;
    block.remove();
    renumber();
    updateSum();
  });

  // Paket seçilince fiyat ve içerik kendiliğinden dolar (boşsa)
  let pkgs = [];
  try { pkgs = JSON.parse(form.dataset.packages || '[]'); } catch { /* yok say */ }
  form.addEventListener('change', (e) => {
    if (!e.target.matches('[data-ev-package]')) return;
    const p = pkgs.find((x) => x.n === e.target.value.trim());
    if (!p) return;
    const block = e.target.closest('[data-ev]');
    const price = block.querySelector('[data-ev-price]');
    const detail = block.querySelector('[name$="_detail"]');
    const type = block.querySelector('select[name$="_type"]');
    if (p.p && (!num(price.value) || price.dataset.auto === '1')) { price.value = p.p.toLocaleString('tr-TR'); price.dataset.auto = '1'; }
    if (p.d && (!detail.value.trim() || detail.dataset.auto === '1')) { detail.value = p.d; detail.dataset.auto = '1'; }
    if (p.t && type && !type.value) type.value = p.t;
    updateSum();
  });
  form.addEventListener('input', (e) => {
    if (e.target.matches('[data-ev-price], [name$="_detail"]')) delete e.target.dataset.auto;
    if (e.target.matches('[data-ev-price], [data-deposit]')) updateSum();
  });
  form.addEventListener('change', (e) => { if (e.target.matches('[data-ev-date]')) checkDate(e.target); });
  evList.querySelectorAll('[data-ev-date]').forEach((el) => el.value && checkDate(el));
  renumber();
  updateSum();
})();
