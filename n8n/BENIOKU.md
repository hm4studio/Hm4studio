# HM4 Studio · n8n + WhatsApp kurulumu

## Nasıl çalışır

```
 WhatsApp ──► Meta ──► n8n (Hostinger VPS) ──► Site (talep kaydı, otomatik cevap hazırlar)
                              │                     │
                              └──── WhatsApp'a gönderir ◄──┘

 Site'de olay (aşama, fotoğraf, talep) ──► n8n ──► WhatsApp
 Her sabah 10:30: n8n ──► Site "bugün kime hatırlatma?" ──► WhatsApp ──► Site "gönderildi"
```

- **Kurallar ve metinler sitede:** Kime, ne zaman, hangi mesaj; aynı mesaj iki kez gitmesin diye kayıt.
  Metinler `content/whatsapp.json`, Meta şablonları `n8n/SABLONLAR.md`.
- **n8n yalnızca köprü:** Mesajı alır, siteye sorar, WhatsApp'a gönderir. WhatsApp anahtarı sadece n8n'de durur.
- **Gelen talepler** stüdyo panelinde **Talepler** sayfasında listelenir; tek tıkla çift oluşturulur.

| Akış | Dosya | Ne yapar |
|---|---|---|
| 1 | `1-gelen-mesajlar.json` | Yeni yazan kişiyi karşılar, form bağlantısı gönderir, talebi panele düşürür. Kayıtlı çifte panel bağlantısı verir. |
| 2 | `2-site-olaylari.json` | Aşama değişince, fotoğraflar yüklenince, formdan talep gelince ve ekipten birine görev verilince mesaj gönderir. |
| 3 | `3-gunluk-hatirlatmalar.json` | Her sabah plan formu, albüm seçimi ve teslim sonrası yorum hatırlatmalarını gönderir. |

---

## Adım 1 · n8n'i Hostinger VPS'e kurun

1. hPanel › **VPS** › sunucunuz › **İşletim Sistemi** bölümünde Hostinger'ın **n8n** uygulama şablonunu seçin.
   Bu işlem VPS'i sıfırlar; üzerinde başka bir şey varsa önce yedekleyin.
2. Kurulum bitince verilen adresten n8n'i açın ve yönetici hesabınızı oluşturun.
3. n8n ayarlarında saat dilimi **Europe/Istanbul** olsun (akışlar bunu zaten kullanır).

## Adım 2 · Meta WhatsApp Business API

1. **developers.facebook.com** › Uygulamalarım › **Uygulama oluştur** › tür olarak **İşletme**'yi seçin.
   Meta Business hesabınızı bağlayın.
2. Uygulamaya **WhatsApp** ürününü ekleyin. **API Kurulumu** sayfasında Meta bir test numarası verir;
   ilk denemeyi onunla yapabilirsiniz (en fazla 5 alıcı).
3. **Gerçek numara ekleyin.** Numara, normal WhatsApp ya da WhatsApp Business uygulamasında açık olmamalı.
   Meta bazı hesaplarda Business uygulamasındaki numarayı birlikte kullanmaya ("coexistence") izin veriyor;
   ekranda bu seçenek çıkarsa kullanabilirsiniz.
4. Aynı sayfadan **Telefon numarası kimliğini (Phone number ID)** not alın.
5. **Kalıcı erişim anahtarı:** Business Ayarları › Kullanıcılar › **Sistem kullanıcıları** › Ekle (Yönetici).
   Ardından **Varlık ata** ile uygulamayı ve WhatsApp hesabını verin › **Anahtar oluştur**.
   İzinler: `whatsapp_business_messaging`, `whatsapp_business_management`. Anahtarı güvenli bir yere kaydedin.
6. **Ödeme yöntemi** ekleyin. Şablon mesajları ücretlidir; müşteri yazdıktan sonraki 24 saat içinde verilen cevaplar ücretsizdir.
7. `n8n/SABLONLAR.md`'deki 6 şablonu oluşturup onaya gönderin.

## Adım 3 · n8n'de kimlik bilgileri

n8n › **Credentials** › **Add credential** › **Header Auth** ile iki kayıt oluşturun:

| Ad | Name | Value |
|---|---|---|
| **HM4 Site** | `Authorization` | `Bearer <N8N_API_KEY>` (site ile ortak gizli anahtar) |
| **WhatsApp Cloud API** | `Authorization` | `Bearer <Meta kalıcı erişim anahtarı>` |

## Adım 4 · Akışları içe aktarın

1. n8n › **Workflows** › **⋯ › Import from File** ile `n8n/` klasöründeki 3 dosyayı tek tek içe aktarın.
2. Her akışta:
   - **Ayarlar** düğümündeki `siteUrl` değerini sitenizin adresiyle değiştirin (sonunda `/` olmadan).
   - Sitenize giden HTTP düğümlerinde kimlik bilgisi olarak **HM4 Site**'ı seçin.
   - **WhatsApp'a gönder** düğümünde **WhatsApp Cloud API**'yi seçin.
   - 2 numaralı akışta **Siteden olay** webhook düğümünde **HM4 Site**'ı seçin.
3. Üç akışı da **Active** yapın.
4. Şu adresleri not alın (webhook düğümüne tıklayınca **Production URL**):
   - Akış 1 › **Meta doğrulama (GET)**: Meta'ya verilecek adres
   - Akış 2 › **Siteden olay**: sitedeki `N8N_WEBHOOK_URL`

## Adım 5 · Site ayarları

Siteyi barındırdığınız yerde (Render › Environment) şunları ekleyin:

| Ayar | Değer |
|---|---|
| `N8N_API_KEY` | n8n'deki "HM4 Site" anahtarıyla aynı (Bearer'sız) |
| `N8N_WEBHOOK_URL` | Akış 2'nin Production URL'i |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta'daki telefon numarası kimliği |
| `WHATSAPP_VERIFY_TOKEN` | Sizin belirlediğiniz bir kelime, örn. `hm4-dogrulama-2026` |

`content/whatsapp.json` içindeki `yorumLinki` alanına Google işletme yorum bağlantınızı yazın.

## Adım 6 · Meta webhook'u bağlayın

developers.facebook.com › uygulamanız › WhatsApp › **Yapılandırma** › Webhook:
- **Callback URL:** Akış 1'in "Meta doğrulama (GET)" Production URL'i
- **Verify token:** `WHATSAPP_VERIFY_TOKEN` ile aynı değer
- **Doğrula ve kaydet**, ardından **Webhook alanları** › `messages` için **Abone ol**.

## Adım 7 · Deneyin

1. Kendi telefonunuzdan işletme numarasına "Merhaba" yazın: karşılama mesajı ve form bağlantısı gelmeli,
   panelde **Talepler**'de görünmelisiniz.
2. Formu doldurun: "Bilgileriniz bize ulaştı" mesajı gelmeli.
3. Talepten **Çift oluştur** deyin, aşamayı değiştirin: "durumu güncellendi" mesajı gelmeli.

Mesaj gelmezse n8n › **Executions** ekranında kırmızı adımı açın. Meta'nın verdiği hata mesajı orada yazar;
en sık nedenler: şablon henüz onaylanmamış, anahtar yanlış, numara henüz doğrulanmamış.

---

## Önemli not: sitenin her zaman açık olması

n8n gelen mesajı siteye sorar. Render'ın ücretsiz planında site uykuya geçer ve uyanması
yaklaşık 1 dakika sürer; bu süre içinde gelen mesajlar cevapsız kalabilir.
Gerçek kullanımda site her zaman açık olmalı: Render'ın ücretli planı ya da siteyi de
aynı Hostinger VPS'e kurmak (Docker dosyası hazır: `Dockerfile`).
