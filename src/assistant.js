'use strict';
// Çift panelindeki yapay zekâ asistanı (OpenAI). Yalnızca bilgi verir, hiçbir şeyi değiştiremez.
// Her soruda o çiftin güncel bilgileri (randevular, iş aşaması, fotoğraf/albüm durumu, sözleşme) modele verilir.
// T.C. kimlik no, adres, imza gibi bilgiler asla gönderilmez. Konuşmalar sunucuda saklanmaz.
const config = require('./config');
const db = require('./db');
const contract = require('./contract');
const { getContent } = require('./content');
const { PLAN_FIELDS } = require('./jobs');

const enabled = () => Boolean(config.openaiKey);

// Çift başına sınır: saatte 30, günde 80 mesaj (kötüye kullanım ve maliyet için)
const usage = new Map();
function overLimit(coupleId) {
  const now = Date.now();
  const list = (usage.get(coupleId) || []).filter((t) => now - t < 24 * 3600 * 1000);
  const lastHour = list.filter((t) => now - t < 3600 * 1000).length;
  if (lastHour >= 30 || list.length >= 80) { usage.set(coupleId, list); return true; }
  list.push(now); usage.set(coupleId, list);
  return false;
}

const d = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }) : 'belirtilmedi');
const tl = (n) => `${Number(n || 0).toLocaleString('tr-TR')} TL`;

function coupleContext(couple) {
  const c = getContent();
  const card = db.getCoupleCard(couple.id);
  const evs = db.listEvents(couple.id);
  const sel = db.listPhotos(couple.id, 'secim');
  const edited = db.listPhotos(couple.id, 'duzenli');
  const favs = sel.filter((p) => p.is_fav).length;
  const videos = db.listVideos(couple.id);
  const k = db.activeContract(couple.id);
  const stages = c.stages || [];
  let plan = {};
  try { plan = JSON.parse(couple.plan_json || '{}') || {}; } catch { plan = {}; }
  const lines = [
    `Çift: ${couple.name}`,
    `Bugün: ${d(new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10))}`,
    `Randevular:${evs.length ? '' : ' henüz girilmedi'}`,
    ...evs.map((e) => `- ${e.event_type || 'Çekim'}: ${d(e.event_date)}${e.start_time ? `, saat ${e.start_time}` : ''}${e.venue || e.city ? `, ${[e.venue, e.city].filter(Boolean).join(', ')}` : ''}${e.package ? `, paket: ${e.package}` : ''}${e.package_detail ? ` (${e.package_detail.replace(/\s+/g, ' ')})` : ''}`),
    `İş aşaması: ${stages[couple.stage] || '-'} (${couple.stage + 1}/${stages.length}). Aşamalar sırasıyla: ${stages.join(' → ')}`,
    couple.stage_note ? `Stüdyonun çifte notu: ${couple.stage_note}` : '',
    `Video durumu: ${couple.video_status || 'bu işte video yok ya da henüz başlamadı'}`,
    couple.due_date ? `Tahmini teslim tarihi: ${d(couple.due_date)}` : 'Tahmini teslim tarihi: henüz belirlenmedi',
    `Seçim fotoğrafları: ${sel.length} yüklendi. Albüm için seçilen: ${favs}/${couple.album_limit}. Albüm seçimi ${couple.album_locked ? 'tamamlandı ve kilitlendi' : 'açık'}.`,
    `Düzenlenmiş (renkli) teslim fotoğrafları: ${edited.length ? `${edited.length} adet hazır` : 'henüz yüklenmedi'}`,
    `Videolar: ${videos.length ? videos.map((v) => `${v.kind}${v.title ? ` "${v.title}"` : ''}`).join(', ') : 'henüz eklenmedi'}`,
    `Sözleşme: ${!k ? 'henüz gönderilmedi' : k.signed_at ? 'onaylandı' : 'onay bekliyor (Sözleşme sayfasından okunup imzalanır)'}`,
    `Çekim günü planı: ${plan.saved ? 'dolduruldu' : 'henüz doldurulmadı (Plan sayfasından)'}`,
    `Albüm tasarımı: ${{ hazir: 'stüdyo gönderdi, çiftin incelemesini bekliyor (Albüm sayfasından sayfa sayfa onaylanır)', degisiklik: 'çift değişiklik istedi, stüdyo düzeltiyor', onaylandi: 'çift onayladı, baskıya hazırlanıyor' }[couple.album_design_state] || 'henüz gönderilmedi'}`,
    ...PLAN_FIELDS.filter((f) => plan[f.key]).map((f) => `  ${f.short}: ${String(plan[f.key]).replace(/\s+/g, ' ').slice(0, 400)}`),
  ];
  if (c.couplePanel?.showPayments && card?.total) lines.push(`Ödeme: toplam ${tl(card.total)}, ödenen ${tl(card.paid)}, kalan ${tl(Math.max(card.total - card.paid, 0))}`);
  return lines.filter(Boolean).join('\n');
}

function studioContext() {
  const c = getContent();
  const co = contract.settings(c).company;
  const ct = c.contact || {};
  return [
    `Stüdyo: ${c.brand?.name || 'HM4 Studio'}, düğün/nişan/kına fotoğraf ve video. Sorumlu: ${co.sorumlu}. Adres: ${co.adres}. Telefon/WhatsApp: ${ct.phoneDisplay || co.telefon}.`,
    'Sözleşmeden önemli kurallar: Teslim süresi fotoğraf seçiminden itibaren 90 gündür. Teslim online galeri (bu panel) ve/veya USB ile yapılır. Teslimden itibaren 15 gün içinde bir kez toplu revizyon istenebilir. Teslimden 90 gün sonra dosyalar sunucudan silinir; çiftin dosyaları indirip yedeklemesi gerekir. Kapora iade edilmez. Değişiklikler en az 48 saat önce bildirilmelidir.',
  ].join('\n');
}

const PANEL_GUIDE = `Panel kullanımı:
- Durum sayfası: iş aşaması, randevular, (açıksa) ödeme özeti, telefon bildirimlerini açma, WhatsApp bildirim izni.
- Fotoğraflar sayfası: "Seçim fotoğrafları" albüm seçimi içindir; fotoğrafın üzerindeki kalbe dokununca albüme eklenir, tekrar dokununca çıkar. Üstteki sayaç kaç fotoğraf seçildiğini gösterir; sınır dolunca yeni seçim yapılamaz. Seçim bitince "Seçimi tamamladım" düğmesiyle gönderilir, sonrasında değişiklik için stüdyoya yazmak gerekir. "Düzenlenmiş fotoğraflar" renk düzenlemesi yapılmış teslim fotoğraflarıdır; hepsi tek seferde "Tümünü indir" ile ZIP olarak indirilebilir. Seçim fotoğrafları da "Tümünü indir", seçilenler "Seçimimi indir" ile indirilebilir.
- Video sayfası: klip, düğün hikâyesi, reels gibi teslim videoları; izlenebilir ve indirilebilir.
- Plan sayfası: çekim günü akışı (hazırlık yeri, saatler, önemli kişiler, notlar) doldurulur; stüdyo ekibi buna göre hazırlanır.
- Sözleşme sayfası (gönderildiyse): metin okunur, ad soyad, T.C. kimlik no ve adres yazılır, paylaşım izni seçilir, imza parmakla çizilir ve onaylanır. Onaydan sonra PDF olarak indirilebilir.
- Albüm sayfası (stüdyo albüm tasarımını gönderince açılır): her sayfa için "Beğendim" ya da "Değişiklik istiyorum" seçilir, değişiklik için kısa not yazılıp "Notu kaydet"e basılır. Tüm sayfalar beğenilince "Albümü onaylıyorum", değişiklik varsa tüm sayfalar incelendikten sonra "Değişiklikleri gönder" kullanılır.
- Randevu belgesi Durum sayfasından indirilebilir.
- Uygulama gibi kullanmak için: iPhone'da Safari > Paylaş > Ana Ekrana Ekle; Android'de Chrome menüsü > Ana ekrana ekle. Bildirimler iPhone'da yalnızca ana ekrana eklenmiş uygulamada çalışır.
- Şifre unutulursa stüdyodan yeni şifre istenir.`;

function systemPrompt(couple) {
  return `Sen ${getContent().brand?.name || 'HM4 Studio'}'nun çift panelindeki yardımcı asistansın. Karşındaki kişi bu stüdyoyla çalışan bir çift (gelin/damat).
Kurallar:
- Türkçe, sıcak ama kısa ve net cevap ver (genelde 1-4 cümle). Gereksiz giriş cümlesi kurma.
- Yalnızca aşağıdaki bilgilere dayan. Bilmediğin bir tarihi, fiyatı, süreyi veya durumu ASLA uydurma; emin değilsen stüdyoya WhatsApp'tan sormalarını söyle.
- Hiçbir şeyi değiştiremezsin (randevu, fiyat, seçim, sözleşme). Değişiklik, iptal, indirim, ek hizmet, şikâyet veya özel istekler için kibarca stüdyoya WhatsApp'tan yazmalarını söyle.
- Sadece bu çiftin işi, panelin kullanımı ve stüdyonun hizmetleri hakkında konuş. Alakasız konularda kısaca yardımcı olamayacağını söyle.
- Çiftten T.C. kimlik no, kart bilgisi, şifre gibi bilgileri isteme; yazarlarsa bunları buraya yazmamalarını hatırlat.
- Markdown başlık veya tablo kullanma; gerekirse kısa madde işaretleri kullanabilirsin.

${studioContext()}

${PANEL_GUIDE}

Bu çiftin güncel bilgileri:
${coupleContext(couple)}`;
}

async function answer(couple, messages) {
  const res = await fetch(`${config.openaiBase}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.openaiKey}` },
    body: JSON.stringify({
      model: config.openaiModel,
      messages: [{ role: 'system', content: systemPrompt(couple) }, ...messages],
      max_completion_tokens: 500,
      store: false,
    }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`Asistan hatası: HTTP ${res.status} ${data?.error?.message || ''}`);
    throw new Error(res.status === 429 ? 'yogun' : 'hata');
  }
  return String(data.choices?.[0]?.message?.content || '').trim();
}

module.exports = { enabled, overLimit, answer, systemPrompt };
