'use strict';
// İndirme kapalı çift: fotoğraf ve videoda basılı tutup/sağ tıklayıp kaydetme menüsü açılmaz.
(function () {
  document.body.classList.add('is-nodl');
  const blocked = (t) => t && t.closest && t.closest('img, video, .tile__img, .lb, [data-lb]');
  document.addEventListener('contextmenu', (e) => { if (blocked(e.target)) e.preventDefault(); });
  document.addEventListener('dragstart', (e) => { if (blocked(e.target)) e.preventDefault(); });
}());
