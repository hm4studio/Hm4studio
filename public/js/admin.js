/* HM4 Studio — admin fotoğraf yükleyici.
   Fotoğraflar tarayıcıda web boyutuna küçültülür (hızlı açılış, mobil performans),
   ardından sırayla sunucuya gönderilir. İstenirse orijinal dosya da yüklenir. */
(function () {
  'use strict';
  // Seri numaralarını panoya kopyala
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    const old = btn.innerHTML;
    try { await navigator.clipboard.writeText(btn.dataset.copy); btn.textContent = 'Kopyalandı'; } catch { btn.textContent = 'Kopyalanamadı'; }
    setTimeout(() => { btn.innerHTML = old; }, 1600);
  });
  // Portfolyo etiketleri: yukarı taşı / sil (sıra, formdaki sıradır)
  document.addEventListener('click', (e) => {
    const up = e.target.closest('[data-tag-up]');
    const del = e.target.closest('[data-tag-del]');
    const row = (up || del)?.closest('[data-tagrow]');
    if (!row) return;
    if (up && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
    if (del) { row.querySelector('input:not([type=hidden])').value = ''; row.hidden = true; }
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

  // Geçici hatalar (site yeniden başlıyor, bağlantı koptu) için tekrar denenir; kalıcı hatalar (ör. dosya çok büyük) denenmez
  const RETRY_WAIT = [3000, 8000, 20000];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const newKey = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  // Yükleme sürerken sayfadan çıkılmaya çalışılırsa tarayıcı uyarı gösterir (çıkılırsa yükleme durur)
  let busy = 0;
  window.addEventListener('beforeunload', (e) => { if (busy) { e.preventDefault(); e.returnValue = ''; } });
  class UploadError extends Error { constructor(msg, retry) { super(msg); this.retry = retry; } }

  async function uploadWithRetry(file, opts, onRetry) {
    file.uploadKey ||= newKey(); // aynı dosyanın tüm denemelerinde aynı anahtar: sunucu iki kez eklemez
    for (let attempt = 0; ; attempt++) {
      try { return await uploadOne(file, opts); } catch (err) {
        if (!err.retry || attempt >= RETRY_WAIT.length) throw err;
        onRetry(attempt + 2, RETRY_WAIT.length + 1);
        await sleep(RETRY_WAIT[attempt]);
      }
    }
  }

  async function uploadOne(file, { endpoint, keepOriginal, category, gallery }) {
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
      'X-Upload-Key': file.uploadKey || '',
    };
    if (category !== undefined) headers['X-Category'] = encodeURIComponent(category);
    if (gallery) headers['X-Gallery'] = gallery;
    let res;
    try {
      res = await fetch(endpoint, { method: 'POST', headers, body: new Blob(parts.map(([, b]) => b)), credentials: 'same-origin' });
    } catch { throw new UploadError('Bağlantı koptu', true); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new UploadError(data.error || `Sunucu hatası (${res.status})`, [0, 408, 429, 500, 502, 503, 504].includes(res.status));
  }

  // Düzenlenmiş fotoğraflar galeriye bağlanmaz: o seçilince galeri alanı gizlenir
  document.querySelectorAll('[data-kind-select]').forEach((sel) => {
    const field = sel.closest('form')?.querySelector('[data-gallery-field]');
    const sync = () => { if (field) field.hidden = sel.value === 'duzenli'; };
    sel.addEventListener('change', sync); sync();
  });
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
      const galSel = form.querySelector('[data-gallery-select]');
      const opts = { endpoint: form.dataset.endpoint, keepOriginal: keep ? keep.checked : false, category: cat ? cat.value : undefined, gallery: galSel && (!cat || cat.value !== 'duzenli') ? galSel.value : '' };
      let ok = 0;
      const summary = document.createElement('li');
      summary.className = 'uploader__summary';

      // Verilen sıradaki dosyaları 2'şer 2'şer yükler; hata verenlerin sırasını döndürür
      async function run(indexes) {
        busy++;
        let next = 0;
        const failed = [];
        async function worker() {
          while (next < indexes.length) {
            const i = indexes[next++];
            const row = rows[i];
            const state = row.querySelector('.state');
            state.textContent = 'Yükleniyor…'; state.className = 'state';
            try {
              await uploadWithRetry(files[i], opts, (n, max) => { state.textContent = `Tekrar deneniyor (${n}/${max})…`; });
              state.textContent = 'Tamam'; state.className = 'state ok'; ok++;
            } catch (err) {
              state.textContent = err.message; state.className = 'state err'; failed.push(i);
            }
          }
        }
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, indexes.length) }, worker));
        busy--;
        return failed;
      }

      function finish(failed) {
        input.disabled = false;
        summary.innerHTML = '';
        const text = document.createElement('strong');
        text.textContent = `${ok} fotoğraf yüklendi${failed.length ? `, ${failed.length} fotoğraf yüklenemedi` : ''}.`;
        summary.appendChild(text);
        list.prepend(summary);
        if (!failed.length) {
          const s = document.createElement('span'); s.textContent = 'Sayfa yenileniyor…'; summary.appendChild(s);
          setTimeout(() => location.reload(), 900);
          return;
        }
        // Hatalılar listenin en üstüne: hangi dosyalar olduğu tek bakışta görünsün
        failed.slice().reverse().forEach((i) => summary.after(rows[i]));
        const again = document.createElement('button');
        again.type = 'button'; again.className = 'btn btn--primary btn--sm';
        again.textContent = `Hatalıları tekrar yükle (${failed.length})`;
        again.addEventListener('click', async () => {
          again.disabled = true; input.disabled = true;
          finish(await run(failed));
        });
        summary.appendChild(again);
        if (ok) {
          const btn = document.createElement('button');
          btn.type = 'button'; btn.className = 'btn btn--text btn--sm'; btn.textContent = 'Sayfayı yenile';
          btn.addEventListener('click', () => location.reload());
          summary.appendChild(btn);
        }
      }

      finish(await run(files.map((_, i) => i)));
    });
  });
})();

// Hatırlatma formu: hızlı tarih düğmeleri
document.querySelectorAll('[data-set-date]').forEach((b) => b.addEventListener('click', () => {
  const inp = document.getElementById('rm-d');
  if (inp) inp.value = b.dataset.setDate;
  document.querySelectorAll('[data-set-date]').forEach((x) => x.classList.toggle('is-active', x === b));
}));

// Sayfa başlıkları: Google önizlemesi ve harf sayacı
document.querySelectorAll('[data-seo-row]').forEach((row) => {
  const pairs = [[row.querySelector('[data-seo-t]'), row.querySelector('[data-seo-pt]')], [row.querySelector('[data-seo-d]'), row.querySelector('[data-seo-pd]')]];
  const counters = row.querySelectorAll('[data-seo-n]');
  pairs.forEach(([inp, out], i) => {
    if (!inp || !out) return;
    const upd = () => {
      const v = inp.value.trim() || inp.placeholder;
      out.textContent = v;
      const n = v.length; const max = Number(inp.dataset.max);
      counters[i].textContent = `(${n}/${max}${n > max ? ' · uzun, Google keser' : ''})`;
      counters[i].classList.toggle('is-over', n > max);
    };
    inp.addEventListener('input', upd); upd();
  });
});
