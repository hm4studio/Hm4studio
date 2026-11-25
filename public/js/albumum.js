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
  const label = btn.querySelector('span');
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const val = (n) => (form.querySelector(`input[name="${n}"]:checked`) || {}).value || '';

  // Kapak yazısı: saydam zemin üstünde yaldız (kapağın sırt hariç ölçüsünde)
  async function decal(boy) {
    const m = /^(\d{2})x(\d{2,3})$/.exec(boy) || [0, 30, 60];
    const hcm = Number(m[1]); const wcm = Number(m[2]) / 2 - 1.3;
    const H = 1024; const W = Math.round((H * wcm) / hcm);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    try { await document.fonts.load('600 80px "Cormorant Garamond"'); } catch { /* yedek yazı tipi */ }
    const isim = form.dataset.akIsim || ''; const tarih = form.dataset.akTarih || '';
    let fs = H * 0.085;
    g.font = `600 ${fs}px "Cormorant Garamond", Georgia, serif`;
    while (g.measureText(isim).width > W * 0.8 && fs > 20) { fs -= 2; g.font = `600 ${fs}px "Cormorant Garamond", Georgia, serif`; }
    const grad = g.createLinearGradient(0, H * 0.4, 0, H * 0.65);
    grad.addColorStop(0, '#f4dc9c'); grad.addColorStop(0.5, '#c9a256'); grad.addColorStop(1, '#e9cf8a');
    g.fillStyle = grad; g.textAlign = 'center'; g.textBaseline = 'middle';
    const cy = tarih ? H * 0.47 : H * 0.5;
    g.fillText(isim, W / 2, cy);
    if (tarih) {
      g.font = `500 ${H * 0.05}px "Cormorant Garamond", Georgia, serif`;
      if ('letterSpacing' in g) g.letterSpacing = `${Math.round(H * 0.012)}px`;
      g.fillText(tarih, W / 2, cy + H * 0.09);
    }
    return cv.toDataURL('image/png');
  }

  // Kumaş dokusu: ışık farkını düzle ve kenarları birleştir (kapakta tekrar ederken kare kare görünmesin)
  function fabric(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const N = 512; const cv = document.createElement('canvas'); cv.width = N; cv.height = N;
        const g = cv.getContext('2d'); g.drawImage(img, 0, 0, N, N);
        const a = g.getImageData(0, 0, N, N).data;
        const sm = document.createElement('canvas'); sm.width = 6; sm.height = 6;
        const sg = sm.getContext('2d'); sg.imageSmoothingQuality = 'high'; sg.drawImage(cv, 0, 0, 6, 6);
        const bl = document.createElement('canvas'); bl.width = N; bl.height = N;
        const bg = bl.getContext('2d'); bg.imageSmoothingQuality = 'high'; bg.filter = 'blur(40px)'; bg.drawImage(sm, -40, -40, N + 80, N + 80);
        const lo = bg.getImageData(0, 0, N, N).data;
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
      const [yaldiz, kumas] = await Promise.all([decal(boy), fabric(sw ? sw.src : '')]);
      const r = await fetch('/panel/albumum/ar', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ no: form.dataset.akForm, renk, boy, yaldiz, kumas }) });
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
