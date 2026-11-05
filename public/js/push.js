/* HM4 Studio — telefon bildirimlerini aç / kapat (çift ve yönetici panelleri). */
(function () {
  'use strict';
  const box = document.querySelector('[data-push]');
  if (!box) return;
  const text = box.querySelector('[data-push-text]');
  const btn = box.querySelector('[data-push-btn]');
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const post = (url, body) => fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(body) });
  const b64 = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, (c) => c.charCodeAt(0)); };

  function show(msg, label, on) {
    text.textContent = msg;
    btn.hidden = !label;
    if (label) btn.textContent = label;
    btn.className = `btn btn--sm ${on ? 'btn--text' : 'btn--primary'}`;
    box.dataset.state = on ? 'on' : 'off';
    box.hidden = false;
  }

  async function current() {
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }

  // Çift panelinde sessiz mod: çalışmayacağı yerde (iPhone'da ana ekrana eklenmemişse, desteklenmiyorsa,
  // izin engellenmişse) kutu hiç görünmez; çifte korkutucu bir uyarı gösterilmez.
  const quiet = box.hasAttribute('data-push-quiet');
  async function render() {
    if (quiet && (!supported || (isIOS && !standalone) || Notification.permission === 'denied')) { box.hidden = true; return; }
    if (!supported) {
      if (isIOS && !standalone) return show('Bildirim almak için önce bu sayfayı ana ekranınıza ekleyin (Paylaş › Ana Ekrana Ekle), sonra uygulamadan açın.', '', false);
      return show('Bu tarayıcı bildirimleri desteklemiyor.', '', false);
    }
    if (Notification.permission === 'denied') return show('Bildirimler engellenmiş. Telefonun Ayarlar › Bildirimler bölümünden HM4 Studio’ya izin verin.', '', false);
    const sub = await current().catch(() => null);
    if (sub) return show('Bildirimler bu cihazda açık.', 'Kapat', true);
    show(box.dataset.offText || 'Gelişmeleri telefon bildirimiyle haber verelim.', 'Bildirimleri aç', false);
  }

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const existing = await current();
      if (existing) {
        await post('/push/iptal', { endpoint: existing.endpoint });
        await existing.unsubscribe();
      } else {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') { await render(); return; }
        const { key } = await (await fetch('/push/anahtar')).json();
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
        const r = await post('/push/abone', { subscription: sub.toJSON(), test: true });
        if (!r.ok) throw new Error('kaydedilemedi');
      }
    } catch {
      text.textContent = 'Bir sorun oldu, sayfayı yenileyip tekrar deneyin.';
      btn.disabled = false;
      return;
    }
    btn.disabled = false;
    render();
  });

  render();
})();
