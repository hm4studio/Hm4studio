# WhatsApp mesaj şablonları (Meta onayı için)

Müşteri size son 24 saat içinde yazmadıysa WhatsApp yalnızca **Meta'nın onayladığı şablonlarla**
mesaj göndermenize izin verir. Bildirimler ve hatırlatmalar bu yüzden şablonla gider.

Nerede oluşturulur: **Meta Business Suite › WhatsApp Manager › Mesaj şablonları › Şablon oluştur**

Her şablon için:
- **Ad:** aşağıdaki adı birebir yazın (küçük harf, alt çizgi). Site bu adla gönderir.
- **Dil:** Türkçe (`tr`)
- **Kategori:** belirtildiği gibi
- **Gövde:** metni kopyalayın. `{{1}}`, `{{2}}`… değişkenlerdir; Meta örnek değer ister, örnekleri de aşağıda.

Onay genelde birkaç dakika ile birkaç saat sürer. Şablon adlarını değiştirirseniz
`content/whatsapp.json` içindeki `sablonlar` bölümünü de güncelleyin.

---

### 1. `hm4_asama_guncellendi` — Kategori: **Yardımcı (Utility)**
Ne zaman: Panelden çiftin iş aşamasını değiştirdiğinizde.

```
Merhaba {{1}}, çekiminizin durumu güncellendi: {{2}}. Ayrıntıları panelinizden görebilirsiniz: {{3}}
```
Örnekler: `{{1}}` Ayşe & Mehmet · `{{2}}` Düzenleme · `{{3}}` https://siteniz.com/uygulama

### 2. `hm4_fotograflar_hazir` — Kategori: **Yardımcı (Utility)**
Ne zaman: Çiftin galerisine fotoğraf yüklediğinizde (son yüklemeden 15 dk sonra, günde en fazla bir kez).

```
Merhaba {{1}}, fotoğraflarınız panelinize yüklendi 📸 Albümünüz için beğendiğiniz kareleri buradan seçebilirsiniz: {{2}}
```
Örnekler: `{{1}}` Ayşe & Mehmet · `{{2}}` https://siteniz.com/uygulama

### 3. `hm4_plan_hatirlatma` — Kategori: **Yardımcı (Utility)**
Ne zaman: Çekime 7 ve 2 gün kala, çift gün planını henüz doldurmadıysa.

```
Merhaba {{1}}, çekiminize {{2}} gün kaldı. Gün planınızı (mekân, saat akışı, önemli kişiler) panelinize eklerseniz hazırlığımızı ona göre yaparız: {{3}}
```
Örnekler: `{{1}}` Ayşe & Mehmet · `{{2}}` 7 · `{{3}}` https://siteniz.com/uygulama

### 4. `hm4_album_hatirlatma` — Kategori: **Yardımcı (Utility)**
Ne zaman: Fotoğraflar yüklendikten 5 gün sonra albüm seçimi hâlâ tamamlanmadıysa.

```
Merhaba {{1}}, albümünüz için {{2}} kare seçmenizi bekliyoruz. Panelinizden kalbe dokunarak seçebilirsiniz: {{3}}
```
Örnekler: `{{1}}` Ayşe & Mehmet · `{{2}}` 60 · `{{3}}` https://siteniz.com/uygulama

### 5. `hm4_yorum_iste` — Kategori: **Pazarlama (Marketing)**
Ne zaman: "Teslim edildi" aşamasından 7 gün sonra, bir kez. Meta yorum isteklerini genelde pazarlama sayar.
`content/whatsapp.json` içindeki `yorumLinki` alanına Google işletme yorum bağlantınızı yazmazsanız gönderilmez.

```
Merhaba {{1}}, sizinle çalışmak bizim için çok keyifliydi 🤍 Deneyiminizi birkaç cümleyle paylaşırsanız çok seviniriz: {{2}}
```
Örnekler: `{{1}}` Ayşe & Mehmet · `{{2}}` https://g.page/r/…/review

---

## Şablon gerektirmeyen mesajlar

Bunlar müşteri size yazdıktan sonraki 24 saat içinde gittiği için serbest metindir.
Metinleri `content/whatsapp.json › otomatikCevap` içinden istediğiniz gibi değiştirebilirsiniz:

- **yeniKisi:** İlk kez yazan kişiye karşılama ve "Uygunluk sorun" formu bağlantısı (24 saatte bir).
- **mevcutCift:** Kayıtlı bir çift yazınca panel bağlantısı (12 saatte bir).
- **talepAlindi:** WhatsApp'tan gelen kişi formu doldurunca teşekkür.

Hatırlatma günlerini (`planHatirlatmaGunOnce`, `albumHatirlatmaGunSonra`, `yorumIstemeGunSonra`) da aynı dosyadaki `kurallar` bölümünden değiştirebilirsiniz.
