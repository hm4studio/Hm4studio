'use strict';
// Albüm paneli: fotoğraflar hikâye şeridinde (çekim saatine göre) sıralanır, şerit kesilerek yapraklara bölünür.
// Her yaprağa, fotoğraf sayısı ve yönlerine göre sol/sağ sayfayı ayrı düşünen şablonlar önerilir.
// Fotoğraflar tarayıcıda işlenir; çift albümünde taslak sunucuya kaydedilir.
(function () {
  const root = document.querySelector('[data-designer]');
  if (!root) return;
  const base = root.dataset.base;
  const local = !base;
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => [...root.querySelectorAll(s)];
  const byId = (id) => document.getElementById(id);
  const num = (id) => parseFloat(byId(id).value) || 0;
  const pxToMm = (px) => px / 300 * 25.4;
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  // pages: yapraklar (fotoğraf kimlikleri, hikâye sırasıyla) · out: albüme girmeyenler · tpl: yaprağın şablon anahtarı
  const S = { photos: [], pages: [[]], out: [], tpl: {}, crop: {}, sheet: 0, cropMode: false, sel: null, dims: {}, couple: {}, set: 'secim', nextId: 1 };
  const byPid = new Map();
  const photoById = (id) => byPid.get(id);
  const indexPhotos = () => { byPid.clear(); S.photos.forEach((p) => byPid.set(p.id, p)); };
  const status = (t) => { $('[data-status]').textContent = t; };

  const CFG_IDS = ['pw', 'ph', 'leaves', 'perPage', 'gapPx', 'cut', 'safe', 'foldM', 'sortMode', 'dpi', 'fullBleed'];
  function cfg() {
    return { pw: num('pw') * 10, ph: num('ph') * 10, leaves: Math.max(1, Math.round(num('leaves'))), gap: pxToMm(num('gapPx')), cut: num('cut'), safe: num('safe'), foldM: num('foldM') };
  }
  // Boş yaprakları at (açık olan hariç); şablon seçimleri yaprakla birlikte kayar
  function tidy() {
    const keep = [], tpl = {};
    let sheet = 0;
    S.pages.forEach((l, i) => {
      if (!(l.length || i === S.sheet || S.pages.length === 1)) return;
      if (S.tpl[i]) tpl[keep.length] = S.tpl[i];
      if (i === S.sheet) sheet = keep.length;
      keep.push(l);
    });
    S.pages = keep.length ? keep : [[]];
    S.tpl = tpl;
    S.sheet = Math.max(0, Math.min(sheet, S.pages.length - 1));
  }

  // ── Kaydetme ──
  let saveT = null;
  function snapshot() {
    const v = {};
    CFG_IDS.forEach((id) => { const e = byId(id); v[id] = e.type === 'checkbox' ? e.checked : e.value; });
    return { v: 2, set: S.set, cfg: v, pages: S.pages, tpl: S.tpl, crop: S.crop, sheet: S.sheet };
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

  // ── Sıralama ──
  function colorInfo(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    const l = (mx + mn) / 2 / 255, s = mx === 0 ? 0 : d / mx;
    let hh = 0;
    if (d > 0) { if (mx === r) hh = ((g - b) / d) % 6; else if (mx === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4; hh *= 60; if (hh < 0) hh += 360; }
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
      p.col = colorInfo(r / 256, g / 256, b / 256);
    } catch { p.col = { h: 0, s: 0, l: 0.5 }; }
  }
  const byName = (a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true });
  function sortPhotos(list) {
    const mode = byId('sortMode').value;
    const arr = [...list];
    if (mode === 'color') {
      const mono = (p) => (p.col ? p.col.s < 0.12 : false);
      const hue = (p) => (p.col ? Math.floor(p.col.h / 30) : 0), lum = (p) => (p.col ? p.col.l : 0.5);
      return arr.sort((a, b) => (b.cover - a.cover) || (mono(a) !== mono(b) ? (mono(a) ? 1 : -1) : mono(a) ? lum(a) - lum(b) : (hue(a) - hue(b)) || lum(a) - lum(b)));
    }
    if (mode === 'time') return arr.sort((a, b) => (b.cover - a.cover) || (a.shot && b.shot ? a.shot.localeCompare(b.shot) : a.shot ? -1 : b.shot ? 1 : 0) || byName(a, b));
    return arr.sort((a, b) => (b.cover - a.cover) || byName(a, b));
  }
  const SORT_LABEL = { time: '· çekim saatine göre', name: '· dosya adına göre', color: '· renk ve tona göre' };

  // ── Şablonlar (mm) ──
  function splitH(A, ratios, g) {
    const tot = A.h - g * (ratios.length - 1), sum = ratios.reduce((a, b) => a + b, 0); let y = A.y;
    return ratios.map((r) => { const hh = tot * r / sum; const s = { x: A.x, y, w: A.w, h: hh }; y += hh + g; return s; });
  }
  function splitW(A, ratios, g) {
    const tot = A.w - g * (ratios.length - 1), sum = ratios.reduce((a, b) => a + b, 0); let x = A.x;
    return ratios.map((r) => { const w = tot * r / sum; const s = { x, y: A.y, w, h: A.h }; x += w + g; return s; });
  }
  const inset = (B, fx, fy) => ({ x: B.x + B.w * fx, y: B.y + B.h * fy, w: B.w * (1 - 2 * fx), h: B.h * (1 - 2 * fy) });
  const centered = (B, ar) => { let w = B.w, hh = w / ar; if (hh > B.h) { hh = B.h; w = hh * ar; } return { x: B.x + (B.w - w) / 2, y: B.y + (B.h - hh) / 2, w, h: hh }; };
  // Sayfa düzenleri: B = içerik kutusu (kenar boşluklu), F = taşma payıyla bütün sayfa
  const PAGE = {
    0: { p0: () => [] },
    1: {
      full: (B, F) => [F],
      fill: (B) => [B],
      port: (B) => [centered(B, 2 / 3)],
      land: (B) => [centered(inset(B, 0, 0.12), 3 / 2)],
      mid: (B) => [inset(B, 0.16, 0.16)],
    },
    2: {
      cols: (B, F, g) => splitW(B, [1, 1], g),
      rows: (B, F, g) => splitH(B, [1, 1], g),
      colsIn: (B, F, g) => splitW(inset(B, 0.04, 0.16), [1, 1], g),
      bigSmall: (B, F, g) => splitW(B, [0.62, 0.38], g),
      fullCols: (B, F, g) => splitW(F, [1, 1], g),
    },
    3: {
      cols: (B, F, g) => splitW(B, [1, 1, 1], g),
      l1r2: (B, F, g) => { const c = splitW(B, [0.6, 0.4], g); return [c[0], ...splitH(c[1], [1, 1], g)]; },
      l2r1: (B, F, g) => { const c = splitW(B, [0.4, 0.6], g); return [...splitH(c[0], [1, 1], g), c[1]]; },
      t1b2: (B, F, g) => { const r = splitH(B, [0.56, 0.44], g); return [r[0], ...splitW(r[1], [1, 1], g)]; },
      t2b1: (B, F, g) => { const r = splitH(B, [0.44, 0.56], g); return [...splitW(r[0], [1, 1], g), r[1]]; },
      rows: (B, F, g) => splitH(B, [1, 1, 1], g),
    },
    4: {
      grid: (B, F, g) => { const r = splitH(B, [1, 1], g); return [...splitW(r[0], [1, 1], g), ...splitW(r[1], [1, 1], g)]; },
      one2one: (B, F, g) => { const c = splitW(B, [0.4, 0.2, 0.4], g); return [c[0], ...splitH(c[1], [1, 1], g), c[2]]; },
      l1r3: (B, F, g) => { const c = splitW(B, [0.6, 0.4], g); return [c[0], ...splitH(c[1], [1, 1, 1], g)]; },
      t1b3: (B, F, g) => { const r = splitH(B, [0.58, 0.42], g); return [r[0], ...splitW(r[1], [1, 1, 1], g)]; },
      cols: (B, F, g) => splitW(B, [1, 1, 1, 1], g),
    },
  };
  // Bütün yaprağa yayılan düzenler (katlamadan geçer)
  const SPREAD = {
    1: { pano: (A, F) => [F], panoIn: (A) => [A] },
    3: { panoCols: (A, F, g) => splitW(A, [1, 1, 1], g) },
  };
  const bleedOn = () => byId('fullBleed').checked;
  function boxes(c) {
    const m = bleedOn() ? 0 : c.cut + c.safe;
    const fm = bleedOn() ? 0 : c.foldM;
    return {
      L: { B: { x: m, y: m, w: c.pw - m - fm, h: c.ph - 2 * m }, F: { x: -c.cut, y: -c.cut, w: c.pw + c.cut, h: c.ph + 2 * c.cut } },
      R: { B: { x: c.pw + fm, y: m, w: c.pw - m - fm, h: c.ph - 2 * m }, F: { x: c.pw, y: -c.cut, w: c.pw + c.cut, h: c.ph + 2 * c.cut } },
      A: { x: m, y: m, w: 2 * c.pw - 2 * m, h: c.ph - 2 * m }, AF: { x: -c.cut, y: -c.cut, w: 2 * c.pw + 2 * c.cut, h: c.ph + 2 * c.cut },
    };
  }
  // n fotoğraf için bütün yaprak şablonları: anahtar "a.düzen|b.düzen" ya da "s.düzen"
  const tplCache = new Map();
  const cfgKey = (c) => `${c.pw}|${c.ph}|${c.gap}|${c.cut}|${c.safe}|${c.foldM}|${bleedOn()}`;
  function templatesFor(n, c) {
    const ck = `${n}|${cfgKey(c)}`;
    if (tplCache.has(ck)) return tplCache.get(ck);
    const X = boxes(c), out = [];
    for (let a = Math.max(0, n - 4); a <= Math.min(4, n); a++) {
      const b = n - a;
      if (n > 2 && (a === 0 || b === 0)) continue;
      for (const [lk, lf] of Object.entries(PAGE[a])) {
        for (const [rk, rf] of Object.entries(PAGE[b])) {
          out.push({ key: `${a}.${lk}|${b}.${rk}`, rects: [...lf(X.L.B, X.L.F, c.gap), ...rf(X.R.B, X.R.F, c.gap)] });
        }
      }
    }
    for (const [k, f] of Object.entries(SPREAD[n] || {})) out.push({ key: `s.${k}`, rects: f(X.A, X.AF, c.gap) });
    tplCache.set(ck, out);
    if (tplCache.size > 40) tplCache.delete(tplCache.keys().next().value);
    return out;
  }
  const arOf = (p) => (p && p.w && p.h ? p.w / p.h : 1.5);
  function permutations(n) {
    const res = [], a = [...Array(n).keys()];
    const go = (k) => { if (k === n) { res.push([...a]); return; } for (let i = k; i < n; i++) { [a[k], a[i]] = [a[i], a[k]]; go(k + 1); [a[k], a[i]] = [a[i], a[k]]; } };
    go(0); return res;
  }
  const PERMS = {};
  // Fotoğrafları yuvalara yerleştir: sırayı mümkün olduğunca koru, yönü uymayanı en az kırpmayla eşleştir
  function fitTemplate(t, ars) {
    const n = ars.length;
    const cost = (slot, ar) => Math.abs(Math.log((slot.w / slot.h) / ar));
    let best = null;
    const perms = n <= 5 ? (PERMS[n] || (PERMS[n] = permutations(n))) : [[...Array(n).keys()]];
    for (const pm of perms) {
      let sum = 0, worst = 0, moved = 0;
      for (let i = 0; i < n; i++) { const c = cost(t.rects[i], ars[pm[i]]); sum += c; worst = Math.max(worst, c); if (pm[i] !== i) moved++; }
      const score = sum / n + moved * 0.01;
      if (!best || score < best.score) best = { score, worst, order: pm };
    }
    return best;
  }
  const rankCache = new Map();
  function rankTemplates(ids, c) {
    const n = ids.length;
    if (!n) return { exact: [], near: [] };
    const ars = ids.map((id) => arOf(photoById(id)));
    const ck = `${ars.map((a) => a.toFixed(2)).join(',')}|${cfgKey(c)}`;
    if (rankCache.has(ck)) return rankCache.get(ck);
    const all = templatesFor(n, c).map((t) => {
      const f = fitTemplate(t, ars);
      const pages = t.key.split('|').map((x) => parseInt(x, 10) || 0);
      const balance = t.key.startsWith('s.') ? 0.05 : Math.abs(pages[0] - pages[1]) * 0.03;
      return { ...t, score: f.score + balance, worst: f.worst, order: f.order };
    }).sort((a, b) => a.score - b.score);
    const res = { exact: all.filter((t) => t.worst < 0.3), near: all.filter((t) => t.worst >= 0.3) };
    rankCache.set(ck, res);
    if (rankCache.size > 200) rankCache.delete(rankCache.keys().next().value);
    return res;
  }
  // Varsayılan: en iyi tam uyanlardan; art arda gelen yapraklarda aynı düzen tekrarlanmasın diye sırayla
  function defaultTemplate(i, rk) {
    const pool = rk.exact.length ? rk.exact : rk.near;
    const top = pool.filter((t) => t.score <= pool[0].score + 0.12).slice(0, 6);
    return top[i % top.length];
  }
  // Yaprağın son hali: [{ id, r }]
  function computeLeaf(i, c) {
    const ids = S.pages[i] || [];
    if (!ids.length) return [];
    const rk = rankTemplates(ids, c);
    const t = rk.exact.find((x) => x.key === S.tpl[i]) || rk.near.find((x) => x.key === S.tpl[i]) || defaultTemplate(i, rk);
    return t.order.map((pi, si) => ({ id: ids[pi], r: t.rects[si] }));
  }
  const currentKey = (i, c) => { const ids = S.pages[i] || []; if (!ids.length) return ''; const rk = rankTemplates(ids, c); return S.tpl[i] && [...rk.exact, ...rk.near].some((t) => t.key === S.tpl[i]) ? S.tpl[i] : defaultTemplate(i, rk).key; };

  // ── Kadraj ──
  const cropOf = (id) => S.crop[id] || (S.crop[id] = { z: 1, ox: 0, oy: 0 });
  function geom(iw, ih, W, H, cr) {
    const s = Math.max(W / iw, H / ih) * cr.z, w = iw * s, hh = ih * s;
    const mx = Math.max(0, (w - W) / 2), my = Math.max(0, (hh - H) / 2);
    const ox = Math.max(-mx, Math.min(mx, cr.ox * W)), oy = Math.max(-my, Math.min(my, cr.oy * H));
    cr.ox = W ? ox / W : 0; cr.oy = H ? oy / H : 0;
    return { s, w, h: hh, left: (W - w) / 2 + ox, top: (H - hh) / 2 + oy };
  }

  // ── Fotoğraf taşıma, kesme, birleştirme ──
  const locate = (id) => { for (let p = 0; p < S.pages.length; p++) { const i = S.pages[p].indexOf(id); if (i >= 0) return { p, i }; } return null; };
  function detach(id) {
    S.pages.forEach((l) => { const i = l.indexOf(id); if (i >= 0) l.splice(i, 1); });
    const o = S.out.indexOf(id); if (o >= 0) S.out.splice(o, 1);
  }
  function touched(...leaves) { leaves.forEach((l) => { if (l != null) delete S.tpl[l]; }); }
  function moveTo(id, leaf, idx) {
    const from = locate(id);
    if (from && idx != null && S.pages[leaf][idx] != null) {
      const other = S.pages[leaf][idx];
      S.pages[leaf][idx] = id; S.pages[from.p][from.i] = other;
      if (from.p !== leaf) touched(leaf, from.p);
      return;
    }
    detach(id);
    const L = S.pages[leaf];
    L.splice(idx == null || idx > L.length ? L.length : idx, 0, id);
    touched(leaf, from && from.p);
  }
  function removeFromAlbum(id) {
    const from = locate(id);
    detach(id); S.out.push(id);
    touched(from && from.p);
    if (S.sel === id) S.sel = null;
  }
  function shiftTpl(from, d) {
    const n = {};
    Object.entries(S.tpl).forEach(([k, v]) => { const i = +k; if (i < from) n[i] = v; else if (d > 0) n[i + d] = v; else if (i > from) n[i + d] = v; });
    S.tpl = n;
  }
  function cutAt(leaf, idx) {
    const L = S.pages[leaf];
    shiftTpl(leaf + 1, 1);
    S.pages.splice(leaf, 1, L.slice(0, idx), L.slice(idx));
    touched(leaf, leaf + 1);
    S.sheet = leaf + 1; S.sel = null;
  }
  function mergeAfter(leaf) {
    if (leaf + 1 >= S.pages.length) return;
    S.pages.splice(leaf, 2, [...S.pages[leaf], ...S.pages[leaf + 1]]);
    shiftTpl(leaf + 1, -1); touched(leaf);
    S.sheet = leaf; S.sel = null;
  }

  // ── Otomatik diz ──
  function planSizes(N, leaves, mode) {
    if (mode !== 'mix') { const out = []; for (let i = 0; i < N; i += mode) out.push(Math.min(mode, N - i)); return out; }
    if (N >= 3 * leaves && N <= 4 * leaves) {
      const fours = N - 3 * leaves;
      return Array.from({ length: leaves }, (_, i) => (Math.floor((i + 1) * fours / leaves) > Math.floor(i * fours / leaves) ? 4 : 3));
    }
    const b = Math.floor(N / leaves), extra = N % leaves;
    return Array.from({ length: leaves }, (_, i) => b + (i < extra ? 1 : 0)).filter((x) => x > 0);
  }
  async function autoBuild() {
    if (!S.photos.length) { status('Önce fotoğraf ekleyin.'); return; }
    const placed = S.pages.flat();
    if (placed.length && !window.confirm('Yerleşim silinip fotoğraflar yeniden dizilsin mi? (Albüm dışına aldıklarınız dışarıda kalır.)')) return;
    if (byId('sortMode').value === 'color') { status('Tonlar inceleniyor…'); await Promise.all(S.photos.map(ensureColor)); }
    const outSet = new Set(placed.length ? S.out : []);
    const keep = S.photos.filter((p) => !outSet.has(p.id));
    if (keep.length > 8 * cfg().leaves) byId('leaves').value = Math.ceil(keep.length / 8);
    const c = cfg(), per = byId('perPage').value;
    const sorted = sortPhotos(keep);
    const sizes = planSizes(sorted.length, c.leaves, per === 'mix' ? 'mix' : parseInt(per, 10));
    S.pages = []; let i = 0;
    sizes.forEach((s) => { S.pages.push(sorted.slice(i, i + s).map((p) => p.id)); i += s; });
    S.out = S.photos.filter((p) => outSet.has(p.id)).map((p) => p.id);
    S.tpl = {}; S.sheet = 0; S.sel = null;
    tidy();
    status(`${keep.length} fotoğraf ${S.pages.length} yaprağa dizildi. Şeritte iki fotoğraf arasına dokunarak yaprak bölebilirsiniz.`);
    render(); scheduleSave();
  }
  // Şeridi, yaprak büyüklüklerini koruyarak yeniden sırala
  function resort() {
    const all = S.pages.flat();
    S.out = sortPhotos(S.out.map(photoById).filter(Boolean)).map((p) => p.id);
    if (!all.length) return;
    const sizes = S.pages.map((l) => l.length);
    const sorted = sortPhotos(all.map(photoById)).map((p) => p.id);
    let i = 0; S.pages = sizes.map((s) => { const r = sorted.slice(i, i + s); i += s; return r; });
    S.tpl = {};
  }

  // ── Sürükle-bırak (dokunmatikte şerit kaydırılabilir; sürükleme şeride dik hareketle başlar) ──
  let drag = null;
  function clearGhosts() { document.querySelectorAll('.dz-ghost').forEach((g) => g.remove()); }
  function startDrag(e, src) {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (drag) endDrag();
    clearGhosts();
    if (e.pointerType === 'mouse' || src.type === 'cell') e.preventDefault();
    const ghost = el('img', 'dz-ghost'); ghost.src = photoById(src.id).thumb; ghost.alt = ''; ghost.hidden = true;
    document.body.appendChild(ghost);
    drag = { src, ghost, pid: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', endDrag);
  }
  function dropTarget(e) {
    const x = document.elementFromPoint(e.clientX, e.clientY);
    if (!x || !root.contains(x)) return null;
    const cell = x.closest('.dz-cell'); if (cell) return { el: cell, leaf: +cell.dataset.leaf, idx: +cell.dataset.idx };
    const th = x.closest('[data-tl-id]'); if (th) return { el: th, leaf: th.dataset.leaf === 'out' ? 'out' : +th.dataset.leaf, idx: +th.dataset.idx, insert: true };
    const grp = x.closest('[data-drop-leaf]'); if (grp) return { el: grp, leaf: grp.dataset.dropLeaf === 'out' ? 'out' : +grp.dataset.dropLeaf, idx: null };
    return null;
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    e.preventDefault();
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 8) drag.moved = true;
    drag.ghost.hidden = !drag.moved;
    drag.ghost.style.left = `${e.clientX}px`; drag.ghost.style.top = `${e.clientY}px`;
    $$('.is-over').forEach((x) => x.classList.remove('is-over'));
    const t = drag.moved && dropTarget(e);
    if (t) t.el.classList.add('is-over');
  }
  function endDrag() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', endDrag);
    $$('.is-over').forEach((x) => x.classList.remove('is-over'));
    const d = drag; drag = null; clearGhosts();
    return d;
  }
  function onUp(e) {
    if (drag && e.pointerId !== drag.pid) return;
    const d = endDrag();
    if (!d) return;
    const id = d.src.id;
    if (!d.moved) {
      if (d.src.type === 'cell') { S.sel = S.sel === id ? null : id; render(); return; }
      const at = locate(id);
      if (at) { S.sheet = at.p; S.sel = id; render(); return; }
      moveTo(id, S.sheet, null); render(); scheduleSave(); return; // albüm dışındakine dokunmak: açık yaprağa ekler
    }
    const t = dropTarget(e);
    if (!t) return;
    if (t.leaf === 'out') removeFromAlbum(id);
    else if (t.insert && d.src.type !== 'cell') {
      const from = locate(id);
      let idx = t.idx;
      if (from && from.p === t.leaf && from.i < idx) idx -= 1;
      detach(id);
      const L = S.pages[t.leaf];
      L.splice(Math.min(idx, L.length), 0, id); touched(t.leaf, from && from.p);
    } else moveTo(id, t.leaf, t.idx);
    tidy(); render(); scheduleSave();
  }
  let pan = null;
  function startPan(e, id, cell) {
    e.preventDefault();
    S.sel = id;
    const cr = cropOf(id);
    pan = { id, cell, sx: e.clientX, sy: e.clientY, ox0: cr.ox, oy0: cr.oy, W: S.dims[id].W, H: S.dims[id].H };
    window.addEventListener('pointermove', onPan, { passive: false });
    window.addEventListener('pointerup', endPan);
    window.addEventListener('pointercancel', endPan);
  }
  function onPan(e) {
    if (!pan) return;
    e.preventDefault();
    const cr = cropOf(pan.id);
    cr.ox = pan.ox0 + (e.clientX - pan.sx) / pan.W; cr.oy = pan.oy0 + (e.clientY - pan.sy) / pan.H;
    placeImg(pan.cell.querySelector('img'), photoById(pan.id), pan.cell._slot);
  }
  function endPan() {
    window.removeEventListener('pointermove', onPan);
    window.removeEventListener('pointerup', endPan);
    window.removeEventListener('pointercancel', endPan);
    pan = null; render(); scheduleSave();
  }
  // Görüntü, taşma payı dahil yuvanın tamamına göre konumlanır; ekranda sayfa kenarında kırpılır
  function placeImg(im, p, slot) {
    const g = geom(p.w || 3, p.h || 2, slot.W, slot.H, cropOf(p.id));
    im.style.width = `${g.w}px`; im.style.height = `${g.h}px`;
    im.style.left = `${g.left - slot.dx}px`; im.style.top = `${g.top - slot.dy}px`;
  }

  // ── Çizim ──
  function drawMini(box, items, c, scaleW, photos) {
    const k = scaleW / (2 * c.pw);
    items.forEach(({ id, r }) => {
      const p = id != null ? photoById(id) : null;
      const x = Math.max(0, r.x), y = Math.max(0, r.y);
      const w = Math.min(2 * c.pw, r.x + r.w) - x, hh = Math.min(c.ph, r.y + r.h) - y;
      const e = el(photos && p ? 'img' : 'i');
      Object.assign(e.style, { left: `${x * k}px`, top: `${y * k}px`, width: `${w * k}px`, height: `${hh * k}px` });
      if (photos && p) { e.src = p.thumb; e.alt = ''; e.draggable = false; e.loading = 'lazy'; }
      box.appendChild(e);
    });
  }
  function renderTemplates(c) {
    const ids = S.pages[S.sheet] || [];
    const exactBox = $('[data-tpl-exact]'), nearBox = $('[data-tpl-near]');
    const keep = [exactBox.scrollLeft, nearBox.scrollLeft];
    exactBox.textContent = ''; nearBox.textContent = '';
    const head = $('[data-tpl-head]'); head.textContent = '';
    head.appendChild(el('strong', '', `Yaprak ${S.sheet + 1}`));
    head.appendChild(document.createTextNode(` · ${ids.length} fotoğraf`));
    if (!ids.length) { $('[data-tpl-count]').textContent = 'Şeritten fotoğraf ekleyin'; return; }
    const rk = rankTemplates(ids, c);
    const curKey = currentKey(S.sheet, c);
    $('[data-tpl-count]').textContent = `${rk.exact.length} tam uyan · ${rk.near.length} yakın`;
    const tw = 128;
    const tile = (t, dim) => {
      const b = el('button', `dz-t${t.key === curKey ? ' is-on' : ''}${dim ? ' is-dim' : ''}`);
      b.type = 'button';
      b.style.width = `${tw}px`; b.style.height = `${Math.round(tw * c.ph / (2 * c.pw))}px`;
      b.setAttribute('aria-label', 'Bu şablonu uygula');
      drawMini(b, t.rects.map((r) => ({ id: null, r })), c, tw, false);
      b.addEventListener('click', () => { S.tpl[S.sheet] = t.key; render(); scheduleSave(); });
      return b;
    };
    rk.exact.slice(0, 30).forEach((t) => exactBox.appendChild(tile(t, false)));
    rk.near.slice(0, 30).forEach((t) => nearBox.appendChild(tile(t, true)));
    if (!rk.exact.length) exactBox.appendChild(el('span', 'dz-tpl__none', 'Bu fotoğraflara tam uyan şablon yok; yakınlardan seçin.'));
    if (!rk.near.length) nearBox.appendChild(el('span', 'dz-tpl__none', '—'));
    [exactBox.scrollLeft, nearBox.scrollLeft] = keep;
    const on = exactBox.querySelector('.is-on') || nearBox.querySelector('.is-on');
    if (on && !drag) { const bx = on.parentElement; if (on.offsetLeft < bx.scrollLeft || on.offsetLeft + on.offsetWidth > bx.scrollLeft + bx.clientWidth) bx.scrollLeft = Math.max(0, on.offsetLeft - 20); }
  }

  function renderSpread(c) {
    const wrap = $('[data-wrap]');
    const availW = (wrap.clientWidth || 600) * 0.76;
    const availH = Math.max(220, window.innerHeight * 0.46);
    const s = Math.min(availW / (2 * c.pw), availH / c.ph);
    const sp = $('[data-spread]');
    const W = 2 * c.pw * s, H = c.ph * s;
    sp.style.width = `${W}px`; sp.style.height = `${H}px`;
    sp.textContent = '';
    sp.dataset.dropLeaf = S.sheet;
    const m = c.cut + c.safe;
    const guide = el('div', 'dz-guide');
    Object.assign(guide.style, { left: `${m * s}px`, top: `${m * s}px`, width: `${(2 * c.pw - 2 * m) * s}px`, height: `${(c.ph - 2 * m) * s}px` });
    sp.appendChild(guide);
    const order = S.pages[S.sheet] || [];
    computeLeaf(S.sheet, c).forEach(({ id, r }) => {
      const p = photoById(id); if (!p) return;
      const vx = Math.max(0, r.x), vy = Math.max(0, r.y);
      const vw = Math.min(2 * c.pw, r.x + r.w) - vx, vh = Math.min(c.ph, r.y + r.h) - vy;
      const d = el('div', `dz-cell${S.sel === id ? ' is-sel' : ''}`);
      d.dataset.leaf = S.sheet; d.dataset.idx = order.indexOf(id);
      Object.assign(d.style, { left: `${vx * s}px`, top: `${vy * s}px`, width: `${vw * s}px`, height: `${vh * s}px` });
      const im = el('img'); im.src = p.src; im.alt = p.name; im.draggable = false; im.decoding = 'async';
      d.appendChild(im);
      d._slot = { W: r.w * s, H: r.h * s, dx: (vx - r.x) * s, dy: (vy - r.y) * s };
      placeImg(im, p, d._slot);
      S.dims[id] = { W: r.w * s, H: r.h * s };
      d.addEventListener('pointerdown', (e) => (S.cropMode ? startPan(e, id, d) : startDrag(e, { type: 'cell', id })));
      sp.appendChild(d);
    });
    const fold = el('div', 'dz-fold');
    fold.style.left = `${c.pw * s}px`; fold.style.width = `${Math.max(1, 2 * c.foldM * s)}px`;
    sp.appendChild(fold);
    if (!order.length) sp.appendChild(el('p', 'dz-empty', 'Boş yaprak · şeritten fotoğraf sürükleyin'));
    [-1, 1].forEach((dd) => {
      const pk = $(`[data-peek="${dd}"]`); pk.textContent = '';
      const j = S.sheet + dd;
      pk.hidden = j < 0 || j >= S.pages.length;
      if (pk.hidden) return;
      pk.style.width = `${W}px`; pk.style.height = `${H}px`;
      drawMini(pk, computeLeaf(j, c), c, W, true);
    });
    $('[data-sheet-label]').textContent = `Yaprak ${S.sheet + 1} / ${S.pages.length}`;
  }

  function renderStrip() {
    const st = $('[data-strip]'); const keepX = st.scrollLeft; st.textContent = '';
    const thumb = (id, leaf, idx) => {
      const p = photoById(id); if (!p) return null;
      const t = el('div', `dz-tl__ph${S.sel === id ? ' is-sel' : ''}`);
      t.dataset.tlId = id; t.dataset.leaf = leaf; t.dataset.idx = idx;
      const im = el('img'); im.src = p.thumb; im.alt = p.name; im.draggable = false; im.loading = 'lazy';
      t.appendChild(im);
      if (p.edited && S.set !== 'duzenli') t.appendChild(el('span', 'dz-badge', 'D'));
      t.title = p.shot ? `${p.name} · ${p.shot.slice(11, 16)}` : p.name;
      t.addEventListener('pointerdown', (e) => startDrag(e, { type: 'tl', id }));
      return t;
    };
    S.pages.forEach((L, i) => {
      const g = el('div', `dz-tl__g${i === S.sheet ? ' is-cur' : ''}`);
      g.dataset.dropLeaf = i;
      g.appendChild(el('span', 'dz-tl__n', String(i + 1)));
      L.forEach((id, j) => {
        if (j > 0) {
          const cut = el('button', 'dz-tl__cut'); cut.type = 'button'; cut.setAttribute('aria-label', 'Burada yeni yaprak başlat'); cut.title = 'Burada böl';
          cut.addEventListener('click', (e) => { e.stopPropagation(); cutAt(i, j); render(); scheduleSave(); });
          g.appendChild(cut);
        }
        const t = thumb(id, i, j); if (t) g.appendChild(t);
      });
      if (!L.length) g.appendChild(el('span', 'dz-tl__empty', 'boş'));
      g.addEventListener('click', (e) => { if (e.target.closest('.dz-tl__cut,[data-tl-id]')) return; if (S.sheet !== i) { S.sheet = i; S.sel = null; render(); } });
      st.appendChild(g);
      if (i < S.pages.length - 1) {
        const j = el('button', 'dz-tl__join'); j.type = 'button'; j.setAttribute('aria-label', `${i + 1}. ve ${i + 2}. yaprağı birleştir`); j.title = 'Birleştir';
        j.addEventListener('click', () => { mergeAfter(i); render(); scheduleSave(); });
        st.appendChild(j);
      }
    });
    const add = el('button', 'dz-tl__add', '+ Yaprak'); add.type = 'button';
    add.addEventListener('click', () => { S.pages.push([]); S.sheet = S.pages.length - 1; S.sel = null; render(); });
    st.appendChild(add);
    const out = el('div', 'dz-tl__g dz-tl__g--out'); out.dataset.dropLeaf = 'out';
    out.appendChild(el('span', 'dz-tl__n', `Albüm dışı · ${S.out.length}`));
    S.out.forEach((id, j) => { const t = thumb(id, 'out', j); if (t) out.appendChild(t); });
    if (!S.out.length) out.appendChild(el('span', 'dz-tl__empty', 'Çıkarmak için buraya sürükleyin'));
    st.appendChild(out);
    st.scrollLeft = keepX;
    const cur = st.querySelector('.dz-tl__g.is-cur');
    if (cur && !drag) {
      const a = cur.offsetLeft, b = a + cur.offsetWidth;
      if (a < st.scrollLeft || b > st.scrollLeft + st.clientWidth) st.scrollLeft = Math.max(0, a - 40);
    }
    $('[data-sort-label]').textContent = SORT_LABEL[byId('sortMode').value] || '';
  }

  function render() {
    tidy();
    const c = cfg();
    if (S.sel && !locate(S.sel)) S.sel = null;
    renderTemplates(c);
    renderSpread(c);
    renderStrip();
    const sel = S.sel ? photoById(S.sel) : null;
    $('[data-crop-panel]').hidden = !sel;
    $('[data-crop-label]').textContent = sel ? sel.name : '';
    if (sel) $('[data-zoom]').value = cropOf(sel.id).z;
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
    for (const { id, r } of computeLeaf(leaf, c)) {
      const p = photoById(id); if (!p) continue;
      const full = await loadFull(p);
      const dw = r.w * k, dh = r.h * k;
      const g = geom(full.naturalWidth, full.naturalHeight, dw, dh, { ...cropOf(id) });
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
  const filled = () => S.pages.map((l, i) => (l.length ? i : -1)).filter((i) => i >= 0);
  async function exportLeaves(which) {
    const list = which === 'one' ? [S.sheet] : filled();
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
  async function sendToAlbum() {
    const list = filled();
    if (!list.length) { status('Önce fotoğrafları yapraklara yerleştirin.'); return; }
    if (!window.confirm(`${list.length} yaprak, çiftin "Albüm tasarımı" bölümüne aktarılsın mı? Aynı adlı eski sayfaların yerine geçer. Çifte göndermeyi çift sayfasından siz yaparsınız.`)) return;
    busy(true);
    try {
      for (let n = 0; n < list.length; n++) {
        status(`Aktarılıyor: ${n + 1} / ${list.length}…`);
        const c = cfg();
        const cv = await renderLeaf(list[n], 2400 / (2 * c.pw));
        const display = await toBlob(cv, 0.86);
        const t = document.createElement('canvas');
        t.width = 900; t.height = Math.round(cv.height * 900 / cv.width);
        t.getContext('2d').drawImage(cv, 0, 0, t.width, t.height);
        const thumb = await toBlob(t, 0.8);
        const r = await fetch(`${base}/album-sayfa`, {
          method: 'POST', credentials: 'same-origin', body: new Blob([thumb, display]),
          headers: { 'X-CSRF-Token': csrf, 'X-Parts': `thumb:${thumb.size},display:${display.size}`, 'X-Filename': encodeURIComponent(`Yaprak ${String(n + 1).padStart(2, '0')}.jpg`), 'Content-Type': 'application/octet-stream' },
        });
        if (!r.ok) throw new Error('upload');
      }
      status('Aktarıldı. Çift sayfasına yönlendiriliyorsunuz…');
      window.location.href = `${base}#album`;
    } catch { status('Aktarım yarıda kaldı; yeniden deneyin.'); busy(false); }
  }
  function busy(on) { $$('[data-export],[data-send],[data-auto]').forEach((b) => { b.disabled = on; }); }

  // ── Sıfırdan albüm (cihazdan; fotoğraflar sunucuya gitmez) ──
  function exifShot(buf) {
    const b = new DataView(buf); if (b.byteLength < 4 || b.getUint16(0) !== 0xffd8) return '';
    let i = 2;
    while (i + 10 < b.byteLength) {
      const m = b.getUint16(i), len = b.getUint16(i + 2);
      if (m === 0xffe1 && b.getUint32(i + 4) === 0x45786966) {
        const t = i + 10, le = b.getUint16(t) === 0x4949;
        const u16 = (o) => (o + 2 <= b.byteLength ? b.getUint16(o, le) : 0), u32 = (o) => (o + 4 <= b.byteLength ? b.getUint32(o, le) : 0);
        const str = (o) => { let s = ''; for (let k = 0; k < 19 && t + o + k < b.byteLength; k++) s += String.fromCharCode(b.getUint8(t + o + k)); return s; };
        const scan = (ifd) => { const out = {}; const n = u16(t + ifd); for (let k = 0; k < n && k < 400; k++) { const e = t + ifd + 2 + k * 12; const tag = u16(e); if (tag === 0x8769) out.exif = u32(e + 8); if (tag === 0x9003 || tag === 0x0132) out[tag] = str(u32(e + 8)); } return out; };
        const i0 = scan(u32(t + 4)), sub = i0.exif ? scan(i0.exif) : {};
        const v = sub[0x9003] || i0[0x0132] || '';
        return /^\d{4}:\d\d:\d\d \d\d:\d\d:\d\d$/.test(v) ? v : '';
      }
      if (m === 0xffda || (m & 0xff00) !== 0xff00) return '';
      i += 2 + len;
    }
    return '';
  }
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
      let shot = '';
      try { shot = exifShot(await f.slice(0, 256 * 1024).arrayBuffer()); } catch { shot = ''; }
      const url = URL.createObjectURL(f);
      const img = new Image(); img.src = url;
      try { await img.decode(); } catch { failed.push(f.name); URL.revokeObjectURL(url); continue; }
      const p = { id: S.nextId++, name: f.name, w: img.naturalWidth, h: img.naturalHeight, thumb: await shrink(img, 600, 0.8), src: await shrink(img, 1800, 0.86), full: url, edited: false, cover: false, shot };
      S.photos.push(p); S.out.push(p.id);
    }
    indexPhotos();
    S.out = sortPhotos(S.out.map(photoById)).map((p) => p.id);
    busy(false);
    render();
    status(`${S.photos.length} fotoğraf hazır.${failed.length ? ` Okunamayan: ${failed.join(', ')}.` : ' "Otomatik diz" ile yerleştirin.'} Sıfırdan albüm kaydedilmez; bitince yaprakları indirin.`);
  }

  // ── Olaylar ──
  $$('[data-cfg]').forEach((x) => x.addEventListener(x.tagName === 'SELECT' || x.type === 'checkbox' ? 'change' : 'input', async () => {
    if (x.id === 'sortMode') { if (x.value === 'color') await Promise.all(S.photos.map(ensureColor)); resort(); }
    render(); scheduleSave();
  }));
  $('[data-auto]').addEventListener('click', autoBuild);
  $('[data-toggle-settings]').addEventListener('click', (e) => {
    const box = byId('dz-settings'); box.hidden = !box.hidden;
    e.currentTarget.setAttribute('aria-expanded', String(!box.hidden));
    render();
  });
  const goSheet = (d) => { S.sheet = Math.min(S.pages.length - 1, Math.max(0, S.sheet + d)); S.sel = null; render(); };
  $$('[data-go]').forEach((b) => b.addEventListener('click', () => goSheet(Number(b.dataset.go))));
  $$('[data-peek]').forEach((b) => b.addEventListener('click', () => goSheet(Number(b.dataset.peek))));
  $('[data-variant]').addEventListener('click', () => {
    const c = cfg(), ids = S.pages[S.sheet] || [];
    if (!ids.length) return;
    const rk = rankTemplates(ids, c), list = rk.exact.length ? rk.exact : rk.near;
    const i = list.findIndex((t) => t.key === currentKey(S.sheet, c));
    S.tpl[S.sheet] = list[(i + 1) % list.length].key;
    render(); scheduleSave();
  });
  $('[data-crop]').addEventListener('click', (e) => {
    S.cropMode = !S.cropMode;
    e.currentTarget.setAttribute('aria-pressed', String(S.cropMode));
    root.classList.toggle('is-crop', S.cropMode);
    if (S.cropMode && !S.sel) status('Kadraj açık: bir fotoğrafa dokunup parmağınızla kaydırın.');
    render();
  });
  $$('[data-nudge]').forEach((b) => b.addEventListener('click', () => {
    if (!S.sel) return;
    const [dx, dy] = b.dataset.nudge.split(',').map(Number);
    const cr = cropOf(S.sel); cr.ox += dx * 0.05; cr.oy += dy * 0.05;
    render(); scheduleSave();
  }));
  $('[data-zoom]').addEventListener('input', (e) => { if (!S.sel) return; cropOf(S.sel).z = parseFloat(e.target.value); render(); scheduleSave(); });
  $('[data-fit]').addEventListener('click', () => {
    const d = S.dims[S.sel], p = photoById(S.sel);
    if (!d || !p) return;
    const cr = cropOf(S.sel);
    cr.z = Math.max(0.3, Math.min(d.W / p.w, d.H / p.h) / Math.max(d.W / p.w, d.H / p.h)); cr.ox = 0; cr.oy = 0;
    render(); scheduleSave();
  });
  $('[data-remove]').addEventListener('click', () => { if (!S.sel) return; removeFromAlbum(S.sel); render(); scheduleSave(); });
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
    if (S.pages.some((l) => l.length) && !window.confirm('Fotoğraf grubu değişince yerleşim sıfırlanır. Devam edilsin mi?')) return;
    load(want, true);
  }));
  const fileInput = $('[data-files]');
  if (fileInput) fileInput.addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
  window.addEventListener('beforeunload', (e) => { if (local && S.photos.length) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('blur', () => { endDrag(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) endDrag(); });
  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input,select,textarea')) return;
    if (e.key === 'ArrowRight') goSheet(1);
    if (e.key === 'ArrowLeft') goSheet(-1);
  });
  let rz = null;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(render, 120); });

  // ── Başlangıç ──
  function applyDraft(d) {
    CFG_IDS.forEach((id) => { if (d.cfg[id] === undefined) return; const x = byId(id); if (x.type === 'checkbox') x.checked = Boolean(d.cfg[id]); else x.value = d.cfg[id]; });
    if (!byId('sortMode').value) byId('sortMode').value = 'time';
    const ok = new Set(S.photos.map((p) => p.id));
    S.pages = (d.pages || []).map((l) => l.filter((id) => ok.has(id)));
    if (!S.pages.length) S.pages = [[]];
    S.tpl = d.v === 2 ? (d.tpl || {}) : {};
    S.crop = d.crop || {}; S.sheet = d.sheet || 0;
    const used = new Set(S.pages.flat());
    S.out = sortPhotos(S.photos.filter((p) => !used.has(p.id))).map((p) => p.id);
  }
  async function load(want, switching) {
    try {
      const r = await fetch(`${base}/tasarimci.json${want ? `?set=${want}` : ''}`, { credentials: 'same-origin' });
      const data = await r.json();
      S.couple = data.couple; S.photos = data.photos; S.set = data.set; indexPhotos();
      $('[data-set]').hidden = !(data.favCount && data.editedCount);
      $('[data-n="secim"]').textContent = data.favCount; $('[data-n="duzenli"]').textContent = data.editedCount;
      $$('[data-set-btn]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.setBtn === S.set)));
      const d = data.draft;
      S.pages = [[]]; S.tpl = {}; S.crop = {}; S.sheet = 0; S.sel = null;
      S.out = sortPhotos(S.photos).map((p) => p.id);
      if (!switching && d && d.cfg && (d.set || 'secim') === S.set) applyDraft(d);
      else if (!switching && !d) {
        const m = String(data.size || '').match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/i);
        if (m) { byId('pw').value = m[1].replace(',', '.'); byId('ph').value = m[2].replace(',', '.'); }
        const pg = parseInt(data.pagesHint, 10);
        if (pg) byId('leaves').value = Math.max(1, Math.round(pg / 2));
      }
      render();
      if (switching) scheduleSave();
      const withTime = S.photos.filter((p) => p.shot).length;
      if (!S.photos.length) status('Bu çiftte gösterilecek fotoğraf yok.');
      else status(`${S.photos.length} fotoğraf${S.set === 'duzenli' ? ' (tüm düzenlenmişler)' : ''}.${withTime ? '' : ' Çekim saati bilgisi bulunamadı; dosya adına göre sıralanır.'}${S.pages.some((l) => l.length) ? '' : ' "Otomatik diz" ile başlayın.'}`);
      $('[data-save]').textContent = d && !switching ? 'Taslak açıldı' : '';
    } catch { status('Fotoğraflar alınamadı. Sayfayı yenileyin.'); }
  }
  if (!byId('sortMode').value) byId('sortMode').value = 'time';
  if (local) { render(); status('Cihazınızdan fotoğraf ekleyin ya da yukarıdan bir çift seçin.'); }
  else load('', false);
}());
