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

  // Kapak düzenleri (kapağın sırt hariç yüzüne göre oran): fotoğrafın yeri ve yazının ortası
  const LAYOUT = {
    duz: { text: [0.5, 0.5], tw: 0.8 },
    orta: { foto: { r: [0.2, 0.12, 0.6, 0.56] }, text: [0.5, 0.82], tw: 0.7, frame: true },
    daire: { foto: { c: [0.5, 0.42, 0.3] }, text: [0.5, 0.84], tw: 0.7, frame: true },
    sag: { foto: { r: [0.42, 0, 0.58, 1] }, text: [0.21, 0.5], tw: 0.34 },
    sol: { foto: { r: [0, 0, 0.58, 1] }, text: [0.79, 0.5], tw: 0.34 },
    ust: { foto: { r: [0, 0, 1, 0.7] }, text: [0.5, 0.85], tw: 0.8 },
    tam: { foto: { r: [0, 0, 1, 1] }, text: [0.5, 0.86], tw: 0.8 },
  };
  const loadImg = (src) => new Promise((resolve) => { if (!src) { resolve(null); return; } const im = new Image(); im.onload = () => resolve(im); im.onerror = () => resolve(null); im.src = src; });
  let photoP = null;

  // Kapak: yaldız yazı (metalik katman) + varsa fotoğraf (parlak baskı katmanı); ikisi de saydam zeminli PNG
  async function decal(boy) {
    const m = /^(\d{2})x(\d{2,3})$/.exec(boy) || [0, 30, 60];
    const hcm = Number(m[1]); const wcm = Number(m[2]) / 2 - 1.3;
    const H = 1024; const W = Math.round((H * wcm) / hcm);
    const L = LAYOUT[form.dataset.akKapak] || LAYOUT.duz;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    try { await document.fonts.load('600 80px "Cormorant Garamond"'); } catch { /* yedek yazı tipi */ }
    const gold = (y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#f4dc9c'); gr.addColorStop(0.5, '#c9a256'); gr.addColorStop(1, '#e9cf8a'); return gr; };

    let foto = null;
    if (L.foto) {
      photoP = photoP || loadImg(form.dataset.akFoto);
      const img = await photoP;
      if (img) {
        const PH = 768; const PW = Math.round((PH * W) / H); const k = PH / H;
        const pc = document.createElement('canvas'); pc.width = PW; pc.height = PH;
        const pg = pc.getContext('2d');
        let x; let y; let w; let hh;
        if (L.foto.c) { const r = L.foto.c[2] * Math.min(W, H); x = L.foto.c[0] * W - r; y = L.foto.c[1] * H - r; w = 2 * r; hh = 2 * r; }
        else { [x, y, w, hh] = [L.foto.r[0] * W, L.foto.r[1] * H, L.foto.r[2] * W, L.foto.r[3] * H]; }
        pg.save(); pg.beginPath();
        if (L.foto.c) pg.arc((x + w / 2) * k, (y + hh / 2) * k, (w / 2) * k, 0, Math.PI * 2); else pg.rect(x * k, y * k, w * k, hh * k);
        pg.clip();
        const s = Math.max((w * k) / img.naturalWidth, (hh * k) / img.naturalHeight);
        const dw = img.naturalWidth * s; const dh = img.naturalHeight * s;
        pg.drawImage(img, x * k + (w * k - dw) / 2, y * k + (hh * k - dh) * 0.35, dw, dh);
        pg.restore();
        try { foto = pc.toDataURL('image/png'); } catch { foto = null; }
        if (L.frame) { // ince yaldız çerçeve
          g.strokeStyle = gold(y, y + hh); g.lineWidth = H * 0.007; const o = H * 0.012;
          g.beginPath(); if (L.foto.c) g.arc(x + w / 2, y + hh / 2, w / 2 + o, 0, Math.PI * 2); else g.rect(x - o, y - o, w + 2 * o, hh + 2 * o); g.stroke();
        }
      }
    }

    const isim = form.dataset.akIsim || ''; const tarih = form.dataset.akTarih || '';
    const cx = L.text[0] * W; let cy = L.text[1] * H;
    let fs = H * (L.tw < 0.5 ? 0.07 : 0.085);
    const setF = () => { g.font = `600 ${fs}px "Cormorant Garamond", Georgia, serif`; };
    setF();
    while (g.measureText(isim).width > W * L.tw && fs > 18) { fs -= 2; setF(); }
    if (tarih) cy -= fs * 0.35;
    g.fillStyle = gold(cy - fs, cy + fs * 1.6); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(isim, cx, cy);
    if (tarih) {
      g.font = `500 ${Math.min(H * 0.05, fs * 0.6)}px "Cormorant Garamond", Georgia, serif`;
      if ('letterSpacing' in g) g.letterSpacing = `${Math.round(H * 0.01)}px`;
      g.fillText(tarih, cx, cy + fs * 1.05);
    }
    return { yaldiz: cv.toDataURL('image/png'), foto };
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
