'use strict';
// Online sözleşme: şablon → çifte özel metin (gönderildiği anda dondurulur) → çiftin onayı ve imzası.
// Şablon dili: "## " başlık, "- " madde, boş satır paragraf, {ALAN} yer tutucular, tek satırda {BLOK} tablolar.
const crypto = require('node:crypto');
const { h, raw } = require('./views/html');

const DEFAULT_TEMPLATE = `## 1. TARAF BİLGİLERİ
{TARAFLAR}

## 2. HUKUKİ DAYANAK VE KONU
İşbu sözleşme, 6098 sayılı Türk Borçlar Kanunu'nun (TBK) 470. maddesi ve devamında düzenlenen "Eser Sözleşmesi" hükümlerine tabidir. Yüklenici, Müşteri için belirlenen tarihlerde {sehir} ilinde profesyonel çekim yapmayı; Müşteri ise bu hizmet karşılığında kararlaştırılan bedeli ödemeyi taahhüt eder.

## 3. HİZMET DETAYLARI
İşbu sözleşmenin konusu, Yüklenici tarafından Müşteri'ye aşağıda belirtilen detaylar çerçevesinde profesyonel fotoğraf ve/veya video çekim hizmeti sunulmasıdır.
{HIZMETLER}

## 4. EK HİZMET VE KAPSAM DIŞI TALEPLER
- İşbu sözleşmede açıkça belirtilmeyen hiçbir hizmet ücretsiz olarak talep edilemez. Taraflar, TBK m. 470 ve devamı uyarınca hizmet kapsamının işbu sözleşme ile belirlendiğini kabul eder.
- Sözleşmenin imzalanmasından sonra talep edilecek ek çekim süresi, ek mekân, ek konsept, ilave düzenleme (retouch), ham dosya teslimi, ekstra video çalışması, baskı, albüm değişikliği ve benzeri tüm hizmetler ayrıca ücretlendirilir.
- TBK m. 26 (Sözleşme Özgürlüğü) uyarınca taraflar hizmet kapsamını serbestçe belirlemiş olup, kapsam dışı talepler Yüklenici açısından bağlayıcı değildir.
- Yazılı fiyat mutabakatı yapılmadan ek hizmete başlanmaz.

## 5. TESLİM VE ÖDEME KOŞULLARI
- Teslim süresi: Fotoğraf seçiminden itibaren 90 gündür.
- Teslim şekli: USB bellek / Online galeri (HM4 Studio çift paneli).
- Ödeme koşulları: {kapora} kapora (rezervasyon aşamasında), kalan {kalan} çekim günü (peşin ödeme).
- Kapora iadesi yapılmaz, tarih değişikliği uygunluk durumuna göre değerlendirilir.

## 6. TESLİM VE ARŞİV SORUMLULUĞU
- Muayene ve İhbar: Müşteri, TBK madde 474 uyarınca teslim edilen materyalleri 15 gün içinde kontrol etmelidir.
- 15 gün içinde eksiklik veya yanlışlık bildirilmezse HM4 Studio sorumluluk kabul etmez.
- Yedekleme: Teslimden 90 gün sonra veriler silinir. USB belleklerin bozulması veya veri kaybından Yüklenici sorumlu değildir.
- Çekim tarihinden itibaren 1 yıl içinde teslim alınmayan materyaller arşivlenmez.
- Teslim edilen USB bellekler yalnızca materyallerin Müşteri'ye teslimi amacıyla verilmektedir. USB belleklerin teslim sonrasında bozulması, kaybolması veya veri kaybı yaşanmasından HM4 Studio sorumlu değildir. Müşteri, teslim aldığı materyalleri yedeklemekle yükümlüdür.

Revizyon hakkı ve sınırı:
- TBK m. 474 (Muayene ve İhbar Yükümlülüğü) uyarınca Müşteri, teslim edilen iş üzerinde kontrolünü makul süre içerisinde yapmakla yükümlüdür.
- Müşteri, teslim tarihinden itibaren 15 gün içinde en fazla 1 (bir) defa toplu revizyon talebinde bulunabilir.
- Bu süre geçtikten sonra yapılacak talepler yeni hizmet kapsamında değerlendirilir ve ayrıca ücretlendirilir.
- Estetik beğeniye dayalı konsept değişiklikleri revizyon kapsamında değildir.

## 7. PAYLAŞIM VE KULLANIM İZNİ
Müşteri, HM4 Studio'nun çekimleri tanıtım amaçlı paylaşmasına: {paylasim_izni}
Not: Açık rıza, 6698 sayılı KVKK kapsamında alınmaktadır.

## 8. GENEL HÜKÜMLER
Tarafların zamanında hazır bulunma yükümlülüğü:
- Müşteri çekim günü ve saatinde belirlenen mekânda hazır bulunmakla yükümlüdür.
- HM4 Studio ekibi de belirlenen tarih ve saatte orada olmayı taahhüt eder.
- Taraflardan biri geç kalırsa çekim süresi uzatılamaz, değişiklik karşılıklı anlayışla yapılabilir.

Çekim süreci:
- HM4 Studio'nun yönlendirmelerine uyulması gereklidir.
- Reddedilen yönlendirmeler nedeniyle eksik karelerden HM4 Studio sorumlu tutulamaz.

İptal ve tarih değişikliği:
- Sözleşmeden dönme: Müşteri tarafından yapılacak son dakika iptallerinde TBK madde 484 (Yüklenicinin tam tazminatı) hükümleri saklı kalmak kaydıyla; çekime 15 günden az süre kala yapılan iptallerde hizmet bedelinin tamamı talep edilir.
- Mücbir sebep: TBK madde 136 uyarınca tarafların kontrolü dışındaki durumlar (hava muhalefeti, doğal afet, elektrik kesintisi, ekipman arızası vb.) nedeniyle çekim yapılamazsa taraflar yeni bir tarih belirler.
- Ekipman arızası nedeniyle çekim yapılamazsa, ücret iadesi veya yeni çekim hakkı verilir.

Müşteri güvenliği ve konforu:
- HM4 Studio müşteri güvenliğini öncelikli tutar, tehlikeli veya rahatsız edici pozlar talep edilmez.

İletişim ve bilgilendirme:
- Müşteri, tarih ve mekân bilgisini doğru iletmelidir.
- Değişiklikler en az 48 saat önceden bildirilmelidir.

Kayıt ve arşiv güvenliği:
- HM4 Studio materyalleri yedekler, ancak teslim sonrası verilerin korunmasından Müşteri sorumludur.

Etik kullanım:
- HM4 Studio, görüntüleri üçüncü kişilerle paylaşmaz.
- Müşteri, HM4 Studio logolarını kaldırmadan paylaşımlar yapmayı kabul eder.

Telif hakları ve kullanım izni:
- Eser sahipliği: Çekilen tüm fotoğraf ve videoların mülkiyet ve telif hakları, 5846 sayılı Fikir ve Sanat Eserleri Kanunu (FSEK) uyarınca Yüklenici'ye aittir.

## 9. ÖDEME VE FİYAT BİLGİSİ
{ODEME}
Cayma akçesi (kapora): Ödenen {kapora}, TBK madde 178 uyarınca "cayma akçesi" niteliğindedir. Müşteri sözleşmeden cayarsa bu tutar iade edilmez.
Not: Ödemeler nakit veya EFT/Havale yolu ile yapılabilir.

## 10. YETKİLİ MAHKEME VE YÜRÜRLÜK
İşbu sözleşme {imza_tarihi} tarihinde tarafların rızasıyla elektronik ortamda onaylanmış olup, doğabilecek uyuşmazlıklarda {mahkeme} Mahkemeleri ve İcra Daireleri yetkilidir.

## 11. ONAY
Taraflar şartları okumuş, anlamış ve kabul etmiştir.
{IMZA}`;

const DEFAULT_COMPANY = {
  unvan: 'HM4 Studio',
  sorumlu: 'Menderes Çelik',
  telefon: '0541 741 78 21',
  adres: 'Pınarbaşı Mah. Rıhtımboyu Cad. No:22 Tosya / Kastamonu',
  vergiDairesi: 'Tosya',
  vergiNo: '',
  mahkeme: 'Tosya',
};

const settings = (c) => ({
  title: c.contract?.title || 'Fotoğraf & Video Hizmet Sözleşmesi',
  template: c.contract?.template || DEFAULT_TEMPLATE,
  company: { ...DEFAULT_COMPANY, ...(c.contract?.company || {}) },
});

// T.C. kimlik numarası denetimi (11 hane, algoritma)
function validTc(tc) {
  const s = String(tc || '');
  if (!/^[1-9]\d{10}$/.test(s)) return false;
  const d = s.split('').map(Number);
  const d10 = ((d[0] + d[2] + d[4] + d[6] + d[8]) * 7 - (d[1] + d[3] + d[5] + d[7])) % 10;
  const d11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return ((d10 + 10) % 10) === d[9] && d11 === d[10];
}

const tl = (n) => `${Number(n || 0).toLocaleString('tr-TR')} TL`;
const shortDate = (iso) => (iso ? iso.split('-').reverse().join('.') : '');

// Çifte gönderilen anın verileri (sözleşme metniyle birlikte saklanır, sonradan değişmez)
function snapshotData(c, card, events, payments) {
  const s = settings(c);
  const paid = payments.reduce((t, p) => t + p.amount, 0);
  const lastDate = events.map((e) => e.event_date).filter(Boolean).sort().pop() || '';
  const cities = [...new Set(events.map((e) => e.city).filter(Boolean))];
  return {
    title: s.title,
    template: s.template,
    company: s.company,
    musteri: card.full_name || card.name,
    es: card.partner_name || '',
    telefon: card.phone ? String(card.phone).replace(/^90(\d{3})(\d{3})(\d{2})(\d{2})$/, '0$1 $2 $3 $4') : '',
    randevuNo: card.ref_no || '',
    sehir: cities.join(', ') || '…',
    events: events.map((e) => ({ tur: e.event_type, tarih: shortDate(e.event_date), saat: e.start_time, yer: [e.venue, e.city].filter(Boolean).join(', '), paket: e.package, detay: e.package_detail, tutar: e.price })),
    toplam: card.total || 0,
    kapora: paid,
    kalan: Math.max((card.total || 0) - paid, 0),
    kalanTarih: shortDate(lastDate) ? `${shortDate(lastDate)} (çekim günü)` : 'Çekim günü',
  };
}

// Metni HTML'e çevirir. signer: { ad, tc, adres, izin, imza (data URL), tarih } — imzalanmadıysa boş alanlar
function render(data, signer = {}) {
  const co = data.company || {};
  const inline = {
    sehir: data.sehir, kapora: tl(data.kapora), toplam: tl(data.toplam), kalan: tl(data.kalan), mahkeme: co.mahkeme || '…',
    imza_tarihi: signer.tarih || '…/…/……', paylasim_izni: signer.izin === 'evet' ? '☒ İzin veriyorum  ☐ İzin vermiyorum' : signer.izin === 'hayir' ? '☐ İzin veriyorum  ☒ İzin vermiyorum' : '☐ İzin veriyorum  ☐ İzin vermiyorum',
    musteri: data.musteri, randevu_no: data.randevuNo,
  };
  const fill = (line) => line.replace(/\{([a-z_]+)\}/g, (m, k) => (inline[k] !== undefined ? inline[k] : m));
  const blocks = {
    TARAFLAR: () => h`<div class="ct-parties">
      <div><p class="ct-k">Yüklenici</p><p>${co.unvan}<br>Sorumlu kişi: ${co.sorumlu}<br>${co.vergiDairesi ? h`Vergi dairesi: ${co.vergiDairesi}` : ''}${co.vergiNo ? h` · Vergi no: ${co.vergiNo}` : ''}<br>${co.adres}<br>${co.telefon}</p></div>
      <div><p class="ct-k">Müşteri</p><p>${signer.ad || data.musteri}${data.es ? h` (eşi: ${data.es})` : ''}<br>T.C. Kimlik No: ${signer.tc || '……………………'}<br>Telefon: ${data.telefon || '……………'}<br>Adres: ${signer.adres || '……………………………………'}</p></div>
    </div>`,
    HIZMETLER: () => h`<table class="ct-table"><thead><tr><th>Hizmet</th><th>Tarih / saat</th><th>Yer</th><th>Paket</th><th class="num">Tutar</th></tr></thead><tbody>
      ${data.events.map((e) => h`<tr><td>${e.tur || 'Çekim'}</td><td>${e.tarih}${e.saat ? h`<br>${e.saat}` : ''}</td><td>${e.yer}</td><td>${e.paket}${e.detay ? h`<div class="ct-detail">${e.detay}</div>` : ''}</td><td class="num">${e.tutar ? tl(e.tutar) : ''}</td></tr>`)}
    </tbody></table>`,
    ODEME: () => h`<table class="ct-table ct-pay"><tbody>
      <tr><td>Toplam hizmet bedeli</td><td class="num">${tl(data.toplam)}</td></tr>
      <tr><td>Alınan kapora</td><td class="num">${tl(data.kapora)}</td></tr>
      <tr><td>Kalan ödeme</td><td class="num">${tl(data.kalan)}</td></tr>
      <tr><td>Kalan ödeme tarihi</td><td class="num">${data.kalanTarih}</td></tr>
    </tbody></table>`,
    IMZA: () => h`<div class="ct-sign">
      <div><p class="ct-k">HM4 Studio yetkilisi</p><p>${co.sorumlu}</p></div>
      <div><p class="ct-k">Müşteri</p><p>${signer.ad || '……………………'}</p>${signer.imza ? h`<img class="ct-sig" src="${signer.imza}" alt="Müşteri imzası">` : h`<p class="muted">İmza bekleniyor</p>`}</div>
    </div>`,
  };
  const out = [];
  let list = [];
  let para = [];
  const flushList = () => { if (list.length) { out.push(h`<ul>${list.map((x) => h`<li>${fill(x)}</li>`)}</ul>`); list = []; } };
  const flushPara = () => { if (para.length) { out.push(h`<p>${raw(para.map((x) => String(h`${fill(x)}`)).join('<br>'))}</p>`); para = []; } };
  for (const rawLine of String(data.template || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    const block = /^\{([A-Z]+)\}$/.exec(line);
    if (!line) { flushList(); flushPara(); continue; }
    if (block && blocks[block[1]]) { flushList(); flushPara(); out.push(blocks[block[1]]()); continue; }
    if (line.startsWith('## ')) { flushList(); flushPara(); out.push(h`<h2>${fill(line.slice(3))}</h2>`); continue; }
    if (line.startsWith('- ')) { flushPara(); list.push(line.slice(2)); continue; }
    flushList(); para.push(line);
  }
  flushList(); flushPara();
  return raw(out.map(String).join('\n'));
}

// Onaylanan metnin ve imzalayan bilgilerinin parmak izi (sonradan değiştirilmediğini göstermek için)
function fingerprint(snapshot, signer) {
  return crypto.createHash('sha256').update(JSON.stringify({ snapshot, ad: signer.ad, tc: signer.tc, adres: signer.adres, izin: signer.izin, tarih: signer.tarih, imza: signer.imza })).digest('hex');
}

module.exports = { DEFAULT_TEMPLATE, DEFAULT_COMPANY, settings, validTc, snapshotData, render, fingerprint };
