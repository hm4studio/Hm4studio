'use strict';
// İlerleme çubukları (CSP: satır içi stil yok)
document.querySelectorAll('.ed-bar i[data-w]').forEach((el) => { el.style.width = `${el.dataset.w}%`; });
