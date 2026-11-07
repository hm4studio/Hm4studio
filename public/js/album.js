/* HM4 Studio — çift paneli: albüm tasarımı sayfa onayı */
(function () {
  'use strict';
  const list = document.querySelector('[data-album]');
  if (!list) return;
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const total = Number(list.dataset.total) || 0;
  const progress = document.querySelector('[data-alb-progress]');
  const approve = document.querySelector('[data-alb-approve]');
  const changes = document.querySelector('[data-alb-changes]');

  function refresh() {
    const pages = [...list.querySelectorAll('[data-alb-page]')];
    const st = (s) => pages.filter((p) => p.dataset.status === s).length;
    const done = total - st('bekliyor');
    if (progress) progress.textContent = `${done} / ${total} sayfa incelendi`;
    if (approve) approve.disabled = st('onay') !== total;
    if (changes) changes.disabled = done !== total || !st('degisiklik');
  }

  async function save(page, status, note) {
    const res = await fetch(`/panel/album/sayfa/${page.dataset.albPage}`, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ status, note }),
    }).catch(() => null);
    if (!res || !res.ok) { alert('Kaydedilemedi, bağlantınızı kontrol edip tekrar deneyin.'); return false; }
    page.dataset.status = status;
    page.querySelectorAll('[data-alb-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.albSet === status)));
    refresh();
    return true;
  }

  list.addEventListener('click', async (e) => {
    const page = e.target.closest('[data-alb-page]');
    if (!page) return;
    const box = page.querySelector('[data-alb-note]');
    const text = box?.querySelector('textarea');
    const set = e.target.closest('[data-alb-set]');
    if (set) {
      if (set.dataset.albSet === 'onay') { if (await save(page, 'onay')) box.hidden = true; return; }
      box.hidden = false; text.focus(); // not yazılınca kaydedilir
      if (text.value.trim()) save(page, 'degisiklik', text.value);
      return;
    }
    if (e.target.closest('[data-alb-save]')) {
      if (!text.value.trim()) { text.focus(); return; }
      const btn = e.target.closest('[data-alb-save]');
      if (await save(page, 'degisiklik', text.value)) { btn.textContent = 'Kaydedildi'; setTimeout(() => { btn.textContent = 'Notu kaydet'; }, 1500); }
    }
  });
  refresh();
})();
