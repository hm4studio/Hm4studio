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

  // ── Takvim: ay değiştirirken sayfa yenilenmesin, yerinde değişsin ──
  document.addEventListener('click', async (e) => {
    const a = e.target.closest('.cal__nav a');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    const cal = a.closest('.cal');
    cal.classList.add('is-loading');
    try {
      const res = await fetch(a.href, { credentials: 'same-origin', headers: { Accept: 'text/html' } });
      if (!res.ok || res.redirected) throw new Error('yüklenemedi');
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const fresh = doc.querySelector('.cal');
      if (!fresh) throw new Error('yok');
      cal.replaceWith(fresh);
      const fig = doc.querySelector('.figures'); const cur = document.querySelector('.figures');
      if (fig && cur) cur.replaceWith(fig);
      history.replaceState(null, '', a.href);
    } catch { location.href = a.href; }
  });

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
      const d = b.querySelector('[data-ev-date]').value;
      const tag = b.querySelector('[data-ev-same]');
      if (tag) tag.hidden = !d || !blocks.some((x) => x !== b && x.querySelector('[data-ev-date]').value === d);
    });
  }

  const disc = form.querySelector('[data-discount]');
  // İndirim: "2.000" (₺) ya da "%10"
  function discountOf(gross) {
    const raw = disc ? disc.value.trim() : '';
    if (!raw) return 0;
    const n = Number(raw.replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
    return Math.round(/%/.test(raw) ? (gross * Math.min(n, 100)) / 100 : n);
  }
  const barT = form.querySelector('[data-bar-total]');
  const barR = form.querySelector('[data-bar-rest]');
  const barRk = form.querySelector('[data-bar-rest-k]');
  function bar(total, rest) {
    if (!barT) return;
    barT.textContent = total ? tl(total) : '—';
    const show = Boolean(total && rest !== null && rest !== total);
    barR.hidden = !show; barRk.hidden = !show;
    if (show) barR.textContent = tl(rest);
  }
  function updateSum() {
    const gross = [...evList.querySelectorAll('[data-ev-price]')].reduce((s, el) => s + num(el.value), 0);
    const off = discountOf(gross);
    const total = Math.max(gross - off, 0);
    const later = form.querySelector('[data-dep-later]');
    const d = dep && !(later && later.checked) ? num(dep.value) : 0;
    bar(gross ? total : 0, dep ? Math.max(total - d, 0) : null);
    if (!gross) { sum.textContent = 'Etkinliklere tutar girdikçe toplam burada hesaplanır.'; sum.className = 'appt-sum muted'; return; }
    const head = off ? `Ara toplam ${tl(gross)} · İndirim −${tl(off)} · Toplam ${tl(total)}` : `Toplam ${tl(total)}`;
    if (off > gross) { sum.textContent = `${head} · indirim toplamdan büyük olamaz.`; sum.className = 'appt-sum is-error'; return; }
    if (d > total) { sum.textContent = `${head} · kapora toplamdan büyük olamaz.`; sum.className = 'appt-sum is-error'; return; }
    sum.className = 'appt-sum';
    sum.textContent = dep ? `${head} · Kapora ${tl(d)} · Kalan ${tl(total - d)}` : head;
  }
  disc?.addEventListener('input', updateSum);
  // Kapora sonra ödenecekse: tarih "söz verilen tarih" olur, kalan hesabına katılmaz
  const later = form.querySelector('[data-dep-later]');
  later?.addEventListener('change', () => {
    const lab = form.querySelector('[data-dep-date-label]');
    if (lab) lab.textContent = later.checked ? 'Söz verilen tarih' : 'Kapora tarihi';
    updateSum();
  });

  // Aynı gün başka çekim var mı?
  async function checkDate(input) {
    const warn = input.closest('[data-ev]').querySelector('[data-ev-warn]');
    warn.hidden = true;
    if (!input.value) return;
    try {
      const r = await fetch(`/admin/cakisma?tarih=${input.value}&haric=${form.dataset.couple || 0}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const data = await r.json();
      const items = data.items || [];
      // Yalnızca başka çiftlerle çakışma uyarı sayılır; bu kişinin aynı günkü diğer hizmeti normaldir
      if (items.length) {
        warn.textContent = 'Bu tarihte başka çekim var: ' + items.map((i) => `${i.name} (${i.type || 'etkinlik'}${i.time ? ' ' + i.time : ''})`).join(', ');
        warn.hidden = false;
      }
    } catch { /* uyarı gösterilemezse kayıt yine yapılır */ }
  }

  // Yeni etkinlik bloğu; "aynı gün" ise kaynak bloğun hemen altına, tarih/şehir/mekân kopyalanarak
  function addBlock(source) {
    const i = next++;
    const html = tpl.innerHTML.replaceAll('__i__', String(i)).replaceAll('__n__', '');
    if (source) source.insertAdjacentHTML('afterend', html); else evList.insertAdjacentHTML('beforeend', html);
    const block = source ? source.nextElementSibling : evList.lastElementChild;
    const set = (k, from) => { const el = block.querySelector(`[name="ev${i}_${k}"]`); if (el && from) el.value = from.value; };
    const ref = source || block.previousElementSibling;
    if (ref) set('city', ref.querySelector('[name$="_city"]'));
    if (source) { set('date', source.querySelector('[data-ev-date]')); set('venue', source.querySelector('[name$="_venue"]')); }
    renumber();
    block.querySelector('select').focus();
    if (source) block.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  form.querySelector('[data-ev-add]').addEventListener('click', () => addBlock(null));

  evList.addEventListener('click', (e) => {
    const same = e.target.closest('[data-ev-sameday]');
    if (same) { addBlock(same.closest('[data-ev]')); return; }
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
  // Birden fazla paket: işaretlenenlerin fiyatı toplanır, içerikleri alt alta yazılır (elle değiştirilmediyse)
  form.addEventListener('change', (e) => {
    if (!e.target.matches('[data-ev-pkg]')) return;
    const block = e.target.closest('[data-ev]');
    const on = [...block.querySelectorAll('[data-ev-pkg]:checked')];
    const price = block.querySelector('[data-ev-price]');
    const detail = block.querySelector('[name$="_detail"]');
    const type = block.querySelector('select[name$="_type"]');
    const total = on.reduce((s, x) => s + num(x.dataset.price), 0);
    if (!num(price.value) || price.dataset.auto === '1') { price.value = total ? total.toLocaleString('tr-TR') : ''; price.dataset.auto = '1'; }
    const text = on.map((x) => x.dataset.detail).filter(Boolean).join('\n');
    if (!detail.value.trim() || detail.dataset.auto === '1') { detail.value = text; detail.dataset.auto = '1'; }
    const t = on.map((x) => x.dataset.type).find(Boolean);
    if (t && type && !type.value) type.value = t;
    updateSum();
  });
  form.addEventListener('input', (e) => {
    if (e.target.matches('[data-ev-price], [name$="_detail"]')) delete e.target.dataset.auto;
    if (e.target.matches('[data-ev-price], [data-deposit]')) updateSum();
  });
  form.addEventListener('change', (e) => { if (e.target.matches('[data-ev-date]')) { checkDate(e.target); renumber(); } });
  evList.querySelectorAll('[data-ev-date]').forEach((el) => el.value && checkDate(el));
  // Düzenlerken: tutar/içerik seçili paketlerden geliyorsa "otomatik" say, paket ekleyip çıkarınca güncellensin
  evList.querySelectorAll('[data-ev]').forEach((block) => {
    const on = [...block.querySelectorAll('[data-ev-pkg]:checked')];
    if (!on.length) return;
    const price = block.querySelector('[data-ev-price]');
    const detail = block.querySelector('[name$="_detail"]');
    if (num(price.value) === on.reduce((s, x) => s + num(x.dataset.price), 0)) price.dataset.auto = '1';
    if (detail.value.trim() === on.map((x) => x.dataset.detail).filter(Boolean).join('\n').trim()) detail.dataset.auto = '1';
  });
  renumber();
  updateSum();
})();

// Albüm sipariş formu: seçimler sağdaki önizlemede anında görünür
(function () {
  const box = document.querySelector('[data-order-form]');
  if (!box) return;
  const show = (el) => {
    const out = box.querySelector(`[data-pv-out="${el.dataset.pv}"]`);
    if (!out) return;
    const v = el.value.trim();
    out.textContent = v ? (el.dataset.pv === 'sayfa' ? `${v} sayfa` : v) : '—';
  };
  box.querySelectorAll('[data-pv]').forEach((el) => {
    el.addEventListener('input', () => show(el));
    el.addEventListener('change', () => show(el));
  });
})();

// Bugün: bekleyen ödeme tutarı göz düğmesiyle açılıp kapanır; seçim bu cihazda hatırlanır (varsayılan gizli)
(function () {
  const btn = document.querySelector('[data-money-toggle]');
  const box = btn && btn.closest('[data-money]');
  if (!box) return;
  const set = (show) => {
    box.classList.toggle('is-hidden', !show);
    btn.setAttribute('aria-pressed', show ? 'true' : 'false');
    btn.setAttribute('aria-label', show ? 'Tutarı gizle' : 'Tutarı göster');
  };
  let show = false;
  try { show = localStorage.getItem('hm4-money') === '1'; } catch { /* gizli kalır */ }
  set(show);
  btn.addEventListener('click', () => {
    show = !show;
    set(show);
    try { localStorage.setItem('hm4-money', show ? '1' : '0'); } catch { /* yok say */ }
  });
})();
