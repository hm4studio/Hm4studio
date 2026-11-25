// Ana ekran uygulamasından Safari'ye gönderilen "Masamda gör" sayfası: #<anahtar> → /media/ar/<anahtar>.usdz
(function () {
  var k = (location.hash || '').slice(1);
  var a = document.getElementById('ar');
  if (!/^[a-f0-9]{32}$/.test(k)) { a.hidden = true; document.getElementById('hata').hidden = false; return; }
  a.href = '/media/ar/' + k + '.usdz#allowsContentScaling=0';
})();
