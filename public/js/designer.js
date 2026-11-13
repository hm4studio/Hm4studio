'use strict';
// Albüm tasarımcısı: çiftin albüm seçimi yapraklara dizilir, kadrajlanır, JPG olarak indirilir
// veya "Albüm tasarımı" sayfalarına aktarılır. Fotoğraflar tarayıcıda işlenir.
(function () {
  const root = document.querySelector('[data-designer]');
  if (!root) return;
  const base = root.dataset.base;
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => [...root.querySelectorAll(s)];
  const byId = (id) => document.getElementById(id);
  const num = (id) => parseFloat(byId(id).value) || 0;
  const pxToMm = (px) => px / 300 * 25.4;

  const S = { photos: [], pages: [], sheet: 0, variant: {}, crop: {}, cropMode: false, cropId: null, dims: {}, couple: {}, set: 'secim', nextId: 1 };
  const local = !base;
  const photoById = (id) => S.photos.find((p) => p.id === id);
  const status = (t) => { $('[data-status]').textContent = t; };

  const CFG_IDS = ['pw', 'ph', 'leaves', 'perPage', 'gapPx', 'cut', 'safe', 'foldM', 'sortMode', 'dpi', 'fullBleed'];
  function cfg() {
    return {
      pw: num('pw') * 10, ph: num('ph') * 10,
      leaves: Math.max(1, Math.round(num('leaves'))),
      gap: pxToMm(num('gapPx')), cut: num('cut'), safe: num('safe'), foldM: num('foldM'),
    };
  }
  function ensurePages() {
    const c = cfg();
    while (S.pages.length < c.leaves) S.pages.push([]);
  }

  // ── Kaydetme (taslak sunucuda; iPad'de kaldığınız yerden devam) ──
  let saveT = null;
  function snapshot() {
    const v = {};
    CFG_IDS.forEach((id) => { const el = byId(id); v[id] = el.type === 'checkbox' ? el.checked : el.value; });
    return { v: 1, set: S.set, cfg: v, pages: S.pages, variant: S.variant, crop: S.crop, sheet: S.sheet };
  }
  function scheduleSave() {
    if (local) return;
    $('[data-save]').textContent = 'Kaydediliyor…';
    clearTimeout(saveT);
    saveT = setTimeout(async () => {
      try {
        const r = await fetch(`${base}/tasarimci/taslak`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(snapshot()) });
        $('[data-save]').textContent = r.ok ? 'Kaydedildi' : 'Kaydedilemedi';
      } catch { $('[data-save]').textContent = 'Kaydedilemedi'; }
    }, 1200);
  }

  // ── Renk / ton (otomatik sıralama için, küçük önizlemeden) ──
  function colorInfo(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    const l = (mx + mn) / 2 / 255, s = mx === 0 ? 0 : d / mx;
    let hh = 0;
    if (d > 0) {
      if (mx === r) hh = ((g - b) / d) % 6; else if (mx === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4;
      hh *= 60; if (hh < 0) hh += 360;
    }
    return { h: hh, s, l };
  }
  async function ensureColor(p) {
    if (p.col) return;
    try {
      const img = new Image(); img.src = p.thumb; await img.decode();
      const c = document.createElement('canvas'); c.width = c.height = 16;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, 16, 16);
      const d = x.getImageData(0, 0, 16, 16).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4;
      p.col = colorInfo(r / n, g / n, b / n);
    } catch { p.col = { h: 0, s: 0, l: 0.5 }; }
  }
  function sortPhotos(list) {
    const arr = [...list];
    if (byId('sortMode').value !== 'color') return arr.sort((a, b) => (b.cover - a.cover) || a.name.localeCompare(b.name, 'tr', { numeric: true }));
    const mono = (p) => p.col.s < 0.12;
    return arr.sort((a, b) => {
      if (a.cover !== b.cover) return b.cover - a.cover;
      if (mono(a) !== mono(b)) return mono(a) ? 1 : -1;
      if (mono(a)) return a.col.l - b.col.l;
      const ha = Math.floor(a.col.h / 30), hb = Math.floor(b.col.h / 30);
      return ha !== hb ? ha - hb : a.col.l - b.col.l;
    });
  }

  // ── Yapraklara dağıtım ──
  function chunkPages(list, mode) {
    const pages = []; let i = 0;
    while (i < list.length) {
      const left = list.length - i;
      const c = mode === 'mix' ? (left <= 4 ? left : (left === 6 ? 3 : 4)) : Math.min(mode, left);
      pages.push(list.slice(i, i + c).map((p) => p.id)); i += c;
    }
    return pages;
  }
  function planPages(list, leaves) {
    const N = list.length;
    let sizes;
    if (N >= 3 * leaves && N <= 4 * leaves) {
      const fours = N - 3 * leaves; sizes = [];
      for (let i = 0; i < leaves; i++) sizes.push(Math.floor((i + 1) * fours / leaves) > Math.floor(i * fours / leaves) ? 4 : 3);
    } else {
      const b = Math.floor(N / leaves), extra = N % leaves;
      sizes = Array.from({ length: leaves }, (_, i) => b + (i < extra ? 1 : 0));
    }
    const pages = []; let i = 0;
    sizes.forEach((s) => { pages.push(list.slice(i, i + s).map((p) => p.id)); i += s; });
    return pages;
  }
  async function autoBuild() {
    if (!S.photos.length) { status('Bu çiftin albüm seçiminde fotoğraf yok.'); return; }
    if (S.pages.some((l) => l.length) && !window.confirm('Mevcut yerleşim silinip fotoğraflar yeniden dizilsin mi?')) return;
    if (byId('sortMode').value === 'color') { status('Fotoğrafların tonları inceleniyor…'); await Promise.all(S.photos.map(ensureColor)); }
    if (S.photos.length > 5 * cfg().leaves) byId('leaves').value = Math.ceil(S.photos.length / 5);
    const c = cfg();
    const per = byId('perPage').value;
    const mode = per === 'mix' ? 'mix' : parseInt(per, 10);
    const sorted = sortPhotos(S.photos);
    const pages = mode === 'mix' ? planPages(sorted, c.leaves) : chunkPages(sorted, mode);
    const leftover = pages.slice(c.leaves).reduce((s, p) => s + p.length, 0);
    S.pages = pages.slice(0, c.leaves);
    ensurePages();
    S.sheet = 0; S.variant = {};
    const used = S.pages.filter((p) => p.length).length, blank = c.leaves - used;
    status(`${S.photos.length} fotoğraf ${used} yaprağa yerleşti.${blank > 0 ? ` ${blank} yaprak boş.` : ''}${leftover ? ` ${leftover} fotoğraf sığmadı.` : ''}`);
    render(); scheduleSave();
  }

  // ── Yerleşim şablonları (mm cinsinden) ──
  function fitAll(ars, area, gap) {
    const n = ars.length, out = [];
    for (let mask = 0; mask < (1 << (n - 1)); mask++) {
      const rows = []; let cur = [0];
      for (let i = 1; i < n; i++) { if (mask & (1 << (i - 1))) { rows.push(cur); cur = [i]; } else cur.push(i); }
      rows.push(cur);
      const availH = area.h - gap * (rows.length - 1);
      const hs = rows.map((r) => (area.w - gap * (r.length - 1)) / r.reduce((s, i) => s + ars[i], 0));
      const sumH = hs.reduce((a, b) => a + b, 0);
      if (availH <= 0 || sumH <= 0) continue;
      const k = availH / sumH, rects = new Array(n); let y = 0;
      rows.forEach((r, ri) => {
        const hh = hs[ri] * k, sumAr = r.reduce((s, i) => s + ars[i], 0), avW = area.w - gap * (r.length - 1);
        let x = 0;
        r.forEach((i) => { const w = avW * ars[i] / sumAr; rects[i] = { x, y, w, h: hh }; x += w + gap; });
        y += hh + gap;
      });
      out.push({ score: Math.abs(Math.log(k)), rects });
    }
    return out;
  }
  function splitH(A, ratios, g) {
    const tot = A.h - g * (ratios.length - 1), sum = ratios.reduce((a, b) => a + b, 0); let y = A.y;
    return ratios.map((r) => { const hh = tot * r / sum; const s = { x: A.x, y, w: A.w, h: hh }; y += hh + g; return s; });
  }
  function splitW(A, ratios, g) {
    const tot = A.w - g * (ratios.length - 1), sum = ratios.reduce((a, b) => a + b, 0); let x = A.x;
    return ratios.map((r) => { const w = tot * r / sum; const s = { x, y: A.y, w, h: A.h }; x += w + g; return s; });
  }
  function fitIn(ar, s) {
    let w = s.w, hh = w / ar;
    if (hh > s.h) { hh = s.h; w = hh * ar; }
    return { x: s.x + (s.w - w) / 2, y: s.y + (s.h - hh) / 2, w, h: hh };
  }
  function templates(a, A, g) {
    const n = a.length, out = [];
    if (n === 1) {
      out.push([A]);
      out.push([{ x: A.x + A.w * 0.12, y: A.y + A.h * 0.12, w: A.w * 0.76, h: A.h * 0.76 }]);
    } else if (n === 2) {
      out.push(splitW(A, a, g));
      out.push(splitH(A, a.map((x) => 1 / x), g));
      const t = splitH(A, [0.64, 0.36], g); out.push([t[0], t[1]]);
      const l = splitW(A, [0.62, 0.38], g); out.push([l[0], l[1]]);
    }
    return out;
  }
  function layoutTemplates(ars, area, gap, variant) {
    const scored = templates(ars, area, gap).map((slots) => {
      const fits = slots.map((s, i) => fitIn(ars[i], s));
      const cov = fits.reduce((acc, f, i) => acc + (f.w * f.h) / (slots[i].w * slots[i].h), 0) / ars.length;
      return { cov, fits };
    });
    scored.sort((p, q) => q.cov - p.cov);
    return scored[variant % scored.length].fits;
  }
  function layoutRef(n, A, g, variant) {
    const v = variant % 2;
    let slots;
    if (n === 3) {
      if (v === 0) slots = splitW(A, [1, 1, 1], g);
      else { const c = splitW(A, [0.6, 0.4], g); const p = splitH(c[1], [1, 1], g); slots = [c[0], p[0], p[1]]; }
    } else if (n === 4) {
      if (v === 0) { const c = splitW(A, [0.40, 0.19, 0.40], g); const p = splitH(c[1], [1, 1], g); slots = [c[0], p[0], p[1], c[2]]; }
      else { const c = splitW(A, [1, 1], g); const a = splitH(c[0], [1, 1], g), b = splitH(c[1], [1, 1], g); slots = [a[0], b[0], a[1], b[1]]; }
    } else {
      if (v === 0) { const c = splitW(A, [0.285, 0.137, 0.164, 0.414], g); const p = splitH(c[1], [1, 1], g); slots = [c[0], p[0], p[1], c[2], c[3]]; }
      else { const r = splitH(A, [1, 1], g); slots = [...splitW(r[0], [1, 1], g), ...splitW(r[1], [1, 1, 1], g)]; }
    }
    return slots;
  }
  function layout(ars, area, gap, variant) {
    const n = ars.length;
    if (!n) return [];
    if (n <= 2) return layoutTemplates(ars, area, gap, variant);
    if (n <= 5) return layoutRef(n, area, gap, variant);
    const rowC = fitAll(ars, { w: area.w, h: area.h }, gap);
    const colC = fitAll(ars.map((a) => 1 / a), { w: area.h, h: area.w }, gap)
      .map((c) => ({ score: c.score, rects: c.rects.map((r) => ({ x: r.y, y: r.x, w: r.h, h: r.w })) }));
    const all = [...rowC, ...colC].sort((p, q) => p.score - q.score);
    if (!all.length) return [];
    return all[variant % all.length].rects.map((r) => ({ x: area.x + r.x, y: area.y + r.y, w: r.w, h: r.h }));
  }
  function spreadArea(c) {
    const m = byId('fullBleed').checked ? -c.cut : c.cut + c.safe;
    return { x: m, y: m, w: 2 * c.pw - 2 * m, h: c.ph - 2 * m };
  }
  const arOf = (p) => (p.w && p.h ? p.w / p.h : 1.5);
  const rectsFor = (leaf, c) => layout((S.pages[leaf] || []).map((id) => arOf(photoById(id))), spreadArea(c), c.gap, S.variant[leaf] || 0);

  // ── Kadraj ──
  const cropOf = (id) => S.crop[id] || (S.crop[id] = { z: 1, ox: 0, oy: 0 });
  function geom(iw, ih, W, H, cr) {
    const s = Math.max(W / iw, H / ih) * cr.z, w = iw * s, hh = ih * s;
    const mx = Math.max(0, (w - W) / 2), my = Math.max(0, (hh - H) / 2);
    const ox = Math.max(-mx, Math.min(mx, cr.ox * W)), oy = Math.max(-my, Math.min(my, cr.oy * H));
    cr.ox = W ? ox / W : 0; cr.oy = H ? oy / H : 0;
    return { s, w, h: hh, left: (W - w) / 2 + ox, top: (H - hh) / 2 + oy };
  }
  function applyImg(im, p, W, H, cr) {
    const g = geom(p.w || 3, p.h || 2, W, H, cr);
    im.style.width = `${g.w}px`; im.style.height = `${g.h}px`; im.style.left = `${g.left}px`; im.style.top = `${g.top}px`;
  }

  // ── Yerleri değiştirme ──
  const locate = (id) => { for (let p = 0; p < S.pages.length; p++) { const i = S.pages[p].indexOf(id); if (i >= 0) return { p, i }; } return null; };
  const removeFromLeaves = (id) => S.pages.forEach((l) => { const i = l.indexOf(id); if (i >= 0) l.splice(i, 1); });
  function moveTo(id, leaf, idx) {
    ensurePages();
    if (!S.pages[leaf]) return;
    const from = locate(id);
    if (from && from.p === leaf && idx != null && idx < S.pages[leaf].length) {
      const L = S.pages[leaf]; const other = L[idx]; L[idx] = id; L[from.i] = other; return;
    }
    removeFromLeaves(id);
    const L = S.pages[leaf];
    if (idx == null || idx > L.length) idx = L.length;
    L.splice(idx, 0, id);
  }

  // ── Sürükle-bırak (dokunmatik + fare) ──
  let drag = null;
  function startDrag(e, src) {
    e.preventDefault();
    const ghost = document.createElement('img');
    ghost.className = 'dz-ghost'; ghost.src = photoById(src.id).thumb; ghost.alt = '';
    document.body.appendChild(ghost);
    drag = { src, ghost, sx: e.clientX, sy: e.clientY, moved: false };
    placeGhost(e);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', endDrag);
  }
  function placeGhost(e) { drag.ghost.style.left = `${e.clientX}px`; drag.ghost.style.top = `${e.clientY}px`; drag.ghost.hidden = !drag.moved; }
  function onMove(e) {
    if (!drag) return;
    e.preventDefault();
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 8) drag.moved = true;
    placeGhost(e);
    $$('.is-over').forEach((x) => x.classList.remove('is-over'));
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const t = el && (el.closest('.dz-cell') || el.closest('[data-drop-leaf]') || el.closest('[data-thumbs]'));
    if (t && drag.moved) t.classList.add('is-over');
  }
  function endDrag() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', endDrag);
    $$('.is-over').forEach((x) => x.classList.remove('is-over'));
    const d = drag; drag = null;
    if (d) d.ghost.remove();
    return d;
  }
  function onUp(e) {
    const d = endDrag();
    if (!d) return;
    if (!d.moved) {
      if (d.src.type === 'cell') { S.cropId = d.src.id; render(); }
      else if (d.src.type === 'mini') { S.sheet = d.src.leaf; render(); }
      else if (d.src.type === 'thumb') { moveTo(d.src.id, S.sheet, null); render(); scheduleSave(); }
      return;
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el) {
      const cell = el.closest('.dz-cell'), zone = el.closest('[data-drop-leaf]'), tray = el.closest('[data-thumbs]');
      if (cell) moveTo(d.src.id, +cell.dataset.leaf, +cell.dataset.idx);
      else if (zone) moveTo(d.src.id, +zone.dataset.dropLeaf, null);
      else if (tray) removeFromLeaves(d.src.id);
      else return;
    }
    render(); scheduleSave();
  }

  let pan = null;
  function startPan(e, id, el) {
    e.preventDefault();
    S.cropId = id;
    const cr = cropOf(id);
    $('[data-zoom]').value = cr.z;
    $$('.dz-cell.is-sel').forEach((x) => x.classList.remove('is-sel'));
    el.classList.add('is-sel');
    pan = { id, el, sx: e.clientX, sy: e.clientY, ox0: cr.ox, oy0: cr.oy, W: el.offsetWidth, H: el.offsetHeight };
    window.addEventListener('pointermove', onPan, { passive: false });
    window.addEventListener('pointerup', endPan);
    window.addEventListener('pointercancel', endPan);
  }
  function onPan(e) {
    if (!pan) return;
    e.preventDefault();
    const cr = cropOf(pan.id);
    cr.ox = pan.ox0 + (e.clientX - pan.sx) / pan.W;
    cr.oy = pan.oy0 + (e.clientY - pan.sy) / pan.H;
    applyImg(pan.el.querySelector('img'), photoById(pan.id), pan.W, pan.H, cr);
  }
  function endPan() {
    window.removeEventListener('pointermove', onPan);
    window.removeEventListener('pointerup', endPan);
    window.removeEventListener('pointercancel', endPan);
    pan = null;
    render(); scheduleSave();
  }

  // ── Çizim ──
  function renderThumbs() {
    const t = $('[data-thumbs]'); t.textContent = '';
    let placed = 0;
    S.photos.forEach((p) => {
      const used = Boolean(locate(p.id));
      if (used) placed++;
      const d = document.createElement('div');
      d.className = `dz-thumb${used ? ' is-used' : ''}`;
      const im = new Image(); im.src = p.thumb; im.alt = p.name; im.draggable = false; im.loading = 'lazy'; im.decoding = 'async';
      d.appendChild(im);
      if (p.edited) { const b = document.createElement('span'); b.className = 'dz-badge'; b.textContent = 'D'; b.title = 'Düzenlenmiş hali kullanılıyor'; d.appendChild(b); }
      if (p.cover) { const b = document.createElement('span'); b.className = 'dz-badge dz-badge--cover'; b.textContent = 'Kapak'; d.appendChild(b); }
      d.title = p.name;
      d.addEventListener('pointerdown', (e) => startDrag(e, { type: 'thumb', id: p.id }));
      t.appendChild(d);
    });
    $('[data-tray-count]').textContent = `${placed} / ${S.photos.length} yerleşti`;
  }

  function renderStrip() {
    const st = $('[data-strip]'); st.textContent = '';
    const c = cfg();
    for (let i = 0; i < c.leaves; i++) {
      const L = S.pages[i] || [];
      const box = document.createElement('div');
      box.className = `dz-leaf${i === S.sheet ? ' is-cur' : ''}`;
      box.dataset.dropLeaf = i;
      const mini = document.createElement('div');
      mini.className = 'dz-leaf__mini';
      const rects = rectsFor(i, c), k = 1 / (2 * c.pw);
      L.forEach((id, j) => {
        const p = photoById(id), r = rects[j]; if (!p || !r) return;
        const im = new Image(); im.src = p.thumb; im.draggable = false; im.alt = ''; im.loading = 'lazy';
        im.style.left = `${r.x * k * 100}%`; im.style.top = `${(r.y / c.ph) * 100}%`;
        im.style.width = `${r.w * k * 100}%`; im.style.height = `${(r.h / c.ph) * 100}%`;
        im.addEventListener('pointerdown', (e) => startDrag(e, { type: 'mini', id, leaf: i }));
        mini.appendChild(im);
      });
      mini.style.aspectRatio = `${2 * c.pw} / ${c.ph}`;
      box.appendChild(mini);
      const lab = document.createElement('span');
      lab.textContent = `${i + 1}. yaprak · ${L.length}`;
      box.appendChild(lab);
      box.addEventListener('click', () => { S.sheet = i; render(); });
      st.appendChild(box);
    }
    const cur = st.children[S.sheet];
    if (cur && cur.scrollIntoView && !drag) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function render() {
    ensurePages();
    const c = cfg();
    if (S.sheet > c.leaves - 1) S.sheet = c.leaves - 1;
    const wrap = $('[data-wrap]');
    const availW = (wrap.clientWidth || 600) - 32;
    const availH = Math.max(220, window.innerHeight * 0.52);
    const s = Math.min(availW / (2 * c.pw), availH / c.ph);
    const sp = $('[data-spread]');
    sp.style.width = `${2 * c.pw * s}px`; sp.style.height = `${c.ph * s}px`;
    sp.textContent = '';
    sp.dataset.dropLeaf = S.sheet;
    const area = spreadArea(c);
    const safe = document.createElement('div');
    safe.className = 'dz-guide';
    const m = c.cut + c.safe;
    Object.assign(safe.style, { left: `${m * s}px`, top: `${m * s}px`, width: `${(2 * c.pw - 2 * m) * s}px`, height: `${(c.ph - 2 * m) * s}px` });
    sp.appendChild(safe);
    const ids = S.pages[S.sheet] || [];
    const rects = layout(ids.map((id) => arOf(photoById(id))), area, c.gap, S.variant[S.sheet] || 0);
    ids.forEach((id, i) => {
      const r = rects[i], p = photoById(id);
      if (!r || !p) return;
      const d = document.createElement('div');
      d.className = `dz-cell${S.cropMode && S.cropId === id ? ' is-sel' : ''}`;
      d.dataset.leaf = S.sheet; d.dataset.idx = i;
      Object.assign(d.style, { left: `${r.x * s}px`, top: `${r.y * s}px`, width: `${r.w * s}px`, height: `${r.h * s}px` });
      const im = new Image(); im.src = p.src; im.alt = p.name; im.draggable = false; im.decoding = 'async';
      d.appendChild(im);
      applyImg(im, p, r.w * s, r.h * s, cropOf(id));
      S.dims[id] = { W: r.w * s, H: r.h * s };
      d.addEventListener('pointerdown', (e) => (S.cropMode ? startPan(e, id, d) : startDrag(e, { type: 'cell', id })));
      sp.appendChild(d);
    });
    const fold = document.createElement('div');
    fold.className = 'dz-fold';
    fold.style.left = `${c.pw * s}px`;
    fold.style.width = `${2 * c.foldM * s}px`;
    sp.appendChild(fold);
    if (!ids.length) {
      const e = document.createElement('p');
      e.className = 'dz-empty';
      e.textContent = 'Boş yaprak · soldan fotoğraf sürükleyin';
      sp.appendChild(e);
    }
    $('[data-sheet-label]').textContent = `Yaprak ${S.sheet + 1} / ${c.leaves}`;
    const sel = S.cropId && photoById(S.cropId);
    $('[data-crop-label]').textContent = sel ? sel.name : 'Bir fotoğrafa dokunun';
    renderThumbs();
    renderStrip();
  }

  // ── Dışa aktarma ──
  const fullCache = new Map();
  function loadFull(p) {
    if (fullCache.has(p.id)) return fullCache.get(p.id);
    const pr = new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => { const f = new Image(); f.onload = () => res(f); f.onerror = rej; f.src = p.src; }; im.src = p.full; });
    fullCache.set(p.id, pr);
    if (fullCache.size > 8) fullCache.delete(fullCache.keys().next().value);
    return pr;
  }
  async function renderLeaf(leaf, k) {
    const c = cfg();
    const cv = document.createElement('canvas');
    cv.width = Math.round(2 * c.pw * k); cv.height = Math.round(c.ph * k);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.imageSmoothingQuality = 'high';
    const ids = S.pages[leaf] || [];
    const rects = rectsFor(leaf, c);
    for (let i = 0; i < ids.length; i++) {
      const p = photoById(ids[i]), r = rects[i];
      if (!p || !r) continue;
      const full = await loadFull(p);
      const dw = r.w * k, dh = r.h * k;
      const g = geom(full.naturalWidth, full.naturalHeight, dw, dh, { ...cropOf(p.id) });
      ctx.drawImage(full, -g.left / g.s, -g.top / g.s, dw / g.s, dh / g.s, r.x * k, r.y * k, dw, dh);
    }
    return cv;
  }
  const toBlob = (cv, q) => new Promise((res) => cv.toBlob(res, 'image/jpeg', q));
  function printScale() {
    const c = cfg();
    let k = parseInt(byId('dpi').value, 10) / 25.4;
    const px = (2 * c.pw * k) * (c.ph * k);
    if (px > 16e6) k *= Math.sqrt(16e6 / px);
    return k;
  }
  const leafName = (i) => `${S.couple.refNo ? `${S.couple.refNo} ` : ''}${S.couple.name || 'Albüm'} - Yaprak ${String(i + 1).padStart(2, '0')}.jpg`.replace(/[\\/:*?"<>|]+/g, '-');
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async function exportLeaves(which) {
    const list = which === 'one' ? [S.sheet] : S.pages.map((l, i) => (l.length ? i : -1)).filter((i) => i >= 0);
    if (!list.length || !(S.pages[list[0]] || []).length) { status('Bu yaprak boş.'); return; }
    const k = printScale(), dpi = Math.round(k * 25.4);
    busy(true);
    try {
      for (let n = 0; n < list.length; n++) {
        status(`Hazırlanıyor: ${n + 1} / ${list.length} yaprak (${dpi} DPI)…`);
        const cv = await renderLeaf(list[n], k);
        download(await toBlob(cv, 0.92), leafName(list[n]));
        cv.width = cv.height = 0;
        await new Promise((r) => setTimeout(r, 400));
      }
      status(`${list.length} yaprak indirildi (${dpi} DPI${dpi < parseInt(byId('dpi').value, 10) ? ', tarayıcı sınırı nedeniyle düşürüldü' : ''}).`);
    } catch { status('Bir fotoğraf yüklenemedi; bağlantıyı kontrol edip yeniden deneyin.'); }
    busy(false);
  }
  // Tasarım sayfaları: her dolu yaprak "Yaprak 01.jpg" adıyla Albüm sekmesine yüklenir (aynı ad yerine geçer)
  async function sendToAlbum() {
    const list = S.pages.map((l, i) => (l.length ? i : -1)).filter((i) => i >= 0);
    if (!list.length) { status('Önce fotoğrafları yapraklara yerleştirin.'); return; }
    if (!window.confirm(`${list.length} yaprak, çiftin "Albüm tasarımı" bölümüne aktarılsın mı? Aynı adlı eski sayfaların yerine geçer. Çifte göndermeyi çift sayfasından siz yaparsınız.`)) return;
    busy(true);
    try {
      for (let n = 0; n < list.length; n++) {
        status(`Aktarılıyor: ${n + 1} / ${list.length}…`);
        const c = cfg();
        const k = 2400 / (2 * c.pw);
        const cv = await renderLeaf(list[n], k);
        const display = await toBlob(cv, 0.86);
        const t = document.createElement('canvas');
        const tk = 900 / cv.width; t.width = 900; t.height = Math.round(cv.height * tk);
        t.getContext('2d').drawImage(cv, 0, 0, t.width, t.height);
        const thumb = await toBlob(t, 0.8);
        const r = await fetch(`${base}/album-sayfa`, {
          method: 'POST', credentials: 'same-origin', body: new Blob([thumb, display]),
          headers: { 'X-CSRF-Token': csrf, 'X-Parts': `thumb:${thumb.size},display:${display.size}`, 'X-Filename': encodeURIComponent(`Yaprak ${String(list[n] + 1).padStart(2, '0')}.jpg`), 'Content-Type': 'application/octet-stream' },
        });
        if (!r.ok) throw new Error('upload');
      }
      status('Aktarıldı. Çift sayfasına yönlendiriliyorsunuz…');
      window.location.href = `${base}#album`;
    } catch { status('Aktarım yarıda kaldı; yeniden deneyin.'); busy(false); }
  }
  function busy(on) { $$('[data-export],[data-send],[data-auto]').forEach((b) => { b.disabled = on; }); }

  // ── Olaylar ──
  $$('[data-cfg]').forEach((el) => el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', () => { render(); scheduleSave(); }));
  $('[data-auto]').addEventListener('click', autoBuild);
  $('[data-toggle-settings]').addEventListener('click', (e) => {
    const box = byId('dz-settings'); box.hidden = !box.hidden;
    e.currentTarget.setAttribute('aria-expanded', String(!box.hidden));
    render();
  });
  $$('[data-go]').forEach((b) => b.addEventListener('click', () => { S.sheet = Math.min(cfg().leaves - 1, Math.max(0, S.sheet + Number(b.dataset.go))); render(); }));
  $('[data-variant]').addEventListener('click', () => { S.variant[S.sheet] = (S.variant[S.sheet] || 0) + 1; render(); scheduleSave(); });
  $('[data-crop]').addEventListener('click', (e) => {
    S.cropMode = !S.cropMode;
    e.currentTarget.setAttribute('aria-pressed', String(S.cropMode));
    $('[data-crop-panel]').hidden = !S.cropMode;
    root.classList.toggle('is-crop', S.cropMode);
    render();
  });
  $$('[data-nudge]').forEach((b) => b.addEventListener('click', () => {
    if (!S.cropId) { status('Önce bir fotoğrafa dokunun.'); return; }
    const [dx, dy] = b.dataset.nudge.split(',').map(Number);
    const cr = cropOf(S.cropId); cr.ox += dx * 0.05; cr.oy += dy * 0.05;
    render(); scheduleSave();
  }));
  $('[data-zoom]').addEventListener('input', (e) => { if (!S.cropId) return; cropOf(S.cropId).z = parseFloat(e.target.value); render(); scheduleSave(); });
  $('[data-fit]').addEventListener('click', () => {
    const d = S.dims[S.cropId], p = photoById(S.cropId);
    if (!d || !p) return;
    const cr = cropOf(S.cropId);
    const contain = Math.min(d.W / p.w, d.H / p.h), cover = Math.max(d.W / p.w, d.H / p.h);
    cr.z = Math.max(0.3, contain / cover); cr.ox = 0; cr.oy = 0;
    $('[data-zoom]').value = cr.z;
    render(); scheduleSave();
  });
  $$('[data-export]').forEach((b) => b.addEventListener('click', () => exportLeaves(b.dataset.export)));
  const sendBtn = $('[data-send]');
  if (sendBtn) sendBtn.addEventListener('click', sendToAlbum);
  $('[data-source]').addEventListener('change', (e) => {
    if (local && S.photos.length && !window.confirm('Sıfırdan albüm kaydedilmez. Bu çalışmadan çıkılsın mı?')) { e.target.value = ''; return; }
    window.location.href = e.target.value ? `/admin/album?cift=${e.target.value}` : '/admin/album';
  });
  $$('[data-set-btn]').forEach((b) => b.addEventListener('click', () => {
    const want = b.dataset.setBtn;
    if (want === S.set) return;
    if (S.pages.some((l) => l.length) && !window.confirm('Fotoğraf grubu değişince mevcut yerleşim sıfırlanır. Devam edilsin mi?')) return;
    S.pages = []; S.variant = {}; S.crop = {}; S.sheet = 0;
    load(want, true);
  }));

  // ── Sıfırdan albüm: fotoğraflar cihazdan, tarayıcıda küçültülür (sunucuya gitmez) ──
  async function shrink(img, edge, q) {
    const k = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const b = await toBlob(c, q); c.width = c.height = 0;
    return URL.createObjectURL(b);
  }
  async function addFiles(files) {
    const list = [...files].filter((f) => /^image\//.test(f.type));
    const failed = [];
    busy(true);
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      status(`Hazırlanıyor: ${i + 1} / ${list.length}…`);
      const url = URL.createObjectURL(f);
      const img = new Image(); img.src = url;
      try { await img.decode(); } catch { failed.push(f.name); URL.revokeObjectURL(url); continue; }
      S.photos.push({ id: S.nextId++, name: f.name, w: img.naturalWidth, h: img.naturalHeight, thumb: await shrink(img, 600, 0.8), src: await shrink(img, 1800, 0.86), full: url, edited: false, cover: false });
    }
    busy(false);
    render();
    status(`${S.photos.length} fotoğraf hazır.${failed.length ? ` Okunamayan: ${failed.join(', ')}.` : ' "Otomatik diz" ile yerleştirin.'} Sıfırdan albüm kaydedilmez; bitince yaprakları indirin.`);
  }
  const fileInput = $('[data-files]');
  if (fileInput) fileInput.addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
  window.addEventListener('beforeunload', (e) => { if (local && S.photos.length) { e.preventDefault(); e.returnValue = ''; } });
  let rz = null;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(render, 120); });

  // ── Başlangıç ──
  function applyDraft(d) {
    CFG_IDS.forEach((id) => { if (d.cfg[id] === undefined) return; const el = byId(id); if (el.type === 'checkbox') el.checked = Boolean(d.cfg[id]); else el.value = d.cfg[id]; });
    const ok = new Set(S.photos.map((p) => p.id));
    S.pages = (d.pages || []).map((l) => l.filter((id) => ok.has(id)));
    S.variant = d.variant || {}; S.crop = d.crop || {}; S.sheet = d.sheet || 0;
  }
  async function load(want, switching) {
    try {
      const r = await fetch(`${base}/tasarimci.json${want ? `?set=${want}` : ''}`, { credentials: 'same-origin' });
      const data = await r.json();
      S.couple = data.couple; S.photos = data.photos; S.set = data.set;
      const box = $('[data-set]');
      box.hidden = !(data.favCount && data.editedCount);
      $('[data-n="secim"]').textContent = data.favCount; $('[data-n="duzenli"]').textContent = data.editedCount;
      $$('[data-set-btn]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.setBtn === S.set)));
      const d = data.draft;
      if (!switching && d && d.cfg && (d.set || 'secim') === S.set) applyDraft(d);
      else if (!switching && !d) {
        const m = String(data.size || '').match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/i);
        if (m) { byId('pw').value = m[1].replace(',', '.'); byId('ph').value = m[2].replace(',', '.'); }
        const pg = parseInt(data.pagesHint, 10);
        if (pg) byId('leaves').value = Math.max(1, Math.round(pg / 2));
      }
      render();
      if (switching) scheduleSave();
      const edited = S.photos.filter((p) => p.edited).length;
      const what = S.set === 'duzenli' ? 'düzenlenmiş fotoğraf' : `albüm seçimi${edited ? `, ${edited} tanesi düzenlenmiş haliyle` : ''}`;
      if (!S.photos.length) status('Bu çiftte gösterilecek fotoğraf yok.');
      else status(`${S.photos.length} ${S.set === 'duzenli' ? what : `fotoğraf (${what})`}.${S.pages.some((l) => l.length) ? '' : ' "Otomatik diz" ile başlayın.'}`);
      $('[data-save]').textContent = d && !switching ? 'Taslak açıldı' : '';
    } catch { status('Fotoğraflar alınamadı. Sayfayı yenileyin.'); }
  }
  if (local) { render(); status('Cihazınızdan fotoğraf ekleyin ya da yukarıdan bir çift seçin.'); }
  else load('', false);
}());
