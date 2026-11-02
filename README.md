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
Görüşlerin kaybolmaması için kalıcı disk gerekir; bu Render'da ücretli Starter planla olur.
Ücretsiz planda disk olmadığından sunucu her yeniden başladığında görüşler silinir.
Docker kullanan platformlar (Railway, Fly.io) için `Dockerfile` hazırdır; `/data` klasörünü kalıcı diske bağlayın.

**Gerçek kullanıma geçerken:** `DEMO_MODE=false` yapın ve `data/` klasörünü (görüşler dahil) silin
ya da görüşleri önce CSV olarak indirin.

## 2. Değiştirmeniz gereken yerler

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

**Çift ekleme:** Admin › Çiftler › Yeni çift ekle. Erişim kodu ve şifre **bir kez** gösterilir; çifte iletin.
Şifre kaybolursa çiftin sayfasında **Şifre yenile**.

**Fotoğraf yükleme:** Çiftin sayfasında fotoğrafları seçin. Tarayıcı her fotoğrafın küçük (ızgara) ve
büyük (görüntüleme) sürümünü hazırlar; "Orijinal dosyaları da sakla" işaretliyse çift tam çözünürlüğü indirebilir.

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
