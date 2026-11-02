'use strict';
// WhatsApp mesajlarını hazırlar. Mesajları site göndermez: hazırlanan mesaj n8n'e verilir,
// n8n de Meta'nın WhatsApp Business (Cloud) API'sine iletir. Böylece WhatsApp anahtarı yalnızca n8n'de durur.
const config = require('./config');
const { getWhatsapp } = require('./content');

// Türkiye numaralarını uluslararası biçime çevirir: "0532 123 45 67" → "905321234567"
function normalizePhone(input) {
  let d = String(input || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = `9${d}`;
  else if (d.length === 10 && d.startsWith('5')) d = `90${d}`;
  return d.length >= 10 && d.length <= 15 ? d : null;
}

function displayPhone(p) {
  if (!p) return '';
  const m = /^90(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(p);
  return m ? `0${m[1]} ${m[2]} ${m[3]} ${m[4]}` : `+${p}`;
}

function fill(text, vars) {
  return String(text).replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ''));
}

const graphUrl = () => `https://graph.facebook.com/${config.waApiVersion}/${config.waPhoneNumberId || 'TELEFON_NUMARASI_KIMLIGI'}/messages`;

// Serbest metin (yalnızca müşteri son 24 saatte yazdıysa gönderilebilir)
function textMessage(to, key, vars) {
  const wa = getWhatsapp();
  return {
    url: graphUrl(),
    body: { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: true, body: fill(wa.otomatikCevap[key], vars) } },
  };
}

// Meta onaylı şablon (24 saat kuralı dışında gönderilebilen bildirimler)
function templateMessage(to, key, vars) {
  const wa = getWhatsapp();
  const t = wa.sablonlar[key];
  return {
    url: graphUrl(),
    body: {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: t.ad,
        language: { code: wa.dil || 'tr' },
        components: [{ type: 'body', parameters: t.degiskenler.map((v) => ({ type: 'text', text: String(vars[v] ?? '').slice(0, 900) || '-' })) }],
      },
    },
  };
}

const panelLink = () => `${config.siteUrl}/uygulama`;
const enabled = () => Boolean(config.n8nApiKey);

module.exports = { normalizePhone, displayPhone, fill, textMessage, templateMessage, panelLink, enabled };
