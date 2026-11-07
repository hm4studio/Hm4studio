/* HM4 Studio — teklif formu: seçilen paketler + ek kalemler − indirim = toplam */
(function () {
  'use strict';
  const form = document.querySelector('[data-quote-form]');
  if (!form) return;
  const num = (v) => Number(String(v || '').replace(/[^\d]/g, '')) || 0;
  const tl = (n) => `${n.toLocaleString('tr-TR')} ₺`;
  function update() {
    let sum = 0;
    form.querySelectorAll('[data-q-price]:checked').forEach((x) => { sum += num(x.dataset.qPrice); });
    form.querySelectorAll('[data-q-extra]').forEach((x) => { sum += num(x.value); });
    const disc = num(form.querySelector('[data-q-discount]').value);
    form.querySelector('[data-q-sum]').textContent = sum ? `Ara toplam ${tl(sum)}` : '';
    form.querySelector('[data-q-total]').textContent = tl(Math.max(sum - disc, 0));
  }
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  update();
})();
