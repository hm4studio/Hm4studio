'use strict';
// Düğün.com teklif talebi e-postalarını okur. n8n e-postayı alır, buraya ham metniyle gönderir.
// Örnek metin: "Sayın Hale Özkarabacak, Elifnaz karakaya, 15-08-2027 tarihindeki düğünü için sizden ayrıntılı bir fiyat teklifi bekliyor."
const TYPES = [
  [/^düğün/i, 'Düğün'], [/^nişan/i, 'Nişan'], [/^kına/i, 'Kına'], [/^söz/i, 'Söz'],
  [/^nikah|^nikâh/i, 'Nikah'], [/^dış\s*çekim/i, 'Dış Çekim'], [/^save/i, 'Save the Date'],
];

const titleCase = (s) => s.toLocaleLowerCase('tr-TR').replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('tr-TR'));

function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

const AYLAR = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];
const DATE = String.raw`(\d{1,2})[-./ ](\d{1,2}|[A-Za-zÇĞİÖŞÜçğıöşü]{3,8})[-./ ](\d{4})`;
const monthOf = (v) => (/^\d+$/.test(v) ? Number(v) : AYLAR.findIndex((a) => a.slice(0, 3) === v.toLocaleLowerCase('tr-TR').slice(0, 3)) + 1);

// { name, eventDate (YYYY-MM-DD), service, phone, email } ya da tanınmazsa null
function parse({ subject = '', text = '', html = '' } = {}) {
  const body = `${text || htmlToText(html)}`.replace(/\r/g, '').replace(/[ \t ]+/g, ' ');
  // "Elifnaz Karakaya, 15-08-2027 tarihindeki düğünü için ..." (isimde nokta olabilir: "Elif K.")
  let m = new RegExp(String.raw`(?:^|\n|Sayın[^,\n]*,)\s*([^\n,:]{2,80}?)\s*,\s*${DATE}\s+tarih(?:indeki|li|inde)\s+([^\s]+(?:\s+çekimi)?)\s+(?:için|organizasyon)`, 'i').exec(body);
  // Alan alan yazılmış e-postalar: "Ad Soyad: ...", "Tarih: ..."
  if (!m) {
    const name = (/(?:Ad\s*Soyad|Adı\s*Soyadı|İsim|Gönderen)\s*:\s*([^\n]{2,80})/i.exec(body) || [])[1];
    const dt = new RegExp(String.raw`(?:Tarih|Düğün\s*Tarihi|Etkinlik\s*Tarihi|Organizasyon\s*Tarihi)\s*:\s*${DATE}`, 'i').exec(body);
    const tp = (/(?:Organizasyon|Etkinlik|Hizmet)(?:\s*Türü)?\s*:\s*([^\n]{2,40})/i.exec(body) || [])[1];
    if (name && dt) m = [null, name, dt[1], dt[2], dt[3], tp || 'Düğün'];
  }
  if (!m) return null;
  const [, rawName, d, mo, y, rawType] = m;
  const day = Number(d), month_ = monthOf(mo), year = Number(y);
  if (month_ < 1 || month_ > 12 || day < 1 || day > 31 || year < 2020 || year > 2100) return null;
  const type = rawType.trim();
  const service = (TYPES.find(([re]) => re.test(type)) || [null, titleCase(type.replace(/(ı|i|u|ü|sı|si|su|sü)$/i, ''))])[1];
  const phone = (/(?:\+?90|0)?\s*\(?(5\d{2})\)?[\s.-]*(\d{3})[\s.-]*(\d{2})[\s.-]*(\d{2})/.exec(body) || []).slice(1).join('');
  const email = (/[\w.+-]+@[\w-]+\.[\w.-]+/.exec(body.replace(/\S*@dugun\.com\S*/gi, '')) || [''])[0];
  return {
    name: titleCase(rawName.trim()).slice(0, 80),
    eventDate: `${year}-${String(month_).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    service,
    phone: phone ? `90${phone}` : '',
    email,
    subject: String(subject).slice(0, 200),
  };
}

// Tanınmayan ama müşteri talebi gibi görünen Düğün.com e-postası (kaybolmasın diye yine de talep olarak kaydedilir)
function looksLikeRequest({ subject = '', text = '', html = '' } = {}) {
  const all = `${subject}\n${text || htmlToText(html)}`;
  if (/bülten|kampanya|indirim fırsat|abonelik|şifre|fatura|ödeme hatırlatma/i.test(subject)) return false;
  return /teklif|talep|mesaj|bilgi\s*iste|iletişim|randevu|fiyat|soru/i.test(all);
}

module.exports = { parse, htmlToText, looksLikeRequest };
