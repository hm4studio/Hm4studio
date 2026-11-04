'use strict';
// KVKK aydınlatma metni (Ayarlar › Sözleşme ve KVKK sayfasından düzenlenir) ve WhatsApp açık rıza metni.
const contract = require('./contract');

const DEFAULT_TEXT = `## Veri sorumlusu
{unvan} ({sorumlu}), {adres}. Telefon: {telefon}{eposta}

6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca, kişisel verileriniz veri sorumlusu sıfatıyla aşağıda açıklanan kapsamda işlenmektedir.

## İşlenen kişisel veriler
- Kimlik: ad soyad, sözleşme onayında T.C. kimlik numarası
- İletişim: telefon numarası, adres
- Etkinlik bilgileri: tarih, saat, mekân, paket ve hizmet tercihleri, çekim günü planı
- Görsel ve işitsel kayıtlar: çekim sırasında alınan fotoğraf ve videolar
- Finans: hizmet bedeli ve ödeme kayıtları
- İşlem güvenliği: çift paneline giriş kayıtları, sözleşme onayında IP adresi ve cihaz bilgisi, elektronik imza görüntüsü

## İşleme amaçları
- Uygunluk ve fiyat talebinize dönüş yapılması
- Hizmet sözleşmesinin kurulması ve ifası: çekimlerin planlanması, ekibin görevlendirilmesi, fotoğraf ve videoların düzenlenip teslim edilmesi
- Albüm seçimi ve teslimatın çift paneli üzerinden yürütülmesi
- Ödemelerin takibi, muhasebe ve vergi yükümlülüklerinin yerine getirilmesi
- Olası uyuşmazlıklarda hakların korunması
- Açık rızanız olması hâlinde çekimlerin tanıtım amacıyla paylaşılması ve WhatsApp üzerinden bilgilendirme yapılması

## Hukuki sebepler
- KVKK m. 5/2-c: sözleşmenin kurulması ve ifası için gerekli olması
- KVKK m. 5/2-ç: hukuki yükümlülüklerin yerine getirilmesi
- KVKK m. 5/2-e: bir hakkın tesisi, kullanılması veya korunması
- KVKK m. 5/2-f: meşru menfaat (hizmet kalitesi ve güvenliği)
- KVKK m. 5/1 ve m. 9: açık rıza (tanıtım amaçlı paylaşım, WhatsApp ile iletişim ve yurt dışında bulunan hizmet sağlayıcılara aktarım)

## Aktarım
Kişisel verileriniz yalnızca yukarıdaki amaçlarla ve gerektiği ölçüde; çekimde görevli ekip üyelerimizle, web sitesi ve verilerin barındırıldığı sunucu hizmet sağlayıcısıyla, yedekleme hizmet sağlayıcısıyla (yedekler şifrelenerek saklanır), mali müşavirimizle ve talep hâlinde yetkili kamu kurumlarıyla paylaşılabilir. WhatsApp ile iletişim, Meta Platforms'un yurt dışındaki sunucuları üzerinden gerçekleşir ve açık rızanıza dayanır.

## Toplama yöntemi
Veriler; web sitesindeki talep formu, WhatsApp yazışmaları, telefon görüşmeleri, çift paneli ve çekim günü elektronik ortamda ve sözlü olarak toplanır.

## Saklama süresi
- Teslim edilen fotoğraf ve videolar, sözleşmede belirtildiği üzere teslimden 90 gün sonra sunucularımızdan silinir.
- Sözleşme ve ödeme kayıtları, ilgili mevzuatın öngördüğü süre (10 yıl) boyunca saklanır.
- Sonuçlanmayan talepler 1 yıl sonra silinir.

## Haklarınız
KVKK m. 11 uyarınca; kişisel verilerinizin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme, işleme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, aktarıldığı üçüncü kişileri bilme, eksik veya yanlış işlenmişse düzeltilmesini, şartları oluştuğunda silinmesini veya yok edilmesini isteme, bu işlemlerin aktarılan üçüncü kişilere bildirilmesini isteme, otomatik sistemlerle analiz sonucu aleyhinize bir sonuca itiraz etme ve kanuna aykırı işleme nedeniyle zararın giderilmesini talep etme haklarına sahipsiniz. Verdiğiniz açık rızayı dilediğiniz zaman geri alabilirsiniz.

Başvurularınızı yukarıdaki adrese yazılı olarak veya kayıtlı telefon numaranızdan bize ulaşarak iletebilirsiniz. Başvurular en geç 30 gün içinde ücretsiz olarak sonuçlandırılır.`;

const WA_CONSENT = 'WhatsApp üzerinden bilgilendirme mesajı almayı ve bu amaçla telefon numaramın ve mesaj içeriklerinin WhatsApp’ın (Meta) yurt dışındaki sunucularına aktarılmasını kabul ediyorum.';

function settings(c) {
  return { text: c.kvkk?.text || DEFAULT_TEXT, email: c.contact?.email || '' };
}

function render(c) {
  const co = contract.settings(c).company;
  const s = settings(c);
  const vals = { unvan: co.unvan, sorumlu: co.sorumlu, adres: co.adres, telefon: co.telefon, eposta: s.email && !s.email.startsWith('[') ? ` · E-posta: ${s.email}` : '' };
  const text = s.text.replace(/\{(unvan|sorumlu|adres|telefon|eposta)\}/g, (m, k) => vals[k] || '');
  return contract.render({ template: text, company: co, events: [] });
}

module.exports = { DEFAULT_TEXT, WA_CONSENT, settings, render };
