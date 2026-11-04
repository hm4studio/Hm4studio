/* HM4 Studio — sözleşme imza alanı: parmak/fare ile çizim, PNG olarak forma eklenir. */
(function () {
  'use strict';
  const form = document.querySelector('[data-sign-form]');
  if (!form) return;
  const canvas = form.querySelector('[data-sigpad]');
  const pad = canvas.parentElement;
  const out = form.querySelector('[data-sig-value]');
  const err = form.querySelector('[data-sig-error]');
  const ctx = canvas.getContext('2d');
  let drawing = false, last = null, inked = 0;

  function size() {
    const r = canvas.getBoundingClientRect();
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const prev = inked ? canvas.toDataURL() : null;
    canvas.width = Math.round(r.width * ratio);
    canvas.height = Math.round(r.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2.2;
    if (prev) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height); img.src = prev; }
  }
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drawing = true; last = pos(e);
    ctx.beginPath(); ctx.arc(last.x, last.y, 1.1, 0, Math.PI * 2); ctx.fillStyle = '#1a1a1a'; ctx.fill();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    inked += Math.hypot(p.x - last.x, p.y - last.y);
    last = p;
    pad.classList.add('is-signed'); pad.classList.remove('is-error'); err.hidden = true;
  });
  const end = () => { drawing = false; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  form.querySelector('[data-sig-clear]').addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    inked = 0; pad.classList.remove('is-signed');
  });

  // İmzayı beyaz zeminli, küçültülmüş PNG olarak hazırla
  function exportPng() {
    const w = 600, hgt = Math.round(600 * canvas.height / canvas.width);
    const c2 = document.createElement('canvas');
    c2.width = w; c2.height = hgt;
    const x = c2.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, hgt);
    x.drawImage(canvas, 0, 0, w, hgt);
    return c2.toDataURL('image/png');
  }

  form.addEventListener('submit', (e) => {
    if (inked < 40) {
      e.preventDefault();
      pad.classList.add('is-error'); err.hidden = false;
      pad.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    out.value = exportPng();
  });

  size();
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(size, 150); });
})();
