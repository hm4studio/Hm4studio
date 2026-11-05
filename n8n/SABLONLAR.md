# WhatsApp mesaj şablonları (Meta onayı için)

Toplam **8 şablon** var: çifte 7, ekibe 1. Her çifte en fazla 6 mesaj gider (teslim mesajı iki şablondan biridir).
Müşteri size son 24 saat içinde yazmadıysa WhatsApp yalnızca **Meta'nın onayladığı şablonlarla** mesaj göndermenize izin verir.

Nerede oluşturulur: **Meta Business Suite › WhatsApp Manager › Mesaj şablonları › Şablon oluştur**

Her şablon için:
- **Ad:** aşağıdaki adı birebir yazın (küçük harf, alt çizgi). Site bu adla gönderir.
- **Dil:** Türkçe (`tr`)
- **Kategori:** belirtildiği gibi
- **Gövde:** metni olduğu gibi kopyalayın (sondaki "HM4 Studio" imzası dahil; Meta, sonu değişkenle biten şablonları reddeder). `{{1}}`, `{{2}}`… değişkenlerdir; Meta örnek değer ister, örnekleri de aşağıda.

Onay genelde birkaç dakika ile birkaç saat sürer. Şablon adlarını değiştirirseniz
`content/whatsapp.json` içindeki `sablonlar` bölümünü de güncelleyin.

| # | Ne zaman | Kime | Şablon |
|---|---|---|---|
| 0 | Randevu oluşturulunca: randevu bilgisi + panel giriş bilgileri (bir kez) | Çift | `hm4_randevu_olustu` |
| 1 | Sözleşme gönderilince (bir kez) | Çift | `hm4_sozlesme_onay` |
| 2 | Çekimden 3 gün önce, gün planı doldurulmadıysa | Çift | `hm4_plan_hatirlatma` |
| 3 | Seçim fotoğrafları ilk yüklendiğinde (bir kez) | Çift | `hm4_fotograflar_hazir` |
| 4 | İş "Teslim" aşamasına geçince, video yoksa | Çift | `hm4_teslim_hazir` |
| 4 | İş "Teslim" aşamasına geçince, video varsa | Çift | `hm4_teslim_video_hazir` |
| 5 | Teslimden 7 gün sonra (bir kez) | Çift | `hm4_yorum_iste` |
| 6 | Ekipten biri etkinliğe atanınca ve çekimden 3 gün önce | Ekip üyesi | `hm4_ekip_gorev` |

---

### 0. `hm4_randevu_olustu` — Kategori: **Yardımcı (Utility)**
Yeni randevuyu kaydettiğinizde, kişi kartında WhatsApp izni açık ve telefonu varsa otomatik gider.
```
Merhaba {{1}}, randevunuz oluşturuldu.
Randevu no: {{2}}
İlk çekim: {{3}}

Panelinize bu bağlantıya dokunarak girebilirsiniz: {{4}}

Uygulamayı ana ekrana eklerseniz giriş bilgileriniz:
Erişim kodu: {{5}}
Şifre: {{6}}

HM4 Studio
```
Örnekler: `{{1}}` Ayşe & Mehmet · `{{2}}` HM4-2026-014 · `{{3}}` Düğün · 17 Temmuz 2026 Cuma, 14:00 · `{{4}}` https://siteniz.com/g/12-abc · `{{5}}` ayse-mehmet · `{{6}}` HM4-K7P-3QX

### 1. `hm4_sozlesme_onay` — Kategori: **Yardımcı (Utility)**
```
Merhaba {{1}}, hizmet sözleşmeniz onayınıza sunuldu. Sözleşmeyi panelinizden inceleyip onaylayabilirsiniz: {{2}}

HM4 Studio
```
Örnekler: `{{1}}` Ayşe & Mehmet · `{{2}}` https://siteniz.com/uygulama

### 2. `hm4_plan_hatirlatma` — Kategori: **Yardımcı (Utility)**
```
Merhaba {{1}}, çekiminize {{2}} gün kaldı. Çekim günü planınızı panelinizden tamamlayabilirsiniz: {{3}}

HM4 Studio
```
Örnekler: `{{1}}` Ayşe & Mehmet · `{{2}}` 3 · `{{3}}` https://siteniz.com/uygulama

### 3. `hm4_fotograflar_hazir` — Kategori: **Yardımcı (Utility)**
```
Merhaba {{1}}, fotoğraflarınız seçime hazır. Albümünüz için fotoğraf seçimine panelinizden başlayabilirsiniz: {{2}}

HM4 Studio
```
Örnekler: `{{1}}` Ayşe & Mehmet · `{{2}}` https://siteniz.com/uygulama

### 4a. `hm4_teslim_hazir` — Kategori: **Yardımcı (Utility)**
```
Merhaba {{1}}, düzenlenmiş fotoğraflarınız teslim edildi. Panelinizden görüntüleyip indirebilirsiniz: {{2}}

HM4 Studio
```
Örnekler: `{{1}}` Ayşe & Mehmet · `{{2}}` https://siteniz.com/uygulama

### 4b. `hm4_teslim_video_hazir` — Kategori: **Yardımcı (Utility)**
```
Merhaba {{1}}, düzenlenmiş fotoğraflarınız ve videonuz teslim edildi. Panelinizden izleyip indirebilirsiniz: {{2}}

HM4 Studio
```
Örnekler: `{{1}}` Ayşe & Mehmet · `{{2}}` https://siteniz.com/uygulama

### 5. `hm4_yorum_iste` — Kategori: **Pazarlama (Marketing)**
Meta yorum isteklerini genelde pazarlama sayar. `content/whatsapp.json` içindeki `yorumLinki` alanına Google işletme yorum bağlantınızı yazmazsanız gönderilmez.
```
Merhaba {{1}}, bizi tercih ettiğiniz için teşekkür ederiz. Deneyiminizi birkaç cümleyle paylaşırsanız bizim için çok değerli olur: {{2}}

HM4 Studio
```
Örnekler: `{{1}}` Ayşe & Mehmet · `{{2}}` https://g.page/r/…/review

### 6. `hm4_ekip_gorev` — Kategori: **Yardımcı (Utility)**
Hem görev verildiğinde hem çekimden 3 gün önce hatırlatma olarak aynı metin gider. Ekip telefonları **Admin › Ekip** sayfasından girilir.
```
Merhaba {{1}}, çekim görevi: {{2}} · {{3}}
Tarih: {{4}} {{5}}
Yer: {{6}}
Not: {{7}}

HM4 Studio
```
Örnekler: `{{1}}` Hasan · `{{2}}` Düğün · `{{3}}` Ayşe & Mehmet · `{{4}}` 17 Temmuz Cumartesi · `{{5}}` 14:00 · `{{6}}` Salon adı, Antalya · `{{7}}` Gelin hazırlığından başlanacak

WhatsApp API kurulmadan önce de kişi kartındaki etkinliğin altında, ekipteki kişinin yanında çıkan
WhatsApp simgesine dokunarak aynı mesajı elle gönderebilirsiniz.

---

## Şablon gerektirmeyen mesajlar

Bunlar müşteri size yazdıktan sonraki 24 saat içinde gittiği için serbest metindir.
Metinleri `content/whatsapp.json › otomatikCevap` içinden istediğiniz gibi değiştirebilirsiniz:

- **yeniKisi:** İlk kez yazan kişiye karşılama ve "Uygunluk sorun" formu bağlantısı (24 saatte bir).
- **mevcutCift:** Kayıtlı bir çift yazınca panel bağlantısı (12 saatte bir).
- **talepAlindi:** WhatsApp'tan gelen kişi formu doldurunca teşekkür.

Gün sayılarını (`hatirlatmaGunOnce`: çekimden kaç gün önce plan ve ekip hatırlatması, `yorumIstemeGunSonra`: teslimden kaç gün sonra yorum isteği) aynı dosyadaki `kurallar` bölümünden değiştirebilirsiniz.
