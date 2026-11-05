# HM4 Studio · n8n + WhatsApp otomasyonları

## Nasıl çalışır

```
 WhatsApp ──► Meta ──► n8n ──► Site (talep kaydı, otomatik cevap hazırlar) ──► n8n ──► WhatsApp
 Sitede olay (sözleşme, seçim fotoğrafları, teslim, talep, ekip görevi) ──► n8n ──► WhatsApp
 Her sabah 10:30: n8n ──► Site "bugün kime hatırlatma?" ──► WhatsApp ──► Site "gönderildi"
```

- **Kurallar ve metinler sitede:** kime, ne zaman, hangi mesaj; aynı mesaj iki kez gitmesin diye kayıt tutulur.
  Metinler `content/whatsapp.json`, Meta şablonları `n8n/SABLONLAR.md`.
- **n8n yalnızca köprü:** mesajı alır, siteye sorar, WhatsApp'a gönderir. Meta anahtarı yalnızca n8n'de durur.
- Site ve n8n aynı sunucuda çalışır ve birbirleriyle içeriden konuşur (`http://site:3000`, `http://n8n:5678`).
- WhatsApp yalnızca **telefonu kayıtlı ve WhatsApp iznini kapatmamış** çiftlere gider (KVKK).
  Telefon bildirimleri (uygulama) bundan bağımsızdır.

## Otomasyonlar

| Ne zaman | Kime | Mesaj |
|---|---|---|
| Biri işletme numarasına ilk kez yazınca | Yazan kişi | Serbest metin: karşılama + "Uygunluk sorun" formu; talep panele düşer |
| Kayıtlı çift yazınca | Çift | Serbest metin: panel bağlantısı |
| WhatsApp'tan gelen kişi formu doldurunca | Kişi | Serbest metin: "bilgileriniz alındı" |
| Sözleşme gönderilince (bir kez) | Çift | `hm4_sozlesme_onay` |
| Çekimden 3 gün önce, gün planı yoksa | Çift | `hm4_plan_hatirlatma` |
| Seçim fotoğrafları ilk yüklendiğinde (bir kez) | Çift | `hm4_fotograflar_hazir` |
| İş "Teslim" aşamasına geçince (video varsa ikinci şablon) | Çift | `hm4_teslim_hazir` / `hm4_teslim_video_hazir` |
| Teslimden 7 gün sonra | Çift | `hm4_yorum_iste` |
| Ekipten biri atanınca ve çekimden 3 gün önce | Ekip üyesi | `hm4_ekip_gorev` |

Aşama değişikliği, video ekleme gibi diğer gelişmeler WhatsApp'tan değil, yalnızca telefon bildirimiyle (uygulama) haber verilir.

Gün sayıları `content/whatsapp.json › kurallar` bölümünden değiştirilebilir.

| Akış | Dosya |
|---|---|
| 1 · Gelen mesajlar | `1-gelen-mesajlar.json` |
| 2 · Site olayları → WhatsApp | `2-site-olaylari.json` |
| 3 · Günlük hatırlatmalar (10:30) | `3-gunluk-hatirlatmalar.json` |

---

## Kurulum (Hostinger tarayıcı terminali)

### 1 · Akışları kurun (hazırlık, Meta gerekmez)

    bash /opt/hm4studio/deploy/n8n-kur.sh

Site ile n8n arasındaki anahtarı oluşturur, 3 akışı ve "HM4 Site" kimlik bilgisini n8n'e yükler.
Yeniden çalıştırmak güvenlidir.

### 2 · Meta tarafı (bir kez)

1. **developers.facebook.com** › Uygulamalarım › **Uygulama oluştur** › tür: **İşletme**. Meta Business hesabınızı bağlayın.
2. Uygulamaya **WhatsApp** ürününü ekleyin, **gerçek numaranızı** ekleyip doğrulayın.
   Numara normal WhatsApp'ta açıksa Meta'nın sunduğu "WhatsApp Business uygulamasıyla birlikte kullan" (coexistence) seçeneğine bakın.
3. **Telefon numarası kimliğini (Phone number ID)** not alın.
4. **Kalıcı erişim anahtarı:** Business Ayarları › Kullanıcılar › **Sistem kullanıcıları** › Ekle (Yönetici) ›
   **Varlık ata** (uygulama + WhatsApp hesabı) › **Anahtar oluştur**.
   İzinler: `whatsapp_business_messaging`, `whatsapp_business_management`.
5. **Ödeme yöntemi** ekleyin (şablon mesajları ücretlidir; müşteri yazdıktan sonraki 24 saatte verilen cevaplar ücretsizdir).
6. `n8n/SABLONLAR.md`'deki **7 şablonu** oluşturup onaya gönderin.

### 3 · WhatsApp'ı bağlayın

    bash /opt/hm4studio/deploy/whatsapp-kur.sh

Telefon numarası kimliğini ve kalıcı anahtarı sorar (anahtar ekranda görünmez), n8n'e kaydeder, akışları açar
ve Meta'ya girilecek **Callback URL** ile **Verify token**'ı gösterir:

developers.facebook.com › uygulamanız › WhatsApp › **Yapılandırma** › Webhook › bu iki değeri girin ›
**Doğrula ve kaydet** › Webhook alanları › `messages` › **Abone ol**.

### 4 · Deneyin

1. Kendi telefonunuzdan işletme numarasına "Merhaba" yazın: karşılama mesajı gelmeli, **Talepler**'de görünmelisiniz.
2. Kendi numaranızla bir deneme çifti oluşturup sözleşme gönderin: "sözleşmeniz onayınıza sunuldu" mesajı gelmeli.

Mesaj gelmezse n8n › **Executions** ekranında kırmızı adımı açın; Meta'nın hata mesajı orada yazar.
En sık nedenler: şablon henüz onaylanmamış, anahtar yanlış, numara doğrulanmamış.

`content/whatsapp.json` içindeki `yorumLinki` alanına Google işletme yorum bağlantınızı yazmayı unutmayın.
