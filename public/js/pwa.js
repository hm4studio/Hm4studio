/* HM4 Studio — uygulama (PWA) desteği: servis çalışanını kaydeder ve
   "Ana ekrana ekle" kartını gösterir (Android'de tek dokunuş, iPhone/iPad'de yönlendirme). */
(function () {
  'use strict';

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* desteklenmiyorsa site normal çalışır */ });
    });
  }

  // Ana ekrandaki uygulamadan açıldıysa sitenin sayfaları yerine uygulamanın giriş ekranına git
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isStandalone) {
    const p = location.pathname;
    if (p === '/' || p === '/giris') { location.replace('/uygulama'); return; }
    if (p === '/admin/giris') { location.replace('/uygulama?giris=studyo'); return; }
  }

  // Çevrimdışı sayfasındayken bağlantı gelince yenile
  if (location.pathname === '/offline.html') window.addEventListener('online', () => location.replace('/uygulama'));

  const card = document.querySelector('[data-install]');
  if (!card) return;

  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  let dismissed = false;
  try { dismissed = localStorage.getItem('hm4-install-dismissed') === '1'; } catch { /* depolama kapalı olabilir */ }
  if (standalone || dismissed) return;

  const text = card.querySelector('[data-install-text]');
  const btn = card.querySelector('[data-install-btn]');
  const close = card.querySelector('[data-install-close]');
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  let deferred = null;

  close.addEventListener('click', () => {
    card.hidden = true;
    try { localStorage.setItem('hm4-install-dismissed', '1'); } catch { /* yok say */ }
  });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    text.textContent = 'Fotoğraflarınıza tek dokunuşla ulaşmak için ana ekranınıza ekleyin.';
    btn.hidden = false;
    card.hidden = false;
  });

  btn.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice.catch(() => null);
    deferred = null;
    card.hidden = true;
  });

  window.addEventListener('appinstalled', () => { card.hidden = true; });

  if (isIOS) {
    text.textContent = isSafari
      ? 'Safari’de alttaki Paylaş simgesine, ardından “Ana Ekrana Ekle”ye dokunun.'
      : 'Bu sayfayı Safari’de açıp Paylaş › “Ana Ekrana Ekle”yi seçin.';
    card.hidden = false;
  }
})();
