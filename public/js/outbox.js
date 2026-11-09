/* HM4 Studio — panel: elle gönderilen WhatsApp mesajları. "Gönder" WhatsApp'ı açar ve mesajı gönderildi sayar. */
(function () {
  'use strict';
  const box = document.querySelector('[data-outbox]');
  if (!box) return;
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const count = box.querySelector('[data-todo-count], [data-outbox-count]');
  async function done(item) {
    const keys = (item.dataset.keys || '').split(',').filter(Boolean);
    item.classList.add('is-done');
    try {
      await fetch('/admin/mesajlar/gonderildi', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ keys }) });
    } catch { item.classList.remove('is-done'); return; }
    setTimeout(() => {
      const grp = item.closest('[data-tg-group]');
      item.remove();
      if (grp) {
        const n = grp.querySelectorAll('[data-todo-item]').length;
        box.querySelectorAll(`[data-tg-count="${grp.dataset.tgGroup}"]`).forEach((el) => { el.textContent = n; });
        if (!n) { grp.remove(); box.querySelector(`[data-tg="${grp.dataset.tgGroup}"]`)?.remove(); }
      }
      const tot = box.querySelector('[data-tg=""] b');
      const left = box.querySelectorAll('[data-todo-item], [data-outbox-item]').length;
      if (count) count.textContent = left;
      if (tot) tot.textContent = left;
      if (!left) box.querySelector('[data-todo-empty]')?.removeAttribute('hidden');
    }, 600);
  }
  // Başlık süzgeci: bir başlık seçilince yalnız o grup açık görünür
  box.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-tg]');
    if (!chip) return;
    const key = chip.dataset.tg;
    box.querySelectorAll('[data-tg]').forEach((c) => c.classList.toggle('is-on', c === chip));
    box.querySelectorAll('[data-tg-group]').forEach((g) => {
      const show = !key || g.dataset.tgGroup === key;
      g.hidden = !show;
      if (key && show) g.open = true;
    });
  });
  box.addEventListener('click', (e) => {
    const send = e.target.closest('[data-outbox-send]');
    const skip = e.target.closest('[data-outbox-skip]');
    const item = e.target.closest('[data-outbox-item]');
    if (!item) return;
    if (send) done(item); // bağlantı yeni sekmede açılır, satır işaretlenir
    else if (skip) done(item);
  });
})();
