/* HM4 Studio — admin fotoğraf yükleyici.
   Fotoğraflar tarayıcıda web boyutuna küçültülür (hızlı açılış, mobil performans),
   ardından sırayla sunucuya gönderilir. İstenirse orijinal dosya da yüklenir. */
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
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const THUMB = { edge: 900, quality: 0.8 };      // ızgara görünümü
  const DISPLAY = { edge: 2400, quality: 0.86 };  // büyük görüntüleme
  const CONCURRENCY = 2;

  async function decode(file) {
    if ('createImageBitmap' in window) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* aşağıdaki yönteme düş */ }
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Görsel açılamadı')); };
      img.src = url;
    });
  }

  function resize(source, { edge, quality }) {
    const w = source.width, h = source.height;
    const scale = Math.min(1, edge / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // PNG şeffaflığı için beyaz zemin
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Dönüştürülemedi'))), 'image/jpeg', quality));
  }

  async function uploadOne(file, { endpoint, keepOriginal, category }) {
    const bitmap = await decode(file);
    const thumb = await resize(bitmap, THUMB);
    const display = await resize(bitmap, DISPLAY);
    if (bitmap.close) bitmap.close();
    const parts = [['thumb', thumb], ['display', display]];
    if (keepOriginal) parts.push(['original', file]);
    const headers = {
      'Content-Type': 'application/octet-stream',
      Accept: 'application/json',
      'X-CSRF-Token': csrf,
      'X-Parts': parts.map(([n, b]) => `${n}:${b.size}`).join(','),
      'X-Filename': encodeURIComponent(file.name),
    };
    if (category !== undefined) headers['X-Category'] = encodeURIComponent(category);
    const res = await fetch(endpoint, { method: 'POST', headers, body: new Blob(parts.map(([, b]) => b)), credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `Sunucu hatası (${res.status})`);
  }

  document.querySelectorAll('[data-uploader]').forEach((form) => {
    const input = form.querySelector('[data-files]');
    const list = form.querySelector('[data-list]');
    const drop = form.querySelector('.uploader__drop');
    const keep = form.querySelector('[data-keep-original]');
    const cat = form.querySelector('[data-category]');
    form.addEventListener('submit', (e) => e.preventDefault());

    ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, () => drop.classList.add('is-over')));
    ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('is-over')));

    input.addEventListener('change', async () => {
      const files = [...input.files].filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
      const skipped = input.files.length - files.length;
      input.value = '';
      if (!files.length) {
        if (skipped) alert('Yalnızca JPG, PNG veya WEBP fotoğraflar yüklenebilir.');
        return;
      }
      list.innerHTML = '';
      const rows = files.map((f) => {
        const li = document.createElement('li');
        li.innerHTML = '<span class="name"></span><span class="state">Sırada</span>';
        li.querySelector('.name').textContent = f.name;
        list.appendChild(li);
        return li;
      });
      input.disabled = true;
      let ok = 0, failed = 0, next = 0;
      const opts = { endpoint: form.dataset.endpoint, keepOriginal: keep ? keep.checked : false, category: cat ? cat.value : undefined };

      async function worker() {
        while (next < files.length) {
          const i = next++;
          const state = rows[i].querySelector('.state');
          state.textContent = 'Yükleniyor…';
          try {
            await uploadOne(files[i], opts);
            state.textContent = 'Tamam'; state.className = 'state ok'; ok++;
          } catch (err) {
            state.textContent = err.message; state.className = 'state err'; failed++;
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));
      input.disabled = false;
      const summary = document.createElement('li');
      summary.innerHTML = `<strong>${ok} fotoğraf yüklendi${failed ? `, ${failed} hata` : ''}.</strong><span>${ok ? 'Sayfa yenileniyor…' : ''}</span>`;
      list.prepend(summary);
      if (ok && !failed) setTimeout(() => location.reload(), 900);
      else if (ok) {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'btn btn--outline btn--sm'; btn.textContent = 'Sayfayı yenile';
        btn.addEventListener('click', () => location.reload());
        summary.querySelector('span').replaceWith(btn);
      }
    });
  });
})();
