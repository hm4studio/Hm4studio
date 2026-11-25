'use strict';
// Admin › albüm modeli düzenleme: renk/ebat aç-kapa, fotoğraf ve renk dokusu yükleme, silme onayı
(() => {
  const root = document.querySelector('[data-kt]');
  if (!root) return;
  const no = root.dataset.kt;
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';

  // Onay kutuları ana formdaki gizli alanları açar/kapatır (Kaydet ile birlikte gider)
  for (const cb of root.querySelectorAll('[data-kt-tog]')) {
    cb.addEventListener('change', () => {
      const hid = [...root.querySelectorAll('[data-kt-on]')].find((x) => x.dataset.ktOn === cb.dataset.ktTog);
      if (hid) hid.disabled = !cb.checked;
    });
  }
  for (const f of root.querySelectorAll('[data-kt-confirm]')) {
    f.addEventListener('submit', (e) => { if (!window.confirm(f.dataset.ktConfirm)) e.preventDefault(); });
  }

  // Görseli tarayıcıda küçült: model fotoğrafı 1000px kenar, renk dokusu 384px kare
  function shrink(file, square) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const max = square ? 384 : 1000;
        let sx = 0; let sy = 0; let sw = img.naturalWidth; let sh = img.naturalHeight;
        if (square) { const s = Math.min(sw, sh); sx = (sw - s) / 2; sy = (sh - s) / 2; sw = s; sh = s; }
        const k = Math.min(1, max / Math.max(sw, sh));
        const cv = document.createElement('canvas');
        cv.width = Math.round(sw * k); cv.height = Math.round(sh * k);
        const ctx = cv.getContext('2d');
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
        const px = ctx.getImageData(0, 0, cv.width, cv.height).data;
        let r = 0; let g = 0; let b = 0; let n = 0;
        for (let i = 0; i < px.length; i += 64) { r += px[i]; g += px[i + 1]; b += px[i + 2]; n += 1; }
        const hex = `#${[r, g, b].map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('')}`;
        URL.revokeObjectURL(img.src);
        resolve({ image: cv.toDataURL('image/jpeg', 0.86), hex });
      };
      img.onerror = () => reject(new Error('Görsel açılamadı.'));
      img.src = URL.createObjectURL(file);
    });
  }

  for (const inp of root.querySelectorAll('[data-kt-up]')) {
    inp.addEventListener('change', async () => {
      const file = inp.files && inp.files[0];
      if (!file) return;
      const tur = inp.dataset.ktUp;
      const ad = tur === 'renk' ? (document.getElementById('kt-newcolor')?.value || '').trim() : '';
      if (tur === 'renk' && !ad) { window.alert('Önce renk adını yazın.'); inp.value = ''; return; }
      const btn = inp.closest('label');
      btn?.classList.add('is-busy');
      try {
        const { image, hex } = await shrink(file, tur === 'renk');
        const r = await fetch(`/admin/albumler/${no}/gorsel`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ tur, ad, hex, image }) });
        if (!r.ok) { const t = await r.text(); throw new Error((/<p[^>]*>([^<]+)/.exec(t) || [])[1] || 'Yüklenemedi.'); }
        location.hash = tur === 'renk' ? 'renkler' : '';
        location.reload();
      } catch (err) {
        window.alert(err.message || 'Yüklenemedi.');
      } finally { btn?.classList.remove('is-busy'); inp.value = ''; }
    });
  }
})();
