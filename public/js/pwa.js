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
    if (p === '/admin/giris') { location.replace('/uygulama'); return; }
  }

  // Çift ana ekrandaki uygulamayı kullanıyor: stüdyo panelinde görünsün (oturum başına bir kez)
  if (isStandalone && location.pathname.startsWith('/panel')) {
    let sent = false;
    try { sent = sessionStorage.getItem('hm4-app-ping') === '1'; } catch { /* yok say */ }
    const csrf = document.querySelector('meta[name="csrf-token"]')?.content;
    if (!sent && csrf) {
      fetch('/panel/uygulama', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf } }).catch(() => {});
      try { sessionStorage.setItem('hm4-app-ping', '1'); } catch { /* yok say */ }
    }
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
  const sheet = document.querySelector('[data-install-sheet]');
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  // Uygulama içi tarayıcılar (WhatsApp, Instagram, Facebook…) ana ekrana eklemeye izin vermez
  const inApp = /WhatsApp|Instagram|FBAN|FBAV|FB_IAB|Line\/|Snapchat|TikTok|musical_ly|GSA\//i.test(ua) || (isAndroid && /; wv\)/.test(ua));
  const isSafari = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|DuckDuckGo/.test(ua) && !inApp;
  const isSamsung = /SamsungBrowser/i.test(ua);
  let deferred = null;

  close.addEventListener('click', () => {
    card.hidden = true;
    try { localStorage.setItem('hm4-install-dismissed', '1'); } catch { /* yok say */ }
  });

  // Telefona göre adım adım anlatım
  function steps() {
    if (inApp) {
      return {
        title: 'Önce tarayıcıda açın',
        lead: `Bu sayfa ${/WhatsApp/i.test(ua) ? 'WhatsApp’ın' : /Instagram/i.test(ua) ? 'Instagram’ın' : 'uygulamanın'} içinde açıldı; buradan ana ekrana eklenemez.`,
        list: isIOS
          ? ['Sağ alttaki ya da sağ üstteki pusula / ••• simgesine dokunun.', '“Safari’de Aç”ı seçin.', 'Safari’de alttaki Paylaş simgesi › “Ana Ekrana Ekle”.']
          : ['Sağ üstteki ⋮ menüsüne dokunun.', '“Tarayıcıda aç” ya da “Chrome’da aç”ı seçin.', 'Açılan sayfada “Ekle”ye dokunun.'],
        copy: true,
      };
    }
    if (isIOS && !isSafari) return { title: 'Safari’de açın', lead: 'iPhone’da ana ekrana ekleme yalnızca Safari’de yapılabilir.', list: ['Aşağıdan bağlantıyı kopyalayın.', 'Safari’yi açıp adres çubuğuna yapıştırın.', 'Paylaş simgesi › “Ana Ekrana Ekle”.'], copy: true };
    if (isIOS) return { title: 'Ana ekrana ekleyin', lead: 'Üç dokunuş:', list: ['Alttaki Paylaş simgesine dokunun (kutudan yukarı çıkan ok).', 'Listeyi biraz kaydırıp “Ana Ekrana Ekle”yi seçin.', 'Sağ üstteki “Ekle”ye dokunun.'] };
    if (isSamsung) return { title: 'Ana ekrana ekleyin', lead: 'Samsung İnternet’te:', list: ['Alttaki ☰ menüsüne dokunun.', '“Sayfayı ekle” › “Ana ekran”ı seçin.', '“Ekle”ye dokunun.'] };
    return { title: 'Ana ekrana ekleyin', lead: 'Chrome’da:', list: ['Sağ üstteki ⋮ menüsüne dokunun.', '“Uygulamayı yükle” ya da “Ana ekrana ekle”yi seçin.', '“Yükle”ye dokunun.'] };
  }
  function openSheet() {
    if (!sheet) return;
    const st = steps();
    sheet.querySelector('[data-sheet-title]').textContent = st.title;
    sheet.querySelector('[data-sheet-lead]').textContent = st.lead;
    const ol = sheet.querySelector('[data-sheet-list]'); ol.textContent = '';
    st.list.forEach((x) => { const li = document.createElement('li'); li.textContent = x; ol.appendChild(li); });
    const cp = sheet.querySelector('[data-sheet-copy]');
    cp.hidden = !st.copy;
    if (sheet.parentElement !== document.body) document.body.appendChild(sheet); // animasyonlu kapsayıcıdan çıkar
    sheet.hidden = false;
    document.body.classList.add('is-sheet');
  }
  if (sheet) {
    sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('[data-sheet-close]')) { sheet.hidden = true; document.body.classList.remove('is-sheet'); } });
    const cp = sheet.querySelector('[data-sheet-copy]');
    cp.addEventListener('click', async () => {
      const url = `${location.origin}/giris`;
      try { await navigator.clipboard.writeText(url); cp.textContent = 'Kopyalandı ✓'; } catch { window.prompt('Bağlantıyı kopyalayın:', url); }
    });
  }

  function showCard(msg, label) {
    text.textContent = msg;
    btn.textContent = label;
    btn.hidden = false;
    card.hidden = false;
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    showCard('Fotoğraflarınıza tek dokunuşla ulaşmak için ana ekranınıza ekleyin.', 'Ekle');
  });

  btn.addEventListener('click', async () => {
    if (!deferred) { openSheet(); return; }
    const ev = deferred; deferred = null;
    try {
      await ev.prompt();
      const choice = await ev.userChoice.catch(() => null);
      if (choice && choice.outcome === 'accepted') { card.hidden = true; return; }
    } catch { /* tarayıcı izin vermedi */ }
    // vazgeçildiyse ya da açılmadıysa: elle ekleme adımları
    showCard('Dilediğiniz zaman ekleyebilirsiniz.', 'Nasıl eklenir?');
  });

  window.addEventListener('appinstalled', () => { card.hidden = true; });

  // Otomatik kurulum penceresi gelmeyen telefonlar (iPhone, uygulama içi tarayıcı, Samsung…) için anlatım
  const fallback = () => {
    if (deferred || !card.hidden) return;
    if (!(isIOS || isAndroid)) return;
    showCard(inApp ? 'Önce sayfayı tarayıcıda açmanız gerekiyor.' : isIOS ? 'Safari’den üç dokunuşla ana ekranınıza ekleyin.' : 'Fotoğraflarınıza tek dokunuşla ulaşmak için ana ekranınıza ekleyin.', 'Nasıl eklenir?');
  };
  if (isIOS || inApp) fallback(); else setTimeout(fallback, 2500);
})();
