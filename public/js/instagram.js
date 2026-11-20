/* HM4 Studio — Portfolyo › Instagram'dan al.
   Gönderiler listelenir, seçilenlerin fotoğrafları (çoklu gönderide hepsi) sunucu üzerinden indirilir,
   tarayıcıda diğer yüklemelerle aynı boyutlara küçültülüp portfolyoya eklenir. */
(function () {
  'use strict';
  const box = document.querySelector('[data-ig]');
  if (!box || !window.HM4Upload) return;
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const grid = box.querySelector('[data-ig-grid]');
  const more = box.querySelector('[data-ig-more]');
  const bar = box.querySelector('[data-ig-bar]');
  const list = box.querySelector('[data-ig-list]');
  const importBtn = box.querySelector('[data-ig-import]');
  const tagBox = box.querySelector('[data-ig-tags]');
  let items = [];
  let next = '';
  let filter = 'all';
  const picked = new Set();
  let working = false;

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const isDone = (p) => p.added >= p.photos.length;

  function message(text) { grid.innerHTML = ''; grid.appendChild(el('li', 'ig-msg muted', text)); }

  async function load(reset) {
    if (reset) { items = []; next = ''; picked.clear(); message('Gönderiler yükleniyor…'); }
    more.disabled = true;
    try {
      const res = await fetch(`/admin/instagram/gonderiler${next ? `?after=${encodeURIComponent(next)}` : ''}`, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `Sunucu hatası (${res.status})`);
      items = items.concat(data.items);
      next = data.next || '';
      render();
    } catch (err) {
      if (!items.length) message(err.message); else alert(err.message);
    }
    more.disabled = false;
  }

  function render() {
    const shown = items.filter((p) => filter === 'all' || !isDone(p));
    box.querySelector('[data-ig-count="all"]').textContent = `(${items.length}${next ? '+' : ''})`;
    box.querySelector('[data-ig-count="new"]').textContent = `(${items.filter((p) => !isDone(p)).length})`;
    grid.innerHTML = '';
    if (!shown.length) message(items.length ? 'Hepsi portfolyoda.' : 'Fotoğraflı gönderi bulunamadı.');
    for (const p of shown) {
      const li = el('li', 'ig-it');
      const b = el('button', 'ig-it__btn');
      b.type = 'button';
      b.dataset.id = p.id;
      b.setAttribute('aria-pressed', picked.has(p.id) ? 'true' : 'false');
      b.setAttribute('aria-label', `${p.caption ? p.caption.slice(0, 60) : 'Gönderi'}${p.photos.length > 1 ? ` (${p.photos.length} fotoğraf)` : ''}`);
      if (p.caption) b.title = p.caption.slice(0, 160);
      const img = el('img'); img.src = p.thumb; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
      b.appendChild(img);
      if (isDone(p)) { li.classList.add('is-done'); b.appendChild(el('span', 'ig-it__tag', 'Eklendi')); } else if (p.added) b.appendChild(el('span', 'ig-it__tag', `${p.added}/${p.photos.length} eklendi`));
      else if (p.photos.length > 1) b.appendChild(el('span', 'ig-it__tag', `${p.photos.length} foto`));
      if (picked.has(p.id)) li.classList.add('is-sel');
      li.appendChild(b);
      grid.appendChild(li);
    }
    more.hidden = !next;
    sync();
  }

  function sync() {
    const sel = items.filter((p) => picked.has(p.id));
    const photos = sel.reduce((n, p) => n + p.photos.length - p.added, 0);
    bar.hidden = !sel.length && !working && !list.children.length;
    bar.classList.toggle('is-active', Boolean(sel.length) || working);
    box.querySelector('[data-ig-sel]').textContent = `${sel.length} gönderi seçildi`;
    box.querySelector('[data-ig-photos]').textContent = `· ${photos} fotoğraf`;
    importBtn.disabled = working || !photos;
  }

  grid.addEventListener('click', (e) => {
    const b = e.target.closest('.ig-it__btn');
    if (!b || working) return;
    const id = b.dataset.id;
    const p = items.find((x) => x.id === id);
    if (!p) return;
    if (isDone(p)) { alert('Bu gönderinin fotoğrafları zaten portfolyoda.'); return; }
    if (picked.has(id)) picked.delete(id); else picked.add(id);
    b.setAttribute('aria-pressed', picked.has(id) ? 'true' : 'false');
    b.parentElement.classList.toggle('is-sel', picked.has(id));
    sync();
  });

  box.querySelectorAll('[data-ig-filter]').forEach((t) => t.addEventListener('click', () => {
    filter = t.dataset.igFilter;
    box.querySelectorAll('[data-ig-filter]').forEach((x) => { x.classList.toggle('is-on', x === t); x.setAttribute('aria-pressed', x === t ? 'true' : 'false'); });
    render();
  }));
  box.querySelector('[data-ig-reload]').addEventListener('click', () => { if (!working) load(true); });
  more.addEventListener('click', () => load(false));
  box.querySelector('[data-ig-clear]').addEventListener('click', () => { if (working) return; picked.clear(); list.innerHTML = ''; render(); });

  // Yeni etiket: sitenin etiket listesine eklenir ve hemen seçili gelir
  const newTagBtn = box.querySelector('[data-ig-newtag]');
  newTagBtn.addEventListener('click', async () => {
    const name = (prompt('Yeni etiket adı (ör. Sinop, Sahil, Gün batımı):') || '').trim();
    if (!name) return;
    try {
      const res = await fetch('/admin/portfolyo-etiket-ekle', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ name }), credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'Etiket eklenemedi.');
      let input = [...tagBox.querySelectorAll('input')].find((i) => i.value === data.name);
      if (!input) {
        const label = el('label', 'tagpick__c');
        input = el('input'); input.type = 'checkbox'; input.value = data.name;
        label.append(input, el('span', null, data.name));
        tagBox.insertBefore(label, newTagBtn);
      }
      input.checked = true;
    } catch (err) { alert(err.message); }
  });

  importBtn.addEventListener('click', async () => {
    const tags = [...tagBox.querySelectorAll('input:checked')].map((i) => i.value);
    const jobs = [];
    for (const p of items.filter((x) => picked.has(x.id))) {
      p.photos.forEach((photoId, k) => jobs.push({ post: p, photoId, src: p.src[k], alt: (p.caption || '').split('\n')[0].replace(/#\S+/g, '').trim().slice(0, 160) }));
    }
    const max = Number(box.dataset.max) || 200;
    if (!jobs.length) return;
    if (jobs.length > max) { alert(`Tek seferde en fazla ${max} fotoğraf eklenebilir; daha az gönderi seçin.`); return; }
    working = true; sync();
    window.HM4Upload.busy(1);
    list.innerHTML = '';
    const rows = jobs.map((j, i) => { const li = el('li'); li.append(el('span', 'name', `Gönderi ${items.indexOf(j.post) + 1}${j.post.photos.length > 1 ? ` · foto ${j.post.photos.indexOf(j.photoId) + 1}` : ''}`), el('span', 'state', 'Sırada')); list.appendChild(li); return li; });
    let ok = 0, failed = 0, n = 0;
    async function worker() {
      while (n < jobs.length) {
        const i = n++;
        const j = jobs[i];
        const state = rows[i].querySelector('.state');
        try {
          state.textContent = 'İndiriliyor…';
          const res = await fetch(j.src, { credentials: 'same-origin' });
          if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `İndirilemedi (${res.status})`); }
          const blob = await res.blob();
          state.textContent = 'Ekleniyor…';
          await window.HM4Upload.uploadWithRetry(blob, { endpoint: '/admin/portfolyo', tags, headers: { 'X-Ig-Id': j.photoId, 'X-Ig-Post': j.post.id, 'X-Alt': encodeURIComponent(j.alt) } }, (k, m) => { state.textContent = `Tekrar deneniyor (${k}/${m})…`; });
          state.textContent = 'Tamam'; state.className = 'state ok'; ok++;
          j.post.added = Math.min(j.post.photos.length, j.post.added + 1);
        } catch (err) { state.textContent = err.message; state.className = 'state err'; failed++; }
      }
    }
    await Promise.all([worker(), worker()]);
    window.HM4Upload.busy(-1);
    working = false;
    picked.clear();
    const sum = el('li', 'uploader__summary');
    sum.appendChild(el('strong', null, `${ok} fotoğraf portfolyoya eklendi${failed ? `, ${failed} fotoğraf eklenemedi` : ''}.`));
    const again = el('button', 'btn btn--text btn--sm', 'Sayfayı yenile');
    again.type = 'button'; again.addEventListener('click', () => location.reload());
    sum.appendChild(again);
    list.prepend(sum);
    render();
  });

  load(true);
})();
