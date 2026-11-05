/* HM4 Studio — çift panelindeki asistan balonu. Konuşma yalnızca bu sekmede tutulur. */
(function () {
  'use strict';
  const root = document.querySelector('[data-aibot]');
  if (!root) return;
  const panel = root.querySelector('[data-aibot-panel]');
  const log = root.querySelector('[data-aibot-log]');
  const form = root.querySelector('[data-aibot-form]');
  const input = form.querySelector('input');
  const send = form.querySelector('button');
  const chips = root.querySelector('[data-aibot-chips]');
  const fab = root.querySelector('.aibot__fab');
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const KEY = `hm4-aibot-${document.querySelector('.panel-nav__who')?.textContent || ''}`;
  // Çıkışta konuşmayı sil (ortak kullanılan cihazlarda başkası görmesin)
  document.querySelectorAll('form[action="/cikis"]').forEach((f) => f.addEventListener('submit', () => { try { sessionStorage.removeItem(KEY); } catch { /* yok say */ } }));
  let history = [];
  try { history = JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch { history = []; }

  function bubble(text, who) {
    const el = document.createElement('div');
    el.className = `aibot__msg is-${who}`;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }
  history.forEach((m) => bubble(m.content, m.role === 'user' ? 'me' : 'bot'));
  if (history.length) chips.hidden = true;

  function toggle(open) {
    const on = open ?? panel.hidden;
    panel.hidden = !on;
    root.classList.toggle('is-open', on);
    fab.setAttribute('aria-expanded', String(on));
    if (on) { log.scrollTop = log.scrollHeight; if (window.matchMedia('(min-width: 700px)').matches) input.focus(); } else fab.focus();
  }
  root.querySelectorAll('[data-aibot-toggle]').forEach((b) => b.addEventListener('click', () => toggle()));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) toggle(false); });

  async function ask(q) {
    q = q.trim();
    if (!q) return;
    chips.hidden = true;
    bubble(q, 'me');
    history.push({ role: 'user', content: q });
    input.value = ''; send.disabled = true; input.disabled = true;
    const wait = bubble('Yazıyor…', 'bot'); wait.classList.add('is-wait');
    let reply;
    try {
      const r = await fetch('/panel/asistan', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ messages: history.slice(-12) }) });
      if (r.status === 401) { location.href = '/giris'; return; }
      reply = (await r.json()).reply;
    } catch { reply = ''; }
    reply = reply || 'Bağlantı sorunu oldu, birazdan tekrar dener misiniz?';
    wait.remove();
    bubble(reply, 'bot');
    history.push({ role: 'assistant', content: reply });
    history = history.slice(-20);
    try { sessionStorage.setItem(KEY, JSON.stringify(history)); } catch { /* yok say */ }
    send.disabled = false; input.disabled = false;
    if (window.matchMedia('(min-width: 700px)').matches) input.focus();
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); });
  chips.addEventListener('click', (e) => { const b = e.target.closest('[data-aibot-chip]'); if (b) ask(b.textContent); });
})();
