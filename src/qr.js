'use strict';
// QR kodu → SVG (basılı hediye kartları için). Kütüphane: src/vendor/qrcode.js (MIT, Kazuhiko Arase).
const qrcode = require('./vendor/qrcode');

// Satır içi stil kullanmadan, tek bir <path> ile kare kare çizilen SVG
function svg(text, { size = 120, margin = 2 } = {}) {
  const qr = qrcode(0, 'M');
  qr.addData(String(text));
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
  const box = n + margin * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="QR kod"><rect width="${box}" height="${box}" fill="#fff"/><path d="${d}" fill="#111"/></svg>`;
}

module.exports = { svg };
