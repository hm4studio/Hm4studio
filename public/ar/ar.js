(function () {
  var ua = navigator.userAgent;
  var ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var android = /Android/.test(ua);
  var a = document.createElement('a');
  var quick = ios && a.relList && a.relList.supports && a.relList.supports('ar');
  document.getElementById(quick ? 'ios' : android ? 'android' : 'other').hidden = false;
  if (ios && !quick) document.getElementById('ios').hidden = false;
})();
