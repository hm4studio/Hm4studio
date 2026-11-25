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

// "Masamda gör": seçilen renk ve boyla 3D albüm (kapak yazısını burada çizip sunucuya gönderiyoruz)
(() => {
  const form = document.querySelector('[data-ak-form]');
  if (!form) return;
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const btn = document.querySelector(`[data-ak-ar="${ios ? 'ios' : 'android'}"]`);
  if (!ios && !android) { const n = document.querySelector('[data-ak-arnote]'); if (n) n.hidden = false; return; }
  if (!btn) return;
  btn.hidden = false;
  const hint = document.querySelector('[data-ak-arhint]'); if (hint) hint.hidden = false;
  if (ios && /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua)) { const sf = document.querySelector('[data-ak-arsafari]'); if (sf) sf.hidden = false; }
  const label = btn.querySelector('span');
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const val = (n) => (form.querySelector(`input[name="${n}"]:checked`) || {}).value || '';

  // Kapak tasarımı: sunucudan gelen öğeler (foto, panel, çizgi, çerçeve, yazı); oranlar kapağın sırt hariç yüzüne göre.
  // Metal olanlar (altın, gümüş) yaldız katmanına, diğerleri (fotoğraf, ahşap, beyaz/siyah panel, koyu yazı) baskı katmanına çizilir.
  let SPEC = [];
  try { SPEC = JSON.parse(form.dataset.akTasarim || '[]'); } catch { SPEC = []; }
  const loadImg = (src) => new Promise((resolve) => { if (!src) { resolve(null); return; } const im = new Image(); im.onload = () => resolve(im); im.onerror = () => resolve(null); im.src = src; });
  let photoP = null;
  const METAL = { altin: ['#f4dc9c', '#c9a256', '#e9cf8a'], gumus: ['#f2f2f2', '#a9abae', '#dcdcdc'] };
  const rnd = (() => { let x = 7; return () => { x = (x * 16807) % 2147483647; return x / 2147483647; }; })();

  function shapePath(g, el, W, H, grow = 0) {
    g.beginPath();
    if (el.c && el.elmas) { const r = el.c[2] * Math.min(W, H) + grow; const x = el.c[0] * W; const y = el.c[1] * H; g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); return; }
    if (el.c) { const r = el.c[2] * Math.min(W, H) + grow; g.arc(el.c[0] * W, el.c[1] * H, r, 0, Math.PI * 2); return; }
    const [x, y, w, h] = [el.r[0] * W - grow, el.r[1] * H - grow, el.r[2] * W + 2 * grow, el.r[3] * H + 2 * grow];
    if (el.oval) { g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); return; }
    g.rect(x, y, w, h);
  }
  function bounds(el, W, H) {
    if (el.c) { const r = el.c[2] * Math.min(W, H); return [el.c[0] * W - r, el.c[1] * H - r, 2 * r, 2 * r]; }
    return [el.r[0] * W, el.r[1] * H, el.r[2] * W, el.r[3] * H];
  }
  function fillMat(g, m, b, H) {
    const [x, y, w, h] = b;
    if (METAL[m]) { const c = METAL[m]; const gr = g.createLinearGradient(x, y, x + w * 0.3, y + h); gr.addColorStop(0, c[0]); gr.addColorStop(0.5, c[1]); gr.addColorStop(1, c[2]); g.fillStyle = gr; g.fill(); return; }
    if (m === 'beyaz') { g.fillStyle = '#f6f4ef'; g.fill(); return; }
    if (m === 'siyah') { g.fillStyle = '#17171a'; g.fill(); return; }
    if (m === 'koyu') { g.fillStyle = 'rgba(52,40,32,.9)'; g.fill(); return; }
    if (m === 'kumas2') { g.fillStyle = '#4a413c'; g.fill(); g.save(); g.clip(); g.globalAlpha = 0.18; for (let i = 0; i < 900; i += 1) { g.fillStyle = rnd() > 0.5 ? '#000' : '#8a7d74'; g.fillRect(x + rnd() * w, y + rnd() * h, 2, 2); } g.restore(); return; }
    // ahşap: lif çizgileri uzun kenar boyunca; ahsap2 oluklu
    const vert = h >= w;
    g.fillStyle = '#9a6a3e'; g.fill(); g.save(); g.clip();
    const len = vert ? w : h;
    for (let i = 0; i < len; i += 1) {
      const a = 0.06 + 0.12 * Math.abs(Math.sin(i * 0.37) * Math.sin(i * 0.051 + 1)) + 0.05 * rnd();
      g.fillStyle = `rgba(${rnd() > 0.5 ? '60,35,18' : '200,150,100'},${a})`;
      if (vert) g.fillRect(x + i, y, 1, h); else g.fillRect(x, y + i, w, 1);
    }
    if (m === 'ahsap2') { const step = H * 0.018; g.fillStyle = 'rgba(40,22,10,.55)'; for (let i = step / 2; i < len; i += step) { if (vert) g.fillRect(x + i, y, H * 0.004, h); else g.fillRect(x, y + i, w, H * 0.004); } }
    g.restore();
  }

  async function decal(boy) {
    const m = /^(\d{2})x(\d{2,3})$/.exec(boy) || [0, 30, 60];
    const hcm = Number(m[1]); const wcm = Number(m[2]) / 2 - 1.3;
    const H = 1024; const W = Math.round((H * wcm) / hcm);
    const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    const cm = mk(); const cf = mk(); const gm = cm.getContext('2d'); const gf = cf.getContext('2d');
    let usedF = false;
    try { await Promise.all([document.fonts.load('600 80px "Cormorant Garamond"'), document.fonts.load('italic 500 80px "Cormorant Garamond"')]); } catch { /* yedek yazı tipi */ }
    const isim = form.dataset.akIsim || ''; const tarih = form.dataset.akTarih || '';

    // Baskı katmanı (fotoğraf, koyu yazı…) yaldızın altında durur: sonra çizilen baskı öğesi, altındaki yaldızı siler
    const both = (draw) => { draw(gf); gm.save(); gm.globalCompositeOperation = 'destination-out'; draw(gm); gm.restore(); usedF = true; };
    for (const el of SPEC) {
      if (el.t === 'panel') { const d = (g) => { shapePath(g, el, W, H); fillMat(g, el.m, bounds(el, W, H), H); }; if (METAL[el.m]) d(gm); else both(d); }
      else if (el.t === 'foto') {
        if (el.kenar) { const d = (g) => { shapePath(g, el, W, H, el.kenar.w * H); fillMat(g, el.kenar.m, bounds(el, W, H), H); }; if (METAL[el.kenar.m]) d(gm); else both(d); }
        photoP = photoP || loadImg(form.dataset.akFoto);
        const img = await photoP;
        const [x, y, w, h] = bounds(el, W, H);
        gf.save(); shapePath(gf, el, W, H); gf.clip();
        if (img) { const k = Math.max(w / img.naturalWidth, h / img.naturalHeight); const dw = img.naturalWidth * k; const dh = img.naturalHeight * k; gf.drawImage(img, x + (w - dw) / 2, y + (h - dh) * 0.35, dw, dh); }
        else { gf.fillStyle = '#d8d2c8'; gf.fill(); }
        gf.restore(); usedF = true;
        gm.save(); gm.globalCompositeOperation = 'destination-out'; shapePath(gm, el, W, H); gm.fill(); gm.restore(); // fotoğrafın altındaki yaldızı sil
      } else if (el.t === 'cerceve') {
        const c = METAL[el.m];
        const d = (g) => { shapePath(g, el, W, H); g.lineWidth = el.w * H; g.strokeStyle = c ? c[1] : 'rgba(52,40,32,.9)'; g.stroke(); };
        if (c) d(gm); else both(d);
      } else if (el.t === 'cizgi') {
        const [x, y, w, h] = bounds(el, W, H); const c = METAL[el.m];
        const d = (g) => {
          g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
          g.strokeStyle = c ? c[1] : 'rgba(52,40,32,.85)'; g.lineWidth = Math.max(2, H * 0.003); g.beginPath();
          const n = el.n || 1;
          for (let i = 0; i < n; i += 1) {
            const f = n === 1 ? 0.5 : i / (n - 1);
            if (el.d === 'v') { const xx = x + w * (n === 1 ? 0.5 : 0.1 + 0.8 * f); g.moveTo(xx, y); g.lineTo(xx, y + h); }
            else if (el.d === 'h') { const yy = y + h * (n === 1 ? 0.5 : 0.05 + 0.9 * f); g.moveTo(x, yy); g.lineTo(x + w, yy); }
            else { const o = -h + (w + h) * f; g.moveTo(x + o, y + h); g.lineTo(x + o + h, y); }
          }
          g.stroke(); g.restore();
        };
        if (c) d(gm); else both(d);
      } else if (el.t === 'yazi') {
        const c = METAL[el.m];
        const fam = el.f === 'script' ? 'italic 500' : '600';
        const rot = Number(el.rot || 0); const maxW = (el.w || 0.6) * (rot ? H : W);
        let fs = (el.s || 0.07) * H;
        const setF = (g) => { g.font = `${fam} ${fs}px "Cormorant Garamond", Georgia, serif`; };
        setF(gf); while (gf.measureText(isim).width > maxW && fs > 14) { fs -= 1; setF(gf); }
        const d = (g) => {
          g.save(); g.translate(el.p[0] * W, el.p[1] * H); g.rotate((rot * Math.PI) / 180); setF(g);
          if (c) { const gr = g.createLinearGradient(0, -fs, 0, fs * 1.6); gr.addColorStop(0, c[0]); gr.addColorStop(0.5, c[1]); gr.addColorStop(1, c[2]); g.fillStyle = gr; } else g.fillStyle = 'rgba(52,40,32,.92)';
          g.textAlign = 'center'; g.textBaseline = 'middle';
          const dy = tarih ? -fs * 0.35 : 0;
          g.fillText(isim, 0, dy);
          if (tarih) { g.font = `500 ${fs * 0.55}px "Cormorant Garamond", Georgia, serif`; if ('letterSpacing' in g) g.letterSpacing = `${Math.round(fs * 0.12)}px`; g.fillText(tarih, 0, dy + fs * 1.0); }
          g.restore();
        };
        if (c) d(gm); else both(d);
      }
    }
    let foto = null;
    if (usedF) { const PH = 768; const s2 = document.createElement('canvas'); s2.width = Math.round((W * PH) / H); s2.height = PH; s2.getContext('2d').drawImage(cf, 0, 0, s2.width, PH); try { foto = s2.toDataURL('image/png'); } catch { foto = null; } }
    return { yaldiz: cm.toDataURL('image/png'), foto };
  }

  // Kumaş dokusu: ışık farkını düzle ve kenarları birleştir (kapakta tekrar ederken kare kare görünmesin)
  function fabric(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const N = 512; const cv = document.createElement('canvas'); cv.width = N; cv.height = N;
        const g = cv.getContext('2d'); g.drawImage(img, 0, 0, N, N);
        const a = g.getImageData(0, 0, N, N).data;
        // Işık farkı: 16×16 bölgenin ortalaması, yumuşatılıp araya doğrusal dağıtılır (canvas filtresi Safari'de yok)
        const G = 16; const C = N / G; const grid = new Float32Array(G * G * 3);
        for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) { const i = (y * N + x) * 4; const c = ((Math.floor(y / C) * G) + Math.floor(x / C)) * 3; for (let k = 0; k < 3; k += 1) grid[c + k] += a[i + k] / (C * C); }
        for (let pass = 0; pass < 2; pass += 1) {
          const t = grid.slice();
          for (let gy = 0; gy < G; gy += 1) for (let gx = 0; gx < G; gx += 1) for (let k = 0; k < 3; k += 1) {
            let sum = 0; for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) sum += t[((((gy + dy + G) % G) * G) + ((gx + dx + G) % G)) * 3 + k];
            grid[(gy * G + gx) * 3 + k] = sum / 9;
          }
        }
        const lo = new Float32Array(N * N * 4);
        for (let y = 0; y < N; y += 1) {
          const fy = y / C - 0.5; const y0 = Math.floor(fy); const ty = fy - y0;
          for (let x = 0; x < N; x += 1) {
            const fx = x / C - 0.5; const x0 = Math.floor(fx); const tx = fx - x0;
            const at = (gx, gy, k) => grid[((((gy + G) % G) * G) + ((gx + G) % G)) * 3 + k];
            for (let k = 0; k < 3; k += 1) lo[(y * N + x) * 4 + k] = (at(x0, y0, k) * (1 - tx) + at(x0 + 1, y0, k) * tx) * (1 - ty) + (at(x0, y0 + 1, k) * (1 - tx) + at(x0 + 1, y0 + 1, k) * tx) * ty;
          }
        }
        const mean = [0, 0, 0]; for (let i = 0; i < a.length; i += 4) for (let k = 0; k < 3; k += 1) mean[k] += a[i + k];
        for (let k = 0; k < 3; k += 1) mean[k] /= N * N;
        const f = new Float32Array(N * N * 3);
        for (let p = 0, i = 0; i < a.length; i += 4, p += 3) for (let k = 0; k < 3; k += 1) f[p + k] = (a[i + k] * mean[k]) / Math.max(8, lo[i + k]);
        const out = g.createImageData(N, N); const o = out.data; const H = N / 2;
        for (let y = 0; y < N; y += 1) {
          for (let x = 0; x < N; x += 1) {
            const d = Math.min(x, N - 1 - x, y, N - 1 - y) / (N * 0.25);
            const w = d >= 1 ? 1 : d * d * (3 - 2 * d);
            const p = (y * N + x) * 3; const q = (((y + H) % N) * N + ((x + H) % N)) * 3; const i = (y * N + x) * 4;
            for (let k = 0; k < 3; k += 1) o[i + k] = Math.max(0, Math.min(255, f[p + k] * w + f[q + k] * (1 - w)));
            o[i + 3] = 255;
          }
        }
        g.putImageData(out, 0, 0);
        resolve(cv.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = () => reject(new Error('doku'));
      img.src = src;
    });
  }

  let seq = 0;
  async function prepare() {
    const my = ++seq;
    const renk = val('renk'); const boy = val('boy');
    btn.setAttribute('aria-disabled', 'true'); btn.classList.add('is-busy'); if (label) label.textContent = 'Hazırlanıyor…';
    try {
      const sw = form.querySelector('input[name="renk"]:checked + img');
      const [{ yaldiz, foto }, kumas] = await Promise.all([decal(boy), fabric(sw ? sw.src : '')]);
      const r = await fetch('/panel/albumum/ar', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ no: form.dataset.akForm, renk, boy, yaldiz, kumas, foto }) });
      if (!r.ok) throw new Error('hata');
      const u = await r.json();
      if (my !== seq) return;
      if (ios) btn.href = `${u.usdz}#allowsContentScaling=0`;
      else {
        const file = encodeURIComponent(location.origin + u.glb);
        const back = encodeURIComponent(location.href);
        btn.href = `intent://arvr.google.com/scene-viewer/1.2?file=${file}&mode=ar_preferred&resizable=false&title=${encodeURIComponent(form.dataset.akModel || 'Albüm')}#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;S.browser_fallback_url=${back};end;`;
      }
      btn.removeAttribute('aria-disabled'); btn.classList.remove('is-busy'); if (label) label.textContent = 'Masamda gör';
    } catch {
      if (my === seq && label) { label.textContent = 'Masamda gör (tekrar dene)'; btn.classList.remove('is-busy'); btn.removeAttribute('aria-disabled'); btn.href = '#'; }
    }
  }
  btn.addEventListener('click', (e) => { if (btn.getAttribute('href') === '#') { e.preventDefault(); prepare(); } });
  for (const r of form.querySelectorAll('input[type=radio]')) r.addEventListener('change', prepare);
  prepare();
})();
