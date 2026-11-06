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

// { name, eventDate (YYYY-MM-DD), service, phone, email } ya da tanınmazsa null
function parse({ subject = '', text = '', html = '' } = {}) {
  const body = `${text || htmlToText(html)}`.replace(/\r/g, '').replace(/[ \t ]+/g, ' ');
  const m = /(?:^|[\n,.]\s*)([^\n,.:]{2,80}?)\s*,\s*(\d{1,2})[-./](\d{1,2})[-./](\d{4})\s+tarihindeki\s+([^\s]+(?:\s+çekimi)?)\s+için/i.exec(body);
  if (!m) return null;
  const [, rawName, d, mo, y, rawType] = m;
  const day = Number(d), month = Number(mo), year = Number(y);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2020 || year > 2100) return null;
  const type = rawType.trim();
  const service = (TYPES.find(([re]) => re.test(type)) || [null, titleCase(type.replace(/(ı|i|u|ü|sı|si|su|sü)$/i, ''))])[1];
  const phone = (/(?:\+?90|0)?\s*\(?(5\d{2})\)?[\s.-]*(\d{3})[\s.-]*(\d{2})[\s.-]*(\d{2})/.exec(body) || []).slice(1).join('');
  const email = (/[\w.+-]+@[\w-]+\.[\w.-]+/.exec(body.replace(/\S*@dugun\.com\S*/gi, '')) || [''])[0];
  return {
    name: titleCase(rawName.trim()).slice(0, 80),
    eventDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    service,
    phone: phone ? `90${phone}` : '',
    email,
    subject: String(subject).slice(0, 200),
  };
}

module.exports = { parse, htmlToText };
