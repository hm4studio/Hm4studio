/* İlk giriş kılavuzu: ekran kararır, panelin bölümleri sırayla aydınlanıp okla anlatılır.
   Bir kez gösterilir; görüldüğü sunucuya yazılır (başka cihazda tekrar çıkmaz). */
(() => {
  const KEY = 'hm4-tour-seen';
  try { if (localStorage.getItem(KEY) === '1') return; } catch { /* depolama kapalı olabilir */ }
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const pick = (...sels) => sels.map((s) => document.querySelector(s)).find(visible) || null;

  const steps = [
    { el: () => pick('.cnext'), t: 'Sıradaki adımınız', hi: 'hep burada', p: 'Ne yapmanız gerektiğini buradan takip edin; düğmeye dokunmanız yeterli.' },
    { el: () => pick('.aibot__fab'), t: 'Sorunuz mu var?', hi: 'Asistanımıza sorun', p: 'Yapay zekâ asistanımız 7/24 yanıt verir: fotoğraflarınız ne zaman hazır, albüm nasıl seçilir, sözleşme nasıl onaylanır…', round: true, act: 'Hemen sor' },
    { el: () => pick('.ctiles'), t: 'Fotoğraflar, albüm ve video', hi: 'tek yerde', p: 'Hazır oldukça burada açılır. Albüm seçiminizi de buradan yaparsınız.' },
    { el: () => pick('#c-durum'), t: 'İşiniz', hi: 'hangi aşamada?', p: 'Çekimden teslime kadar nerede olduğumuzu buradan görün.' },
    { el: () => pick('#c-odeme', '#c-belgeler'), t: 'Ödeme ve', hi: 'belgeleriniz', p: 'Sözleşmeniz, ödemeleriniz ve randevu belgeniz burada.' },
    { el: () => pick('.tabbar', '.cside__nav'), t: 'Sayfalar arasında', hi: 'buradan geçin', p: 'Ana sayfa, Fotoğraflar, Albüm ve diğerleri her zaman burada.' },
  ].filter((s) => s.el());
  if (steps.length < 2) return;

  const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; };
  const root = mk('div', 'tour'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Panel kılavuzu');
  const ring = mk('div', 'tour__ring');
  const box = mk('div', 'tour__box');
  const title = mk('p', 'tour__t');
  const text = mk('p', 'tour__p');
  const foot = mk('div', 'tour__foot');
  const dots = mk('span', 'tour__dots');
  const next = mk('button', 'tour__next'); next.type = 'button';
  const skip = mk('button', 'tour__skip', 'Geç'); skip.type = 'button';
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'tour__arrow'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path'); const head = document.createElementNS(NS, 'path');
  svg.append(path, head);
  const act = mk('button', 'tour__act'); act.type = 'button';
  const btns = mk('span', 'tour__btns'); btns.append(skip, act, next);
  foot.append(dots, btns);
  box.append(title, text, foot);
  root.append(ring, svg, box);
  document.body.appendChild(root);
  document.body.classList.add('is-touring');

  let i = 0;
  function finish() {
    root.remove(); document.body.classList.remove('is-touring');
    try { localStorage.setItem(KEY, '1'); } catch { /* yok say */ }
    fetch('/panel/tur', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: '{}' }).catch(() => {});
  }
  function place() {
    const s = steps[i]; const el = s.el(); if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 8, vw = window.innerWidth, vh = window.innerHeight;
    Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    ring.classList.toggle('is-round', Boolean(s.round));
    // Yazı kutusu: hedefin üstünde yer varsa üste, yoksa alta
    const bw = Math.min(340, vw - 32);
    box.style.width = `${bw}px`;
    const bh = box.offsetHeight || 150;
    const tab = document.querySelector('.tabbar'); const safeB = tab && visible(tab) && s.el() !== tab ? vh - tab.getBoundingClientRect().top + 12 : 16;
    const above = r.top - pad > bh + 90 || r.bottom + pad + 70 + bh > vh - safeB;
    let top = above ? r.top - pad - bh - 60 : r.bottom + pad + 60;
    if (top < 16 && !above) top = 16;
    const left = Math.max(16, Math.min(vw - bw - 16, r.left + r.width / 2 - bw / 2 - 30));
    Object.assign(box.style, { left: `${left}px`, top: `${Math.max(16, top)}px` });
    // Kıvrık ok: yazı kutusundan hedefe
    const bx = left + bw * 0.62, by = above ? Math.max(16, top) + bh + 6 : Math.max(16, top) - 6;
    const tx = Math.max(24, Math.min(vw - 24, r.left + r.width * 0.72)), ty = above ? r.top - pad - 6 : r.bottom + pad + 6;
    const cx = bx + (tx > bx ? 70 : -70), cy = (by + ty) / 2;
    svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
    path.setAttribute('d', `M${bx},${by} Q${cx},${cy} ${tx},${ty}`);
    const ang = Math.atan2(ty - cy, tx - cx), L = 11;
    const p1 = [tx - L * Math.cos(ang - 0.5), ty - L * Math.sin(ang - 0.5)], p2 = [tx - L * Math.cos(ang + 0.5), ty - L * Math.sin(ang + 0.5)];
    head.setAttribute('d', `M${p1[0]},${p1[1]} L${tx},${ty} L${p2[0]},${p2[1]}`);
  }
  function show() {
    const s = steps[i];
    title.textContent = `${s.t} `; const em = mk('em', '', s.hi); title.appendChild(em);
    text.textContent = s.p;
    dots.textContent = ''; steps.forEach((_, k) => dots.appendChild(mk('i', k === i ? 'on' : '')));
    next.textContent = i === steps.length - 1 ? 'Başlayalım' : 'İleri';
    skip.hidden = i === steps.length - 1;
    act.hidden = !s.act; act.textContent = s.act || '';
    const el = s.el();
    const r = el.getBoundingClientRect();
    if (r.top < 70 || r.bottom > window.innerHeight - 90) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(place, 420); } else place();
    root.classList.remove('is-in'); void root.offsetWidth; root.classList.add('is-in');
    next.focus({ preventScroll: true });
  }
  next.addEventListener('click', () => { if (i < steps.length - 1) { i++; show(); } else finish(); });
  skip.addEventListener('click', finish);
  act.addEventListener('click', () => { const el = steps[i].el(); finish(); if (el) el.click(); });
  document.addEventListener('keydown', (e) => { if (!document.body.contains(root)) return; if (e.key === 'Escape') finish(); if (e.key === 'ArrowRight' || e.key === 'Enter') next.click(); });
  window.addEventListener('resize', () => document.body.contains(root) && place());
  window.addEventListener('scroll', () => document.body.contains(root) && place(), { passive: true });
  setTimeout(show, 700); // sayfa yerleşsin
})();
