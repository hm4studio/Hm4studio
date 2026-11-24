(function () {
  var ua = navigator.userAgent;
  var ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var android = /Android/.test(ua);
  var sel = ios ? '[data-ios]' : android ? '[data-android]' : '[data-other]';
  document.querySelectorAll(sel).forEach(function (el) { el.hidden = false; });
})();
