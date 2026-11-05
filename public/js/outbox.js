/* HM4 Studio — panel: elle gönderilen WhatsApp mesajları. "Gönder" WhatsApp'ı açar ve mesajı gönderildi sayar. */
(function () {
  'use strict';
  const box = document.querySelector('[data-outbox]');
  if (!box) return;
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const count = box.querySelector('[data-outbox-count]');
  async function done(item) {
    const keys = (item.dataset.keys || '').split(',').filter(Boolean);
    item.classList.add('is-done');
    try {
      await fetch('/admin/mesajlar/gonderildi', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ keys }) });
    } catch { item.classList.remove('is-done'); return; }
    setTimeout(() => {
      item.remove();
      const left = box.querySelectorAll('[data-outbox-item]').length;
      if (count) count.textContent = left;
      if (!left) box.remove();
    }, 600);
  }
  box.addEventListener('click', (e) => {
    const send = e.target.closest('[data-outbox-send]');
    const skip = e.target.closest('[data-outbox-skip]');
    const item = e.target.closest('[data-outbox-item]');
    if (!item) return;
    if (send) done(item); // bağlantı yeni sekmede açılır, satır işaretlenir
    else if (skip) done(item);
  });
})();
