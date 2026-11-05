# WhatsApp mesaj şablonları (Meta onayı için)

Toplam **10 şablon** var. Müşteri size son 24 saat içinde yazmadıysa WhatsApp yalnızca **Meta'nın onayladığı şablonlarla**
mesaj göndermenize izin verir. Bildirimler, hatırlatmalar ve ekip görev mesajları bu yüzden şablonla gider.

Nerede oluşturulur: **Meta Business Suite › WhatsApp Manager › Mesaj şablonları › Şablon oluştur**

Her şablon için:
- **Ad:** aşağıdaki adı birebir yazın (küçük harf, alt çizgi). Site bu adla gönderir.
- **Dil:** Türkçe (`tr`)
- **Kategori:** belirtildiği gibi
- **Gövde:** metni olduğu gibi kopyalayın (sondaki "HM4 Studio" imzası dahil; Meta, sonu değişkenle biten şablonları reddeder). `{{1}}`, `{{2}}`… değişkenlerdir; Meta örnek değer ister, örnekleri de aşağıda.

Onay genelde birkaç dakika ile birkaç saat sürer. Şablon adlarını değiştirirseniz
`content/whatsapp.json` içindeki `sablonlar` bölümünü de güncelleyin.

---

### 1. `hm4_asama_guncellendi` — Kategori: **Yardımcı (Utility)**
Ne zaman: Panelden çiftin iş aşamasını değiştirdiğinizde.

```
Merhaba {{1}}, çalışmanızın durumu güncellendi: {{2}}. Ayrıntıları HM4 Studio panelinizden görüntüleyebilirsiniz: {{3}}

HM4 Studio
```
Örnekler: `{{1}}` Ayşe & Mehmet · `{{2}}` Düzenleme · `{{3}}` https://siteniz.com/uygulama

### 2. `hm4_fotograflar_hazir` — Kategori: **Yardımcı (Utility)**
Ne zaman: Çiftin galerisine **seçim için** fotoğraf yüklediğinizde (son yüklemeden 15 dk sonra, günde en fazla bir kez).

```
Merhaba {{1}}, fotoğraflarınız seçime hazır. Albümünüz için fotoğraf seçimine panelinizden başlayabilirsiniz: {{2}}

HM4 Studio
```
Örnekler: `{{1}}` Ayşe & Mehmet · `{{2}}` https://siteniz.com/uygulama

### 3. `hm4_plan_hatirlatma` — Kategori: **Yardımcı (Utility)**
Ne zaman: Çekime 7 ve 2 gün kala, çift gün planını henüz doldurmadıysa.

```
Merhaba {{1}}, çekiminize {{2}} gün kaldı. Hazırlıklarımızı eksiksiz yapabilmemiz için çekim günü planınızı (mekân, saat akışı, önemli kişiler) panelinizden iletmenizi rica ederiz: {{3}}

HM4 Studio
```
Örnekler: `{{1}}` Ayşe & Mehmet · `{{2}}` 7 · `{{3}}` https://siteniz.com/uygulama

### 4. `hm4_album_hatirlatma` — Kategori: **Yardımcı (Utility)**
Ne zaman: Fotoğraflar yüklendikten 5 gün sonra albüm seçimi hâlâ tamamlanmadıysa.

```
Merhaba {{1}}, albümünüz için {{2}} fotoğraf seçiminizi bekliyoruz. Seçiminizi panelinizden tamamlayabilirsiniz: {{3}}

HM4 Studio
```
Örnekler: `{{1}}` Ayşe & Mehmet · `{{2}}` 60 · `{{3}}` https://siteniz.com/uygulama

### 5. `hm4_yorum_iste` — Kategori: **Pazarlama (Marketing)**
Ne zaman: "Teslim edildi" aşamasından 7 gün sonra, bir kez. Meta yorum isteklerini genelde pazarlama sayar.
`content/whatsapp.json` içindeki `yorumLinki` alanına Google işletme yorum bağlantınızı yazmazsanız gönderilmez.

```
Merhaba {{1}}, bizi tercih ettiğiniz için teşekkür ederiz. Deneyiminizi birkaç cümleyle paylaşırsanız bizim için çok değerli olur: {{2}}

HM4 Studio
```
Örnekler: `{{1}}` Ayşe & Mehmet · `{{2}}` https://g.page/r/…/review

### 6. `hm4_ekip_gorev` — Kategori: **Yardımcı (Utility)**
Ne zaman: Randevu oluştururken veya düzenlerken bir etkinliğe ekipten birini seçtiğinizde (o kişiye, bir kez).
Ekip telefonları **Admin › Ekip** sayfasından girilir.

```
Merhaba {{1}}, yeni görevlendirme: {{2}} · {{3}}
Tarih: {{4}} {{5}}
Yer: {{6}}
Not: {{7}}

HM4 Studio
```
Örnekler: `{{1}}` Hasan · `{{2}}` Düğün · `{{3}}` Ayşe & Mehmet · `{{4}}` 17 Temmuz Cumartesi · `{{5}}` 14:00 · `{{6}}` Salon adı, Antalya · `{{7}}` Gelin hazırlığından başlanacak

WhatsApp API kurulmadan önce de kişi kartındaki etkinliğin altında, ekipteki kişinin yanında çıkan
WhatsApp simgesine dokunarak aynı mesajı elle gönderebilirsiniz.

### 7. `hm4_teslim_hazir` — Kategori: **Yardımcı (Utility)**
Ne zaman: **Düzenlenmiş / renkli** fotoğrafları yüklediğinizde (son yüklemeden 15 dk sonra).

```
Merhaba {{1}}, düzenlenmiş {{2}} fotoğrafınız teslim edildi. Panelinizden görüntüleyip indirebilirsiniz: {{3}}

HM4 Studio
```
Örnekler: `{{1}}` Ayşe & Mehmet · `{{2}}` 350 · `{{3}}` https://siteniz.com/uygulama

### 8. `hm4_video_hazir` — Kategori: **Yardımcı (Utility)**
Ne zaman: Çiftin sayfasına video yüklediğinizde veya video bağlantısı eklediğinizde (günde en fazla bir kez).

```
Merhaba {{1}}, "{{2}}" panelinize eklendi. İzleyebilir ve indirebilirsiniz: {{3}}

HM4 Studio
```
Örnekler: `{{1}}` Ayşe & Mehmet · `{{2}}` Düğün klibi · `{{3}}` https://siteniz.com/uygulama

### 9. `hm4_sozlesme_onay` — Kategori: **Yardımcı (Utility)**
Ne zaman: Sözleşmeyi çifte gönderdiğinizde; 3 gün içinde onaylanmazsa bir kez daha.

```
Merhaba {{1}}, hizmet sözleşmeniz onayınıza sunuldu. Sözleşmeyi panelinizden inceleyip onaylayabilirsiniz: {{2}}

HM4 Studio
```
Örnekler: `{{1}}` Ayşe & Mehmet · `{{2}}` https://siteniz.com/uygulama

### 10. `hm4_odeme_hatirlatma` — Kategori: **Yardımcı (Utility)**
Ne zaman: Çekime 3 gün kala, kalan bakiye varsa (bir kez).

```
Merhaba {{1}}, kalan ödemeniz {{2}} olup {{3}} tarihli çekim günü tahsil edilecektir. Sorularınız için bu numaradan bize ulaşabilirsiniz.

HM4 Studio
```
Örnekler: `{{1}}` Ayşe & Mehmet · `{{2}}` 15.000 TL · `{{3}}` 17 Temmuz Cumartesi

---

## Şablon gerektirmeyen mesajlar

Bunlar müşteri size yazdıktan sonraki 24 saat içinde gittiği için serbest metindir.
Metinleri `content/whatsapp.json › otomatikCevap` içinden istediğiniz gibi değiştirebilirsiniz:

- **yeniKisi:** İlk kez yazan kişiye karşılama ve "Uygunluk sorun" formu bağlantısı (24 saatte bir).
- **mevcutCift:** Kayıtlı bir çift yazınca panel bağlantısı (12 saatte bir).
- **talepAlindi:** WhatsApp'tan gelen kişi formu doldurunca teşekkür.

Hatırlatma günlerini (`planHatirlatmaGunOnce`, `albumHatirlatmaGunSonra`, `yorumIstemeGunSonra`, `odemeHatirlatmaGunOnce`, `sozlesmeHatirlatmaGunSonra`) da aynı dosyadaki `kurallar` bölümünden değiştirebilirsiniz.
