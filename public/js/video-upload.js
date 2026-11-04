/* HM4 Studio — video teslimi: büyük dosyaları 8 MB'lık parçalar hâlinde yükler (bağlantı koparsa parça yeniden denenir). */
(function () {
  'use strict';
  const form = document.querySelector('[data-video-upload]');
  if (!form) return;
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const input = form.querySelector('[data-v-file]');
  const box = form.querySelector('[data-v-progress]');
  const bar = form.querySelector('[data-v-bar]');
  const text = form.querySelector('[data-v-text]');
  const CHUNK = 8 * 1024 * 1024;
  const mb = (n) => `${(n / 1024 / 1024).toFixed(0)} MB`;
  const hex = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  let busy = false;

  window.addEventListener('beforeunload', (e) => { if (busy) { e.preventDefault(); e.returnValue = ''; } });

  async function sendChunk(url, headers, blob) {
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const res = await fetch(url, { method: 'POST', headers, body: blob, credentials: 'same-origin' });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) return data;
        if (res.status < 500 && res.status !== 408) throw new Error(data.error || `Hata (${res.status})`);
      } catch (err) {
        if (attempt === 4 || /Geçersiz|biçim|büyük|sırası/.test(err.message)) throw err;
      }
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
    throw new Error('Bağlantı sorunu');
  }

  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file || busy) return;
    const title = form.querySelector('[data-v-title]').value.trim() || file.name.replace(/\.[^.]+$/, '');
    const kind = form.querySelector('[data-v-kind]').value;
    const total = Math.max(1, Math.ceil(file.size / CHUNK));
    const id = hex();
    busy = true; box.hidden = false; input.disabled = true;
    const started = Date.now();
    try {
      for (let i = 0; i < total; i++) {
        const blob = file.slice(i * CHUNK, Math.min(file.size, (i + 1) * CHUNK));
        await sendChunk(form.dataset.endpoint, {
          'X-CSRF-Token': csrf, Accept: 'application/json', 'Content-Type': 'application/octet-stream',
          'X-Upload-Id': id, 'X-Index': String(i), 'X-Total': String(total),
          'X-Title': encodeURIComponent(title), 'X-Kind': encodeURIComponent(kind),
        }, blob);
        const done = Math.min(file.size, (i + 1) * CHUNK);
        const pct = Math.round((done / file.size) * 100);
        const secs = (Date.now() - started) / 1000;
        const left = secs > 3 ? Math.round((secs / done) * (file.size - done) / 60) : null;
        bar.style.width = `${pct}%`;
        text.textContent = `%${pct} · ${mb(done)} / ${mb(file.size)}${left !== null ? ` · yaklaşık ${left < 1 ? '1 dakikadan az' : left + ' dk'} kaldı` : ''}`;
      }
      text.textContent = 'Yüklendi. Sayfa yenileniyor…';
      busy = false;
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      busy = false; input.disabled = false;
      text.textContent = `Yüklenemedi: ${err.message}`;
      box.classList.add('is-error');
    }
  });
})();
