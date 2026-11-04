# HM4 Studio — Web Sitesi + Çift Paneli + Admin Paneli

Düğün ve nişan fotoğrafçılığı sitesi. Herkese açık site (Anasayfa, Portfolyo, Hakkımızda, İletişim),
çiftlere özel şifreli panel (galeri, favoriler, iş durumu) ve stüdyo yönetim paneli.

**Hiçbir dış paket gerekmez.** Yalnızca Node.js 22.13 veya üstü yeterli (veritabanı: yerleşik SQLite).

---

## 1. Çalıştırma (bilgisayarınızda deneme)

```bash
cp .env.example .env          # ayar dosyasını oluşturun
npm run admin                 # yönetici kullanıcı adı ve şifresi belirleyin
npm start                     # http://localhost:3000
```

- Site: `http://localhost:3000`
- Admin paneli: `http://localhost:3000/admin/giris`
- Çift girişi: `http://localhost:3000/giris`

## 1b. Demo olarak paylaşma ve görüş toplama

`.env` içinde `DEMO_MODE=true` yapın. Demo modunda:

- Site **örnek çiftler ve fotoğraflarla** açılır (fotoğraflar `demo/photos/` klasöründen gelir — oradaki yer tutucuları
  kendi örnek karelerinizle değiştirin).
- Giriş ekranlarında **"Çift olarak gir"** ve **"Stüdyo (admin) olarak gir"** butonları çıkar; şifre gerekmez.
- Her sayfanın üstünde "Demo sürüm · Görüş bildir" bandı görünür. **Görüş formu:** `/gorus`
  (puan, bölüm, görüş, isteğe bağlı ad).
- Demo verileri `DEMO_RESET_HOURS` saatte bir sıfırlanır; **görüşler silinmez.**
- Demo stüdyo hesabı görüşleri göremez ve şifre değiştiremez; yüklemeler 10 MB / 40 fotoğrafla sınırlıdır.
- Görüşleri **gerçek yönetici** hesabınızla girip **Admin › Görüşler**'de okursunuz; Excel için CSV indirebilirsiniz.
  Gerçek yöneticiyi `npm run admin` ile ya da `ADMIN_USERNAME` / `ADMIN_PASSWORD` ayarlarıyla oluşturun.
- Arama motorları demo sayfalarını dizine eklemez.

**Render'da yayına alma (≈10 dk):** Projeyi GitHub'a yükleyin → Render › New + › **Blueprint** → depoyu seçin.
`render.yaml` her şeyi ayarlar; sizden `SITE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` ister.
Görüşlerin kaybolmaması için kalıcı disk gerekir; bu Render'da ücretli planla olur.
Ücretsiz planda disk olmadığından sunucu her yeniden başladığında görüşler silinir.
Docker kullanan platformlar (Railway, Fly.io) için `Dockerfile` hazırdır; `/data` klasörünü kalıcı diske bağlayın.

**Gerçek kullanıma geçerken:** `DEMO_MODE=false` yapın ve `data/` klasörünü (görüşler dahil) silin
ya da görüşleri önce CSV olarak indirin.

## 1c. Telefon uygulaması (ana ekrana ekleme)

Site, App Store gerektirmeyen bir uygulama (PWA) olarak telefona eklenebilir:
- **iPhone / iPad:** Safari'de siteyi açın › Paylaş › **Ana Ekrana Ekle**.
- **Android:** Çift panelinde çıkan **Ekle** butonuna basın (ya da Chrome menüsü › Uygulamayı yükle).

Uygulama doğrudan çiftin paneline açılır, telefonda alttan sekme menüsü vardır. Tasarım dosyaları telefonda
önbelleğe alınır; çiftlerin özel fotoğrafları ve panel sayfaları **asla** önbelleğe alınmaz.
İkonlar: `public/images/icon-*.png`, `apple-touch-icon.png` · Uygulama adı ve renkleri: `public/manifest.webmanifest`.
Uygulama yalnızca site HTTPS ile yayındayken eklenebilir.

## 1d. WhatsApp otomasyonu (n8n)

Yeni yazanları karşılama, talepleri panele düşürme, çifte durum bildirimleri ve günlük hatırlatmalar.
Kurulum adımları: **`n8n/BENIOKU.md`** · Meta şablon metinleri: **`n8n/SABLONLAR.md`** ·
Mesaj metinleri: **`content/whatsapp.json`** · Gelen talepler: **Admin › Talepler**.
Sitedeki **/talep** formu ("Uygunluk sorun") n8n kurulmasa da çalışır; talepler yine panele düşer.

## 2. Siteyi panelden düzenleme

**Ayarlar › Site:** logo, hakkımızda fotoğrafı, vurgu rengi, logo konumu, duyuru bandı, kapak başlığı ve metni,
hizmetler, hakkımızda metni ve iletişim bilgileri. Kaydedince site hemen güncellenir. Bu ayarlar veritabanında
durur ve `content/site.json` dosyasındaki değerlerin üzerine yazılır.

**Ayarlar › Site › İş akışı:** iş aşamaları, etkinlik türleri, müşteri kaynakları, ekip görevleri, teslim süresi,
günlük çekim kapasitesi (talep formundaki "boş / dolu" bilgisi için) ve çift panelinde ödeme özetinin gösterilip gösterilmeyeceği.

**Ayarlar › Paketler:** paket adı, fiyatı ve içeriği. Randevu formunda paket seçilince fiyat ve içerik kendiliğinden dolar.

**Ayarlar › Veriler:**
- **Sezon arşivi:** Seçilen yılın randevuları ve ödemeleri (Excel), veritabanı kopyası ve o yıl etkinliği olan çiftlerin
  tüm fotoğrafları tek bir `.tar` dosyası olarak iner (albüme seçilen kareler dosya adında `-SECILDI` ile işaretli).
- **Veritabanı yedeği:** Her gece kendiliğinden `DATA_DIR/backups/` içine alınır, son 14 gün saklanır; "Şimdi yedek al" ile elle de alınır.
- **Geri yükleme:** Sunucuyu durdurun, yedek `.db` dosyasını `DATA_DIR/hm4.db` olarak kopyalayın, sunucuyu başlatın.

## 2b. Dosyadan değiştirilebilecek yerler

| Ne | Nerede |
|---|---|
| Telefon, WhatsApp, e-posta, Instagram kullanıcı adı, çalışma bölgeleri, saatler | `content/site.json` → `contact` |
| Başlıklar, açıklamalar, hakkımızda metni, hizmetler | `content/site.json` (köşeli parantezli **[ÖRNEK]** yazan her şey) |
| İş aşamaları (Çekim tamamlandı → Teslim edildi) | `content/site.json` → `stages` |
| Logo | Dosyayı `public/images/` içine koyun, `content/site.json` → `brand.logo` = `"/images/logo.png"` |
| Anasayfa kapak fotoğrafı | Admin › Portfolyo › bir fotoğrafta **Kapak yap** |
| Kapak videosu (isteğe bağlı) | `public/images/kapak.mp4` koyun, `hero.video` = `"/images/kapak.mp4"` |
| Hakkımızda fotoğrafı | `public/images/` içine koyun, `about.image` = `"/images/ekip.jpg"` |
| Portfolyo fotoğrafları | Admin › Portfolyo (yükle, kategori seç) |
| Renkler, yazı tipleri | `public/css/style.css` en üstteki `:root` bölümü |

`content/site.json` kaydedildiğinde site hemen güncellenir; yeniden başlatmaya gerek yok.
WhatsApp numarası ülke koduyla, boşluksuz yazılır: `905321234567`.

## 3. Nasıl çalışır?

**Panel (admin ana sayfası):** Yarının programı (saat, mekân, ekip, istekler), aylık takvim, yaklaşan 30 gün,
bekleyen bakiye ve arama/süzgeçli çift kartları. **Excel'e aktar** her etkinliği bir satır olarak indirir.

**Yeni randevu:** Panel › Yeni randevu (ya da takvimde bir güne dokunun). Bir kişi kartına birden çok etkinlik eklenir
(örn. dış çekim, kına, düğün); her etkinliğin kendi tarihi, paketi, tutarı, ekibi ve istekleri olur.
Aynı gün başka çekim varsa form uyarır. Randevu numarası, çiftin erişim kodu ve şifresi otomatik oluşur;
şifre **bir kez** gösterilir, çifte iletin.

**Ödemeler:** Kişi kartında Ödemeler bölümünden parça parça ödeme eklenir; kalan bakiye kendiliğinden düşer.

**Randevu belgesi:** Kişi kartında "Randevu belgesi" › Yazdır / PDF kaydet. Çift de kendi panelinden görebilir.

**Rapor:** Ay ay etkinlik sayısı, ciro, tahsilat; müşteri kaynakları ve etkinlik türleri.

**Ekip:** Admin › Ekip'te personel eklenir/düzenlenir (görev, telefon, notlar, aktif/pasif). Randevu formunda her
etkinliğe ekipten kişiler seçilir; yeni görev verilen kişiye WhatsApp mesajı gider (n8n kuruluysa otomatik,
değilse kişi kartında kişinin yanındaki WhatsApp simgesiyle elle). Şablon: `n8n/SABLONLAR.md` › 6.

Paket önerileri daha önce yazdığınız paket adlarından gelir. Etkinlik türleri, müşteri kaynakları ve ekip görevleri:
`content/site.json` › `appointments`.
Şifre kaybolursa çiftin sayfasında **Şifre yenile**.

**Fotoğraf yükleme:** Çiftin sayfasında fotoğrafları seçin. Tarayıcı her fotoğrafın küçük (ızgara) ve
büyük (görüntüleme) sürümünü hazırlar; "Orijinal dosyaları da sakla" işaretliyse çift tam çözünürlüğü indirebilir.

**Albüm seçim listesi (RAW için):** Fotoğrafları kamera dosya adıyla yükleyin (örn. `DSC01234.jpg`).
Çiftin seçtiği karelerin seri numaraları çiftin sayfasında görünür; **Listeyi indir** her satırda bir numara olan bir .txt verir,
**Kopyala** numaraları boşlukla ayırıp kopyalar (Lightroom/Bridge dosya adı aramasına yapıştırmak için).
Panelde **Tamamlanan albüm seçimleri** bölümü seçimi bitmiş tüm çiftleri listeler; **Hepsini indir** tek Excel tablosu verir.

**Düzenlenmiş (renkli) fotoğraflar:** Çiftin sayfasında yüklerken "Bu fotoğraflar" seçimini **Düzenlenmiş / renkli (teslim)** yapın.
Çift, Fotoğraflar sayfasında **Düzenlenmiş fotoğraflar** ve **Seçim fotoğrafları**nı ayrı görür; düzenlenmişlerde kalp (seçim) yoktur,
tek tıkla tümü indirilir. Sezon arşivinde `duzenlenmis-teslim/` klasörüne ayrı konur.

**Video teslimi:** Çiftin sayfasında **Video teslimi** bölümünden klip, düğün filmi, teaser veya reels yüklenir
(MP4/MOV; büyük dosyalar 8 MB'lık parçalar hâlinde yüklenir, kopan parça yeniden denenir; varsayılan üst sınır 10 GB, `MAX_VIDEO_GB`).
İsterseniz dosya yerine Google Drive/YouTube/Vimeo bağlantısı da eklenir. Çift, panelindeki **Video** sayfasında izler ve indirir.
**Video durumu** (Kurguda, Onayınızda…) iş aşamasının yanında ayrıca seçilir; video olmayan işlerde "Bu işte video yok" kalır.

**Çift paneli sayfaları:** Durum (iş durumu, randevular, ödeme) · Fotoğraflar (galeri, albüm seçimi, indirme) · Video · Plan.

**Giriş bilgileri:** Erişim kodu çiftin adlarından oluşur (`busra-oguz`), şifre iki kelime ve üç rakamdır (`papatya-deniz-472`).
Oluşturulunca **WhatsApp'tan gönder** ile hazır mesaj olarak iletilir.

**İndirme:** Çift panelinde ve yöneticinin çift sayfasında **Tümünü indir** ve **Seçimimi indir** tek bir .zip verir
(varsa orijinal dosyalar, yoksa büyük boy; dosya adları yüklendiği gibi). iPhone'da Dosyalar uygulamasıyla açılır.

**Favoriler:** Çift kalbe dokunarak seçer; admin aynı listeyi çiftin sayfasındaki **Favoriler** sekmesinde
görür, kalbe dokunarak ekleyip çıkarabilir.

**İş durumu:** Çiftin sayfasında aşama + isteğe bağlı not seçip kaydedin; çift kendi panelinde görür.

## 4. Güvenlik

- Çift fotoğrafları `data/private/` klasöründe durur ve **asla herkese açık değildir**. Her istekte
  oturum kontrol edilir: bir çift yalnızca kendi fotoğraflarını, favorilerini ve durumunu görebilir.
- Şifreler scrypt ile şifrelenmiş saklanır; açık hâli hiçbir yere yazılmaz.
- Formlar CSRF korumalı, çerezler HttpOnly/SameSite; hatalı girişler IP başına sınırlanır.
- Gizli ayarlar yalnızca `.env` dosyasındadır (kodda yok). `.env` ve `data/` klasörünü paylaşmayın.

## 5. Yayına alma

**Hostinger VPS (önerilen):** tek komutla kurulum için `deploy/BENIOKU.md`.


Bu uygulama **kalıcı diski olan** bir Node.js sunucusu ister (veritabanı ve fotoğraflar diskte durur).
Uygun seçenekler: bir VPS (ör. Hetzner, DigitalOcean, Türkiye'de bir VPS sağlayıcısı) veya kalıcı disk
sunan platformlar (Render "Persistent Disk", Railway "Volume", Fly.io "Volume").
Netlify/Vercel gibi yalnızca statik barındırma **uygun değildir**.

1. `.env` içinde: `NODE_ENV=production`, `SITE_URL=https://alanadiniz.com`,
   `SESSION_SECRET=` (uzun rastgele değer — üretme komutu `.env.example` içinde), `DATA_DIR=` kalıcı disk yolu.
2. `npm run admin` ile yönetici hesabını sunucuda oluşturun.
3. `npm start` (bir süreç yöneticisiyle, ör. `pm2 start npm -- start`).
4. Önüne HTTPS sağlayan bir ters vekil koyun (Caddy en kolayı: `alanadiniz.com { reverse_proxy localhost:3000 }`).
5. **Yedek:** `data/` klasörünü düzenli yedekleyin — tüm çiftler ve fotoğraflar oradadır.

## 6. Instagram

Instagram, gönderilerin bir siteye otomatik çekilmesine yalnızca resmî API ile izin verir. Bu yüzden:

- **Varsayılan:** Portfolyo fotoğraflarını Admin › Portfolyo'dan yüklersiniz; Instagram profil butonu her sayfada çalışır.
- **İsteğe bağlı otomatik akış:** Hesabınız Profesyonel (İşletme/İçerik Üreticisi) olmalı. Meta for Developers'da
  bir uygulama oluşturup "Instagram API with Instagram Login" ürününü ekleyin, uzun süreli erişim anahtarı alın
  ve `.env` içine `INSTAGRAM_ACCESS_TOKEN=` olarak yazın. Portfolyo sayfasında "Instagram'da bizi takip edin"
  bölümünde son paylaşımlar otomatik görünür. Anahtar ~60 günde bir yenilenmelidir.

## 7. Klasör yapısı

```
server.js              Sunucu giriş noktası
content/site.json      TÜM metinler ve iletişim bilgileri
src/config.js          .env okuma
src/db.js              Veritabanı tabloları ve sorgular
src/auth.js            Şifre, oturum, güvenlik
src/media.js           Fotoğraf kaydetme
src/instagram.js       İsteğe bağlı Instagram akışı
src/routes/            Sayfa adresleri (public, couple, admin)
src/views/             Sayfa şablonları ve tekrar kullanılan bileşenler (components.js)
public/css/style.css   Tasarım
public/js/             Menü, büyük görüntüleme, favoriler, yükleyici
scripts/create-admin.js  Yönetici hesabı oluşturma / şifre sıfırlama
data/                  (otomatik) veritabanı + yüklenen fotoğraflar — git'e eklenmez
```
