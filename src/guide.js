'use strict';
// Panel rehberi içeriği: bir çiftin panelde izlediği 8 adım, günlük rutin, ayarlar haritası ve sayfa ipuçları.
// Metinler kısa tutulur: her adımda "nerede", en fazla 4 "ne yapılır", "sistem kendiliğinden" ve bir ipucu.

const STEPS = [
  {
    title: 'Talep ve teklif',
    where: ['Talepler'], href: '/admin/talepler', btn: 'Talepleri aç',
    do: [
      'Sitedeki formdan gelen talepleri Talepler’de görün, WhatsApp’tan yanıtlayın.',
      'Fiyat sormuş çifte “Yeni teklif” hazırlayıp bağlantısını gönderin.',
      'Çift teklifi kabul edince Bugün’de “Randevuya çevir” çıkar; bilgiler forma hazır gelir.',
    ],
    auto: ['Yeni talep gelince telefonunuza bildirim', 'Kabul edilen teklif Yapılacaklar’ın en üstünde'],
    tip: 'Tarihi henüz belli olmayan dış çekimler için Ön randevu kullanın; tahmini tarihten 2 hafta önce hatırlatır.',
    keys: 'talep teklif fiyat form düğün.com instagram ön randevu tahmini',
  },
  {
    title: 'Randevu',
    where: ['Bugün', 'Yeni randevu'], href: '/admin/randevu/yeni', btn: 'Yeni randevu',
    do: [
      'Çiftin adı ve telefonu, çekimler (tarih, yer, ekip) ve hizmetleri girin.',
      'Ücret, kapora ve ödemeleri aynı formda yazın.',
      'Albüm bilgisi biliniyorsa isteğe bağlı “Albüm siparişi” bölümüne not edin.',
      'Kaydedince çiftin panel giriş bilgileri oluşur; WhatsApp ile gönderin.',
    ],
    auto: ['Aynı güne iki çekim düşerse çakışma uyarısı', 'Çekimden önce çifte plan ve ekibe hatırlatma mesajı'],
    tip: 'Cep albüm gibi kararsız kalınan şeyleri albüm notuna yazın; tasarım onaylanınca sipariş formunda karşınıza çıkar.',
    keys: 'randevu çift ekle yeni müşteri giriş kodu şifre ekip çekim hizmet paket ücret',
  },
  {
    title: 'Sözleşme ve kapora',
    where: ['Çiftin sayfası', 'Sözleşme ve ödeme'], href: '/admin/ciftler', btn: 'Çiftleri aç',
    do: [
      'Çift sözleşmeyi kendi panelinden okuyup onaylar.',
      'Alınan kapora ve ödemeleri “Ödeme ekle” ile girin.',
      '“Maaşımı alınca öderim” diyen çift için kapora sözü ekleyin; günü gelince hatırlatır.',
    ],
    auto: ['“Menderes Çelik sözleşmeyi onayladı” uyarısı Bugün’de', 'Bekleyen ödeme toplamı Bugün’de (göz işaretiyle gizlenir)'],
    tip: 'Sözleşme metnini ve firma bilgilerini Ayarlar › Sözleşme ve KVKK’dan düzenlersiniz.',
    keys: 'sözleşme kvkk kapora ödeme taksit bakiye borç maaş söz tahsilat',
  },
  {
    title: 'Çekim günü',
    where: ['Takvim'], href: '/admin/takvim', btn: 'Takvimi aç',
    do: [
      'Takvimde ayın çekimlerini, yerlerini ve ekibini görün.',
      'Çiftin sayfasından çekime ekip atayın; kimin hangi işte olduğu görünür.',
      'Kendinize hatırlatma ekleyin (Bugün › Hatırlatma).',
    ],
    auto: ['Bugün sayfasında günün programı', 'Ekibe görev ve yarınki liste mesajı'],
    tip: 'Ekip listesini Ayarlar › Ekip’ten yönetirsiniz; rolü (Fotoğrafçı, Videocu…) görev atamada kullanılır.',
    keys: 'takvim çekim günü ekip personel hatırlatma program yer saat',
  },
  {
    title: 'Fotoğraflar ve seçim',
    where: ['Çiftin sayfası', 'Fotoğraflar'], href: '/admin/ciftler', btn: 'Çiftleri aç',
    do: [
      'Fotoğrafları yükleyin; birden fazla çekim varsa her biri ayrı galeri olur.',
      'Galeri kapağını fotoğrafın üzerindeki yıldızla siz seçin.',
      'Çift favorilerini ve +1 kapak karesini seçip “Seçimi tamamla” der.',
      'Seçim listesini (seçim.txt) indirip ARW dosyalarını seri numarasından bulun.',
    ],
    auto: ['Çifte “Fotoğraflarınız hazır” mesajı', 'Seçim bitince bildirim ve Telegram: “212 kare + kapak”'],
    tip: 'Kapak seçilmeden seçim tamamlanmaz; zip’te kapak dosyası “KAPAK -” diye başlar.',
    keys: 'fotoğraf yükle galeri kapak yıldız seçim favori arw seri numara zip indir',
  },
  {
    title: 'Albüm tasarımı',
    where: ['Çiftin sayfası', 'Albüm'], href: '/admin/ciftler', btn: 'Çiftleri aç',
    do: [
      'Hazırladığınız albüm sayfalarını Albüm bölümüne yükleyin ve çifte gönderin.',
      'Çift sayfa sayfa inceler; onaylar ya da notla değişiklik ister.',
      'Değişiklik varsa sayfaları güncelleyip yeniden gönderin.',
    ],
    auto: ['Çifte “Albüm tasarımınız hazır” mesajı', 'Onaylayınca Bugün’de “siparişi tamamlayın” önerisi'],
    tip: 'Çift değişiklik isterse notu size bildirim olarak gelir ve çiftin Albüm bölümünde durur.',
    keys: 'albüm tasarım sayfa onay değişiklik revize',
  },
  {
    title: 'Sipariş ve işler',
    where: ['Siparişler'], href: '/admin/siparisler', btn: 'Siparişleri aç',
    do: [
      'Sipariş formunda paket, boyut, sayfa, model ve rengi seçip çifte onaya gönderin.',
      'Çift onaylayınca laba gönderin ve “Laba gönderildi”, gelince “Geldi” işaretleyin.',
      'Bugün’deki “Bu işler yapıldı mı?” sorusuna Yapıldı, Görev listesine ekle ya da Ertele deyin.',
    ],
    auto: ['Çekimden 10 gün sonra video ve diğer işler sorulur', 'Akşam 20:00’de yarınki görev listesi telefonunuza gelir'],
    tip: 'Paket, boyut ve renk listelerini Ayarlar › Albüm seçenekleri’nden düzenlersiniz.',
    keys: 'sipariş albüm lab baskı paket boyut renk model cep görev iş takibi ertele video kurgu',
  },
  {
    title: 'Teslim',
    where: ['Çiftin sayfası', 'Teslim'], href: '/admin/ciftler', btn: 'Çiftleri aç',
    do: [
      'Ofiste flash bellek, albüm ve baskıları verirken “Teslim et”e basın.',
      'Çift ekranda tutanağı imzalar; iş “Teslim” aşamasına geçer.',
      'Tavsiye programı açıksa hediye kartlarını yazdırıp kutuya koyun.',
    ],
    auto: ['Teslimden sonra Google yorum isteği mesajı', 'Dosya saklama süresi dolmadan Bugün’de uyarı'],
    tip: 'Teslim tutanağındaki ürünleri Ayarlar › Teslim’den düzenlersiniz.',
    keys: 'teslim tutanak imza flash bellek hediye kart kupon google yorum',
  },
];

const DAILY = [
  { when: 'Sabah', title: 'Bugün', text: 'Yapılacaklar, “Bu işler yapıldı mı?”, sipariş önerileri, yeni sözleşme onayları.', href: '/admin' },
  { when: 'Gün içinde', title: 'Gönderilecek mesajlar', text: 'Sistemin hazırladığı WhatsApp mesajları Bugün’deki listede; tek dokunuşla gönderirsiniz.', href: '/admin#yapilacaklar' },
  { when: 'Akşam 20:00', title: 'Görevler', text: 'Yarınki görev listesi telefonunuza gelir; ekibin mesajı da hazırlanır.', href: '/admin/gorevler' },
];

const SETTINGS = [
  { title: 'İşin kendisi', items: [['Paketler', '/admin/paketler'], ['Ekip', '/admin/ekip'], ['Müşteri kaynakları', '/admin/kaynaklar'], ['Sözleşme ve KVKK', '/admin/sozlesme'], ['Albüm seçenekleri', '/admin/album-secenekleri'], ['Teslim', '/admin/teslim-ayarlari']] },
  { title: 'Çiftle iletişim', items: [['Mesajlar', '/admin/mesajlar'], ['Hediye kuponları', '/admin/hediye'], ['Rapor', '/admin/rapor']] },
  { title: 'Web sitesi', items: [['Site', '/admin/site'], ['Portfolyo', '/admin/portfolyo'], ['Portfolyo etiketleri', '/admin/portfolyo-etiketleri'], ['Sayfa başlıkları', '/admin/sayfa-basliklari'], ['Şehir sayfaları', '/admin/sehirler'], ['Veriler ve yedek', '/admin/veriler']] },
];

// Sayfa ipuçları: "Bu sayfa ne işe yarar?" (adım numarası rehberdeki karşılığı)
const HINTS = {
  orders: { text: 'Albüm tasarımını onaylayan çiftlerin siparişleri burada. Formu doldurup çifte onaya gönderin; onaylayınca laba gönderip işaretleyin.', step: 7 },
  tasks: { text: 'Ekibe verdiğiniz işler. Gecikenler en üstte; akşam 20:00’de yarınki liste telefonunuza gelir.', step: 7 },
  list: { text: 'Tüm çiftler. Arayın, aşamaya göre süzün; bir çifte dokununca fotoğraf, albüm, ödeme ve teslim tek sayfada.', step: 2 },
  calendar: { text: 'Ayın çekimleri ve teslim tarihleri. Bir güne dokununca o günün programı açılır.', step: 4 },
  leads: { text: 'Sitedeki formdan gelen yeni müşteriler. Yanıtlayın, teklif gönderin; kabul edince randevuya çevirin.', step: 1 },
};

module.exports = { STEPS, DAILY, SETTINGS, HINTS };
